// Screens: more outputs than the one audience screen, each on its own monitor with a job.
// Screen A shows the timer, B only scripture, C the stage view, and so on. A locked screen keeps
// its job whatever happens; an unlocked one can be switched live ("use A for the sermon notes").
//
// Each screen is a window the desk opens on its monitor (label "screen-<id>"). The monitor is
// remembered by its name, size and scale, so a projector unplugged and plugged back in returns to
// its job. Cameras show on the audience screen only (the computer lets one window capture them).

import type { PresentationModel } from "../domain/types";

export type ScreenRole = "program" | "scripture" | "lyrics" | "slides" | "timer" | "stage" | "blank";

/** What goes live, as screens tell it apart: a verse, song words, or slides and pictures. */
export type ContentKind = "scripture" | "lyrics" | "slides";
export const CONTENT_KINDS: readonly ContentKind[] = ["scripture", "lyrics", "slides"];

export const SCREEN_ROLES: ReadonlyArray<{ id: ScreenRole; label: string; about: string }> = [
  { id: "program", label: "Program", about: "Everything the audience sees, except cameras" },
  { id: "scripture", label: "Scripture", about: "Only verses; dark between them" },
  { id: "lyrics", label: "Lyrics", about: "Only song words; dark between them" },
  { id: "slides", label: "Slides", about: "Slides, pictures and videos; dark between them" },
  { id: "timer", label: "Timer", about: "The countdown, the part's time left, or the clock" },
  { id: "stage", label: "Stage", about: "Now and next, notes, clock and messages" },
  { id: "blank", label: "Dark", about: "Nothing, until it is given a job" },
];

export type ScreenOutput = {
  id: string;
  /** What people call it ("Left projector", "Pulpit TV"); the letter is used when empty. */
  name: string;
  /** The monitor it belongs to (display key: name|WxH|scale), or null until chosen. */
  displayKey: string | null;
  role: ScreenRole;
  /** A locked screen keeps its job: nothing switches it until it is unlocked. */
  locked: boolean;
  /**
   * A screen with one kind of job (scripture, lyrics or slides) can take other kinds too: these
   * show when its own kind is not up ("also"), or its last one stays up ("keep"). Absent: dark.
   * Its own kind always takes over the moment it goes live.
   */
  also?: ContentKind[];
  between?: "also" | "keep";
};

/** Names the church gave its monitors ("Main auditorium"), by display key (name|WxH|scale). */
export type MonitorNames = Record<string, string>;

export type ScreenDisplay = { key: string; name: string; x: number; y: number; width: number; height: number; primary: boolean; audience: boolean };

/** The most screens one desk drives (a computer rarely has more outputs). */
export const MAX_SCREENS = 8;

const ROLES = new Set<ScreenRole>(SCREEN_ROLES.map((role) => role.id));

/** Screen letters in order: A, B, C… */
export const screenLetter = (index: number) => String.fromCharCode(65 + (index % 26));

/** Saved screens, cleaned: known jobs, unique ids, short names, at most eight. */
export function sanitizeScreens(value: unknown): ScreenOutput[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ScreenOutput[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Partial<ScreenOutput>;
    const id = typeof item.id === "string" && /^[a-z0-9]{4,24}$/.test(item.id) ? item.id : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: typeof item.name === "string" ? item.name.trim().slice(0, 40) : "",
      displayKey: typeof item.displayKey === "string" && item.displayKey ? item.displayKey.slice(0, 200) : null,
      role: ROLES.has(item.role as ScreenRole) ? (item.role as ScreenRole) : "blank",
      locked: item.locked === true,
      ...(() => {
        const also = Array.isArray(item.also) ? [...new Set(item.also.filter((kind): kind is ContentKind => CONTENT_KINDS.includes(kind as ContentKind)))] : [];
        return {
          ...(also.length ? { also } : {}),
          ...(item.between === "also" || item.between === "keep" ? { between: item.between } : {}),
        };
      })(),
    });
  }
  return out.slice(0, MAX_SCREENS);
}

/** Saved monitor names, cleaned: short names, at most a few dozen monitors. */
export function sanitizeMonitorNames(value: unknown): MonitorNames {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: MonitorNames = {};
  for (const [key, name] of Object.entries(value).slice(0, 40)) {
    if (typeof name === "string" && name.trim() && key.length <= 200) out[key] = name.trim().slice(0, 40);
  }
  return out;
}

/** Give a screen a new job, unless it is locked. */
export function switchRole(screens: ScreenOutput[], id: string, role: ScreenRole): ScreenOutput[] {
  return screens.map((screen) => (screen.id === id && !screen.locked ? { ...screen, role } : screen));
}

/**
 * Jobs right now: each screen's own job, or the one the running part gives it (Sermon: Timer,
 * Worship: Lyrics). A locked screen always keeps its own job.
 */
