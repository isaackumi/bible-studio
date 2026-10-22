// Pictures straight from a folder on this computer: no importing or copying. Choose a folder (or a
// pinned one), see its pictures, put one on Preview, step through them, or run them as a slideshow
// on the screen (every few seconds, looping, with a cut or a fade). The operator stays in charge: a
// slideshow stops by itself the moment anything else goes LIVE.

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { presentImage } from "../domain/present";
import type { TransitionKind } from "../domain/types";
import { t } from "../i18n/core";
import { isDesktop } from "../platform/runtime";
import { session } from "./session.svelte";
import { audienceRoom, whenAudienceOpens } from "./rooms.svelte";

export type FolderEntry = { name: string; path: string; kind: "image" | "folder"; bytes: number; modified: number };

const PINNED_KEY = "church-studio:picture-folders";
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
  error = $state("");
  loading = $state(false);
  /** The picture on Preview (its place in the folder). */
  current = $state(-1);

  slideshow = $state<{ running: boolean; paused: boolean; seconds: number; loop: boolean; transition: TransitionKind }>({ running: false, paused: false, seconds: 6, loop: true, transition: "fade" });
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** What the slideshow last put on Program, so it knows when the operator has taken over. */
  private shownId: string | null = null;

  readonly images = $derived(this.entries.filter((entry) => entry.kind === "image"));
  readonly folders = $derived(this.entries.filter((entry) => entry.kind === "folder"));

  show = () => {
    audienceRoom.hide();
    this.open = true;
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
    return entry ? { model: presentImage({ theme: session.theme(), imageUrl: this.url(entry) }), id: `picture:${entry.path}` } : null;
  }

  /** Put a picture on Preview (Program does not change). */
  preview = (index: number) => {
    const found = this.model(index);
    if (!found) return;
    this.current = index;
    session.previewModel(found.model, found.id);
  };

  /** A picture straight to the screen: on Preview, then LIVE. */
  showNow = async (index: number, transition?: TransitionKind) => {
    const found = this.model(index);
    if (!found) return;
    this.current = index;
    session.previewModel(found.model, found.id);
    this.shownId = found.id;
    await session.take(transition);
  };

  step = (by: 1 | -1) => {
    if (!this.images.length) return;
    const next = this.current < 0 ? 0 : (this.current + by + this.images.length) % this.images.length;
    if (this.slideshow.running) void this.showNow(next, this.slideshow.transition);
    else this.preview(next);
  };

  // --- Slideshow ------------------------------------------------------------------------------

  start = async (from = Math.max(0, this.current)) => {
    if (!this.images.length) return;
    this.slideshow = { ...this.slideshow, running: true, paused: false };
    await this.showNow(from, this.slideshow.transition);
    this.schedule();
  };

  private schedule() {
    clearTimeout(this.timer);
    if (!this.slideshow.running || this.slideshow.paused) return;
    this.timer = setTimeout(() => void this.tick(), this.slideshow.seconds * 1000);
  }

  private tick = async () => {
    // Something else went LIVE: the operator has taken over, and the slideshow steps aside.
    if (session.live.program.sourceId !== this.shownId) {
      this.stop();
      return;
    }
    const next = this.current + 1;
    if (next >= this.images.length && !this.slideshow.loop) {
      this.stop();
      return;
    }
    await this.showNow(next % this.images.length, this.slideshow.transition);
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
    this.slideshow = { ...this.slideshow, running: false, paused: false };
  };

  /** 1–30 seconds a picture; a running slideshow keeps going at the new pace. */
  setSeconds = (seconds: number) => {
    this.slideshow = { ...this.slideshow, seconds: Math.min(30, Math.max(1, Math.round(seconds))) };
    this.schedule();
  };

  setOptions = (patch: Partial<{ loop: boolean; transition: TransitionKind }>) => {
    this.slideshow = { ...this.slideshow, ...patch };
  };

  /** Keep a picture for the service: it is copied into the library and added to the running order. */
  addToService = async (index: number) => {
    const entry = this.images[index];
    if (!entry) return;
    const asset = await session.importImage(entry.path);
    if (asset) session.addImage(asset.id, asset.name);
  };
}

export const pictures = new Pictures();
whenAudienceOpens(() => pictures.hide());
