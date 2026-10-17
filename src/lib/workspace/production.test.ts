import { describe, expect, it } from "vitest";
import {
  defaultProductionLayout,
  dockShare,
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
    expect(normalizeProductionLayout({ stage: [1, 2, 1], docks: [2, 3, 3, 2], rows: [3, 1] })).toEqual({
      stage: [25, 50, 25],
      docks: [20, 30, 30, 20],
      rows: [75, 25],
      mediaOpen: true,
    });
    expect(normalizeProductionLayout({ mediaOpen: false }).mediaOpen).toBe(false);
  });

  it("gives a three-dock layout saved before the Media dock part of the Sources width", () => {
    const docks = normalizeProductionLayout({ docks: [2, 5, 3] }).docks;
    expect(docks[0]).toBeCloseTo(20);
    expect(docks[1]).toBeCloseTo(22.5);
    expect(docks[2]).toBeCloseTo(27.5);
    expect(docks[3]).toBeCloseTo(30);
  });

  it("saves the three-pane stage proportions only for a complete layout", () => {
    expect(mergeProductionStage([42, 16, 42], [50, 20, 30])).toEqual([50, 20, 30]);
    expect(mergeProductionStage([42, 16, 42], [0, 50, 50])).toEqual([42, 16, 42]);
    expect(mergeProductionStage([42, 16, 42], [60, 40])).toEqual([42, 16, 42]);
  });

  it("preserves hidden dock widths when the visible panes are resized", () => {
    const saved: [number, number, number, number] = [20, 30, 30, 20];
    expect(mergeProductionDocks(saved, [50, 25, 25], [false, true, true, true])).toEqual([20, 40, 20, 20]);
    expect(mergeProductionDocks(saved, [25, 75], [true, true, false, false])).toEqual([12.5, 37.5, 30, 20]);
    expect(mergeProductionDocks(saved, [100], [false, true, true, false])).toBe(saved);
    expect(mergeProductionDocks(saved, [], [false, false, false, false])).toBe(saved);
  });

  it("sizes each visible dock by its share of the visible docks", () => {
    const saved: [number, number, number, number] = [20, 30, 30, 20];
    expect(dockShare(saved, [true, true, true, true], 1)).toBe(30);
    expect(dockShare(saved, [false, true, true, false], 1)).toBe(50);
  });

  it("treats small pointer rounding changes as the same saved layout", () => {
    expect(sameProductionLayout(defaultProductionLayout(), {
      stage: [42.1, 15.9, 42],
      docks: [20, 28.1, 31.9, 20],
      rows: [74.2, 25.8],
      mediaOpen: true,
    })).toBe(true);
  });

  it("saves the monitors/docks split only for a complete two-row layout", () => {
    expect(defaultProductionLayout().rows).toEqual([74, 26]);
    expect(mergeProductionRows([74, 26], [60, 40])).toEqual([60, 40]);
    expect(mergeProductionRows([74, 26], [100])).toEqual([74, 26]);
    expect(mergeProductionRows([74, 26], [0, 100])).toEqual([74, 26]);
    expect(normalizeProductionLayout({ stage: [42, 16, 42], docks: [20, 28, 32, 20] }).rows).toEqual([74, 26]);
  });
});
