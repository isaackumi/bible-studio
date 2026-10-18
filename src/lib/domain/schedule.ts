// Service timing: the service starts at a time, and each section has a length ("Preaching, 45
// minutes") or runs until a clock time ("Worship until 11:00"). From that every section's start
// and end follow, and on the day the desk can say how much is left and whether it runs late.

import type { Service, ServiceSection } from "./types";

/** "08:00" → 480 (minutes after midnight). Null when it is not a time. */
export function parseClock(value: string | null | undefined): number | null {
  const match = typeof value === "string" ? value.trim().match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 480 → "08:00" (for time inputs). */
export function clockValue(minutes: number): string {
  const day = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, "0")}:${String(day % 60).padStart(2, "0")}`;
}

/** 480 → "8:00 AM" in the computer's own way of writing times. */
export function clockLabel(minutes: number): string {
  const day = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const date = new Date(2000, 0, 1, Math.floor(day / 60), day % 60);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** 45 → "45 min", 60 → "1 h", 75 → "1 h 15". */
export function lengthLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${hours} h ${rest}` : `${hours} h`;
}

export type SlotPlan = {
  sectionId: string;
  name: string;
  /** Minutes after midnight. */
  start: number;
  end: number;
  minutes: number;
  /** Ends at a clock time rather than after a length. */
  until: boolean;
  /** No time given yet. */
  untimed: boolean;
};

export type SchedulePlan = { start: number; end: number; slots: SlotPlan[] };

export const DEFAULT_START = "09:00";
export const LENGTH_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90];

/** Every section's planned start and end, one after another from the service start. */
export function planSchedule(service: Pick<Service, "sections" | "startTime">): SchedulePlan {
  const start = parseClock(service.startTime) ?? (parseClock(DEFAULT_START) as number);
  let at = start;
  const slots = service.sections.map((section): SlotPlan => {
    const until = parseClock(section.until);
    const own = typeof section.minutes === "number" && Number.isFinite(section.minutes) ? Math.max(0, Math.round(section.minutes)) : null;
    const end = until !== null ? Math.max(at, until) : at + (own ?? 0);
    const slot = { sectionId: section.id, name: section.name, start: at, end, minutes: end - at, until: until !== null, untimed: until === null && own === null };
    at = end;
    return slot;
  });
  return { start, end: at, slots };
}

/** Clean a section's timing: a length in minutes (0–600) or an "HH:MM" end, not both. */
export function sectionTiming(change: { minutes?: number | null; until?: string | null }): Pick<ServiceSection, "minutes" | "until"> {
  if (change.until !== undefined && change.until !== null) {
    const until = parseClock(change.until);
    return until === null ? { minutes: undefined, until: undefined } : { minutes: undefined, until: clockValue(until) };
  }
  if (change.minutes === null || change.minutes === undefined || !Number.isFinite(change.minutes)) return { minutes: undefined, until: undefined };
  return { minutes: Math.min(600, Math.max(0, Math.round(change.minutes))), until: undefined };
}

export type SlotNow = {
  sectionId: string;
  /** Minutes left in the section now (negative: running over). */
  left: number;
  /** Planned minutes of the section. */
  minutes: number;
  /** How far the service is behind its plan (minutes; negative: ahead). Null before it is known. */
  behind: number | null;
};

/**
 * Where the service stands at `now` (minutes after midnight), given the section the desk is in and
 * when that section actually began (minutes after midnight), if known.
 */
export function slotNow(plan: SchedulePlan, sectionId: string | null, now: number, startedAt: number | null): SlotNow | null {
  const slot = plan.slots.find((entry) => entry.sectionId === sectionId);
  if (!slot || slot.untimed) return null;
  const began = startedAt ?? slot.start;
  const endsAt = slot.until ? slot.end : began + slot.minutes;
  return {
    sectionId: slot.sectionId,
    left: Math.round(endsAt - now),
    minutes: slot.minutes,
    behind: startedAt === null ? null : Math.round(startedAt - slot.start),
  };
}

/** "12 min left", "1 min left", "4 min over". */
export function leftLabel(left: number): string {
  return left >= 0 ? `${lengthLabel(left)} left` : `${lengthLabel(-left)} over`;
}

/** Minutes after midnight for a moment. */
export function minutesOfDay(at: number | Date): number {
  const date = at instanceof Date ? at : new Date(at);
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/**
 * The running section and when it ends, as a moment (epoch ms), so a stage screen can count down
 * by itself. `startedAt` is when the section began (epoch ms); null before anything began.
 */
export function sectionDeadline(
  plan: SchedulePlan,
  sectionId: string | null,
  startedAt: number | null,
): { sectionId: string; name: string; endsAt: number } | null {
  const slot = plan.slots.find((entry) => entry.sectionId === sectionId);
  if (!slot || slot.untimed || startedAt === null) return null;
  const day = new Date(startedAt);
  day.setHours(0, 0, 0, 0);
  const endsAt = slot.until ? day.getTime() + slot.end * 60_000 : startedAt + slot.minutes * 60_000;
  return { sectionId: slot.sectionId, name: slot.name, endsAt };
}

/** Section starts kept for the day, so a restart in the middle of a service remembers them. */
export type SavedStarts = { day: string; serviceId: string; starts: Record<string, number> };

export function readSavedStarts(raw: string | null, serviceId: string, today: string): Record<string, number> {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<SavedStarts>) : null;
    if (!value || value.day !== today || value.serviceId !== serviceId || !value.starts || typeof value.starts !== "object") return {};
    return Object.fromEntries(Object.entries(value.starts).filter(([, at]) => typeof at === "number" && Number.isFinite(at)));
  } catch {
    return {};
  }
}
