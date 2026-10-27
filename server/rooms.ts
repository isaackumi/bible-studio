// Rooms: the audience side of a service, on the internet. A church opens a room from Church Studio,
// shows its QR code, and people join from their phones on any connection (no app, no church Wi-Fi):
// they ask and upvote questions, answer quizzes and polls. The church's own computer is never
// reachable from outside: the desk talks to the room with a secret host key, phones with a
// participant id, and nothing a phone sends reaches the screen unless the operator chooses it.
//
// Each room is one Durable Object (RoomObject below), so everything in a room happens in order.
// The rules live in RoomCore, plain code with a small storage interface, so they are tested
// without Cloudflare.
//
//   POST /v1/rooms                       {name?}                 → {code, hostKey, joinUrl}
//   POST /v1/rooms/:code/join            {name?}                 → {pid, room}   (409 + suggestion: name taken)
//   POST /v1/rooms/:code/rename          {pid, name}             → {name}        (409 + suggestion: name taken)
//   POST /v1/rooms/:code/player          {hostKey, n, name?|remove?}             (the desk renames or takes out a player)
//   GET  /v1/rooms/:code/state?pid=      (audience view)          → {room, questions, activity}
//   POST /v1/rooms/:code/ask             {pid, text, name?}      → {question}
//   POST /v1/rooms/:code/vote            {pid, questionId}       → {votes}
//   POST /v1/rooms/:code/answer          {pid, choice}           → {ok}
//   POST /v1/rooms/:code/host            {hostKey}               → everything, for the desk
//   POST /v1/rooms/:code/moderate        {hostKey, questionId, action}
//   POST /v1/rooms/:code/settings        {hostKey, moderate?, open?, name?}
//   POST /v1/rooms/:code/activity        {hostKey, activity}     (start/advance/reveal a quiz or poll)
//   POST /v1/rooms/:code/close           {hostKey}
//   POST /v1/rooms/:code/share           {hostKey, on?, frame?}  (the desk shares its screen, or stops)
//   GET  /v1/rooms/:code/screen?after=   (a display: the latest screen, or 204 when nothing is new)
//   POST /v1/rooms/:code/remote          {v, type, payload}      → the desk's answer   (phone remote, relay.ts)
//   POST /v1/rooms/:code/inbox           {hostKey}               → {messages}          (the desk waits for presses)
//   POST /v1/rooms/:code/reply           {hostKey, id, envelope} → {delivered}
//   GET  /j                              type a room code in (for people too far away to scan)
//   GET  /j/:code                        the audience page
//   GET  /d/:code                        a browser or phone as a display (the app's own screen)
//   GET  /r/:code                        the phone remote over the internet (→ /app/remote.html?room=)

import { RELAY, RemoteRelay } from "./relay.ts";
import { MOST_TEAMS } from "../src/lib/domain/game-colors.ts";
import { phoneLanguage, type PhoneLanguage } from "./room-words.ts";

export type QuestionState = "pending" | "approved" | "rejected" | "archived";
export type Question = {
  id: string;
  text: string;
  name: string;
  at: number;
  state: QuestionState;
  hidden: boolean;
  pinned: boolean;
  featured: boolean;
  answered: boolean;
  votes: number;
  /** When recent votes came, for "trending" (kept short). */
  recent: number[];
};

/** A quiz or poll question as the desk sends it (games.ts builds these from a game). */
export type ActivityQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  /** Quiz: the right choice's index; polls have none. */
  correct?: number;
  /** Seconds to answer (0: until the operator closes it). */
  seconds: number;
  points: number;
  image?: string;
  /** A poll of typed words (a word cloud) or a rating from 1 to the number of choices. */
  type?: "words" | "scale";
  /** A rating's two ends, in words. */
  low?: string;
  high?: string;
};

/** Each phone may send this many words to a word cloud, each this long at most. */
export const WORDS = { each: 3, length: 40, shown: 100 };

/** A word as the cloud counts it: the same however it is capitalised or spaced. */
export const wordKey = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s.,!?;:"'“”‘’()-]+|[\s.,!?;:"'“”‘’()-]+$/g, "")
    .trim();

/** Words kept off the screen until the operator says otherwise. Kept short: the operator decides the rest. */
const HIDDEN_WORDS = new Set(["fuck", "fucking", "shit", "bitch", "bastard", "asshole", "dick", "cunt", "porn", "sex", "idiot", "stupid", "hate", "nigger", "faggot", "whore", "slut", "damn", "crap"]);
const offends = (key: string) => key.split(/[\s-]+/).some((part) => HIDDEN_WORDS.has(part));
/** Words that are also people's names: fine as a name, still kept off a word cloud. */
const NAMES_TOO = new Set(["dick"]);
/** A name the screen would show to the whole church: none of the hidden words, other than real names. */
const offensiveName = (name: string) => wordKey(name).split(/[\s-]+/).some((part) => HIDDEN_WORDS.has(part) && !NAMES_TOO.has(part));

/** The words sent to the current word cloud: each once with how many sent it, the most first. */
export function wordCounts(state: RoomState): Array<{ text: string; key: string; count: number; hidden: boolean }> {
  const counts = new Map<string, { text: string; key: string; count: number }>();
  for (const entries of Object.values(state.words ?? {})) {
    for (const text of entries) {
      const key = wordKey(text);
      if (!key) continue;
      const seen = counts.get(key);
      if (seen) seen.count += 1;
      else counts.set(key, { text: text.trim(), key, count: 1 });
    }
  }
  const shown = new Set(state.shownWords ?? []);
  const hidden = new Set(state.hiddenWords ?? []);
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, WORDS.shown)
    .map((word) => ({ ...word, hidden: hidden.has(word.key) || (offends(word.key) && !shown.has(word.key)) }));
}

/**
 * What the audience sees besides Q&A: nothing, a quiz question or a poll. `phase`: open (answering),
 * closed (time up), reveal (right answer and results shown).
 */
export type Activity =
  | { kind: "none" }
  | { kind: "quiz" | "poll"; game: string; round: number; total: number; question: ActivityQuestion; phase: "open" | "closed" | "reveal"; openedAt: number; opensAt?: number; anonymous?: boolean };

/** When answers open: after the reading time, if the desk asked for one. */
const opensAt = (activity: { openedAt: number; opensAt?: number }) => activity.opensAt ?? activity.openedAt;

