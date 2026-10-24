// The desk's side of a room (server/rooms.ts): open it, show its QR code, moderate questions and
// run quizzes and polls. Nothing from a phone reaches the screen by itself: the operator puts a
// question or the QR code on Preview, and LIVE sends it as always.
//
// The room's host key is kept on this computer only (it is what lets this desk run the room).

import { serverCall } from "../domain/billing";
import { defaultPlay, drawQuestions, finishTheVerseGame, ready, shuffled, whichBookGame, WELL_KNOWN, type Game, type PlaySettings } from "../domain/games";
import { sanitizeMusicStyle, type MusicStyle } from "../game/music-styles";
import type { GameSound } from "../game/sounds";
import { makeGroups, pickPeople, type RoomPerson } from "../domain/picker";
import { api } from "../db/api";
import { presentQr } from "../domain/overlays";
import { presentText } from "../domain/present";
import { emptyModel } from "../domain/theme";
import { currentLanguage, t } from "../i18n/core";
import { session } from "./session.svelte";
import { remoteSafe } from "../display/remote-safe";
import { GAME_WORDS, presentGame, type GamePlayer, type GameScreenData, type GameStage } from "../domain/game-screen";
import { MOST_TEAMS, TEAMS } from "../domain/game-colors";
import type { GameReport, ReportQuestion } from "../domain/game-report";

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

export type ActivityQuestion = { id: string; prompt: string; choices: string[]; correct?: number; seconds: number; points: number; image?: string; type?: "words" | "scale"; low?: string; high?: string };
export type RoomActivity =
  | { kind: "none" }
  | { kind: "quiz" | "poll"; game: string; round: number; total: number; question: ActivityQuestion; phase: "open" | "closed" | "reveal"; openedAt: number; opensAt?: number };

export type HostView = {
  room: { name: string; code: string; open: boolean; moderate: boolean; createdAt: number };
  people: number;
  questions: RoomQuestion[];
  activity: RoomActivity;
  answers: number[];
  answered: number;
  /** A word cloud's words, the most sent first; hidden ones stay off the screen. */
  words?: Array<{ text: string; key: string; count: number; hidden: boolean }>;
  leaderboard: Array<{ name: string; score: number }>;
  /** Everyone's place, best first, with where they stood before the last question (the screen's climb). */
  ranking?: { players: number; top: GamePlayer[]; bottom: GamePlayer[] };
  /** Who joined, newest last (the game lobby). */
  joined?: Array<{ n: number; name: string }>;
  /** The first right answer to the open question: who, and how quickly. */
  fastest?: { n: number; name: string; ms: number } | null;
  /** Team standings, best first (team mode); null without teams. */
  teams?: Array<{ team: number; players: number; score: number; gain: number }> | null;
};

