// The desk's side of a room (server/rooms.ts): open it, show its QR code, moderate questions and
// run quizzes and polls. Nothing from a phone reaches the screen by itself: the operator puts a
// question or the QR code on Preview, and LIVE sends it as always.
//
// The room's host key is kept on this computer only (it is what lets this desk run the room).

import { serverCall } from "../domain/billing";
import { finishTheVerseGame, ready, shuffled, whichBookGame, WELL_KNOWN, type Game } from "../domain/games";
import { api } from "../db/api";
import { presentQr } from "../domain/overlays";
import { presentText } from "../domain/present";
import { t } from "../i18n/core";
import { session } from "./session.svelte";
import { remoteSafe } from "../display/remote-safe";
import { presentGame, type GamePlayer, type GameScreenData, type GameStage } from "../domain/game-screen";

export type RoomQuestion = {
  id: string;
  text: string;
  name: string;
  at: number;
  state: "pending" | "approved" | "rejected" | "archived";
  hidden: boolean;
  pinned: boolean;
  featured: boolean;
  answered: boolean;
  votes: number;
  trending: number;
};

export type ActivityQuestion = { id: string; prompt: string; choices: string[]; correct?: number; seconds: number; points: number; image?: string };
export type RoomActivity =
  | { kind: "none" }
  | { kind: "quiz" | "poll"; game: string; round: number; total: number; question: ActivityQuestion; phase: "open" | "closed" | "reveal"; openedAt: number };

export type HostView = {
  room: { name: string; code: string; open: boolean; moderate: boolean; createdAt: number };
  people: number;
  questions: RoomQuestion[];
  activity: RoomActivity;
  answers: number[];
  answered: number;
  leaderboard: Array<{ name: string; score: number }>;
  /** Everyone's place, best first, with where they stood before the last question (the screen's climb). */
  ranking?: { players: number; top: GamePlayer[]; bottom: GamePlayer[] };
  /** Who joined, newest last (the game lobby). */
  joined?: Array<{ n: number; name: string }>;
};

type Saved = { code: string; hostKey: string; joinUrl: string };
const KEY = "church-studio:room";
const POLL_MS = 2000;
/** While a game is on the screen or answers are coming in: every second, so the screen keeps up. */
const GAME_POLL_MS = 1000;
const GAME_PREFS = "church-studio:game-screen";

function readSaved(): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    return saved?.code && saved.hostKey ? saved : null;
  } catch {
    return null;
  }
}

/** Called when the Audience drawer opens (the Pictures drawer, in the same place, closes). */
let onShow: (() => void) | null = null;
export const whenAudienceOpens = (run: () => void) => void (onShow = run);

