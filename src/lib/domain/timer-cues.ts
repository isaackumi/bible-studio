// Sounds for countdowns, so the team hears time running out without watching the clock: a soft
// double beep at the warning times (5 and 1 minutes by default), a tick for each of the last
// seconds, and a longer chime at zero. Pure: given the time left before and now, which cues are due.

export type TimerSounds = {
  on: boolean;
  /** 0–1. */
  volume: number;
  /** Minutes left that get a double beep. */
  warnAt: number[];
  /** A tick for each of the last ten seconds. */
  ticks: boolean;
};

export type TimerCue = "warn" | "tick" | "end";

export const WARN_CHOICES = [10, 5, 2, 1] as const;

export function defaultTimerSounds(): TimerSounds {
  return { on: true, volume: 0.5, warnAt: [5, 1], ticks: true };
}

export function sanitizeTimerSounds(value: unknown): TimerSounds {
  const base = defaultTimerSounds();
  const record = value && typeof value === "object" ? (value as Partial<TimerSounds>) : {};
  const volume = typeof record.volume === "number" && Number.isFinite(record.volume) ? Math.min(1, Math.max(0, record.volume)) : base.volume;
  const warnAt = Array.isArray(record.warnAt)
    ? [...new Set(record.warnAt.filter((minutes): minutes is number => typeof minutes === "number" && minutes > 0 && minutes <= 60).map(Math.round))].sort((a, b) => b - a)
    : base.warnAt;
  return { on: record.on !== false, volume, warnAt, ticks: record.ticks !== false };
}

/**
 * Cues crossed between two readings of the time left (ms). Crossing means the earlier reading was
 * above the mark and the later one is at or below it, so a cue sounds once, and a countdown that is
 * already past a mark when it first shows stays quiet for it.
 */
export function cuesBetween(before: number, after: number, sounds: TimerSounds): TimerCue[] {
  if (!sounds.on || after >= before) return [];
  const cues: TimerCue[] = [];
  for (const minutes of sounds.warnAt) {
    const mark = minutes * 60_000;
    if (before > mark && after <= mark) cues.push("warn");
  }
  if (sounds.ticks) {
    for (let second = 10; second >= 1; second -= 1) {
      const mark = second * 1000;
      if (before > mark && after <= mark) {
        cues.push("tick");
        break;
      }
    }
  }
  if (before > 0 && after <= 0) return [...cues.filter((cue) => cue === "warn"), "end"];
  return cues.slice(0, 2);
}
