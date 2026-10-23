// Pictures and videos straight from a folder on this computer: no importing or copying. Choose a
// folder (a pinned one, or a place such as Pictures or a synced Google Drive), see what is in it, put
// one on Preview, step through them, or run them as a slideshow on the screen (every few seconds for
// a picture, to the end for a video, looping, with a cut or a fade). The operator stays in charge: a
// slideshow stops by itself the moment anything else goes LIVE.

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { presentImage, presentVideo } from "../domain/present";
import type { ScreenTransition } from "../domain/types";
import { t } from "../i18n/core";
import { captionOf, cleanSlideOptions, screenTransition, slideOrder, type SlideOptions } from "../domain/slideshow";
import { isDesktop } from "../platform/runtime";
import { session } from "./session.svelte";
import { audienceRoom, whenAudienceOpens } from "./rooms.svelte";

export type FolderEntry = { name: string; path: string; kind: "image" | "video" | "folder"; bytes: number; modified: number; items: number };
/** Where pictures usually are: Pictures, Desktop, and cloud drives synced by their own apps. */
export type Place = { name: string; path: string; kind: "pictures" | "desktop" | "google-drive" | "icloud" | "dropbox" | "onedrive" };

/** Each folder keeps its own colour (from its name), so it is found again at a glance. */
const FOLDER_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
export function folderColor(name: string): string {
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FOLDER_COLORS[hash % FOLDER_COLORS.length]!;
}

/** The folders above and including this one, for a path to click back through (the last few). */
export function crumbsOf(path: string, keep = 4): Array<{ name: string; path: string }> {
  const crumbs: Array<{ name: string; path: string }> = [];
  let at: string | null = path;
  while (at && crumbs.length < keep) {
    crumbs.unshift({ name: folderName(at), path: at });
    at = parentOf(at);
  }
  return crumbs;
}

const PINNED_KEY = "church-studio:picture-folders";
const OPTIONS_KEY = "church-studio:slideshow";
const LAST_KEY = "church-studio:picture-folder";
const MOST_PINNED = 12;

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage refused: it lasts for this session.
  }
}

/** The folder a path is in ("/a/b/c" → "/a/b"), on any system. */
export function parentOf(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, "");
  const at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return at > 0 ? trimmed.slice(0, at) : null;
}

export const folderName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;

class Pictures {
  open = $state(false);
  folder = $state<string | null>(null);
  entries = $state<FolderEntry[]>([]);
  pinned = $state<string[]>(typeof localStorage === "undefined" ? [] : read<string[]>(PINNED_KEY, []));
  places = $state<Place[]>([]);
  error = $state("");
  loading = $state(false);
  /** The picture on Preview (its place in the folder). */
  current = $state(-1);

  /** The church's choices (remembered), and whether one is running now. */
  slideshow = $state<SlideOptions & { running: boolean; paused: boolean }>({ ...cleanSlideOptions(typeof localStorage === "undefined" ? null : read<unknown>(OPTIONS_KEY, null)), running: false, paused: false });
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** The order this run plays in (places in `images`), and where it is in it. */
  private sequence: number[] = [];
  private position = 0;
  private countdownTimer: ReturnType<typeof setTimeout> | undefined;
  private watchTimer: ReturnType<typeof setInterval> | undefined;
  /** What the slideshow last put on Program, so it knows when the operator has taken over. */
  private shownId: string | null = null;

  /** Pictures and videos, in the order they show (and play in a slideshow). */
  readonly images = $derived(this.entries.filter((entry) => entry.kind !== "folder"));
  readonly folders = $derived(this.entries.filter((entry) => entry.kind === "folder"));

  show = () => {
    audienceRoom.hide();
    this.open = true;
    if (isDesktop() && !this.places.length) void invoke<Place[]>("picture_places").then((found) => (this.places = found)).catch(() => {});
    if (!this.folder && isDesktop()) {
      const last = typeof localStorage === "undefined" ? null : read<string | null>(LAST_KEY, null);
      if (last) void this.openFolder(last);
    }
  };

  hide = () => {
    this.open = false;
  };