class AudienceRoom {
  /** The room this desk runs, if any. */
  current = $state<Saved | null>(typeof localStorage === "undefined" ? null : readSaved());
  view = $state<HostView | null>(null);
  error = $state("");
  busy = $state(false);
  /** The panel is open (it polls more often while it is). */
  open = $state(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  private save(saved: Saved | null) {
    this.current = saved;
    try {
      if (saved) localStorage.setItem(KEY, JSON.stringify(saved));
      else localStorage.removeItem(KEY);
    } catch {
      // Storage refused: the room still runs until this window closes.
    }
  }

  show = () => {
    onShow?.();
    this.open = true;
    void this.poll();
  };

  hide = () => {
    this.open = false;
  };

  /** Open a room named after the church. */
  start = async (): Promise<void> => {
    this.busy = true;
    this.error = "";
    const answer = await serverCall<Saved>("/v1/rooms", { name: session.workspace.churchName || t("Church") });
    this.busy = false;
    if (!answer.ok) {
      this.error = answer.offline ? t("Connect to the internet to open a room: phones join it over the internet.") : answer.error;
      return;
    }
    this.save({ code: answer.data.code, hostKey: answer.data.hostKey, joinUrl: answer.data.joinUrl });
    await this.poll();
  };

  end = async () => {
    const saved = this.current;
    if (!saved) return;
    this.stopWatching?.();
    this.stopWatching = null;
    this.sharing = false;
    await serverCall(`/v1/rooms/${saved.code}/close`, { hostKey: saved.hostKey });
    this.save(null);
    this.view = null;
    clearTimeout(this.timer);
  };

  private call = async (action: string, body: Record<string, unknown>) => {
    const saved = this.current;
    if (!saved) return false;
    const answer = await serverCall(`/v1/rooms/${saved.code}/${action}`, { hostKey: saved.hostKey, ...body });
    if (!answer.ok) {
      this.error = answer.offline ? t("No internet: the room carries on, and this desk catches up when it is back.") : answer.error;
      return false;
    }
    this.error = "";
    await this.poll();
    return true;
  };

  moderate = (questionId: string, action: "approve" | "reject" | "archive" | "restore" | "hide" | "show" | "pin" | "feature" | "answered") => this.call("moderate", { questionId, action });
  settings = (input: { moderate?: boolean; open?: boolean }) => this.call("settings", input);
  activity = (input: { action: "open" | "close" | "reveal" | "end" | "reset-scores"; kind?: "quiz" | "poll"; game?: string; round?: number; total?: number; question?: ActivityQuestion }) => this.call("activity", input);

  /** Ask the room what is new; while the panel is open, again every two seconds. */
  poll = async (): Promise<void> => {
    clearTimeout(this.timer);
    const saved = this.current;
    if (!saved) return;
    const answer = await serverCall<HostView>(`/v1/rooms/${saved.code}/host`, { hostKey: saved.hostKey });
    if (answer.ok) {
      this.view = answer.data;
      this.error = "";
    } else if (answer.status === 404) {
      // The room ended (a day unused, or closed elsewhere).
      this.save(null);
      this.view = null;
      return;
    } else if (!answer.offline) this.error = answer.error;
    void this.refreshScreen();
    const busy = (this.view?.activity.kind ?? "none") !== "none" || this.screenStage !== null;
    if (this.open || busy) this.timer = setTimeout(() => void this.poll(), busy ? GAME_POLL_MS : POLL_MS);
  };

  /** The join QR code on Preview, ready to send LIVE. */
  qrOnPreview = (caption = t("Scan to ask a question")) => {
    const saved = this.current;
    if (!saved) return;
    // The code, in big boxes, for the back rows: type it in at the short address instead of scanning.
    const at = saved.joinUrl.replace(/^https?:\/\//, "").replace(/\/j\/[^/]*$/, "/j");
    session.previewModel(presentQr({ theme: session.theme(), data: saved.joinUrl, style: "rounded", dark: "#000000", light: "#ffffff", caption, code: { value: saved.code, at } }), `room:${saved.code}:qr`);
  };

  // --- The screen on phones and browsers ------------------------------------------------------

  /** Program is being shared with browsers and phones used as displays (/d/CODE). */
  sharing = $state(false);
  private shareTimer: ReturnType<typeof setTimeout> | undefined;
  private shareSent = "";
  private stopWatching: (() => void) | null = null;

  get displayUrl(): string | null {
    return this.current ? this.current.joinUrl.replace("/j/", "/d/") : null;
  }

  /** Start or stop sending Program to the room's displays. */
  share = async (on: boolean) => {
    const saved = this.current;
    if (!saved) return;
    if (!on) {
      this.sharing = false;
      this.stopWatching?.();
      this.stopWatching = null;
      clearTimeout(this.shareTimer);
      this.shareSent = "";
      await serverCall(`/v1/rooms/${saved.code}/share`, { hostKey: saved.hostKey, on: false });
      return;
    }
    this.sharing = true;
    // Every change to Program goes out (at most four times a second; the newest always wins).
    this.stopWatching = $effect.root(() => {
      $effect(() => {
        const program = session.live.program;
        const canvas = session.outputCanvas();
        const frame = JSON.stringify({ model: remoteSafe(program.model), aspect: canvas.width / canvas.height });
        clearTimeout(this.shareTimer);
        this.shareTimer = setTimeout(() => void this.sendScreen(frame), 250);
      });
    });
  };

  private sendScreen = async (frame: string) => {
    const saved = this.current;
    if (!saved || !this.sharing || frame === this.shareSent) return;
    const answer = await serverCall(`/v1/rooms/${saved.code}/share`, { hostKey: saved.hostKey, frame });
    if (answer.ok) this.shareSent = frame;
    else this.error = answer.offline ? t("No internet: displays keep the last screen until it is back.") : answer.error;
  };

  /** The display link's QR code on Preview: for a phone or a TV browser to show the screen. */
  displayQrOnPreview = () => {
    const url = this.displayUrl;
    if (!url) return;
    session.previewModel(presentQr({ theme: session.theme(), data: url, style: "rounded", dark: "#000000", light: "#ffffff", caption: `${t("Scan to follow on your phone")} · ${url.replace(/^https?:\/\//, "")}` }), `room:${this.current?.code}:display-qr`);
  };

  // --- Games ---------------------------------------------------------------------------------

  /** The game being played: its questions (answers mixed), and which one is up. */
  playing = $state<{ game: Game; index: number } | null>(null);

  /** Start a game: only questions ready to run, answers mixed so the right one moves about. */
  play = (game: Game) => {
    const questions = game.questions.filter((question) => ready(question, game.kind)).map((question) => (game.kind === "quiz" ? shuffled(question) : question));
    if (!questions.length) {
      this.error = t("This game has no questions ready to play yet.");
      return;
    }
    this.playing = { game: { ...game, questions }, index: 0 };
    this.lastGame = null;
    void this.activity({ action: "reset-scores" }).then(() => (this.follow ? this.showGame("lobby", true) : undefined));
  };

  /** Made fresh from the Bible on this computer (the first translation installed). */
  makeFromBible = async (kind: "which-book" | "finish-verse"): Promise<Game | null> => {
    const translationId = session.translations.find((entry) => !entry.id.startsWith("api:"))?.id ?? session.translations[0]?.id;
    if (!translationId) return null;
    const verses = await Promise.all(
      WELL_KNOWN.map(async (ref) => {
        const found = await api.passage(translationId, ref.book, ref.chapter, ref.verse, ref.verse).catch(() => []);
        const book = session.books.find((entry) => entry.ord === ref.book)?.name ?? "";
        return { book: ref.book, text: found[0]?.text ?? "", reference: `${book} ${ref.chapter}:${ref.verse}` };
      }),
    );
    const usable = verses.filter((verse) => verse.text);
    if (usable.length < 4) return null;
    return kind === "which-book" ? whichBookGame(usable, session.books.map((book) => book.name)) : finishTheVerseGame(usable);
  };

  get question() {
    return this.playing ? (this.playing.game.questions[this.playing.index] ?? null) : null;
  }

  /** Send the current question to the phones (and start its clock). */
  ask = async () => {
    const run = this.playing;
    const question = this.question;
    if (!run || !question) return;
    this.askedAt = Date.now();
    const opened = await this.activity({
      action: "open",
      kind: run.game.kind,
      game: run.game.title,
      round: run.index + 1,
      total: run.game.questions.length,
      question: { id: question.id, prompt: question.prompt, choices: question.choices.filter((choice) => choice.trim()), ...(question.correct !== null ? { correct: question.correct } : {}), seconds: question.seconds, points: question.points },
    });
    if (opened && this.follow) await this.showGame("question", true);
  };

  stopAnswers = () => this.activity({ action: "close" });
  reveal = async () => {
    const shown = await this.activity({ action: "reveal" });
    if (shown && this.follow) await this.showGame("results", true);
  };

  next = async () => {
    if (!this.playing) return;
    if (this.playing.index + 1 >= this.playing.game.questions.length) return;
    this.playing = { ...this.playing, index: this.playing.index + 1 };
    await this.ask();
  };

  finish = async () => {
    const quiz = this.playing?.game.kind === "quiz";
    const title = this.playing?.game.title ?? "";
    // The podium stays up after the game ends: its last scores are kept for the screen.
    if (quiz && this.follow && this.view?.ranking?.top.length) {
      this.lastGame = { title, ranking: this.view.ranking };
      await this.showGame("podium", true);
    }
    this.playing = null;
    await this.activity({ action: "end" });
  };

  // --- The game on the screen -----------------------------------------------------------------

  /** Which stage of the game the screen shows (null: none). The screen updates by itself while it does. */
  screenStage = $state<GameStage | null>(null);
  /** Each step of the game goes to the screen as it happens (otherwise the buttons put it on Preview). */
  follow = $state(readPrefs().follow);
  /** Music and sound effects on the audience screen. */
  sounds = $state(readPrefs().sounds);
  private askedAt = 0;
  private lastGame: { title: string; ranking: NonNullable<HostView["ranking"]> } | null = null;
  private stageKey = "";

  setFollow = (on: boolean) => {
    this.follow = on;
    writePrefs({ follow: on, sounds: this.sounds });
  };

  setSounds = (on: boolean) => {
    this.sounds = on;
    writePrefs({ follow: this.follow, sounds: on });
    void this.refreshScreen();
  };

  private get screenId(): string {
    return `room:${this.current?.code ?? ""}:game-screen`;
  }

  /** The frame for a stage, from the room as it is now. */
  private gameScreen(stage: GameStage): GameScreenData {
    const view = this.view;
    const run = this.playing;
    const question = this.question;
    const activity = view?.activity;
    const live = activity && activity.kind !== "none" && question && activity.question.id === question.id ? activity : null;
    const ranking = stage === "podium" && !run && this.lastGame ? this.lastGame.ranking : view?.ranking;
    const saved = this.current;
    const at = saved ? saved.joinUrl.replace(/^https?:\/\//, "").replace(/\/j\/[^/]*$/, "/j") : "";
    const choices = question ? question.choices.filter((choice) => choice.trim()) : [];
    return {
      stage,
      title: run?.game.title ?? this.lastGame?.title ?? t("Quiz"),
      round: (run?.index ?? 0) + 1,
      total: run?.game.questions.length ?? 0,
      prompt: question?.prompt ?? "",
      choices,
      correct: stage === "results" || stage === "leaderboard" ? (question?.correct ?? null) : null,
      counts: choices.map((_, index) => view?.answers[index] ?? 0),
      // Running while answers are open; at zero once they close (time up, or stopped early).
      endsAt: live && question?.seconds ? (live.phase === "open" ? this.askedAt + question.seconds * 1000 : Math.min(Date.now(), this.askedAt + question.seconds * 1000)) : null,
      seconds: question?.seconds ?? 0,
      answered: live ? (view?.answered ?? 0) : 0,
      players: ranking?.players ?? view?.people ?? 0,
      top: ranking?.top ?? [],
      bottom: ranking?.bottom ?? [],
      joined: view?.joined ?? [],
      join: saved ? { code: saved.code, at, url: saved.joinUrl } : null,
      sounds: this.sounds,
      key: `${stage}:${question?.id ?? ""}:${live?.phase === "open" ? "open" : ""}`,
    };
  }

  /** Put a stage of the game on Preview, or straight on the screen. */
  showGame = async (stage: GameStage, live = false) => {
    if (!this.current) return;
    this.screenStage = stage;
    const data = this.gameScreen(stage);
    this.stageKey = data.key;
    session.previewModel(presentGame(session.theme(), data), this.screenId);
    if (live) await session.take();
    void this.poll();
  };

  /** While a game stage is on Preview or the screen, keep it up to date with the room. */
  private refreshScreen = async () => {
    const stage = this.screenStage;
    if (!stage) return;
    const onScreen = session.live.program.sourceId === this.screenId || session.live.preview.sourceId === this.screenId;
    if (!onScreen) {
      this.screenStage = null;
      return;
    }
    // Time up: following the game, the answer is shown by itself, as on a game show.
    const run = this.playing;
    const question = this.question;
    const activity = this.view?.activity;
    if (this.follow && stage === "question" && run && question?.seconds && activity && activity.kind !== "none" && activity.phase === "open" && activity.question.id === question.id && Date.now() > this.askedAt + question.seconds * 1000 + 1200) {
      await this.reveal();
      return;
    }
    const data = this.gameScreen(stage);
    await session.refreshSource(this.screenId, presentGame(session.theme(), { ...data, key: this.stageKey }));
  };

  /** A question on Preview (with who asked), ready to send LIVE. */
  questionOnPreview = (question: RoomQuestion) => {
    session.previewModel(presentText({ theme: session.theme(), layout: "title", heading: question.name ? t("{name} asks", { name: question.name }) : t("A question"), body: question.text }), `room:${this.current?.code}:q:${question.id}`);
  };
}

export const audienceRoom = new AudienceRoom();

function readPrefs(): { follow: boolean; sounds: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(GAME_PREFS) ?? "null") as { follow?: unknown; sounds?: unknown } | null;
    return { follow: saved?.follow !== false, sounds: saved?.sounds !== false };
  } catch {
    return { follow: true, sounds: true };
  }
}

function writePrefs(prefs: { follow: boolean; sounds: boolean }) {
  try {
    localStorage.setItem(GAME_PREFS, JSON.stringify(prefs));
  } catch {
    // Storage refused: the choice lasts until this window closes.
  }
}
