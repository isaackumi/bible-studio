import { preferService, serviceSongIds } from "../domain/service-first";
import type { BibleItem, Service, Song } from "../domain/types";
import { t } from "../i18n/core";
import { callSong, callVerse, claimed, newPilot, songOf, standBack, watchProgram, type Pilot, type ProgramNow } from "../voice/autopilot";
import { spokenReference } from "../voice/detect";
import { buildSongIndex, chooseSung, screenForSung, type SongIndex } from "../voice/song-detect";

/** What Autopilot needs from the session. */
export type AutopilotHost = {
  songs: () => Song[];
  service: () => Service | null;
  program: () => ProgramNow;
  nextSource: () => string | null;
  songScreens: (section: { lines: string[] }) => Array<{ from: number; to: number }>;
  /** Put a song part on the screen, leaving what the operator staged on Next. */
  songLive: (song: Song, sectionId: string, screen: number) => Promise<void>;
  songNext: (song: Song, sectionId: string, screen: number) => void;
  /** Put a verse on the screen (it is on Next already). */
  verseLive: (passage: BibleItem) => Promise<void>;
  undo: () => Promise<void>;
  onHeard: (listener: (text: string, final: boolean, alternatives: string[]) => void) => () => void;
  listening: () => boolean;
  startListening: () => Promise<void>;
  /** Premium check (shows the offer when it is not). */
  allowed: () => boolean;
  sermonMode: () => "off" | "suggest" | "auto";
  setSermonMode: (mode: "off" | "suggest" | "auto") => void;
  /** A line for the listening log, so a service can be looked back on. */
  log: (line: string) => void;
};

/**
 * Autopilot (voice/autopilot.ts has its rules): songs follow the singing straight onto the screen,
 * and sermon slides follow the preaching (the session's Auto-advance). Verses heard wait on Next,
 * unless the operator lets them go live when their whole reference is said. It says what it did
 * last, so the operator can trust it and undo it.
 */
export class Autopilot {
  on = $state(false);
  /** The last thing it did, for the desk's line. */
  last = $state<{ label: string; live: boolean } | null>(null);
  /** Standing back because the operator took over. */
  paused = $state(false);
  /** Verses whose whole reference is said go live too (this computer remembers the choice). */
  verses = $state(readVerses());

  private pilot: Pilot = newPilot();
  private stopHearing: (() => void) | null = null;
  private sermonBefore: "off" | "suggest" | "auto" = "off";
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;
  /** Changing the screen now: what is heard meanwhile waits, so the change is not taken for the operator's. */
  private moving = false;
  private indexed: { songs: Song[]; service: Service | null; all: SongIndex; own: SongIndex } | null = null;

  constructor(private readonly host: AutopilotHost) {}

  start = async () => {
    if (this.on || !this.host.allowed()) return;
    this.on = true;
    this.last = null;
    this.pilot = { ...newPilot(), seen: this.host.program().source };
    this.stopHearing = this.host.onHeard((text, _final, alternatives) => this.heard(text, alternatives));
    this.sermonBefore = this.host.sermonMode();
    this.host.setSermonMode("auto");
    this.host.log("autopilot: on");
    if (!this.host.listening()) await this.host.startListening();
  };

  stop = () => {
    if (!this.on) return;
    this.on = false;
    this.stopHearing?.();
    this.stopHearing = null;
    if (this.host.sermonMode() === "auto") this.host.setSermonMode(this.sermonBefore);
    this.setPaused(0);
    this.host.log("autopilot: off");
  };

  /** Undo Autopilot's last change, and stand back for a while. */
  undo = async () => {
    await this.host.undo();
    this.pilot = standBack({ ...this.pilot, seen: this.host.program().source }, Date.now());
    this.setPaused(this.pilot.holdUntil - Date.now());
    this.host.log("autopilot: undone");
  };

  setVerses = (on: boolean) => {
    this.verses = on;
    try {
      localStorage.setItem(VERSES_KEY, on ? "1" : "0");
    } catch {
      // Private windows can refuse storage; the choice lasts for this session.
    }
  };

  /** A verse found by listening (the desk put it on Next). True when Autopilot showed it. */
  verse = async (passage: BibleItem, text: string, final: boolean): Promise<boolean> => {
    if (!this.on || !this.verses || this.moving) return false;
    const now = Date.now();
    this.watch(now);
    const said = spokenReference(text);
    const cited = Boolean(said?.startVerse) && said!.bookOrd === passage.bookOrd && said!.chapter === passage.chapter && said!.startVerse === passage.startVerse;
    const call = callVerse(this.pilot, { key: `verse:${passage.reference}`, cited, final }, this.host.program(), now);
    this.pilot = call.pilot;
    if (call.action !== "live") return false;
    await this.move(passage.reference, () => this.host.verseLive(passage));
    return true;
  };

