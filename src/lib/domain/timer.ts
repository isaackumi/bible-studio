import type { PresentationModel, Theme } from "./types";

export type TimerMode = "countdown" | "countup" | "clock" | "target";

/** Countdowns turn red this long before zero unless the source sets another warning time. */
export const DEFAULT_TIMER_WARNING_MS = 60_000;

export type TimerSpec = {
  id: string;
  name: string;
  mode: TimerMode;
  label: string;
  durationMs: number;
  targetAt: number | null;
  warningMs: number;
  running: boolean;
  startedAt: number | null;
  elapsedMs: number;
};

export type TimerPaint = {
  mode: TimerMode;
  label: string;
  durationMs: number;
  elapsedMs: number;
  startedAt: number | null;
  running: boolean;
  warningMs: number;
  targetAt: number | null;
};

export type TimerView = {
  text: string;
  remainingMs: number;
  elapsedMs: number;
  complete: boolean;
  warning: boolean;
};

function pad(value: number) {
  return String(Math.max(0, value)).padStart(2, "0");
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function targetAtFromClock(clock: string, now: number): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(clock.trim());
  if (!match) return now;
  const date = new Date(now);
  date.setHours(Number(match[1]), Number(match[2]), Number(match[3] ?? 0), 0);
  let at = date.getTime();
  if (at <= now) at += 24 * 60 * 60 * 1000;
  return at;
}

export function formatClock(at: number, utc = false) {
  const date = new Date(at);
  const hours = utc ? date.getUTCHours() : date.getHours();
  const minutes = utc ? date.getUTCMinutes() : date.getMinutes();
  const seconds = utc ? date.getUTCSeconds() : date.getSeconds();
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function createTimer(input: {
  name: string;
  mode: TimerMode;
  durationMs?: number;
  targetAt?: number | null;
  warningMs?: number;
  label?: string;
  id?: string;
}): TimerSpec {
  return {
    id: input.id ?? `timer:${input.name}`,
    name: input.name.trim() || "Timer",
    mode: input.mode,
    label: input.label?.trim() || input.name.trim() || "Timer",
    durationMs: Math.max(0, Math.round(input.durationMs ?? 0)),
    targetAt: input.targetAt ?? null,
    warningMs: Math.max(0, Math.round(input.warningMs ?? 10_000)),
    running: false,
    startedAt: null,
    elapsedMs: 0,
  };
}

export function elapsedOf(timer: TimerSpec, now: number) {
  if (!timer.running || timer.startedAt === null) return timer.elapsedMs;
  return timer.elapsedMs + Math.max(0, now - timer.startedAt);
}

export function timerDisplay(timer: TimerSpec, now: number): TimerView {
  if (timer.mode === "clock") {
    return { text: formatClock(now), remainingMs: 0, elapsedMs: 0, complete: false, warning: false };
  }
  if (timer.mode === "target") {
    const remaining = Math.max(0, (timer.targetAt ?? 0) - now);
    return {
      text: formatDuration(remaining),
      remainingMs: remaining,
      elapsedMs: 0,
      complete: remaining <= 0,
      warning: remaining > 0 && remaining <= timer.warningMs,
    };
  }
  const elapsed = elapsedOf(timer, now);
  if (timer.mode === "countup") {
    const capped = Math.min(elapsed, timer.durationMs || elapsed);
    return {
      text: formatDuration(capped),
      remainingMs: Math.max(0, (timer.durationMs || 0) - capped),
      elapsedMs: capped,
      complete: timer.durationMs > 0 && capped >= timer.durationMs,
      warning: false,
    };
  }
  const remaining = Math.max(0, timer.durationMs - elapsed);
  return {
    text: formatDuration(remaining),
    remainingMs: remaining,
    elapsedMs: elapsed,
    complete: remaining <= 0,
    warning: remaining > 0 && remaining <= timer.warningMs,
  };
}

export function startTimer(timer: TimerSpec, now: number): TimerSpec {
  if (timer.running) return timer;
  return { ...timer, running: true, startedAt: now };
}

export function pauseTimer(timer: TimerSpec, now: number): TimerSpec {
  if (!timer.running) return timer;
  return { ...timer, running: false, elapsedMs: elapsedOf(timer, now), startedAt: null };
}

export function resumeTimer(timer: TimerSpec, now: number): TimerSpec {
  return startTimer(timer, now);
}

export function resetTimer(timer: TimerSpec): TimerSpec {
  return { ...timer, running: false, startedAt: null, elapsedMs: 0 };
}

export function timerFromPaint(paint: TimerPaint, label = paint.label): TimerSpec {
  return {
    id: "paint",
    name: label,
    mode: paint.mode,
    label: paint.label,
    durationMs: paint.durationMs,
    targetAt: paint.targetAt,
    warningMs: paint.warningMs,
    running: paint.running,
    startedAt: paint.startedAt,
    elapsedMs: paint.elapsedMs,
  };
}

export function presentTimer(timer: TimerSpec, theme: Theme, now: number): PresentationModel {
  const view = timerDisplay(timer, now);
  return {
    layout: "timer",
    // Timers read across a room: at least 96px unless a style sets the size.
    theme: { ...theme, fontSize: Math.max(theme.fontSize, 96) },
    reference: timer.label,
    attribution: null,
    lines: [{ text: view.text }],
    imageUrl: null,
    backgroundImageUrl: null,
    timer: {
      mode: timer.mode,
      label: timer.label,
      durationMs: timer.durationMs,
      elapsedMs: timer.elapsedMs,
      startedAt: timer.startedAt,
      running: timer.running,
      warningMs: timer.warningMs,
      targetAt: timer.targetAt,
    },
  };
}

export type TimerAction = "pause" | "resume" | "reset";

/** Pause, resume or reset one painted timer. Clocks have nothing to control. */
export function controlPaint(paint: TimerPaint, action: TimerAction, now: number): TimerPaint {
  if (paint.mode === "clock") return paint;
  const spec = timerFromPaint(paint);
  const next = action === "pause" ? pauseTimer(spec, now) : action === "resume" ? resumeTimer(spec, now) : resetTimer(spec);
  return { ...paint, running: next.running, startedAt: next.startedAt, elapsedMs: next.elapsedMs };
}

/** Controllable timers (not clocks) in a frame, including scene layers. */
export function timersIn(model: PresentationModel): TimerPaint[] {
  const own = model.timer && model.timer.mode !== "clock" ? [model.timer] : [];
  return [...own, ...(model.layers ?? []).flatMap((layer) => timersIn(layer.model))];
}

/** Apply a timer action to every timer in a frame. Null when the frame has no timer. */
export function controlTimers(model: PresentationModel, action: TimerAction, now: number): PresentationModel | null {
  if (!timersIn(model).length) return null;
  const apply = (frame: PresentationModel): PresentationModel => ({
    ...frame,
    ...(frame.timer ? { timer: controlPaint(frame.timer, action, now) } : {}),
    ...(frame.layers ? { layers: frame.layers.map((layer) => ({ ...layer, model: apply(layer.model) })) } : {}),
  });
  return apply(model);
}
