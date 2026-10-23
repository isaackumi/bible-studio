import { wordCount } from "../ai/live-notes";
import type { Sermon, SermonLive } from "../domain/types";
import { t } from "../i18n/core";

/** What live notes need from the session. */
export type LiveNotesHost = {
  sermon: (id: string) => Sermon | undefined;
  /** Save without a "saved" message each time (this happens every few seconds during a sermon). */
  save: (sermon: Sermon) => Promise<void>;
  listening: () => boolean;
  startListening: () => Promise<void>;
  /** Whether the AI can tidy notes now (set up, and the feature switched on). */
  canTidy: () => boolean;
  tidy: (input: { title: string; notes: string; heard: string }) => Promise<string>;
};

/** How often the AI tidies the notes, when enough new words have been heard. */
const TIDY_EVERY_MS = 3 * 60_000;
/** Too few new words to be worth a turn (a pause, a song, a prayer). */
const FEWEST_NEW_WORDS = 60;
/** Words heard are written into the sermon this often, so nothing is lost if the computer stops. */
const SAVE_EVERY_MS = 15_000;
const AUTO_KEY = "church-studio:live-notes-auto";

/**
 * Notes taken while the pastor preaches. Everything heard is kept with the sermon as it comes in;
 * every few minutes the church's AI turns the new words into clean notes and puts mistakes right,
 * and the operator accepts each version (or lets them through by themselves).
 */
export class LiveNotes {
  /** The sermon the notes belong to (kept after stopping, so a last version can still be accepted). */
  sermonId = $state<string | null>(null);
  /** Taking notes now: words heard go into the sermon. */
  active = $state(false);
  startedAt = $state(0);
  /** Words heard since notes started. */
  words = $state(0);
  /** The newest lines heard, for the card (the full transcript is saved with the sermon). */
  recent = $state<string[]>([]);
  /** The AI's latest version of the notes, waiting to be accepted. */
  suggestion = $state<string | null>(null);
  tidying = $state(false);
  lastTidyAt = $state(0);
  error = $state("");
  /** Accept each version by itself, without a click. */
  autoAccept = $state(readAuto());

  private unsaved: string[] = [];
  /** Words heard since the last version the AI wrote. */
  private sinceTidy = "";
  /** Words in a version waiting to be accepted: given back if it is dismissed, so none are lost. */
  private inSuggestion = "";
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastSaveAt = 0;

  constructor(private readonly host: LiveNotesHost) {}

  get on(): boolean {
    return this.active;
  }

  /** The sermon's live notes as saved now. */
  live(id = this.sermonId): SermonLive | null {
    return (id && this.host.sermon(id)?.live) || null;
  }

  start = async (sermonId: string) => {
    if (this.active && this.sermonId !== sermonId) await this.stop();
    if (this.sermonId !== sermonId) this.suggestion = null;
    this.sermonId = sermonId;
    this.active = true;
    this.startedAt = Date.now();
    this.words = 0;
    this.recent = [];
    this.error = "";
    this.lastTidyAt = Date.now();
    clearInterval(this.timer);
    this.timer = setInterval(() => void this.tick(), 5000);
    if (!this.host.listening()) await this.host.startListening();
  };

  stop = async () => {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.timer);
    this.timer = undefined;
    await this.flush();
    // One last tidy of what was said at the end, when there is enough of it.
    if (this.host.canTidy() && !this.suggestion && wordCount(this.sinceTidy) >= FEWEST_NEW_WORDS / 2) await this.tidy();
  };

  /** A finished phrase from the speech recognizer. */
  hear = (text: string) => {
    const line = text.trim();
    if (!this.active || !line) return;
    this.unsaved.push(line);
    this.sinceTidy = `${this.sinceTidy} ${line}`.trim();
    this.words += wordCount(line);
    this.recent = [...this.recent, line].slice(-6);
  };

  private async tick() {
    if (Date.now() - this.lastSaveAt >= SAVE_EVERY_MS) await this.flush();
    if (this.host.canTidy() && !this.tidying && !this.suggestion && Date.now() - this.lastTidyAt >= TIDY_EVERY_MS && wordCount(this.sinceTidy) >= FEWEST_NEW_WORDS) await this.tidy();
  }

  /** Write the words heard so far into the sermon. */
  private async flush() {
    this.lastSaveAt = Date.now();
    const id = this.sermonId;
    if (!id || !this.unsaved.length) return;
    const sermon = this.host.sermon(id);
    if (!sermon) return;
    const lines = this.unsaved.splice(0);
    const live = sermon.live ?? { transcript: "", notes: "", updatedAt: "" };
    const transcript = [live.transcript.trim(), lines.join(" ")].filter(Boolean).join("\n");
    await this.host.save({ ...sermon, live: { ...live, transcript, updatedAt: new Date().toISOString() } });
  }

  /** Ask the AI for a new version of the notes now (also every few minutes by itself). */
  tidy = async () => {
    const id = this.sermonId;
    const sermon = id ? this.host.sermon(id) : undefined;
    if (!sermon || this.tidying) return;
    const heard = this.sinceTidy;
    if (!heard.trim()) {
      this.error = t("Nothing new heard yet.");
      return;
    }
    this.tidying = true;
    this.error = "";
    this.sinceTidy = "";
    await this.flush();
    this.lastTidyAt = Date.now();
    try {
      const notes = await this.host.tidy({ title: sermon.title, notes: sermon.live?.notes ?? "", heard });
      if (this.autoAccept) await this.accept(notes);
      else {
        this.suggestion = notes;
        this.inSuggestion = heard;
      }
    } catch (error) {
      // Kept for the next turn: words are never lost to a failed request.
      this.sinceTidy = `${heard} ${this.sinceTidy}`.trim();
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.tidying = false;
    }
  };

  /** Keep a version of the notes (the AI's, or the operator's own edit). */
  accept = async (notes = this.suggestion) => {
    const id = this.sermonId;
    if (!id || notes === null) return;
    await this.flush();
    const sermon = this.host.sermon(id);
    if (!sermon) return;
    const live = sermon.live ?? { transcript: "", notes: "", updatedAt: "" };
    await this.host.save({ ...sermon, live: { ...live, notes, updatedAt: new Date().toISOString() } });
    this.suggestion = null;
    this.inSuggestion = "";
  };

  /** The operator's own edit of a sermon's live notes (taking notes or not). */
  setNotes = async (sermonId: string, notes: string) => {
    if (this.active && this.sermonId === sermonId) await this.flush();
    const sermon = this.host.sermon(sermonId);
    if (!sermon) return;
    const live = sermon.live ?? { transcript: "", notes: "", updatedAt: "" };
    await this.host.save({ ...sermon, live: { ...live, notes, updatedAt: new Date().toISOString() } });
  };

  /** Not this version: its words go back in, so the next one still covers them. */
  dismiss = () => {
    this.sinceTidy = `${this.inSuggestion} ${this.sinceTidy}`.trim();
    this.inSuggestion = "";
    this.suggestion = null;
  };

  setAutoAccept = (on: boolean) => {
    this.autoAccept = on;
    try {
      localStorage.setItem(AUTO_KEY, on ? "1" : "0");
    } catch {
      // Remembered for this visit only.
    }
  };

  close() {
    clearInterval(this.timer);
  }
}

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}
