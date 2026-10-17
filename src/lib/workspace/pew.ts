import type { PewDeskState, PewMonitors, PewPage, WorkspaceLayout } from "../domain/types";

/** Bible panel visibility is the scripture library. Service panel visibility is the queue. */
export const LIBRARY_PANEL = "bible";
export const QUEUE_PANEL = "service";

export function defaultPewDesk(): PewDeskState {
  return {
    focus: false,
    monitors: { scriptures: { preview: true, program: true }, songs: { preview: true, program: true }, sermon: { preview: true, program: true } },
    columns: [46, 30, 24],
    librarySplit: 42,
    stageSplit: 46,
    programSplit: 58,
  };
}

function split(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(84, Math.max(16, value));
}

function triple(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  const nums = value.map((item) => (typeof item === "number" ? item : Number.NaN));
  if (nums.some((item) => !Number.isFinite(item) || item <= 0)) return fallback;
  const sum = nums[0] + nums[1] + nums[2];
  return [(nums[0] / sum) * 100, (nums[1] / sum) * 100, (nums[2] / sum) * 100];
}

const PAGES: PewPage[] = ["scriptures", "songs", "sermon"];

function monitors(value: unknown): Record<PewPage, PewMonitors> {
  const record = value && typeof value === "object" ? (value as Record<string, Partial<PewMonitors>>) : {};
  return Object.fromEntries(
    PAGES.map((page) => [page, { preview: record[page]?.preview !== false, program: record[page]?.program !== false }]),
  ) as Record<PewPage, PewMonitors>;
}

export function normalizePew(value: unknown): PewDeskState {
  const base = defaultPewDesk();
  const record = value && typeof value === "object" ? (value as Partial<PewDeskState>) : {};
  return {
    focus: record.focus === true,
    monitors: monitors(record.monitors),
    columns: triple(record.columns, base.columns),
    librarySplit: split(record.librarySplit, base.librarySplit),
    stageSplit: split(record.stageSplit, base.stageSplit),
    programSplit: split(record.programSplit, base.programSplit),
  };
}

export function panelOpen(layout: WorkspaceLayout | undefined, panelId: typeof LIBRARY_PANEL | typeof QUEUE_PANEL): boolean {
  return layout?.panels.find((panel) => panel.panelId === panelId)?.visible !== false;
}

/** Write a reported percentage layout back without dropping a hidden library column. */
export function mergeColumns(
  saved: [number, number, number],
  reported: number[],
  libraryVisible: boolean,
): [number, number, number] {
  if (libraryVisible && reported.length === 3) return triple(reported, saved);
  if (!libraryVisible && reported.length === 2) {
    const rest = 100 - saved[0];
    const sum = reported[0] + reported[1];
    if (sum <= 0) return saved;
    return triple([saved[0], (reported[0] / sum) * rest, (reported[1] / sum) * rest], saved);
  }
  return saved;
}

export function mergeSplit(saved: number, reported: number[]): number {
  if (reported.length !== 2) return saved;
  return split(reported[0], saved);
}

export function samePew(left: PewDeskState, right: PewDeskState): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.4;
  return (
    left.focus === right.focus &&
    PAGES.every((page) => left.monitors[page].preview === right.monitors[page].preview && left.monitors[page].program === right.monitors[page].program) &&
    near(left.librarySplit, right.librarySplit) &&
    near(left.stageSplit, right.stageSplit) &&
    near(left.programSplit, right.programSplit) &&
    left.columns.every((size, index) => near(size, right.columns[index]))
  );
}
