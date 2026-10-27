// The load watch: how hard the computer is working (processors and memory), read every few seconds,
// and what to do when it is too much for a service. A short spike never alarms anyone: a level is
// reached only when it lasts, and left only once it has clearly passed, so an alert never flickers.
// Each alert says whose doing it is (Church Studio or other apps) and offers only what helps here;
// nothing that would interrupt the screen is offered while something is showing.

import { msg } from "../i18n/core";

/** One reading from the desktop core (src-tauri/src/diagnostics.rs `load`). */
export type LoadSample = {
  at: number;
  /** The whole computer's processors, 0–100. */
  cpu: number;
  /** Church Studio's share of the whole computer, 0–100. */
  appCpu: number;
  memoryTotal: number;
  memoryAvailable: number;
  appMemory: number;
  cores: number;
};

export type LoadLevel = "ok" | "warn" | "critical";
export type LoadKind = "cpu" | "memory" | "app-memory";

export type LoadThresholds = {
  /** Processors busy above this (%) for `sustainMs`: a warning; above `cpuCritical`: critical. */
  cpuWarn: number;
  cpuCritical: number;
  /** Free memory below this share (%) of the computer's: a warning; below `memoryCritical`: critical. */
  memoryWarn: number;
  memoryCritical: number;
  /** How long processors must stay busy before it counts. */
  sustainMs: number;
};

export const DEFAULT_THRESHOLDS: LoadThresholds = { cpuWarn: 85, cpuCritical: 95, memoryWarn: 12, memoryCritical: 6, sustainMs: 30_000 };

/** Church Studio itself holding this much memory (bytes), or this share of the computer's, is too much. */
const APP_MEMORY_WARN = 3 * 1024 ** 3;
const APP_MEMORY_CRITICAL = 5 * 1024 ** 3;
/** Free memory is tested over a shorter run: it changes slowly, and running out cannot wait. */
const MEMORY_SUSTAIN_MS = 10_000;
/** A level is left only when the reading is this far back past its line (points, or % free). */
const CPU_CLEAR_MARGIN = 10;
const MEMORY_CLEAR_MARGIN = 4;

/** Readings kept: enough for the longest run tested, plus a little. */
export const keepFor = (thresholds: LoadThresholds) => Math.max(thresholds.sustainMs, MEMORY_SUSTAIN_MS) + 15_000;

export const freePercent = (sample: LoadSample) => (sample.memoryTotal ? (100 * sample.memoryAvailable) / sample.memoryTotal : 100);

/** The readings of the last `ms`, when they cover it (a fresh launch has not seen enough yet). */
function lastRun(history: LoadSample[], ms: number, now: number): LoadSample[] | null {
  const run = history.filter((sample) => now - sample.at <= ms);
  if (run.length < 2) return null;
  // Covered: the oldest reading kept is near the start of the run (two readings' gap allowed).
  return now - run[0]!.at >= ms * 0.75 ? run : null;
}

/** Each kind's level now, from the readings and the levels before (for the way back down). */
export function loadLevels(history: LoadSample[], before: Record<LoadKind, LoadLevel>, thresholds: LoadThresholds, now: number): Record<LoadKind, LoadLevel> {
  const latest = history[history.length - 1];
  if (!latest) return { cpu: "ok", memory: "ok", "app-memory": "ok" };

  // Processors: every reading in the run above the line; back down only once well under it.
  const cpuRun = lastRun(history, thresholds.sustainMs, now);
  const cpuAbove = (line: number) => !!cpuRun && cpuRun.every((sample) => sample.cpu >= line);
  const recent = history.slice(-3);
  const cpuAverage = recent.reduce((total, sample) => total + sample.cpu, 0) / recent.length;
  let cpu: LoadLevel = cpuAbove(thresholds.cpuCritical) ? "critical" : cpuAbove(thresholds.cpuWarn) ? "warn" : "ok";
  if (cpu === "ok" && before.cpu !== "ok" && cpuAverage > thresholds.cpuWarn - CPU_CLEAR_MARGIN) cpu = before.cpu === "critical" && cpuAverage > thresholds.cpuCritical - CPU_CLEAR_MARGIN ? "critical" : "warn";

  // Free memory: below the line for the whole (shorter) run; back up only past it by a margin.
  const memoryRun = lastRun(history, MEMORY_SUSTAIN_MS, now);
  const memoryBelow = (line: number) => !!memoryRun && memoryRun.every((sample) => freePercent(sample) <= line);
  let memory: LoadLevel = memoryBelow(thresholds.memoryCritical) ? "critical" : memoryBelow(thresholds.memoryWarn) ? "warn" : "ok";
  const free = freePercent(latest);
  if (memory === "ok" && before.memory !== "ok" && free < thresholds.memoryWarn + MEMORY_CLEAR_MARGIN) memory = before.memory === "critical" && free < thresholds.memoryCritical + MEMORY_CLEAR_MARGIN ? "critical" : "warn";

  // Church Studio's own memory: a steady climb past these is a leak worth a restart after the service.
  const share = latest.memoryTotal ? latest.appMemory / latest.memoryTotal : 0;
  const appMemory: LoadLevel = latest.appMemory >= APP_MEMORY_CRITICAL || share >= 0.6 ? "critical" : latest.appMemory >= APP_MEMORY_WARN || share >= 0.4 ? "warn" : "ok";

  return { cpu, memory, "app-memory": appMemory };
}