type Saved = { code: string; hostKey: string; joinUrl: string };
const KEY = "church-studio:room";
const POLL_MS = 2000;
/** While a game is on the screen or answers are coming in: every second, so the screen keeps up. */
const GAME_POLL_MS = 1000;
const GAME_PREFS = "church-studio:game-screen";
/** Reading time before answers open, when the Get ready countdown is on. */
const READ_MS = 4000;
/** Running by itself: how long the answer stays up, then the leaderboard, before the next question. */
const AUTO_RESULTS_MS = 6000;
const AUTO_BOARD_MS = 7000;

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
  /** Take a word off the word cloud on the screen, or put one back. */
  setWordShown = (word: string, shown: boolean) => this.activity({ action: shown ? "show-word" : "hide-word", word }).then(() => this.poll());
  activity = (input: { action: "open" | "close" | "reveal" | "end" | "reset-scores" | "teams" | "hide-word" | "show-word"; word?: string; kind?: "quiz" | "poll"; anonymous?: boolean; game?: string; round?: number; total?: number; question?: ActivityQuestion; readMs?: number; teams?: number }) => this.call("activity", input);

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
    if (this.sharing) return;
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

  /** How each game is played: how many of its questions, mixed or not (kept on this computer). */
  plays = $state<Record<string, PlaySettings>>(readPlays().settings);
  /** The questions each game asked lately (by their words), so a replay asks others first. */
  private asked: Record<string, string[]> = readPlays().asked;

  playSettings = (game: Game): PlaySettings => this.plays[game.id] ?? defaultPlay(game);

  setPlaySettings = (game: Game, settings: PlaySettings) => {
    this.plays = { ...this.plays, [game.id]: { count: Math.max(0, Math.round(settings.count)), mix: settings.mix } };
    writePlays(this.plays, this.asked);
  };

  /**
   * Start a game: its questions for this play (a new order, or a few from the pool, the ones not
   * asked lately first), answers mixed so the right one moves about.
   */
  play = (game: Game) => {
    const pool = game.questions.filter((question) => ready(question, game.kind));
    const drawn = drawQuestions(game, this.playSettings(game), this.asked[game.id] ?? []);
    const questions = drawn.map((question) => (game.kind === "quiz" ? shuffled(question) : question));
    if (!questions.length) {
      this.error = t("This game has no questions ready to play yet.");
      return;
    }
    // Asked lately: added to until every question has had its turn, then it starts again.
    const lately = [...new Set([...(this.asked[game.id] ?? []), ...drawn.map((question) => question.prompt)])];
    this.asked = { ...this.asked, [game.id]: lately.length >= pool.length ? drawn.map((question) => question.prompt) : lately };
    writePlays(this.plays, this.asked);
    this.playing = { game: { ...game, questions }, index: 0 };
    this.lastGame = null;
    this.recentGames = [game.id, ...this.recentGames.filter((id) => id !== game.id)].slice(0, MOST_RECENT);
    writeRecent(this.recentGames);
    this.rounds = [];
    this.lastReport = null;
    void this.activity({ action: "reset-scores" })
      .then(() => this.activity({ action: "teams", teams: game.kind === "quiz" ? this.teams : 0 }))
      .then(() => (this.follow ? this.showGame("lobby", true) : undefined));
  };

  /** Made fresh from the Bible on this computer (the first translation installed). */
  makeFromBible = async (kind: "which-book" | "finish-verse"): Promise<Game | null> => {
    // The Bible the desk reads from (the church's choice), then the King James, then any other on
    // this computer: never simply the first installed, which may be another language.
    const installed = (id: string | null | undefined) => (id && session.translations.some((entry) => entry.id === id) ? id : undefined);
    const translationId = installed(session.workspace.deskTranslationId) ?? installed("kjv") ?? session.translations.find((entry) => !entry.id.startsWith("api:"))?.id ?? session.translations[0]?.id;
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
    this.opensAt = this.askedAt + (this.ready ? READ_MS : 0);
    const opened = await this.activity({
      action: "open",
      readMs: this.ready ? READ_MS : 0,
      kind: run.game.kind,
      ...(run.game.kind === "poll" && run.game.anonymous ? { anonymous: true } : {}),
      game: run.game.title,
      round: run.index + 1,
      total: run.game.questions.length,
      question: {
        id: question.id,
        prompt: question.prompt,
        choices: question.choices.filter((choice) => choice.trim()),
        ...(question.correct !== null ? { correct: question.correct } : {}),
        seconds: question.seconds,
        points: question.points,
        ...(question.type ? { type: question.type } : {}),
        ...(question.type === "scale" && question.scale ? { low: question.scale.low, high: question.scale.high } : {}),
      },
    });
    if (opened && this.follow) await this.showGame("question", true);
  };

  stopAnswers = () => this.activity({ action: "close" });
  reveal = async () => {
    const shown = await this.activity({ action: "reveal" });
    this.revealedAt = Date.now();
    // Answers are closed now: read the room once more so the report counts every one.
    if (shown) {
      await this.poll();
      this.recordRound();
    }
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
    if (quiz) this.saveReport();
    // The podium stays up after the game ends: its last scores are kept for the screen.
    if (quiz && this.follow && this.view?.ranking?.top.length) {
      this.lastGame = { title, ranking: this.view.ranking };
      await this.showGame("podium", true);
    }
    this.playing = null;
    await this.activity({ action: "end" });
  };

  /**
   * Stop the game now, part-way or at the end: what was played is kept in the report, the game
   * comes off the screen (its music with it), and phones go back to the room.
   */
  endGame = async () => {
    if (this.playing?.game.kind === "quiz") this.saveReport();
    this.playing = null;
    await this.activity({ action: "end" });
    this.takeGameOff();
  };

  /** A game frame from this room is on the screen (the podium, after a game). */
  get gameOnScreen(): boolean {
    return !!this.current && session.live.program.sourceId === this.screenId;
  }

  /** The podium (or any game frame) off the screen and Preview, and the last game forgotten. */
  takeGameOff = () => {
    if (session.live.program.sourceId === this.screenId) session.clear();
    // Preview too, so LIVE cannot put an old game frame back up.
    if (session.live.preview.sourceId === this.screenId) session.previewModel(emptyModel(session.theme()), null);
    this.screenStage = null;
    this.lastGame = null;
  };

  // --- The random picker ---------------------------------------------------------------------

  /** Join numbers picked since the room opened (or since Start again): each spin picks someone new. */
  picked = $state<number[]>([]);
  /** The last picks, newest first, for the desk. */
  pickHistory = $state<Array<{ at: number; people: RoomPerson[] }>>([]);
  /** The groups made last. */
  lastGroups = $state<RoomPerson[][] | null>(null);
  private pickShown: GameScreenData["pick"] | null = null;
  private groupsShown: GameScreenData["groups"] | null = null;

  /** Everyone here now, by name ("Guest" when they gave none). */
  get roomPeople(): RoomPerson[] {
    return (this.view?.joined ?? []).map((person) => ({ n: person.n, name: person.name || t("Guest") }));
  }

  /** Pick `count` people at random and show the reel on the screen (or Preview). */
  pick = async (count: number, again: boolean) => {
    const people = this.roomPeople;
    const chosen = pickPeople(people, count, this.picked, again);
    if (!chosen.length) {
      this.error = people.length ? t("Everyone here has been picked. Press Start again, or allow picking someone twice.") : t("Nobody has joined yet. People join with the code on the screen.");
      return;
    }
    this.error = "";
    this.picked = [...new Set([...this.picked, ...chosen.map((person) => person.n)])];
    this.pickHistory = [{ at: Date.now(), people: chosen }, ...this.pickHistory].slice(0, 20);
    this.pickShown = { names: people.map((person) => person.name), winners: chosen, spin: `${Date.now()}` };
    await this.showGame("pick", this.follow);
  };

  /** Split everyone here into `count` groups at random and show them. */
  makeGroups = async (count: number) => {
    const people = this.roomPeople;
    if (people.length < 2) {
      this.error = t("Groups need at least two people in the room.");
      return;
    }
    this.error = "";
    const groups = makeGroups(people, count);
    this.lastGroups = groups;
    this.groupsShown = groups;
    await this.showGame("groups", this.follow);
  };

  resetPicks = () => {
    this.picked = [];
    this.pickHistory = [];
  };

  // --- The game on the screen -----------------------------------------------------------------

  /** Which stage of the game the screen shows (null: none). The screen updates by itself while it does. */
  screenStage = $state<GameStage | null>(null);
  /** Each step of the game goes to the screen as it happens (otherwise the buttons put it on Preview). */
  follow = $state(readPrefs().follow);
  /** Music and sound effects on the audience screen. */
  sounds = $state(readPrefs().sounds);
  /** The style of the game music. */
  musicStyle = $state<MusicStyle>(readPrefs().musicStyle);
  /** Games played lately, newest first (their ids), for the Games tab's Recently played. */
  recentGames = $state<string[]>(readRecent());

  /** Team mode for the next quiz: 0 (everyone for themselves) or 2 to 4 teams. */
  teams = $state(readPrefs().teams);
  /** The report of the quiz that just ended, shown on the desk until the next game starts. */
  lastReport = $state<GameReport | null>(null);
  /** Each question as it was answered, for the report (the room keeps only the open one). */
  private rounds: ReportQuestion[] = [];

  setTeams = (count: number) => {
    this.teams = count >= 2 ? Math.min(MOST_TEAMS, Math.round(count)) : 0;
    this.savePrefs();
    // During a quiz the room changes now; players keep their scores, the teams are drawn afresh.
    if (this.playing?.game.kind === "quiz") void this.activity({ action: "teams", teams: this.teams }).then(() => this.poll());
  };

  /** The question being revealed, as the room answered it (once per question). */
  private recordRound() {
    const question = this.question;
    const view = this.view;
    if (!question || !view || view.activity.kind === "none" || view.activity.question.id !== question.id) return;
    const choices = question.choices.filter((choice) => choice.trim());
    const round: ReportQuestion = { prompt: question.prompt, choices, correct: question.correct, counts: choices.map((_, index) => view.answers[index] ?? 0) };
    this.rounds = [...this.rounds.filter((entry) => entry.prompt !== round.prompt), round];
  }

  /** The quiz's report: kept with the church's games, and shown on the desk. */
  private saveReport() {
    const run = this.playing;
    if (!run || !this.rounds.length) return;
    const view = this.view;
    const report: GameReport = {
      id: `report:${Date.now().toString(36)}`,
      gameId: run.game.id,
      title: run.game.title,
      ...(run.game.series ? { series: run.game.series } : {}),
      ...(run.game.sermonId ? { sermonId: run.game.sermonId } : {}),
      at: new Date().toISOString(),
      players: view?.ranking?.players ?? view?.people ?? 0,
      questions: this.rounds,
      top: (view?.ranking?.top ?? []).slice(0, 5).map((player) => ({ name: player.name, score: player.score })),
      ...(view?.teams ? { teams: view.teams.map((team) => ({ name: t(TEAMS[team.team]?.name ?? ""), score: team.score })) } : {}),
    };
    session.saveGameReport(report);
    this.lastReport = report;
    this.rounds = [];
  }

  /** A few seconds to read each question before the answers open and the clock starts. */
  ready = $state(readPrefs().ready);
  /** The game runs by itself: the answer, the leaderboard and the next question, each in turn. */
  auto = $state(readPrefs().auto);
  private askedAt = 0;
  private opensAt = 0;
  private revealedAt = 0;
  private stepping = false;
  private lastGame: { title: string; ranking: NonNullable<HostView["ranking"]> } | null = null;
  private stageKey = "";

  setFollow = (on: boolean) => {
    this.follow = on;
    this.savePrefs();
  };

  setSounds = (on: boolean) => {
    this.sounds = on;
    this.savePrefs();
    void this.refreshScreen();
  };

  setMusicStyle = (style: MusicStyle) => {
    this.musicStyle = style;
    this.savePrefs();
    void this.refreshScreen();
  };

  /** A few seconds of a style's question music, on this computer, to choose by ear. */
  private sampler: GameSound | null = null;
  private samplerTimer: ReturnType<typeof setTimeout> | undefined;
  hearing = $state<MusicStyle | null>(null);
  hearMusic = async (style: MusicStyle) => {
    clearTimeout(this.samplerTimer);
    this.sampler?.close();
    if (this.hearing === style) {
      this.sampler = null;
      this.hearing = null;
      return;
    }
    this.hearing = style;
    const { GameSound } = await import("../game/sounds");
    if (this.hearing !== style) return;
    this.sampler = new GameSound();
    this.sampler.setStyle(style);
    this.sampler.play("question");
    this.hearing = style;
    this.samplerTimer = setTimeout(() => {
      this.sampler?.close();
      this.sampler = null;
      this.hearing = null;
    }, 8000);
  };

  setReady = (on: boolean) => {
    this.ready = on;
    this.savePrefs();
  };

  setAuto = (on: boolean) => {
    this.auto = on;
    this.savePrefs();
  };

  private savePrefs() {
    writePrefs({ follow: this.follow, sounds: this.sounds, ready: this.ready, auto: this.auto, teams: this.teams, musicStyle: this.musicStyle });
  }

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
      endsAt: live && question?.seconds ? (live.phase === "open" ? this.opensAt + question.seconds * 1000 : Math.min(Date.now(), this.opensAt + question.seconds * 1000)) : null,
      opensAt: live && live.phase === "open" ? this.opensAt : null,
      fastest: live && live.phase !== "open" ? (view?.fastest ?? null) : null,
      seconds: question?.seconds ?? 0,
      answered: live ? (view?.answered ?? 0) : 0,
      players: ranking?.players ?? view?.people ?? 0,
      top: ranking?.top ?? [],
      bottom: ranking?.bottom ?? [],
      // The lobby shows the newest few; the full list is for the picker.
      joined: (view?.joined ?? []).slice(-40),
      ...(stage === "pick" && this.pickShown ? { pick: this.pickShown } : {}),
      ...(stage === "groups" && this.groupsShown ? { groups: this.groupsShown } : {}),
      join: saved ? { code: saved.code, at, url: saved.joinUrl } : null,
      sounds: this.sounds,
      music: this.sounds && this.playing !== null,
      musicStyle: this.musicStyle,
      // A word cloud grows on the screen as the words come in; a rating names its two ends.
      ...(question?.type ? { type: question.type } : {}),
      ...(question?.type === "words" ? { cloud: (view?.words ?? []).filter((word) => !word.hidden).slice(0, 60).map(({ text, count }) => ({ text, count })) } : {}),
      ...(question?.type === "scale" && question.scale ? { low: question.scale.low, high: question.scale.high } : {}),
      // An anonymous poll shows how many are in, never who.
      ...(run?.game.kind === "poll" && run.game.anonymous ? { anonymous: true } : {}),
      key: `${stage}:${stage === "pick" ? (this.pickShown?.spin ?? "") : stage === "groups" ? String(this.groupsShown?.length ?? 0) + (this.lastGroups?.flat().map((person) => person.n).join(",") ?? "") : (question?.id ?? "")}:${live?.phase === "open" ? "open" : ""}`,
      teams: view?.teams ? view.teams.map((team) => ({ ...team, name: t(TEAMS[team.team]?.name ?? ""), color: TEAMS[team.team]?.color ?? "#888888" })) : null,
      words: Object.fromEntries(GAME_WORDS.map((line) => [line, t(line)])),
      lang: currentLanguage(),
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
    const live = activity && activity.kind !== "none" && question && activity.question.id === question.id ? activity : null;
    if (this.follow && stage === "question" && run && question?.seconds && live?.phase === "open" && Date.now() > this.opensAt + question.seconds * 1000 + 1200) {
      await this.reveal();
      return;
    }
    // Running by itself: after the answer, the leaderboard (a quiz), then the next question or the podium.
    if (this.auto && this.follow && run && live?.phase === "reveal" && !this.stepping) {
      const since = Date.now() - this.revealedAt;
      const quiz = run.game.kind === "quiz";
      const last = run.index + 1 >= run.game.questions.length;
      const step = async (what: () => Promise<void>) => {
        this.stepping = true;
        try {
          await what();
        } finally {
          this.stepping = false;
        }
      };
      if (quiz && stage === "results" && since > AUTO_RESULTS_MS) return step(() => this.showGame("leaderboard", true));
      if ((quiz ? stage === "leaderboard" && since > AUTO_RESULTS_MS + AUTO_BOARD_MS : stage === "results" && since > AUTO_RESULTS_MS)) return step(() => (last ? this.finish() : this.next()));
    }
    const data = this.gameScreen(stage);
    await session.refreshSource(this.screenId, presentGame(session.theme(), { ...data, key: this.stageKey }));
  };

  /** The question last put on Preview, marked in the list. */
  shownQuestion = $state<string | null>(null);

  /** A question on Preview (with who asked), ready to send LIVE. */
  questionOnPreview = (question: RoomQuestion) => {
    this.shownQuestion = question.id;
    session.previewModel(presentText({ theme: session.theme(), layout: "title", heading: question.name ? t("{name} asks", { name: question.name }) : t("A question"), body: question.text }), `room:${this.current?.code}:q:${question.id}`);
  };
}