/**
 * Someone who joined. `n` is their public number (join order) and picks their colour; `gain` is what
 * the last revealed question gave them, `before` their score before it, `streak` right answers in a row.
 */
export type Participant = { name: string; joinedAt: number; score: number; ip: string; n?: number; gain?: number; before?: number; streak?: number; team?: number };

/** How many player colours there are (the desk and phones share the same list, by number). */
export const PLAYER_COLORS = 12;

/** One player as the screen shows them: never their private id. */
export type Ranked = { n: number; name: string; score: number; before: number; gain: number; streak: number; rank: number; was: number };

/**
 * Everyone who has played, best first: their rank now and before the last question (so the screen
 * can show people moving up), the top of the table and the last three.
 */
export function ranking(state: RoomState, top = 10) {
  const people = Object.values(state.participants).map((person, index) => ({ ...person, n: person.n ?? index }));
  const order = (key: "score" | "before") => [...people].sort((a, b) => (key === "score" ? b.score - a.score : (b.before ?? b.score) - (a.before ?? a.score)) || a.joinedAt - b.joinedAt);
  const was = new Map(order("before").map((person, index) => [person.n, index + 1]));
  const all: Ranked[] = order("score").map((person, index) => ({
    n: person.n,
    name: person.name || "Guest",
    score: person.score,
    before: person.before ?? person.score,
    gain: person.gain ?? 0,
    streak: person.streak ?? 0,
    rank: index + 1,
    was: was.get(person.n) ?? index + 1,
  }));
  return { players: all.length, top: all.slice(0, top), bottom: all.length > top ? all.slice(-3) : [] };
}

export type RoomState = {
  code: string;
  name: string;
  createdAt: number;
  touchedAt: number;
  hostKeyHash: string;
  /** Questions wait for approval (true) or appear at once (false). */
  moderate: boolean;
  /** Questions can be asked. */
  open: boolean;
  closed: boolean;
  questions: Question[];
  participants: Record<string, Participant>;
  /** Who upvoted what: question id → participant ids (and network addresses, hashed). */
  voters: Record<string, string[]>;
  /** Who asked each question (so they can see it waiting for the operator). */
  askedBy: Record<string, string>;
  voterAddresses: Record<string, Record<string, number>>;
  activity: Activity;
  /** Answers to the current activity question: participant → {choice, at}. */
  answers: Record<string, { choice: number; at: number }>;
  /** A word cloud's words: participant → what they typed (a few each). */
  words?: Record<string, string[]>;
  /** Words the operator took off the screen, and flagged ones they let through (by wordKey). */
  hiddenWords?: string[];
  shownWords?: string[];
  /** Asks per participant, for the rate limit (times). */
  asked: Record<string, number[]>;
  /**
   * What the church's screen shows, for browsers and phones used as displays (/d/CODE), while the
   * desk shares it: the Program frame as the desk sent it, and a number that goes up with each.
   */
  screen?: { on: boolean; revision: number; frame: string; at: number };
  /** Team mode: how many teams (2 to 4); absent or 0, everyone plays for themselves. */
  teams?: number;
  /** The next joiner's number (join order); it only goes up. */
  nextN?: number;
};

export type RoomStorage = { get(): Promise<RoomState | null>; put(state: RoomState): Promise<void>; drop(): Promise<void> };

export const LIMITS = {
  /** One Program frame (words, theme, layout; pictures stay on the church's computer). */
  frameBytes: 256 * 1024,
  questionLength: 280,
  nameLength: 40,
  questions: 500,
  participants: 2000,
  /** Questions one person may ask in ten minutes. */
  asksPer10Min: 5,
  /**
   * Upvotes for one question from one network address. A church's Wi-Fi is one address for everyone
   * in the room, and each person votes once, so this only stops one phone posing as a crowd.
   */
  votesPerAddress: 600,
  /** A room nobody uses for this long closes by itself. */
  idleMs: 24 * 60 * 60_000,
};