  choose = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false, title: t("Choose a folder of pictures") });
    if (typeof picked === "string") await this.openFolder(picked);
  };

  openFolder = async (path: string) => {
    this.loading = true;
    this.error = "";
    try {
      const entries = await invoke<FolderEntry[]>("picture_folder", { path });
      this.entries = entries.sort((a, b) => (a.kind === b.kind ? byName.compare(a.name, b.name) : a.kind === "folder" ? -1 : 1));
      this.folder = path;
      this.current = -1;
      write(LAST_KEY, path);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
    }
  };

  up = () => {
    const parent = this.folder ? parentOf(this.folder) : null;
    if (parent) void this.openFolder(parent);
  };

  togglePin = (path = this.folder) => {
    if (!path) return;
    this.pinned = this.pinned.includes(path) ? this.pinned.filter((entry) => entry !== path) : [path, ...this.pinned].slice(0, MOST_PINNED);
    write(PINNED_KEY, this.pinned);
  };

  url = (entry: FolderEntry) => convertFileSrc(entry.path);

  private model(index: number) {
    const entry = this.images[index];
    if (!entry) return null;
    const show = this.slideshow;
    // In a running slideshow, a picture zooms for as long as it shows (and a little into the change).
    const kenBurns = show.running && show.kenBurns ? show.seconds + 2 : undefined;
    const caption = show.running && show.captions ? captionOf(entry.name) : undefined;
    const model = entry.kind === "video" ? presentVideo({ theme: session.theme(), videoUrl: this.url(entry), loop: false }) : presentImage({ theme: session.theme(), imageUrl: this.url(entry), kenBurns, caption });
    return { model, id: `picture:${entry.path}` };
  }

  /** Put a picture on Preview (Program does not change). */
  preview = (index: number) => {
    const found = this.model(index);
    if (!found) return;
    this.current = index;
    session.previewModel(found.model, found.id);
  };

  /** A picture straight to the screen: on Preview, then LIVE. */
  showNow = async (index: number, transition?: ScreenTransition, ms?: number) => {
    const found = this.model(index);
    if (!found) return;
    this.current = index;
    session.previewModel(found.model, found.id);
    this.shownId = found.id;
    await session.take(transition, ms);
  };

  /** Changes of picture so far, so Mix takes turns. */
  private turns = 0;

  /** The slideshow's transition for its next change of picture, and its length. */
  private change(direction: 1 | -1): [ScreenTransition, number] {
    this.turns += 1;
    return [screenTransition(this.slideshow.transition, direction, this.turns), Math.round(this.slideshow.transitionSeconds * 1000)];
  }

  step = (by: 1 | -1) => {
    if (!this.images.length) return;
    const next = this.current < 0 ? 0 : (this.current + by + this.images.length) % this.images.length;
    if (this.slideshow.running) void this.showNow(next, ...this.change(by));
    else this.preview(next);
  };

  // --- Slideshow ------------------------------------------------------------------------------

  start = async (from = this.current) => {
    if (!this.images.length) return;
    this.slideshow = { ...this.slideshow, running: true, paused: false };
    this.sequence = slideOrder(this.images, this.slideshow.order, from);
    this.position = 0;
    // Music first, so the first picture's take does not fade it (session.slideshowMusic).
    // It loops for as long as the pictures run, whatever the playlist's own setting.
    if (this.slideshow.music && this.slideshow.playlistId) {
      session.slideshowMusic = true;
      if (session.audio.playlistId !== this.slideshow.playlistId || !session.audio.playing) await session.playPlaylist(this.slideshow.playlistId, 0, { loop: true });
    }
    if (this.slideshow.countdown) {
      const endsAt = Date.now() + this.slideshow.countdownMinutes * 60_000;
      void session.setSlideCountdown({ label: t(this.slideshow.countdownLabel), endsAt });
      clearTimeout(this.countdownTimer);
      // At zero the countdown leaves the screen; the pictures carry on until the operator moves on.
      this.countdownTimer = setTimeout(() => void session.setSlideCountdown(null), endsAt - Date.now());
    }
    if (this.slideshow.watch) {
      clearInterval(this.watchTimer);
      this.watchTimer = setInterval(() => void this.pickUpNew(), 20_000);
    }
    await this.showNow(this.sequence[0]!, ...this.change(1));
    this.schedule();
  };

  /** Pictures added to the folder while it runs (someone filling a shared Drive folder) join the end. */
  private pickUpNew = async () => {
    if (!this.folder || !this.slideshow.running) return;
    const folder = this.folder;
    const before = new Set(this.images.map((entry) => entry.path));
    const shownPath = this.images[this.current]?.path;
    try {
      const entries = await invoke<FolderEntry[]>("picture_folder", { path: folder });
      if (this.folder !== folder || !this.slideshow.running) return;
      const added = entries.filter((entry) => entry.kind !== "folder" && !before.has(entry.path));
      if (!added.length) return;
      this.entries = [...this.entries, ...added];
      // Places stay true for what is already in the order; the new ones play next round.
      this.current = this.images.findIndex((entry) => entry.path === shownPath);
      for (const entry of added) this.sequence.push(this.images.findIndex((image) => image.path === entry.path));
      session.notify(t("{count} new pictures joined the slideshow.", { count: added.length }));
    } catch {
      // The folder is gone or offline for a moment: the slideshow carries on with what it has.
    }
  };

  private schedule() {
    clearTimeout(this.timer);
    if (!this.slideshow.running || this.slideshow.paused) return;
    // A video plays to its end; the next comes once it has (checked twice a second).
    if (this.images[this.current]?.kind === "video") {
      this.timer = setTimeout(() => (session.programVideoDone() === false ? this.schedule() : void this.tick()), 500);
      return;
    }
    this.timer = setTimeout(() => void this.tick(), this.slideshow.seconds * 1000);
  }

  private tick = async () => {
    // Something else went LIVE: the operator has taken over, and the slideshow steps aside.
    if (session.live.program.sourceId !== this.shownId) {
      this.stop();
      return;
    }
    let position = this.position + 1;
    if (position >= this.sequence.length) {
      if (!this.slideshow.loop) {
        this.stop();
        return;
      }
      // A new round: a shuffled show mixes again (and does not repeat the last picture first).
      position = 0;
      if (this.slideshow.order === "shuffle") {
        const mixed = slideOrder(this.images, "shuffle", -1);
        if (mixed.length > 1 && mixed[0] === this.current) mixed.push(mixed.shift()!);
        this.sequence = mixed;
      }
    }
    this.position = position;
    await this.showNow(this.sequence[position]!, ...this.change(1));
    this.schedule();
  };

  pause = () => {
    this.slideshow = { ...this.slideshow, paused: true };
    clearTimeout(this.timer);
  };

  resume = () => {
    this.slideshow = { ...this.slideshow, paused: false };
    this.schedule();
  };

  stop = () => {
    clearTimeout(this.timer);
    clearTimeout(this.countdownTimer);
    clearInterval(this.watchTimer);
    const wasRunning = this.slideshow.running;
    this.slideshow = { ...this.slideshow, running: false, paused: false };
    if (!wasRunning) return;
    if (session.slideCountdown) void session.setSlideCountdown(null);
    if (session.slideshowMusic) {
      session.slideshowMusic = false;
      session.audio.fadeOut(4);
    }
  };

  /** The slideshow's playlist, made the first time music is added here. */
  private musicPlaylist(): string {
    const chosen = this.slideshow.playlistId && session.workspace.playlists.some((list) => list.id === this.slideshow.playlistId) ? this.slideshow.playlistId : null;
    return chosen ?? session.createPlaylist(t("Slideshow music")).id;
  }

  /** Pick songs on this computer for the slideshow; music switches on with them. */
  addMusic = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: true, filters: [{ name: "Audio", extensions: ["mp3", "m4a", "aac", "wav", "ogg", "oga", "flac"] }] });
    const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
    if (!paths.length) return;
    const playlistId = this.musicPlaylist();
    const added = await session.importAudio(paths, playlistId);
    if (added.length) this.setOptions({ music: true, playlistId });
  };

  /** Hear the slideshow's music now (or pause it), before the pictures start. */
  testMusic = async () => {
    const id = this.slideshow.playlistId;
    if (!id) return;
    if (session.audio.playlistId === id && session.audio.current) {
      await session.audio.toggle();
      return;
    }
    await session.playPlaylist(id, 0, { loop: true });
  };

  /** 1–30 seconds a picture; a running slideshow keeps going at the new pace. */
  setSeconds = (seconds: number) => {
    this.setOptions({ seconds });
    this.schedule();
  };

  /** Change a choice; it is remembered for next time (on this computer). */
  setOptions = (patch: Partial<SlideOptions>) => {
    const { running, paused } = this.slideshow;
    const options = cleanSlideOptions({ ...this.slideshow, ...patch });
    this.slideshow = { ...options, running, paused };
    write(OPTIONS_KEY, options);
  };

  /** Keep a picture or video for the service: it is copied into the library and added to the running order. */
  addToService = async (index: number) => {
    const entry = this.images[index];
    if (!entry) return;
    const asset = await session.importImage(entry.path);
    if (!asset) return;
    if (asset.kind === "video") session.addVideo(asset.id, asset.name, { loop: false });
    else session.addImage(asset.id, asset.name);
  };
}

export const pictures = new Pictures();
whenAudienceOpens(() => pictures.hide());