export const audienceRoom = new AudienceRoom();

const RECENT_KEY = "church-studio:recent-games";
const MOST_RECENT = 6;

function readRecent(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string").slice(0, MOST_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecent(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    // Remembered for this visit only.
  }
}

type GamePrefs = { follow: boolean; sounds: boolean; ready: boolean; auto: boolean; teams: number; musicStyle: MusicStyle };

function readPrefs(): GamePrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(GAME_PREFS) ?? "null") as Partial<Record<keyof GamePrefs, unknown>> | null;
    const teams = Math.round(Number(saved?.teams) || 0);
    return { follow: saved?.follow !== false, sounds: saved?.sounds !== false, ready: saved?.ready !== false, auto: saved?.auto === true, teams: teams >= 2 && teams <= MOST_TEAMS ? teams : 0, musicStyle: sanitizeMusicStyle(saved?.musicStyle) };
  } catch {
    return { follow: true, sounds: true, ready: true, auto: false, teams: 0, musicStyle: "classic" };
  }
}

function writePrefs(prefs: GamePrefs) {
  try {
    localStorage.setItem(GAME_PREFS, JSON.stringify(prefs));
  } catch {
    // Storage refused: the choice lasts until this window closes.
  }
}

const GAME_PLAYS = "church-studio:game-plays";