const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
export const randomCode = () => Array.from(crypto.getRandomValues(new Uint32Array(6)), (n) => CODE_LETTERS[n % CODE_LETTERS.length]).join("");
export const randomId = (bytes = 9) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async (text: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
const clean = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
        .trim()
        .slice(0, max)
    : "";
export const isCode = (value: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(value);

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string; suggestion?: string };
const fail = (status: number, error: string): Result<never> => ({ ok: false, status, error });

/** A name as the screen tells names apart: case, spacing and look-alike forms set aside. */
const nameKey = (name: string) => name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/** Two people in a room never share a name (the screen and the leaderboard show it). No name never clashes. */
function nameTaken(state: RoomState, name: string, self?: string): Result<never> | null {
  const key = nameKey(name);
  if (!key) return null;
  const taken = new Set(Object.entries(state.participants).filter(([pid]) => pid !== self).map(([, person]) => nameKey(person.name)));
  if (!taken.has(key)) return null;
  let n = 2;
  while (taken.has(nameKey(`${name} ${n}`))) n++;
  return { ok: false, status: 409, error: `Someone here is already called ${name}. Choose another name.`, suggestion: `${name} ${n}`.slice(0, LIMITS.nameLength) };
}

/** What the audience may see of a question (no other people's ids or addresses). */
export function publicQuestion(question: Question, pid: string | null, state: RoomState) {
  return {
    id: question.id,
    text: question.text,
    name: question.name,
    at: question.at,
    votes: question.votes,
    pinned: question.pinned,
    featured: question.featured,
    answered: question.answered,
    mine: !!pid && (state.voters[question.id] ?? []).includes(pid),
  };
}

/** The audience's view of an activity: never the right answer before it is revealed. */
export function publicActivity(state: RoomState, pid: string | null, now: number, placeOf?: (n: number) => { rank: number | null; players: number }, counted?: number[]) {
  const activity = state.activity;
  if (activity.kind === "none") return { kind: "none" as const };
  const { correct, ...question } = activity.question;
  const mine = pid ? state.answers[pid] : undefined;
  const counts = counted ?? activity.question.choices.map((_, index) => Object.values(state.answers).filter((answer) => answer.choice === index).length);
  const reveal = activity.phase === "reveal";
  return {
    kind: activity.kind,
    game: activity.game,
    round: activity.round,
    total: activity.total,
    phase: activity.phase,
    question,
    opensAt: opensAt(activity),
    endsAt: activity.question.seconds ? opensAt(activity) + activity.question.seconds * 1000 : null,
    now,
    answered: mine ? mine.choice : null,
    ...(activity.question.type === "words" && pid ? { mine: state.words?.[pid] ?? [], each: WORDS.each } : {}),
    ...(reveal && activity.question.type === "words" ? { cloud: wordCounts(state).filter((word) => !word.hidden).slice(0, 40).map(({ text, count }) => ({ text, count })) } : {}),
    // An anonymous poll: the phone says so (nothing ties a vote to a name anywhere).
    ...(activity.anonymous ? { anonymous: true } : {}),
    ...(reveal ? { correct: activity.kind === "quiz" ? correct : undefined, counts } : {}),
    ...(reveal && activity.kind === "quiz" && pid ? { score: state.participants[pid]?.score ?? 0, ...standing(state, pid, placeOf) } : {}),
  };
}

/** A player's own place after a reveal: what they gained, their streak and rank. */
function standing(state: RoomState, pid: string, placeOf?: (n: number) => { rank: number | null; players: number }) {
  const person = state.participants[pid];
  if (!person) return {};
  // The room hands in its ranking, worked out once; without it, rank everyone here.
  if (placeOf) return { gain: person.gain ?? 0, streak: person.streak ?? 0, ...placeOf(person.n ?? -1) };
  const all = ranking(state, Number.MAX_SAFE_INTEGER).top;
  const me = all.find((entry) => entry.n === (person.n ?? -1));
  return { gain: person.gain ?? 0, streak: person.streak ?? 0, rank: me?.rank ?? null, players: all.length };
}

/** Teams take turns by join order, so they stay even as people arrive. */
const teamOf = (n: number, teams: number) => ((n % teams) + teams) % teams;

/**
 * Team standings, best first: each team's average score (so a small team can win) and what it
 * gained on the last question. Null when the room plays without teams.
 */
export function teamRanking(state: RoomState): Array<{ team: number; players: number; score: number; gain: number }> | null {
  const count = state.teams ?? 0;
  if (count < 2) return null;
  const teams = Array.from({ length: count }, (_, team) => ({ team, players: 0, total: 0, gained: 0 }));
  for (const person of Object.values(state.participants)) {
    const entry = teams[person.team ?? teamOf(person.n ?? 0, count)];
    if (!entry) continue;
    entry.players += 1;
    entry.total += person.score;
    entry.gained += person.gain ?? 0;
  }
  return teams
    .map((entry) => ({ team: entry.team, players: entry.players, score: entry.players ? Math.round(entry.total / entry.players) : 0, gain: entry.players ? Math.round(entry.gained / entry.players) : 0 }))
    .sort((a, b) => b.score - a.score || a.team - b.team);
}

/** The first right answer to the question that is open (a quiz): who, and how quickly. */
export function fastest(state: RoomState): { n: number; name: string; ms: number } | null {
  const activity = state.activity;
  if (activity.kind !== "quiz") return null;
  let best: { pid: string; at: number } | null = null;
  for (const [pid, answer] of Object.entries(state.answers)) {
    if (answer.choice === activity.question.correct && (!best || answer.at < best.at)) best = { pid, at: answer.at };
  }
  const person = best && state.participants[best.pid];
  return best && person ? { n: person.n ?? 0, name: person.name || "Guest", ms: Math.max(0, best.at - opensAt(activity)) } : null;
}

/** The top of the leaderboard (names and scores only). */
export function leaderboard(state: RoomState, size = 10) {
  return Object.values(state.participants)
    .filter((person) => person.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, size)
    .map((person) => ({ name: person.name || "Guest", score: person.score }));
}

/** The rules of a room. Every method loads the room, changes it, and saves it. */
/** A phone checks in every few seconds while it is open: one heard from this lately is in the room. */
export const HERE_MS = 30_000;
/** At a new game, people not heard from for this long have gone and are left out of it. */
export const GONE_MS = 2 * 60_000;
/** How long answers wait in memory before the room is written (at most). */
export const ANSWER_FLUSH_MS = 400;

export class RoomCore {
  /**
   * When each person's phone last checked in. Kept in memory, not saved: a phone polls every few
   * seconds, and writing each poll to storage would cost more than knowing who is here is worth.
   */
  private seen = new Map<string, number>();
  /**
   * When this copy of the room started. The check-ins live in memory, so after a restart (a deploy,
   * or the room waking up) everyone counts as heard from at that moment, until their phones say
   * otherwise: nobody is dropped from a game because the server forgot them.
   */
  private readonly startedAt: number;

  constructor(
    private store: RoomStorage,
    private now: () => number = () => Date.now(),
  ) {
    this.startedAt = now();
  }

  private touch(pid: unknown) {
    if (typeof pid === "string" && pid) this.seen.set(pid, this.now());
  }

  /** Last heard from: a check-in, or joining when there has been none since. */
  private lastSeen(pid: string, person: Participant) {
    return Math.max(this.seen.get(pid) ?? 0, person.joinedAt, this.startedAt);
  }

  private here(state: RoomState) {
    const now = this.now();
    return Object.entries(state.participants).filter(([pid, person]) => now - this.lastSeen(pid, person) <= HERE_MS);
  }

  /**
   * The room as it is now, kept in memory between requests: a room is one object on one thread, so
   * this copy is the truth, and a phone checking in no longer reads (and copies) the whole room from
   * storage. Undefined until first read.
   */
  private live: RoomState | null | undefined;
  /** Everyone ranked, worked out once after the scores change (not once per phone per check-in). */
  private ranks: { all: Ranked[]; byN: Map<number, Ranked> } | null = null;
  /** What every phone is shown alike (the vote counts, the top five), worked out once per change. */
  private shared: { counts: number[]; top: Array<{ name: string; score: number }> } | null = null;
  /** A save waiting to be written, while answers pour in. */
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  private async load(): Promise<RoomState | null> {
    if (this.live === undefined) this.live = await this.store.get();
    const state = this.live;
    if (!state) return null;
    if (state.closed || this.now() - state.touchedAt > LIMITS.idleMs) return null;
    return state;
  }

  private async save(state: RoomState) {
    state.touchedAt = this.now();
    this.live = state;
    this.ranks = null;
    this.shared = null;
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    await this.store.put(state);
  }

  /**
   * Answers arrive by the hundred in a few seconds: each is kept at once (in memory, so the next
   * request sees it), and the room is written once for the lot a moment later, not once per answer.
   */
  private saveSoon(state: RoomState) {
    state.touchedAt = this.now();
    this.live = state;
    this.ranks = null;
    this.shared = null;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      if (this.live) void this.store.put(this.live);
    }, ANSWER_FLUSH_MS);
  }

  private sharedFor(state: RoomState) {
    if (!this.shared) {
      const counts = new Array<number>(state.activity.kind === "none" ? 0 : state.activity.question.choices.length).fill(0);
      for (const answer of Object.values(state.answers)) if (answer.choice < counts.length) counts[answer.choice]! += 1;
      this.shared = { counts, top: leaderboard(state, 5) };
    }
    return this.shared;
  }

  /** Everyone's place, best first, from the scores as they are now. */
  private ranked(state: RoomState) {
    if (!this.ranks) {
      const all = ranking(state, Number.MAX_SAFE_INTEGER).top;
      this.ranks = { all, byN: new Map(all.map((entry) => [entry.n, entry])) };
    }
    return this.ranks;
  }

  private async host(hostKey: unknown): Promise<Result<RoomState>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    if (typeof hostKey !== "string" || (await sha256(hostKey)) !== state.hostKeyHash) return fail(403, "Only the church's Church Studio can do that.");
    return { ok: true, data: state };
  }

  async create(code: string, name: string): Promise<Result<{ hostKey: string }>> {
    if (await this.store.get().then((state) => state && !state.closed)) return fail(409, "taken");
    const hostKey = `rk_${randomId(24)}`;
    const now = this.now();
    this.ranks = null;
    this.live = undefined;
    await this.store.put({
      code,
      name: clean(name, 60) || "Church",
      createdAt: now,
      touchedAt: now,
      hostKeyHash: await sha256(hostKey),
      // A new room starts with questions off and nothing held for approval: most rooms are opened
      // for a quiz or a poll, and the desk turns questions on when it wants them.
      moderate: false,
      open: false,
      closed: false,
      questions: [],
      participants: {},
      voters: {},
      askedBy: {},
      voterAddresses: {},
      activity: { kind: "none" },
      answers: {},
      asked: {},
    });
    return { ok: true, data: { hostKey } };
  }

  async join(name: unknown, ip: string): Promise<Result<{ pid: string; room: { name: string; code: string }; n: number }>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    if (Object.keys(state.participants).length >= LIMITS.participants) return fail(429, "This room is full.");
    const wanted = clean(name, LIMITS.nameLength).replace(/\s+/g, " ");
    if (offensiveName(wanted)) return fail(400, "Choose another name: this one is shown on the screen.");
    const clash = nameTaken(state, wanted);
    if (clash) return clash;
    const pid = randomId(12);
    // Each joiner a number of their own, which picks their colour on the screen and their phone.
    // Never reused, even after people who left are taken out of a new game: the number keys their
    // name on the screen and picks their colour, so two people must never share one.
    const n = state.nextN ?? Object.values(state.participants).reduce((most, person) => Math.max(most, (person.n ?? 0) + 1), Object.keys(state.participants).length);
    state.nextN = n + 1;
    state.participants[pid] = { name: wanted, joinedAt: this.now(), score: 0, ip, n, gain: 0, before: 0, streak: 0, ...(state.teams && state.teams >= 2 ? { team: teamOf(n, state.teams) } : {}) };
    await this.save(state);
    this.touch(pid);
    return { ok: true, data: { pid, room: { name: state.name, code: state.code }, n } };
  }

  /** A player changes their name, to one nobody else in the room has. */
  async rename(pid: unknown, name: unknown): Promise<Result<{ name: string }>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    if (typeof pid !== "string" || !state.participants[pid]) return fail(401, "Join the room first.");
    this.touch(pid);
    const wanted = clean(name, LIMITS.nameLength).replace(/\s+/g, " ");
    if (!wanted) return fail(400, "Type a name.");
    if (offensiveName(wanted)) return fail(400, "Choose another name: this one is shown on the screen.");
    const clash = nameTaken(state, wanted, pid);
    if (clash) return clash;
    state.participants[pid]!.name = wanted;
    await this.save(state);
    return { ok: true, data: { name: wanted } };
  }

  /** What a phone sees: the room, the questions the operator lets through, and the activity. */
  async view(pid: string | null): Promise<Result<unknown>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    const known = pid && state.participants[pid] ? pid : null;
    if (known) this.touch(known);
    const questions = state.questions.filter((question) => question.state === "approved" && !question.hidden).map((question) => publicQuestion(question, known, state));
    const mine = known ? state.questions.filter((question) => question.state === "pending" && state.askedBy[question.id] === known).length : 0;
    return {
      ok: true,
      data: {
        room: { name: state.name, code: state.code, open: state.open, moderate: state.moderate },
        questions,
        waiting: mine,
        activity: publicActivity(state, known, this.now(), (n) => ({ rank: this.ranked(state).byN.get(n)?.rank ?? null, players: this.ranked(state).all.length }), this.sharedFor(state).counts),
        ...(state.activity.kind !== "none" && state.activity.phase === "reveal" && state.activity.kind === "quiz" ? { leaderboard: this.sharedFor(state).top } : {}),
        ...(known ? { me: { n: state.participants[known]!.n ?? 0, name: state.participants[known]!.name, ...(state.teams && state.teams >= 2 ? { team: state.participants[known]!.team ?? teamOf(state.participants[known]!.n ?? 0, state.teams) } : {}) } } : {}),
      },
    };
  }

  async ask(pid: unknown, text: unknown, name: unknown): Promise<Result<{ id: string; state: QuestionState }>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    if (typeof pid !== "string" || !state.participants[pid]) return fail(401, "Join the room first.");
    this.touch(pid);
    if (!state.open) return fail(403, "Questions are closed for now.");
    const words = clean(text, LIMITS.questionLength);
    if (words.length < 3) return fail(400, "Type a question first.");
    if (state.questions.length >= LIMITS.questions) return fail(429, "This room has taken all the questions it can.");
    const now = this.now();
    const recent = (state.asked[pid] ?? []).filter((at) => now - at < 10 * 60_000);
    if (recent.length >= LIMITS.asksPer10Min) return fail(429, "You have asked a few already. Try again in a few minutes.");
    const question: Question = {
      id: randomId(8),
      text: words,
      name: clean(name, LIMITS.nameLength) || state.participants[pid]!.name || "",
      at: now,
      state: state.moderate ? "pending" : "approved",
      hidden: false,
      pinned: false,
      featured: false,
      answered: false,
      votes: 0,
      recent: [],
    };
    state.questions.push(question);
    state.askedBy[question.id] = pid;
    state.asked[pid] = [...recent, now];
    await this.save(state);
    return { ok: true, data: { id: question.id, state: question.state } };
  }

  async vote(pid: unknown, questionId: unknown, ipHash: string): Promise<Result<{ votes: number }>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    if (typeof pid !== "string" || !state.participants[pid]) return fail(401, "Join the room first.");
    this.touch(pid);
    const question = state.questions.find((entry) => entry.id === questionId && entry.state === "approved" && !entry.hidden);
    if (!question) return fail(404, "That question is not up any more.");
    const voters = state.voters[question.id] ?? [];
    const addresses = (state.voterAddresses[question.id] ??= {});
    // One vote per person per question; pressing again takes it back.
    if (voters.includes(pid)) {
      state.voters[question.id] = voters.filter((entry) => entry !== pid);
      question.votes = Math.max(0, question.votes - 1);
      addresses[ipHash] = Math.max(0, (addresses[ipHash] ?? 1) - 1);
    } else {
      if ((addresses[ipHash] ?? 0) >= LIMITS.votesPerAddress) return fail(429, "Too many votes from this network for one question.");
      state.voters[question.id] = [...voters, pid];
      question.votes += 1;
      addresses[ipHash] = (addresses[ipHash] ?? 0) + 1;
      question.recent = [...question.recent.filter((at) => this.now() - at < 15 * 60_000), this.now()].slice(-200);
    }
    await this.save(state);
    return { ok: true, data: { votes: question.votes } };
  }

  async answer(pid: unknown, choice: unknown, text?: unknown): Promise<Result<{ ok: true }>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    if (typeof pid !== "string" || !state.participants[pid]) return fail(401, "Join the room first.");
    this.touch(pid);
    const activity = state.activity;
    if (activity.kind === "none" || activity.phase !== "open") return fail(409, "Answers are closed.");
    const now = this.now();
    if (activity.question.seconds && now > opensAt(activity) + activity.question.seconds * 1000 + 1500) return fail(409, "Time is up.");
    // A word cloud: a few words each, sent one at a time.
    if (activity.question.type === "words") {
      const words = clean(text, WORDS.length);
      if (!wordKey(words)) return fail(400, "Type a word or two.");
      const mine = (state.words ??= {})[pid] ?? [];
      if (mine.length >= WORDS.each) return fail(409, "You have sent your words.");
      if (mine.some((entry) => wordKey(entry) === wordKey(words))) return fail(409, "You sent that already.");
      state.words[pid] = [...mine, words];
      if (!state.answers[pid]) state.answers[pid] = { choice: 0, at: now };
      this.saveSoon(state);
      return { ok: true, data: { ok: true } };
    }
    const index = Number(choice);
    if (!Number.isInteger(index) || index < 0 || index >= activity.question.choices.length) return fail(400, "Choose one of the answers.");
    if (state.answers[pid]) return fail(409, "You have answered already.");
    state.answers[pid] = { choice: index, at: now };
    this.saveSoon(state);
    return { ok: true, data: { ok: true } };
  }

  /** Everything, for the desk. */
  /** The desk renames a player (a name not for the screen) or takes them out; their phone goes back to joining. */
  async player(hostKey: unknown, input: { n?: unknown; name?: unknown; remove?: unknown }): Promise<Result<{ name?: string; removed?: boolean }>> {
    const found = await this.host(hostKey);
    if (!found.ok) return found;
    const state = found.data;
    const pid = Object.keys(state.participants).find((key) => state.participants[key]!.n === input.n);
    if (!pid) return fail(404, "That person is not in the room any more.");
    if (input.remove === true) {
      delete state.participants[pid];
      this.seen.delete(pid);
      await this.save(state);
      return { ok: true, data: { removed: true } };
    }
    const wanted = clean(input.name, LIMITS.nameLength).replace(/\s+/g, " ");
    if (!wanted) return fail(400, "Type a name.");
    const clash = nameTaken(state, wanted, pid);
    if (clash) return clash;
    state.participants[pid]!.name = wanted;
    await this.save(state);
    return { ok: true, data: { name: wanted } };
  }

  async hostView(hostKey: unknown): Promise<Result<unknown>> {
    const found = await this.host(hostKey);
    if (!found.ok) return found;
    const state = found.data;
    return {
      ok: true,
      data: {
        room: { name: state.name, code: state.code, open: state.open, moderate: state.moderate, createdAt: state.createdAt },
        // Here now (phones heard from lately), not everyone who ever joined this room.
        people: this.here(state).length,
        questions: state.questions.map(({ recent, ...question }) => ({ ...question, trending: recent.filter((at) => this.now() - at < 15 * 60_000).length })),
        activity: state.activity,
        answers: state.activity.kind === "none" ? [] : state.activity.question.choices.map((_, index) => Object.values(state.answers).filter((answer) => answer.choice === index).length),
        ...(state.activity.kind !== "none" && state.activity.question.type === "words" ? { words: wordCounts(state) } : {}),
        answered: Object.keys(state.answers).length,
        leaderboard: leaderboard(state, 10),
        // The table keeps everyone who scored, but "players in" is who is here now: the same number
        // the desk shows, so the screen and the operator never disagree.
        ranking: ((all) => ({ players: this.here(state).length, top: all.slice(0, 10), bottom: all.length > 10 ? all.slice(-3) : [] }))(this.ranked(state).all),
        fastest: fastest(state),
        teams: teamRanking(state),
        // Who is here, newest last (the lobby shows names popping in).
        joined: this.here(state)
          .map(([, person]) => person)
          .sort((a, b) => a.joinedAt - b.joinedAt)
          .slice(-300)
          .map((person, index) => ({ n: person.n ?? index, name: person.name || "Guest" })),
      },
    };
  }

  async moderate(hostKey: unknown, questionId: unknown, action: unknown): Promise<Result<{ ok: true }>> {
    const found = await this.host(hostKey);
    if (!found.ok) return found;
    const state = found.data;
    const question = state.questions.find((entry) => entry.id === questionId);
    if (!question) return fail(404, "No such question.");
    switch (action) {
      case "approve":
        question.state = "approved";
        break;
      case "reject":
        question.state = "rejected";
        break;
      case "archive":
        question.state = "archived";
        break;
      case "restore":
        question.state = "pending";
        break;
      case "hide":
        question.hidden = true;
        break;
      case "show":
        question.hidden = false;
        break;
      case "pin":
        question.pinned = !question.pinned;
        break;
      case "feature":
        // One featured question at a time.
        for (const other of state.questions) if (other !== question) other.featured = false;
        question.featured = !question.featured;
        break;
      case "answered":
        question.answered = !question.answered;
        break;
      default:
        return fail(400, "Unknown action.");
    }
    await this.save(state);
    return { ok: true, data: { ok: true } };
  }

  async settings(hostKey: unknown, input: { moderate?: unknown; open?: unknown; name?: unknown }): Promise<Result<{ ok: true }>> {
    const found = await this.host(hostKey);
    if (!found.ok) return found;
    const state = found.data;
    if (typeof input.moderate === "boolean") state.moderate = input.moderate;
    if (typeof input.open === "boolean") state.open = input.open;
    if (typeof input.name === "string" && clean(input.name, 60)) state.name = clean(input.name, 60);
    await this.save(state);
    return { ok: true, data: { ok: true } };
  }

  /**
   * The desk runs quizzes and polls: it sends each question to open it, then closes it and reveals
   * the answer. Scores are given at reveal: points for a right answer, more for a quicker one.
   */
  async activity(hostKey: unknown, input: { action?: unknown; kind?: unknown; game?: unknown; round?: unknown; total?: unknown; question?: unknown; readMs?: unknown; teams?: unknown; anonymous?: unknown; word?: unknown }): Promise<Result<{ ok: true }>> {
    const found = await this.host(hostKey);
    if (!found.ok) return found;
    const state = found.data;
    const now = this.now();
    if (input.action === "open") {
      const question = cleanQuestion(input.question);
      if (!question) return fail(400, "A question needs words and two or more answers.");
      const kind = input.kind === "poll" ? "poll" : "quiz";
      if (kind === "quiz" && question.correct === undefined) return fail(400, "Mark the right answer.");
      // Reading time first (up to ten seconds): the clock and the quick bonus start when it ends.
      const readMs = Math.min(10_000, Math.max(0, Math.round(Number(input.readMs) || 0)));
      state.activity = { kind, game: clean(input.game, 80), round: Math.max(1, Number(input.round) || 1), total: Math.max(1, Number(input.total) || 1), question, phase: "open", openedAt: now, ...(readMs ? { opensAt: now + readMs } : {}), ...(kind === "poll" && input.anonymous === true ? { anonymous: true } : {}) };
      state.answers = {};
      state.words = {};
      state.hiddenWords = [];
      state.shownWords = [];
    } else if (input.action === "close") {
      if (state.activity.kind === "none") return fail(409, "Nothing is open.");
      state.activity = { ...state.activity, phase: "closed" };
    } else if (input.action === "reveal") {
      const activity = state.activity;
      if (activity.kind === "none") return fail(409, "Nothing is open.");
      if (activity.phase !== "reveal" && activity.kind === "quiz") {
        for (const [pid, person] of Object.entries(state.participants)) {
          const answer = state.answers[pid];
          person.before = person.score;
          if (!answer || answer.choice !== activity.question.correct) {
            person.gain = 0;
            person.streak = 0;
            continue;
          }
          // Up to half as many points again for answering quickly, and 100 more for each right
          // answer in a row after the first (up to 500).
          const seconds = activity.question.seconds || 30;
          const quick = Math.min(1, Math.max(0, 1 - (answer.at - opensAt(activity)) / (seconds * 1000)));
          person.streak = (person.streak ?? 0) + 1;
          const gain = Math.round(activity.question.points * (1 + quick / 2)) + Math.min(500, (person.streak - 1) * 100);
          person.gain = gain;
          person.score += gain;
        }
      }
      state.activity = { ...activity, phase: "reveal" };
    } else if (input.action === "end") {
      state.activity = { kind: "none" };
      state.answers = {};
    } else if (input.action === "teams") {
      // 0 (or 1): everyone for themselves. 2 to 4: everyone is placed in a team, evenly by join order.
      const count = Math.min(MOST_TEAMS, Math.max(0, Math.round(Number(input.teams) || 0)));
      if (count >= 2) {
        state.teams = count;
        for (const person of Object.values(state.participants)) person.team = teamOf(person.n ?? 0, count);
      } else {
        delete state.teams;
        for (const person of Object.values(state.participants)) delete person.team;
      }
    } else if (input.action === "hide-word" || input.action === "show-word") {
      const key = wordKey(clean(input.word, WORDS.length));
      if (!key) return fail(400, "Which word?");
      const hide = input.action === "hide-word";
      state.hiddenWords = (state.hiddenWords ?? []).filter((word) => word !== key).concat(hide ? [key] : []);
      state.shownWords = (state.shownWords ?? []).filter((word) => word !== key).concat(hide ? [] : [key]);
    } else if (input.action === "reset-scores") {
      // A new game: people who have gone (not heard from for a while) are left out of it, so they
      // do not fill the leaderboard; anyone still here keeps their place and colour.
      const now = this.now();
      for (const [pid, person] of Object.entries(state.participants)) {
        if (now - this.lastSeen(pid, person) > GONE_MS) {
          delete state.participants[pid];
          this.seen.delete(pid);
        }
      }
      for (const person of Object.values(state.participants)) Object.assign(person, { score: 0, before: 0, gain: 0, streak: 0 });
    } else return fail(400, "Unknown action.");
    await this.save(state);
    return { ok: true, data: { ok: true } };
  }

  /** The desk sends what is on its screen (or stops sharing it). */
  async share(hostKey: unknown, input: { on?: unknown; frame?: unknown }): Promise<Result<{ revision: number }>> {
    const found = await this.host(hostKey);
    if (!found.ok) return found;
    const state = found.data;
    const current = state.screen ?? { on: false, revision: 0, frame: "", at: 0 };
    if (input.on === false) {
      state.screen = { on: false, revision: current.revision + 1, frame: "", at: this.now() };
    } else {
      const frame = typeof input.frame === "string" ? input.frame : "";
      if (!frame || frame.length > LIMITS.frameBytes) return fail(413, "That screen is too large to share.");
      try {
        JSON.parse(frame);
      } catch {
        return fail(400, "That is not a screen.");
      }
      state.screen = { on: true, revision: current.revision + 1, frame, at: this.now() };
    }
    await this.save(state);
    return { ok: true, data: { revision: state.screen.revision } };
  }

  /** A display asks for the screen: nothing new since `after`, or the latest frame. */
  async screen(after: number): Promise<Result<{ on: boolean; revision: number; frame?: string; name: string } | null>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    const screen = state.screen ?? { on: false, revision: 0, frame: "", at: 0 };
    if (screen.revision === after) return { ok: true, data: null };
    return { ok: true, data: { on: screen.on, revision: screen.revision, name: state.name, ...(screen.on ? { frame: screen.frame } : {}) } };
  }

  /** Whether the room is open (a phone remote's message is only relayed into a live room). */
  async exists(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  /** The desk relaying its phone remote: only the church's Church Studio, and it keeps the room alive. */
  async relayHost(hostKey: unknown): Promise<Result<{ ok: true }>> {
    const found = await this.host(hostKey);
    if (!found.ok) return found;
    // Waiting on the inbox all day is use: touched again hourly, not on every request.
    if (this.now() - found.data.touchedAt > 60 * 60_000) await this.save(found.data);
    return { ok: true, data: { ok: true } };
  }

  async close(hostKey: unknown): Promise<Result<{ ok: true }>> {
    const found = await this.host(hostKey);
    if (!found.ok) return found;
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    this.live = null;
    await this.store.drop();
    return { ok: true, data: { ok: true } };
  }
}

