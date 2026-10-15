import { describe, expect, it } from "vitest";
import { factoryLayouts, hidePanel } from "./layout";
import { LIBRARY_PANEL, QUEUE_PANEL, defaultPewDesk, mergeColumns, mergeSplit, normalizePew, panelOpen } from "./pew";

describe("pew desk chrome", () => {
  it("repairs a missing or broken size record", () => {
    expect(normalizePew(undefined)).toEqual(defaultPewDesk());
    expect(normalizePew({ focus: true, columns: [10, 0, 10], librarySplit: 200 }).focus).toBe(true);
    expect(normalizePew({ columns: [10, 0, 10] }).columns).toEqual(defaultPewDesk().columns);
    expect(normalizePew({ librarySplit: 200 }).librarySplit).toBe(84);
  });

  it("keeps the library share when that column is hidden", () => {
    const saved: [number, number, number] = [40, 36, 24];
    expect(mergeColumns(saved, [70, 30], false)).toEqual([40, 42, 18]);
    expect(mergeColumns(saved, [50, 30, 20], true)).toEqual([50, 30, 20]);
    expect(mergeSplit(42, [100])).toBe(42);
    expect(mergeSplit(42, [30, 70])).toBe(30);
  });

  it("reads library and queue visibility from the saved layout", () => {
    const layout = factoryLayouts()[0];
    expect(panelOpen(layout, LIBRARY_PANEL)).toBe(true);
    expect(panelOpen(layout, QUEUE_PANEL)).toBe(true);
    const hidden = hidePanel(hidePanel(layout, LIBRARY_PANEL), QUEUE_PANEL);
    expect(panelOpen(hidden, LIBRARY_PANEL)).toBe(false);
    expect(panelOpen(hidden, QUEUE_PANEL)).toBe(false);
    expect(hidden.panels.find((panel) => panel.panelId === "preview")?.visible).toBe(true);
    expect(hidden.panels.find((panel) => panel.panelId === "program")?.visible).toBe(true);
  });
});