/** What the desk is doing, so an alert offers only what helps. */
export type LoadContext = {
  /** Something is on the audience screen (a restart would black it out). */
  showing: boolean;
  /** Listening is on, and with which recognizer. */
  listening: boolean;
  heavyListening: boolean;
  /** Animated or video backgrounds are moving (and Calm backgrounds is off). */
  movingBackgrounds: boolean;
};

export type LoadActionId = "lighter-listening" | "stop-listening" | "calm-backgrounds" | "open-monitor" | "restart" | "settings";

export type LoadAlert = {
  kind: LoadKind;
  level: Exclude<LoadLevel, "ok">;
  title: string;
  detail: string;
  values: Record<string, string | number>;
  actions: Array<{ id: LoadActionId; label: string }>;
};

const LABELS: Record<LoadActionId, string> = {
  "lighter-listening": msg("Use lighter listening"),
  "stop-listening": msg("Stop listening"),
  "calm-backgrounds": msg("Hold backgrounds still"),
  "open-monitor": msg("See what is using it"),
  restart: msg("Restart Church Studio"),
  settings: msg("Alert settings"),
};

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

/** The alert for one kind at its level: what is happening, whose doing it is, and what can be done. */
export function loadAlert(kind: LoadKind, level: Exclude<LoadLevel, "ok">, sample: LoadSample, context: LoadContext): LoadAlert {
  const actions: LoadActionId[] = [];
  let title: string;
  let detail: string;
  const values: Record<string, string | number> = { cpu: Math.round(sample.cpu), app: Math.round(sample.appCpu), free: gb(sample.memoryAvailable), total: gb(sample.memoryTotal), used: gb(sample.appMemory) };
  if (kind === "cpu") {
    const ours = sample.appCpu >= sample.cpu * 0.5;
    title = level === "critical" ? msg("The computer is overloaded") : msg("The computer is working very hard");
    if (ours) {
      detail = msg("Its processors are {cpu}% busy, mostly with Church Studio. The screen may stutter and listening may fall behind.");
      if (context.listening && context.heavyListening) actions.push("lighter-listening");
      if (context.movingBackgrounds) actions.push("calm-backgrounds");
    } else {
      detail = msg("Its processors are {cpu}% busy, mostly with other apps (Church Studio uses {app}%). Close what is not needed for the service.");
    }
    actions.push("open-monitor");
  } else if (kind === "memory") {
    title = level === "critical" ? msg("The computer is almost out of memory") : msg("The computer is low on memory");
    detail = msg("{free} GB free of {total} GB (Church Studio uses {used} GB). Close other apps, browser tabs especially, before the service.");
    if (context.listening && context.heavyListening) actions.push("lighter-listening");
    actions.push("open-monitor");
  } else {
    title = msg("Church Studio is holding a lot of memory");
    detail = context.showing
      ? msg("It uses {used} GB. Restart it after the service to free it; nothing is lost.")
      : msg("It uses {used} GB. A restart frees it; nothing is lost.");
    if (!context.showing) actions.push("restart");
  }
  actions.push("settings");
  return { kind, level, title, detail, values, actions: actions.map((id) => ({ id, label: LABELS[id] })) };
}

/** Raise an alert now? On a rise in level at once; at the same level again only after `repeatMs`. */
export function shouldAlert(level: LoadLevel, before: LoadLevel, lastAt: number | undefined, now: number, repeatMs = 10 * 60_000): boolean {
  if (level === "ok") return false;
  if (level === "critical" && before !== "critical") return true;
  if (before === "ok") return true;
  return lastAt === undefined || now - lastAt >= repeatMs;
}

/** Thresholds from storage, every value kept in a sensible range. */
export function cleanThresholds(value: unknown): LoadThresholds {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const num = (key: keyof LoadThresholds, min: number, max: number) => {
    const n = Number(record[key]);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : DEFAULT_THRESHOLDS[key];
  };
  const cpuWarn = num("cpuWarn", 50, 98);
  const memoryWarn = num("memoryWarn", 3, 40);
  return {
    cpuWarn,
    cpuCritical: Math.max(cpuWarn + 1, num("cpuCritical", 55, 100)),
    memoryWarn,
    memoryCritical: Math.min(memoryWarn - 1, num("memoryCritical", 2, 30)),
    sustainMs: num("sustainMs", 5_000, 300_000),
  };
}
