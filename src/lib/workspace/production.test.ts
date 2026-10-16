import { describe, expect, it } from "vitest";
import {
  defaultProductionLayout,
  mergeProductionDocks,
  mergeProductionRows,
  mergeProductionStage,
  normalizeProductionLayout,
  sameProductionLayout,
} from "./production";

describe("production workspace layout", () => {
  it("repairs missing and invalid pane sizes", () => {
    const defaults = defaultProductionLayout();
    expect(normalizeProductionLayout(undefined)).toEqual(defaults);
    expect(normalizeProductionLayout({ stage: [0, 0, 0], docks: [1, 2] })).toEqual(defaults);
    expect(normalizeProductionLayout({ stage: [1, 2, 1], docks: [2, 5, 3], rows: [3, 1] })).toEqual({
      stage: [25, 50, 25],
      docks: [20, 50, 30],
      rows: [75, 25],
    });
  });

  it("saves the three-pane stage proportions only for a complete layout", () => {
    expect(mergeProductionStage([42, 16, 42], [50, 20, 30])).toEqual([50, 20, 30]);
    expect(mergeProductionStage([42, 16, 42], [0, 50, 50])).toEqual([42, 16, 42]);
    expect(mergeProductionStage([42, 16, 42], [60, 40])).toEqual([42, 16, 42]);
  });

  it("preserves hidden dock widths when the visible panes are resized", () => {
    const saved: [number, number, number] = [28, 44, 28];
    expect(mergeProductionDocks(saved, [70, 30], false, true)).toEqual([28, 50.4, 21.6]);
    expect(mergeProductionDocks(saved, [25, 75], true, false)).toEqual([18, 54, 28]);
    expect(mergeProductionDocks(saved, [100], false, false)).toBe(saved);
  });

  it("treats small pointer rounding changes as the same saved layout", () => {
    expect(sameProductionLayout(defaultProductionLayout(), {
      stage: [42.1, 15.9, 42],
      docks: [28, 44.1, 27.9],
      rows: [74.2, 25.8],
    })).toBe(true);
  });

  it("saves the monitors/docks split only for a complete two-row layout", () => {
    expect(defaultProductionLayout().rows).toEqual([74, 26]);
    expect(mergeProductionRows([74, 26], [60, 40])).toEqual([60, 40]);
    expect(mergeProductionRows([74, 26], [100])).toEqual([74, 26]);
    expect(mergeProductionRows([74, 26], [0, 100])).toEqual([74, 26]);
    expect(normalizeProductionLayout({ stage: [42, 16, 42], docks: [28, 44, 28] }).rows).toEqual([74, 26]);
  });
});