export function screensNow(screens: ScreenOutput[], partJobs: Record<string, unknown> | undefined): ScreenOutput[] {
  if (!partJobs) return screens;
  return screens.map((screen) => {
    const job = partJobs[screen.id];
    return screen.locked || !ROLES.has(job as ScreenRole) ? screen : { ...screen, role: job as ScreenRole };
  });
}

/** What this screen shows of Program: everything, only verses, only song words, or nothing. */
export function programFor(role: ScreenRole, model: PresentationModel | null): PresentationModel | null {
  if (!model) return null;
  if (role === "program") return model;
  if (role === "scripture" || role === "lyrics" || role === "slides") return contentKind(model) === role ? model : null;
  return null;
}

/** What went live, as screens tell it apart. BLACK and CLEAR are "clear": every screen goes dark. */
export function contentKind(model: PresentationModel | null): ContentKind | "clear" | "other" {
  if (!model || model.layout === "black" || model.layout === "empty") return "clear";
  if (model.layout === "scripture") return "scripture";
  if (model.layout === "lyrics") return "lyrics";
  if (["image", "video", "document", "title", "composition"].includes(model.layout)) return "slides";
  return "other";
}

/**
 * What a screen shows now, and the last of its own kind it showed (for "keep"). Its own kind
 * always takes over the moment it goes live; between them it shows the other kinds it takes, keeps
 * the last one up, or goes dark. BLACK and CLEAR empty it whatever it was keeping.
 */
export function screenShows(screen: Pick<ScreenOutput, "role" | "also" | "between">, model: PresentationModel | null, last: PresentationModel | null): { show: PresentationModel | null; last: PresentationModel | null } {
  if (screen.role === "program") return { show: model, last: null };
  if (screen.role !== "scripture" && screen.role !== "lyrics" && screen.role !== "slides") return { show: null, last: null };
  const kind = contentKind(model);
  if (kind === "clear") return { show: null, last: null };
  if (kind === screen.role) return { show: model, last: model };
  if (screen.between === "keep") return { show: last, last };
  if (screen.between === "also" && kind !== "other" && screen.also?.includes(kind)) return { show: model, last };
  return { show: null, last };
}

/** A monitor as people know it: the church's name for it, with its own name beside ("Main auditorium (HISENSE)"). */
export function monitorLabel(display: { key: string; name: string }, names: MonitorNames): string {
  const own = names[display.key] ?? Object.entries(names).find(([key]) => key.split("|")[0] === display.name)?.[1];
  return own?.trim() ? `${own.trim()} (${display.name})` : display.name;
}

export type ScreenPlace =
  | { state: "showing"; display: ScreenDisplay }
  | { state: "no-monitor" }
  | { state: "missing"; displayKey: string }
  | { state: "taken"; display: ScreenDisplay; by: "desk" | "audience" | "screen" };

/**
 * Where each screen goes now: on its monitor if that monitor is connected and nothing else is
 * there (the desk, the audience screen or an earlier screen keep theirs).
 */
export function placeScreens(screens: ScreenOutput[], displays: ScreenDisplay[], deskKey: string | null): Map<string, ScreenPlace> {
  const places = new Map<string, ScreenPlace>();
  const used = new Set<string>();
  for (const screen of screens) {
    if (!screen.displayKey) {
      places.set(screen.id, { state: "no-monitor" });
      continue;
    }
    const display = displays.find((item) => item.key === screen.displayKey);
    if (!display) places.set(screen.id, { state: "missing", displayKey: screen.displayKey });
    else if (display.key === deskKey) places.set(screen.id, { state: "taken", display, by: "desk" });
    else if (display.audience) places.set(screen.id, { state: "taken", display, by: "audience" });
    else if (used.has(display.key)) places.set(screen.id, { state: "taken", display, by: "screen" });
    else {
      used.add(display.key);
      places.set(screen.id, { state: "showing", display });
    }
  }
  return places;
}

/** A new screen: on the first free monitor (not the desk's, the audience's or another screen's). */
export function newScreen(screens: ScreenOutput[], displays: ScreenDisplay[], deskKey: string | null, id: string): ScreenOutput {
  const taken = new Set(screens.map((screen) => screen.displayKey).filter(Boolean));
  const free = displays.find((display) => display.key !== deskKey && !display.audience && !taken.has(display.key));
  return { id, name: "", displayKey: free?.key ?? null, role: screens.length === 0 ? "timer" : "blank", locked: false };
}

// --- The window's side -----------------------------------------------------------------------------

export const SCREENS_KEY = "church-studio.screens";

/** The screens list as the desk last shared it (windows read it on start, then follow events). */
export function readScreensLocal(): ScreenOutput[] {
  try {
    return sanitizeScreens(JSON.parse(localStorage.getItem(SCREENS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function writeScreensLocal(screens: ScreenOutput[]) {
  try {
    localStorage.setItem(SCREENS_KEY, JSON.stringify(screens));
  } catch {
    // Storage refused (private window): windows still get the event.
  }
}