export function cleanQuestion(value: unknown): ActivityQuestion | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const prompt = clean(input.prompt, 300);
  const type = input.type === "words" || input.type === "scale" ? input.type : undefined;
  // A rating is the numbers 1 to 5 or 10; a word cloud has no choices at all.
  const choices = type === "words" ? [] : type === "scale" ? Array.from({ length: Number(input.choices && Array.isArray(input.choices) ? input.choices.length : 5) === 10 ? 10 : 5 }, (_, n) => String(n + 1)) : (Array.isArray(input.choices) ? input.choices : []).map((choice) => clean(choice, 120)).filter(Boolean).slice(0, 6);
  if (!prompt || (type !== "words" && choices.length < 2)) return null;
  const correct = Number.isInteger(input.correct) && Number(input.correct) >= 0 && Number(input.correct) < choices.length ? Number(input.correct) : undefined;
  const image = typeof input.image === "string" && /^https:\/\/[^\s"'<>]{1,500}$/.test(input.image) ? input.image : undefined;
  return {
    id: clean(input.id, 40) || randomId(6),
    prompt,
    choices,
    ...(correct !== undefined ? { correct } : {}),
    seconds: Math.min(120, Math.max(0, Math.round(Number(input.seconds) || 0))),
    points: Math.min(5000, Math.max(0, Math.round(Number(input.points) || 1000))),
    ...(image ? { image } : {}),
    ...(type ? { type } : {}),
    ...(type === "scale" && clean(input.low, 40) ? { low: clean(input.low, 40) } : {}),
    ...(type === "scale" && clean(input.high, 40) ? { high: clean(input.high, 40) } : {}),
  };
}

