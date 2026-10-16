import type { ProductionLayout } from "../domain/types";

const DEFAULT_STAGE: [number, number, number] = [42, 16, 42];
const DEFAULT_DOCKS: [number, number, number] = [28, 44, 28];
const DEFAULT_ROWS: [number, number] = [74, 26];

export function defaultProductionLayout(): ProductionLayout {
  return {
    stage: [...DEFAULT_STAGE],
    docks: [...DEFAULT_DOCKS],
    rows: [...DEFAULT_ROWS],
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

export function normalizeProductionLayout(value: unknown): ProductionLayout {
  const record = value && typeof value === "object" ? (value as Partial<ProductionLayout>) : {};
  return {
    stage: normalizedSizes(record.stage, DEFAULT_STAGE),
    docks: normalizedSizes(record.docks, DEFAULT_DOCKS),
    rows: normalizedRows(record.rows),
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

export function mergeProductionDocks(
  saved: [number, number, number],
  reported: number[],
  scenesVisible: boolean,
  controlsVisible: boolean,
): [number, number, number] {
  const total = positiveTotal(reported);
  if (total === null) return saved;
  if (scenesVisible && controlsVisible && reported.length === 3) {
    return [(reported[0]! / total) * 100, (reported[1]! / total) * 100, (reported[2]! / total) * 100];
  }
  if (!scenesVisible && controlsVisible && reported.length === 2) {
    const available = 100 - saved[0];
    const sourceShare = (reported[0]! / total) * available;
    return [saved[0], sourceShare, available - sourceShare];
  }
  if (scenesVisible && !controlsVisible && reported.length === 2) {
    const available = 100 - saved[2];
    const sceneShare = (reported[0]! / total) * available;
    return [sceneShare, available - sceneShare, saved[2]];
  }
  return saved;
}

export function sameProductionLayout(left: ProductionLayout, right: ProductionLayout): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.4;
  return left.stage.every((size, index) => near(size, right.stage[index]!)) &&
    left.docks.every((size, index) => near(size, right.docks[index]!)) &&
    left.rows.every((size, index) => near(size, right.rows[index]!));
}