function readPlays(): { settings: Record<string, PlaySettings>; asked: Record<string, string[]> } {
  try {
    const saved = JSON.parse(localStorage.getItem(GAME_PLAYS) ?? "null") as { settings?: unknown; asked?: unknown } | null;
    const settings: Record<string, PlaySettings> = {};
    for (const [id, value] of Object.entries(saved?.settings && typeof saved.settings === "object" ? saved.settings : {})) {
      const entry = value as Partial<PlaySettings> | null;
      if (entry && typeof entry === "object") settings[id] = { count: Math.max(0, Math.round(Number(entry.count) || 0)), mix: entry.mix !== false };
    }
    const asked: Record<string, string[]> = {};
    for (const [id, value] of Object.entries(saved?.asked && typeof saved.asked === "object" ? saved.asked : {})) {
      if (Array.isArray(value)) asked[id] = value.filter((entry): entry is string => typeof entry === "string").slice(0, 200);
    }
    return { settings, asked };
  } catch {
    return { settings: {}, asked: {} };
  }
}

function writePlays(settings: Record<string, PlaySettings>, asked: Record<string, string[]>) {
  try {
    localStorage.setItem(GAME_PLAYS, JSON.stringify({ settings, asked }));
  } catch {
    // Storage refused: the choices last until this window closes.
  }
}
