import type { ProductionLayout } from "../domain/types";

const DEFAULT_STAGE: [number, number, number] = [42, 16, 42];
/** Scenes, Sources, Media, Controls. */
const DEFAULT_DOCKS: [number, number, number, number] = [20, 28, 32, 20];
const DEFAULT_ROWS: [number, number] = [74, 26];

export function defaultProductionLayout(): ProductionLayout {
  return {
    stage: [...DEFAULT_STAGE],
    docks: [...DEFAULT_DOCKS],
    rows: [...DEFAULT_ROWS],
    mediaOpen: true,
  };
}

function normalizedRows(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return [...DEFAULT_ROWS];
  const [top, bottom] = value;
  if (typeof top !== "number" || typeof bottom !== "number" || !(top > 0) || !(bottom > 0) || !Number.isFinite(top + bottom)) {
    return [...DEFAULT_ROWS];
  }
  return [(top / (top + bottom)) * 100, (bottom / (top + bottom)) * 100];
}

function normalizedSizes(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback];
  const [first, second, third] = value;
  if (
    typeof first !== "number" ||
    typeof second !== "number" ||
    typeof third !== "number" ||
    !Number.isFinite(first) ||
    !Number.isFinite(second) ||
    !Number.isFinite(third) ||
    first <= 0 ||
    second <= 0 ||
    third <= 0
  ) {
    return [...fallback];
  }
  const total = first + second + third;
  return [(first / total) * 100, (second / total) * 100, (third / total) * 100];
}

/** Four dock widths. A layout saved before the Media dock splits its Sources width with Media. */
function normalizedDocks(value: unknown): [number, number, number, number] {
  if (!Array.isArray(value)) return [...DEFAULT_DOCKS];
  if (value.length === 3) {
    const [scenes, sources, controls] = normalizedSizes(value, [28, 44, 28]);
    return [scenes, sources * 0.45, sources * 0.55, controls];
  }
  if (value.length !== 4 || value.some((size) => typeof size !== "number" || !Number.isFinite(size) || size <= 0)) return [...DEFAULT_DOCKS];
  const total = (value as number[]).reduce((sum, size) => sum + size, 0);
  return (value as number[]).map((size) => (size / total) * 100) as [number, number, number, number];
}

export function normalizeProductionLayout(value: unknown): ProductionLayout {
  const record = value && typeof value === "object" ? (value as Partial<ProductionLayout>) : {};
  return {
    stage: normalizedSizes(record.stage, DEFAULT_STAGE),
    docks: normalizedDocks(record.docks),
    rows: normalizedRows(record.rows),
    mediaOpen: record.mediaOpen !== false,
  };
}

function positiveTotal(values: number[]): number | null {
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? total : null;
}

export function mergeProductionStage(saved: [number, number, number], reported: number[]): [number, number, number] {
  const total = positiveTotal(reported);
  if (reported.length !== 3 || total === null) return saved;
  return [(reported[0]! / total) * 100, (reported[1]! / total) * 100, (reported[2]! / total) * 100];
}

export function mergeProductionRows(saved: [number, number], reported: number[]): [number, number] {
  const total = positiveTotal(reported);
  if (reported.length !== 2 || total === null) return saved;
  return [(reported[0]! / total) * 100, (reported[1]! / total) * 100];
}

/** Write reported widths of the visible docks back, keeping hidden docks at their saved width. */
export function mergeProductionDocks(
  saved: [number, number, number, number],
  reported: number[],
  visible: [boolean, boolean, boolean, boolean],
): [number, number, number, number] {
  const total = positiveTotal(reported);
  const shown = visible.filter(Boolean).length;
  if (total === null || shown === 0 || reported.length !== shown) return saved;
  const available = saved.reduce((sum, size, index) => sum + (visible[index] ? size : 0), 0);
  let next = 0;
  return saved.map((size, index) => (visible[index] ? (reported[next++]! / total) * available : size)) as [number, number, number, number];
}

/** Default pane size for a visible dock: its saved share of the visible docks. */
export function dockShare(saved: [number, number, number, number], visible: [boolean, boolean, boolean, boolean], index: number): number {
  const available = saved.reduce((sum, size, at) => sum + (visible[at] ? size : 0), 0);
  return available > 0 ? (saved[index]! / available) * 100 : 100;
}

export function sameProductionLayout(left: ProductionLayout, right: ProductionLayout): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.4;
  return left.stage.every((size, index) => near(size, right.stage[index]!)) &&
    left.docks.every((size, index) => near(size, right.docks[index]!)) &&
    left.rows.every((size, index) => near(size, right.rows[index]!)) &&
    left.mediaOpen === right.mediaOpen;
}
