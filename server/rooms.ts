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
//   POST /v1/rooms/:code/join            {name?}                 → {pid, room}
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
//   GET  /j/:code                        the audience page
//   GET  /d/:code                        a browser or phone as a display (the app's own screen)

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
};

/**
 * What the audience sees besides Q&A: nothing, a quiz question or a poll. `phase`: open (answering),
 * closed (time up), reveal (right answer and results shown).
 */
export type Activity =
  | { kind: "none" }
  | { kind: "quiz" | "poll"; game: string; round: number; total: number; question: ActivityQuestion; phase: "open" | "closed" | "reveal"; openedAt: number };

export type Participant = { name: string; joinedAt: number; score: number; ip: string };

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
  /** Asks per participant, for the rate limit (times). */
  asked: Record<string, number[]>;
  /**
   * What the church's screen shows, for browsers and phones used as displays (/d/CODE), while the
   * desk shares it: the Program frame as the desk sent it, and a number that goes up with each.
   */
  screen?: { on: boolean; revision: number; frame: string; at: number };
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
  /** Upvotes for one question from one network address (a church's Wi-Fi is one address). */
  votesPerAddress: 40,
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

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result<never> => ({ ok: false, status, error });

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
export function publicActivity(state: RoomState, pid: string | null, now: number) {
  const activity = state.activity;
  if (activity.kind === "none") return { kind: "none" as const };
  const { correct, ...question } = activity.question;
  const mine = pid ? state.answers[pid] : undefined;
  const counts = activity.question.choices.map((_, index) => Object.values(state.answers).filter((answer) => answer.choice === index).length);
  const reveal = activity.phase === "reveal";
  return {
    kind: activity.kind,
    game: activity.game,
    round: activity.round,
    total: activity.total,
    phase: activity.phase,
    question,
    endsAt: activity.question.seconds ? activity.openedAt + activity.question.seconds * 1000 : null,
    now,
    answered: mine ? mine.choice : null,
    ...(reveal ? { correct: activity.kind === "quiz" ? correct : undefined, counts } : {}),
    ...(reveal && activity.kind === "quiz" && pid ? { score: state.participants[pid]?.score ?? 0 } : {}),
  };
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
export class RoomCore {
  constructor(
    private store: RoomStorage,
    private now: () => number = () => Date.now(),
  ) {}

  private async load(): Promise<RoomState | null> {
    const state = await this.store.get();
    if (!state) return null;
    if (state.closed || this.now() - state.touchedAt > LIMITS.idleMs) return null;
    return state;
  }

  private async save(state: RoomState) {
    state.touchedAt = this.now();
    await this.store.put(state);
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
    await this.store.put({
      code,
      name: clean(name, 60) || "Church",
      createdAt: now,
      touchedAt: now,
      hostKeyHash: await sha256(hostKey),
      moderate: true,
      open: true,
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

  async join(name: unknown, ip: string): Promise<Result<{ pid: string; room: { name: string; code: string } }>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    if (Object.keys(state.participants).length >= LIMITS.participants) return fail(429, "This room is full.");
    const pid = randomId(12);
    state.participants[pid] = { name: clean(name, LIMITS.nameLength), joinedAt: this.now(), score: 0, ip };
    await this.save(state);
    return { ok: true, data: { pid, room: { name: state.name, code: state.code } } };
  }

  /** What a phone sees: the room, the questions the operator lets through, and the activity. */
  async view(pid: string | null): Promise<Result<unknown>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    const known = pid && state.participants[pid] ? pid : null;
    const questions = state.questions.filter((question) => question.state === "approved" && !question.hidden).map((question) => publicQuestion(question, known, state));
    const mine = known ? state.questions.filter((question) => question.state === "pending" && state.askedBy[question.id] === known).length : 0;
    return {
      ok: true,
      data: {
        room: { name: state.name, code: state.code, open: state.open, moderate: state.moderate },
        questions,
        waiting: mine,
        activity: publicActivity(state, known, this.now()),
        ...(state.activity.kind !== "none" && state.activity.phase === "reveal" && state.activity.kind === "quiz" ? { leaderboard: leaderboard(state, 5) } : {}),
      },
    };
  }

  async ask(pid: unknown, text: unknown, name: unknown): Promise<Result<{ id: string; state: QuestionState }>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    if (typeof pid !== "string" || !state.participants[pid]) return fail(401, "Join the room first.");
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

  async answer(pid: unknown, choice: unknown): Promise<Result<{ ok: true }>> {
    const state = await this.load();
    if (!state) return fail(404, "This room has ended.");
    if (typeof pid !== "string" || !state.participants[pid]) return fail(401, "Join the room first.");
    const activity = state.activity;
    if (activity.kind === "none" || activity.phase !== "open") return fail(409, "Answers are closed.");
    const now = this.now();
    if (activity.question.seconds && now > activity.openedAt + activity.question.seconds * 1000 + 1500) return fail(409, "Time is up.");
    const index = Number(choice);
    if (!Number.isInteger(index) || index < 0 || index >= activity.question.choices.length) return fail(400, "Choose one of the answers.");
    if (state.answers[pid]) return fail(409, "You have answered already.");
    state.answers[pid] = { choice: index, at: now };
    await this.save(state);
    return { ok: true, data: { ok: true } };
  }

  /** Everything, for the desk. */
  async hostView(hostKey: unknown): Promise<Result<unknown>> {
    const found = await this.host(hostKey);
    if (!found.ok) return found;
    const state = found.data;
    return {
      ok: true,
      data: {
        room: { name: state.name, code: state.code, open: state.open, moderate: state.moderate, createdAt: state.createdAt },
        people: Object.keys(state.participants).length,
        questions: state.questions.map(({ recent, ...question }) => ({ ...question, trending: recent.filter((at) => this.now() - at < 15 * 60_000).length })),
        activity: state.activity,
        answers: state.activity.kind === "none" ? [] : state.activity.question.choices.map((_, index) => Object.values(state.answers).filter((answer) => answer.choice === index).length),
        answered: Object.keys(state.answers).length,
        leaderboard: leaderboard(state, 10),
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
  async activity(hostKey: unknown, input: { action?: unknown; kind?: unknown; game?: unknown; round?: unknown; total?: unknown; question?: unknown }): Promise<Result<{ ok: true }>> {
    const found = await this.host(hostKey);
    if (!found.ok) return found;
    const state = found.data;
    const now = this.now();
    if (input.action === "open") {
      const question = cleanQuestion(input.question);
      if (!question) return fail(400, "A question needs words and two or more answers.");
      const kind = input.kind === "poll" ? "poll" : "quiz";
      if (kind === "quiz" && question.correct === undefined) return fail(400, "Mark the right answer.");
      state.activity = { kind, game: clean(input.game, 80), round: Math.max(1, Number(input.round) || 1), total: Math.max(1, Number(input.total) || 1), question, phase: "open", openedAt: now };
      state.answers = {};
    } else if (input.action === "close") {
      if (state.activity.kind === "none") return fail(409, "Nothing is open.");
      state.activity = { ...state.activity, phase: "closed" };
    } else if (input.action === "reveal") {
      const activity = state.activity;
      if (activity.kind === "none") return fail(409, "Nothing is open.");
      if (activity.phase !== "reveal" && activity.kind === "quiz") {
        for (const [pid, answer] of Object.entries(state.answers)) {
          const person = state.participants[pid];
          if (!person || answer.choice !== activity.question.correct) continue;
          // Up to half as many points again for answering quickly.
          const seconds = activity.question.seconds || 30;
          const quick = Math.max(0, 1 - (answer.at - activity.openedAt) / (seconds * 1000));
          person.score += Math.round(activity.question.points * (1 + quick / 2));
        }
      }
      state.activity = { ...activity, phase: "reveal" };
    } else if (input.action === "end") {
      state.activity = { kind: "none" };
      state.answers = {};
    } else if (input.action === "reset-scores") {
      for (const person of Object.values(state.participants)) person.score = 0;
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

  async close(hostKey: unknown): Promise<Result<{ ok: true }>> {
    const found = await this.host(hostKey);
    if (!found.ok) return found;
    await this.store.drop();
    return { ok: true, data: { ok: true } };
  }
}

export function cleanQuestion(value: unknown): ActivityQuestion | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const prompt = clean(input.prompt, 300);
  const choices = (Array.isArray(input.choices) ? input.choices : []).map((choice) => clean(choice, 120)).filter(Boolean).slice(0, 6);
  if (!prompt || choices.length < 2) return null;
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
  };
}

// --- On Cloudflare ----------------------------------------------------------------------------

type DurableState = { storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void>; deleteAll(): Promise<void>; setAlarm(at: number): Promise<void> } };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" } });

/** One room: its state in the object's own storage, its rules in RoomCore. */
export class RoomObject {
  private core: RoomCore;
  constructor(private state: DurableState) {
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
    const input = request.method === "POST" ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};
    const ip = request.headers.get("x-room-ip") ?? "";
    const reply = (result: Result<unknown>) => (result.ok ? json(200, result.data) : json(result.status, { error: result.error }));
    switch (action) {
      case "create":
        return reply(await this.core.create(String(input.code ?? ""), String(input.name ?? "")));
      case "join":
        return reply(await this.core.join(input.name, ip));
      case "state":
        return reply(await this.core.view(url.searchParams.get("pid")));
      case "ask":
        return reply(await this.core.ask(input.pid, input.text, input.name));
      case "vote":
        return reply(await this.core.vote(input.pid, input.questionId, ip));
      case "answer":
        return reply(await this.core.answer(input.pid, input.choice));
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
export async function handleRooms(request: Request, rooms: RoomNamespace | undefined, origin: string, page: (code: string, origin: string) => string, limit?: (key: string) => Promise<boolean>): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS" && path.startsWith("/v1/rooms")) return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" } });
  // A browser or phone as a display: the app's own screen, showing what the church's screen shows.
  const displayPage = path.match(/^\/d\/([A-Za-z0-9]{6})$/);
  if (displayPage && request.method === "GET") return Response.redirect(`${origin}/app/?receiver=${displayPage[1]!.toUpperCase()}`, 302);
  const joinPage = path.match(/^\/j\/([A-Za-z0-9]{6})$/);
  if (joinPage && request.method === "GET") {
    return new Response(page(joinPage[1]!.toUpperCase(), origin), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
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
  const match = path.match(/^\/v1\/rooms\/([A-Za-z0-9]{6})\/(join|state|ask|vote|answer|host|moderate|settings|activity|close|share|screen)$/);
  if (!match) return json(404, { error: "Not found" });
  const code = match[1]!.toUpperCase();
  const action = match[2]!;
  if (!isCode(code)) return json(404, { error: "No such room." });
  if ((action === "ask" || action === "join") && (await slow(action))) return json(429, { error: "Too many at once from this network. Wait a minute." });
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
