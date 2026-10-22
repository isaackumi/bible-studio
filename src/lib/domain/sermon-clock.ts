// The sermon's own clock: when it first went live, and how long each section has been on the
// screen. Fed with Program's source ("sermon:<id>:<section>") whenever it changes.

export type SermonClock = {
  sermonId: string;
  /** When the first section of this sermon went live (ms). */
  startedAt: number;
  /** The section on Program now, and since when; null while something else is showing. */
  sectionId: string | null;
  since: number;
  /** Time already spent on each section before `since` (ms). */
  spent: Record<string, number>;
};

/** Split "sermon:<id>:<section>" (ids may hold colons, sections never do). */
export function sermonSource(source: string): { sermonId: string; sectionId: string } | null {
  if (!source.startsWith("sermon:")) return null;
  const rest = source.slice("sermon:".length);
  const at = rest.lastIndexOf(":");
  return at > 0 ? { sermonId: rest.slice(0, at), sectionId: rest.slice(at + 1) } : null;
}

/** The clock after Program shows `source` at `now`. Another sermon going live starts a new clock. */
export function tickClock(clock: SermonClock | null, source: string, now: number): SermonClock | null {
  const live = sermonSource(source);
  const banked = (current: SermonClock): Record<string, number> =>
    current.sectionId ? { ...current.spent, [current.sectionId]: (current.spent[current.sectionId] ?? 0) + Math.max(0, now - current.since) } : current.spent;
  if (!live) return clock && clock.sectionId ? { ...clock, spent: banked(clock), sectionId: null, since: now } : clock;
  if (!clock || clock.sermonId !== live.sermonId) return { sermonId: live.sermonId, startedAt: now, sectionId: live.sectionId, since: now, spent: {} };
  if (clock.sectionId === live.sectionId) return clock;
  return { ...clock, spent: banked(clock), sectionId: live.sectionId, since: now };
}

/** Time on a section so far (ms), counting the stretch it is live now. */
export function sectionSpent(clock: SermonClock | null, sectionId: string, now: number): number {
  if (!clock) return 0;
  return (clock.spent[sectionId] ?? 0) + (clock.sectionId === sectionId ? Math.max(0, now - clock.since) : 0);
}

/** "4:05", or "1:02:09" past an hour. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** How a time stands against its plan: under 80% fine, then near, then over. */
export function paceOf(spentMs: number, plannedMinutes: number | undefined): "none" | "ok" | "near" | "over" {
  if (!plannedMinutes) return "none";
  const share = spentMs / (plannedMinutes * 60_000);
  return share > 1 ? "over" : share >= 0.8 ? "near" : "ok";
}