// --- On Cloudflare ----------------------------------------------------------------------------

type DurableState = { storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void>; deleteAll(): Promise<void>; setAlarm(at: number): Promise<void> } };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" } });

/** One room: its state in the object's own storage, its rules in RoomCore. */
export class RoomObject {
  private core: RoomCore;
  private relay: RemoteRelay;
  // Cloudflare makes the object with (state, env): nothing else may sit in the second place.
  constructor(private state: DurableState) {
    this.relay = new RemoteRelay();
    this.core = new RoomCore({
      get: async () => (await state.storage.get<RoomState>("room")) ?? null,
      put: async (room) => {
        await state.storage.put("room", room);
        // Gone a day after the last use (the alarm checks and clears it).
        await state.storage.setAlarm(Date.now() + LIMITS.idleMs + 60_000);
      },
      drop: () => state.storage.deleteAll(),
    });
  }

  async alarm() {
    const room = await this.state.storage.get<RoomState>("room");
    if (!room || Date.now() - room.touchedAt > LIMITS.idleMs) await this.state.storage.deleteAll();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split("/").pop() ?? "";
    const body = request.method === "POST" ? await request.text() : "";
    const limit = action === "remote" ? RELAY.messageBytes : action === "reply" ? RELAY.replyBytes + 1024 : action === "share" ? LIMITS.frameBytes * 2 + 4096 : 64 * 1024;
    if (body.length > limit) return json(413, { error: "Too large." });
    const input = body ? ((() => { try { return JSON.parse(body); } catch { return {}; } })() as Record<string, unknown>) : {};
    const ip = request.headers.get("x-room-ip") ?? "";
    const reply = (result: Result<unknown>) => (result.ok ? json(200, result.data) : json(result.status, { error: result.error, ...(result.suggestion ? { suggestion: result.suggestion } : {}) }));
    switch (action) {
      case "create":
        return reply(await this.core.create(String(input.code ?? ""), String(input.name ?? "")));
      case "join":
        return reply(await this.core.join(input.name, ip));
      case "rename":
        return reply(await this.core.rename(input.pid, input.name));
      case "player":
        return reply(await this.core.player(input.hostKey, input));
      case "state":
        return reply(await this.core.view(url.searchParams.get("pid")));
      case "ask":
        return reply(await this.core.ask(input.pid, input.text, input.name));
      case "vote":
        return reply(await this.core.vote(input.pid, input.questionId, ip));
      case "answer":
        return reply(await this.core.answer(input.pid, input.choice, input.text));
      case "host":
        return reply(await this.core.hostView(input.hostKey));
      case "moderate":
        return reply(await this.core.moderate(input.hostKey, input.questionId, input.action));
      case "settings":
        return reply(await this.core.settings(input.hostKey, input));
      case "activity":
        return reply(await this.core.activity(input.hostKey, input));
      case "close":
        return reply(await this.core.close(input.hostKey));
      case "share":
        return reply(await this.core.share(input.hostKey, input));
      // The phone remote over the internet (relay.ts): a phone's message, the desk's inbox, its answer.
      case "remote": {
        if (!(await this.core.exists())) return json(404, { error: "This remote link has ended. Ask for a new code." });
        const answer = await this.relay.send(input);
        return answer === null ? json(503, { error: "The desk is not connected. Check that Church Studio is open and on the internet." }) : json(200, answer);
      }
      case "inbox": {
        const host = await this.core.relayHost(input.hostKey);
        if (!host.ok) return reply(host);
        return json(200, { messages: await this.relay.take() });
      }
      case "reply": {
        const host = await this.core.relayHost(input.hostKey);
        if (!host.ok) return reply(host);
        if (JSON.stringify(input.envelope ?? null).length > RELAY.replyBytes) return json(413, { error: "Too large." });
        return json(200, { delivered: this.relay.reply(String(input.id ?? ""), input.envelope) });
      }
      case "screen": {
        const result = await this.core.screen(Number(url.searchParams.get("after")) || 0);
        // Nothing new: an empty answer, so a display asking every second costs almost nothing.
        if (result.ok && result.data === null) return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } });
        return reply(result);
      }
      default:
        return json(404, { error: "Not found" });
    }
  }
}