  /** Make a change to the screen, then take what the screen shows now as Autopilot's own. */
  private async move(label: string, change: () => Promise<void>) {
    this.moving = true;
    try {
      await change();
    } finally {
      this.moving = false;
    }
    this.pilot = claimed(this.pilot, this.host.program().source ?? "", Date.now());
    this.last = { label, live: true };
    this.host.log(`autopilot: live ${label}`);
  }

  /** Look at the screen: a change Autopilot did not make means the operator took over. */
  private watch(now: number) {
    const watched = watchProgram(this.pilot, this.host.program(), now);
    if (watched.holdUntil !== this.pilot.holdUntil) {
      this.setPaused(watched.holdUntil - now);
      this.host.log("autopilot: the operator took over; standing back");
    }
    this.pilot = watched;
  }

  /** Autopilot's own sermon slide change (Auto-advance), so it is not taken for the operator's. */
  claim = (key: string, label: string) => {
    if (!this.on) return;
    this.pilot = claimed(this.pilot, key, Date.now());
    this.last = { label, live: true };
  };

  private setPaused(ms: number) {
    clearTimeout(this.pauseTimer);
    this.paused = ms > 0;
    if (ms > 0) this.pauseTimer = setTimeout(() => (this.paused = false), ms);
  }

  private index() {
    const songs = this.host.songs();
    const service = this.host.service();
    if (!this.indexed || this.indexed.songs !== songs || this.indexed.service !== service) {
      const inService = serviceSongIds(service);
      this.indexed = { songs, service, all: buildSongIndex(songs), own: buildSongIndex(songs.filter((song) => inService.has(song.id))) };
    }
    return this.indexed;
  }

  private heard(text: string, alternatives: string[]) {
    if (!text || this.moving) return;
    const now = Date.now();
    this.watch(now);
    const program = this.host.program();

    const { all, own } = this.index();
    const phrases = alternatives.length ? alternatives : [text];
    const current = songOf(program.source);
    const match = preferService(own.entries.length ? chooseSung(phrases, own, current) : null, chooseSung(phrases, all, current));
    if (!match) return;
    const song = this.host.songs().find((entry) => entry.id === match.songId);
    const section = song?.sections.find((entry) => entry.id === match.sectionId);
    if (!song || !section) return;
    // Line by line, the screen holding the words just sung.
    const screens = this.host.songScreens(section);
    const base = `song:${song.id}:${section.id}`;
    const showingScreen = program.source?.startsWith(`${base}#`) ? Number(program.source.slice(base.length + 1)) || 0 : 0;
    const screen = screenForSung(text, section.lines, screens, showingScreen);
    const key = screens.length > 1 ? `${base}#${screen}` : base;
    const label = screens.length > 1 ? `${match.label} · ${screen + 1}/${screens.length}` : match.label;

    const call = callSong(this.pilot, { key, songId: song.id, inService: own.entries.some((entry) => entry.songId === song.id) }, program, this.host.nextSource(), now);
    this.pilot = call.pilot;
    if (call.action === "live") {
      void this.move(label, () => this.host.songLive(song, section.id, screen));
    } else if (call.action === "next") {
      this.last = { label, live: false };
      this.host.log(`autopilot: next ${label}`);
      this.host.songNext(song, section.id, screen);
    }
  }

  /** The desk's line: what Autopilot is doing now. */
  get status(): string {
    if (!this.on) return "";
    if (!this.host.listening()) return t("Autopilot needs listening on.");
    if (this.paused) return t("You took over. Autopilot waits a moment before following again.");
    if (!this.last) return this.verses ? t("Autopilot is following the singing, the sermon slides and the verses read.") : t("Autopilot is following the singing and the sermon slides.");
    return this.last.live ? t("Autopilot showed {label}.", { label: this.last.label }) : t("{label} is on Next. Something else is showing.", { label: this.last.label });
  }
}

const VERSES_KEY = "church-studio:autopilot-verses";

function readVerses(): boolean {
  try {
    return localStorage.getItem(VERSES_KEY) === "1";
  } catch {
    return false;
  }
}
