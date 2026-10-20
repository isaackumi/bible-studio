// A service on the day: when each part actually began, and when the service ended. The screen's
// countdown stops at 00:00:00, but the clock keeps running here, so afterwards each part shows its
// planned time next to the time it really took (and who led it), for planning the next service.

import { planSchedule } from "./schedule";
import type { Service } from "./types";

/** One part beginning (or beginning again) at a moment (epoch ms). */
export type RunMark = { sectionId: string; at: number };

/** A part as it was when the run ended, so later edits to the service do not change history. */
export type RunPart = {
  sectionId: string;
  name: string;
  leader: string;
  /** Planned minutes; null when the part had no time. */
  planned: number | null;
  /** Time it really ran (ms), all its stretches added up. */
  usedMs: number;
  /** When it first began (epoch ms); null when it never began. */
  startedAt: number | null;
};

export type ServiceRun = {
  id: string;
  startedAt: number;
  /** Null while the service is running. */
  endedAt: number | null;
  marks: RunMark[];
  /** Filled when the run ends. */
  parts?: RunPart[];
};

/** Runs kept per service (the oldest go first). */
export const RUNS_KEPT = 30;

/** The run still going (not ended), if any. */
export function activeRun(service: Service | null | undefined): ServiceRun | null {
  const last = service?.runs?.at(-1);
  return last && last.endedAt === null ? last : null;
}

/** A part begins: a new mark on the running run, or a new run when none is going. */
export function markPart(service: Service, sectionId: string, at: number, id: string): Service {
  const runs = service.runs ?? [];
  const running = activeRun(service);
  // A run left open from another day is closed where its last part began, not left running for days.
  const stale = running && new Date(running.startedAt).toDateString() !== new Date(at).toDateString();
  if (running && !stale) {
    if (running.marks.at(-1)?.sectionId === sectionId) return service;
    return { ...service, runs: [...runs.slice(0, -1), { ...running, marks: [...running.marks, { sectionId, at }] }] };
  }
  const kept = stale ? [...runs.slice(0, -1), finishRun(service, running!, running!.marks.at(-1)?.at ?? running!.startedAt)] : runs;
  const fresh: ServiceRun = { id, startedAt: at, endedAt: null, marks: [{ sectionId, at }] };
  return { ...service, runs: [...kept, fresh].slice(-RUNS_KEPT) };
}

/** Time used by each part of a run, up to `now` while it is still going. */
export function usedBySection(run: ServiceRun, now: number): Map<string, number> {
  const used = new Map<string, number>();
  const end = run.endedAt ?? now;
  run.marks.forEach((mark, index) => {
    const until = Math.min(run.marks[index + 1]?.at ?? end, end);
    used.set(mark.sectionId, (used.get(mark.sectionId) ?? 0) + Math.max(0, until - mark.at));
  });
  return used;
}

/** Every part of the service with its planned and used time in this run. */
export function runParts(service: Service, run: ServiceRun, now: number): RunPart[] {
  if (run.parts) return run.parts;
  const plan = planSchedule(service);
  const used = usedBySection(run, now);
  const first = new Map<string, number>();
  for (const mark of run.marks) if (!first.has(mark.sectionId)) first.set(mark.sectionId, mark.at);
  // Parts left out this time are not in the report (unless something from them ran after all).
  return service.sections.flatMap((section, index) => {
    const slot = plan.slots[index];
    if (section.skip && !used.get(section.id)) return [];
    return [{
      sectionId: section.id,
      name: section.name,
      leader: section.leader?.trim() ?? "",
      planned: slot && !slot.untimed ? slot.minutes : null,
      usedMs: used.get(section.id) ?? 0,
      startedAt: first.get(section.id) ?? null,
    }];
  });
}

/** Close a run at `at`, keeping the parts as they are now. */
export function finishRun(service: Service, run: ServiceRun, at: number): ServiceRun {
  const ended = { ...run, endedAt: Math.max(at, run.startedAt) };
  return { ...ended, parts: runParts(service, ended, at) };
}

/** End the running run, if any. */
export function endRun(service: Service, at: number): Service {
  const running = activeRun(service);
  if (!running) return service;
  return { ...service, runs: [...(service.runs ?? []).slice(0, -1), finishRun(service, running, at)] };
}

/** "12:04" or "1:02:30" (time used, never negative). */
export function usedLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Minutes over the plan (negative: under), rounded; null when the part had no time or never ran. */
export function overBy(part: Pick<RunPart, "planned" | "usedMs" | "startedAt">): number | null {
  if (part.planned === null || part.startedAt === null) return null;
  return Math.round(part.usedMs / 60_000 - part.planned);
}

/** The run as a spreadsheet (CSV): part, leader, planned, used and difference in minutes. */
export function runCsv(parts: RunPart[]): string {
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const rows = parts.map((part) => {
    const used = Math.round((part.usedMs / 60_000) * 10) / 10;
    const over = part.planned === null || part.startedAt === null ? "" : String(Math.round((used - part.planned) * 10) / 10);
    return [cell(part.name), cell(part.leader), part.planned === null ? "" : String(part.planned), part.startedAt === null ? "" : String(used), over].join(",");
  });
  return ["Part,Led by,Planned (min),Used (min),Over (min)", ...rows].join("\n");
}

/** How a part usually goes across the ended runs: average minutes over the plan, and how many runs. */
export function usualOver(service: Service): Map<string, { over: number; runs: number }> {
  const totals = new Map<string, { sum: number; runs: number }>();
  for (const run of service.runs ?? []) {
    if (run.endedAt === null) continue;
    for (const part of runParts(service, run, run.endedAt)) {
      const over = part.planned === null || part.startedAt === null ? null : part.usedMs / 60_000 - part.planned;
      if (over === null) continue;
      const entry = totals.get(part.sectionId) ?? { sum: 0, runs: 0 };
      totals.set(part.sectionId, { sum: entry.sum + over, runs: entry.runs + 1 });
    }
  }
  return new Map([...totals].map(([id, entry]) => [id, { over: Math.round(entry.sum / entry.runs), runs: entry.runs }]));
}