export type RoomNamespace = { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request | string, init?: RequestInit): Promise<Response> } };

/**
 * The public routes: open a room (the desk), and everything a phone does in one. `limit` is the
 * per-address rate limiter (api.ts tooFast); `page` draws the audience page.
 */
/**
 * `limit` is the strict per-address limiter (a few a minute): opening rooms. `crowd` is the roomy one
 * for a congregation joining at once: a church's whole Wi-Fi reaches us as one address, so joins,
 * questions, renames and phone remote messages are counted per room and address, and each person's
 * own limits stay in the room.
 */
export async function handleRooms(
  request: Request,
  rooms: RoomNamespace | undefined,
  origin: string,
  page: (code: string, origin: string, language?: PhoneLanguage) => string,
  limit?: (key: string) => Promise<boolean>,
  crowd?: (key: string) => Promise<boolean>,
): Promise<Response | null> {
  const language = phoneLanguage(request.headers.get("accept-language"));
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS" && path.startsWith("/v1/rooms")) return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" } });
  // A browser or phone as a display: the app's own screen, showing what the church's screen shows.
  const displayPage = path.match(/^\/d\/([A-Za-z0-9]{6})$/);
  if (displayPage && request.method === "GET") return Response.redirect(`${origin}/app/?receiver=${displayPage[1]!.toUpperCase()}`, 302);
  // The short address on the screen: type the code in by hand.
  if ((path === "/j" || path === "/j/") && request.method === "GET") return new Response(page("", origin, language), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  // The phone remote's short address (typed when the QR code cannot be scanned).
  const remotePage = path.match(/^\/r\/([A-Za-z0-9]{6})$/);
  if (remotePage && request.method === "GET") return Response.redirect(`${origin}/app/remote.html?room=${remotePage[1]!.toUpperCase()}`, 302);
  const joinPage = path.match(/^\/j\/([A-Za-z0-9]{6})$/);
  if (joinPage && request.method === "GET") {
    return new Response(page(joinPage[1]!.toUpperCase(), origin, language), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  if (!path.startsWith("/v1/rooms")) return null;
  if (!rooms) return json(503, { error: "Rooms are not set up on this server yet." });
  const address = request.headers.get("cf-connecting-ip") ?? "";
  const slow = async (route: string) => !!address && !!limit && !(await limit(`room-${route}:${address}`));
  if (path === "/v1/rooms" && request.method === "POST") {
    if (await slow("create")) return json(429, { error: "Too many rooms opened from this network. Wait a minute." });
    const input = (await request.json().catch(() => ({}))) as { name?: unknown };
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const stub = rooms.get(rooms.idFromName(code));
      const made = await stub.fetch("https://room/create", { method: "POST", body: JSON.stringify({ code, name: input.name ?? "" }) });
      if (made.status === 409) continue;
      const body = (await made.json()) as { hostKey?: string; error?: string };
      if (!made.ok || !body.hostKey) return json(made.status, body);
      return json(200, { code, hostKey: body.hostKey, joinUrl: `${origin}/j/${code}` });
    }
    return json(503, { error: "Could not open a room. Try again." });
  }
  const match = path.match(/^\/v1\/rooms\/([A-Za-z0-9]{6})\/(join|rename|player|state|ask|vote|answer|host|moderate|settings|activity|close|share|screen|remote|inbox|reply)$/);
  if (!match) return json(404, { error: "Not found" });
  const code = match[1]!.toUpperCase();
  const action = match[2]!;
  if (!isCode(code)) return json(404, { error: "No such room." });
  if ((action === "ask" || action === "join" || action === "rename") && address && crowd && !(await crowd(`room-${action}:${code}:${address}`)))
    return json(429, { error: "Lots of people are joining at once. Trying again…", retry: true });
  // The phone remote through the relay, counted the same way (a phone asks about once a second,
  // so a few remotes on the church Wi-Fi sit well inside it; a runaway script does not).
  if (action === "remote" && address && crowd && !(await crowd(`room-remote:${code}:${address}`)))
    return json(429, { error: "Too many presses at once. Wait a moment.", retry: true });
  const stub = rooms.get(rooms.idFromName(code));
  const headers = { "content-type": "application/json", "x-room-ip": await sha256(`${address}:${code}`) };
  const target = `https://room/${action}${url.search}`;
  return stub.fetch(target, request.method === "POST" ? { method: "POST", headers, body: await request.text() } : { headers });
}

/** Rooms held in memory: for the local server (dev.ts) and tests, in place of Durable Objects. */
export function memoryRooms(): RoomNamespace {
  const objects = new Map<string, RoomObject>();
  return {
    idFromName: (name) => name,
    get: (id) => ({
      fetch: (input, init) => {
        const key = String(id);
        if (!objects.has(key)) {
          const store = new Map<string, unknown>();
          objects.set(key, new RoomObject({ storage: { get: async (k) => store.get(k) as never, put: async (k, v) => void store.set(k, structuredClone(v)), deleteAll: async () => store.clear(), setAlarm: async () => {} } }));
        }
        return objects.get(key)!.fetch(input instanceof Request ? input : new Request(input, init));
      },
    }),
  };
}
