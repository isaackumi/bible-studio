import { describe, expect, it } from "vitest";
import { factoryLayouts, hidePanel } from "./layout";
import { LIBRARY_PANEL, QUEUE_PANEL, defaultPewDesk, mergeColumns, mergeSplit, normalizePew, panelOpen, samePew } from "./pew";

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

describe("monitors per page", () => {
  it("shows both monitors on every page by default, and on older saves", () => {
    expect(defaultPewDesk().monitors.songs).toEqual({ preview: true, program: true });
    expect(normalizePew({ focus: false }).monitors).toEqual(defaultPewDesk().monitors);
  });

  it("keeps each page's choice separately", () => {
    const pew = normalizePew({ monitors: { songs: { preview: false }, sermon: { program: false }, scriptures: "junk" } });
    expect(pew.monitors).toEqual({
      scriptures: { preview: true, program: true },
      songs: { preview: false, program: true },
      sermon: { preview: true, program: false },
      service: { preview: true, program: true },
    });
    expect(samePew(pew, defaultPewDesk())).toBe(false);
  });
});

describe("moving the scripture page's panels", () => {
  it("swaps two panels, keeping every place filled", async () => {
    const { defaultSlots, swapPanels } = await import("./pew");
    const moved = swapPanels(undefined, "preview", "transcript");
    expect(moved.transcript).toBe("preview");
    expect(moved.preview).toBe("transcript");
    expect(new Set(Object.values(moved)).size).toBe(7);
    // Dragging back restores the start.
    expect(swapPanels(moved, "transcript", "preview")).toEqual(defaultSlots());
  });

  it("keeps only a real arrangement, and forgets one that is the default", async () => {
    const { normalizePew, swapPanels } = await import("./pew");
    const moved = swapPanels(undefined, "queue", "reading");
    expect(normalizePew({ slots: moved }).slots).toEqual(moved);
    expect(normalizePew({ slots: { ...moved, lists: "queue" } }).slots).toBeUndefined();
    expect(normalizePew({ slots: { transcript: "transcript" } }).slots).toBeUndefined();
    expect(normalizePew({ slots: swapPanels(moved, "reading", "queue") }).slots).toBeUndefined();
  });
});
