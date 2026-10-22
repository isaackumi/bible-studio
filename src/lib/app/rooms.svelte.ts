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
};

type Saved = { code: string; hostKey: string; joinUrl: string };
const KEY = "church-studio:room";
const POLL_MS = 2000;

function readSaved(): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    return saved?.code && saved.hostKey ? saved : null;
  } catch {
    return null;
  }
}

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
    if (this.open || (this.view?.activity.kind ?? "none") !== "none") this.timer = setTimeout(() => void this.poll(), POLL_MS);
  };

  /** The join QR code on Preview, ready to send LIVE. */
  qrOnPreview = (caption = t("Scan to ask a question")) => {
    const saved = this.current;
    if (!saved) return;
    session.previewModel(presentQr({ theme: session.theme(), data: saved.joinUrl, style: "rounded", dark: "#000000", light: "#ffffff", caption: `${caption} · ${saved.joinUrl.replace(/^https?:\/\//, "")}` }), `room:${saved.code}:qr`);
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
    void this.activity({ action: "reset-scores" });
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
    await this.activity({
      action: "open",
      kind: run.game.kind,
      game: run.game.title,
      round: run.index + 1,
      total: run.game.questions.length,
      question: { id: question.id, prompt: question.prompt, choices: question.choices.filter((choice) => choice.trim()), ...(question.correct !== null ? { correct: question.correct } : {}), seconds: question.seconds, points: question.points },
    });
  };

  stopAnswers = () => this.activity({ action: "close" });
  reveal = () => this.activity({ action: "reveal" });

  next = async () => {
    if (!this.playing) return;
    if (this.playing.index + 1 >= this.playing.game.questions.length) return;
    this.playing = { ...this.playing, index: this.playing.index + 1 };
    await this.ask();
  };

  finish = async () => {
    this.playing = null;
    await this.activity({ action: "end" });
  };

  /** The question and its answers on Preview, for the room to read along. */
  questionOnScreen = () => {
    const question = this.question;
    if (!question || !this.playing) return;
    const marks = ["A", "B", "C", "D", "E", "F"];
    session.previewModel(
      presentText({ theme: session.theme(), layout: "title", heading: question.prompt, body: question.choices.filter((choice) => choice.trim()).map((choice, index) => `${marks[index]}   ${choice}`).join("\n") }),
      `room:${this.current?.code}:game:${question.id}`,
    );
  };

  /** How people answered (and the right answer, in a quiz) on Preview. */
  resultsOnScreen = () => {
    const question = this.question;
    const view = this.view;
    if (!question || !view) return;
    const total = view.answers.reduce((sum, count) => sum + count, 0);
    const marks = ["A", "B", "C", "D", "E", "F"];
    const lines = question.choices.filter((choice) => choice.trim()).map((choice, index) => {
      const count = view.answers[index] ?? 0;
      const share = total ? Math.round((count / total) * 100) : 0;
      return `${question.correct === index ? "✓ " : ""}${marks[index]}   ${choice}   ${share}%`;
    });
    session.previewModel(presentText({ theme: session.theme(), layout: "title", heading: question.prompt, body: lines.join("\n") }), `room:${this.current?.code}:results:${question.id}`);
  };

  leaderboardOnScreen = () => {
    const board = this.view?.leaderboard ?? [];
    session.previewModel(
      presentText({ theme: session.theme(), layout: "title", heading: t("Leaderboard"), body: board.length ? board.slice(0, 8).map((entry, index) => `${index + 1}.  ${entry.name}   ${entry.score}`).join("\n") : t("No scores yet.") }),
      `room:${this.current?.code}:leaderboard`,
    );
  };

  /** A question on Preview (with who asked), ready to send LIVE. */
  questionOnPreview = (question: RoomQuestion) => {
    session.previewModel(presentText({ theme: session.theme(), layout: "title", heading: question.name ? t("{name} asks", { name: question.name }) : t("A question"), body: question.text }), `room:${this.current?.code}:q:${question.id}`);
  };
}

export const audienceRoom = new AudienceRoom();
