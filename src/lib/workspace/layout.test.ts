import { describe, expect, it } from "vitest";
import {
  dockPanel,
  factoryLayouts,
  gridPlan,
  hidePanel,
  movePanel,
  placeFloating,
  presentLayout,
  resetLayout,
  resizeLayout,
  showPanel,
  splitTracks,
  viewportMode,
} from "./layout";

const NOW = "2026-10-14T00:00:00.000Z";

describe("workspace layout", () => {
  it("ships bible, production, and simple workspaces", () => {
    expect(factoryLayouts().map((layout) => layout.name)).toEqual(["Bible Operator", "Live Production", "Simple Presenter"]);
  });

  it("moves a panel without changing program state and keeps the original layout intact", () => {
    const layout = factoryLayouts()[0];
    const snapshot = structuredClone(layout);
    const next = movePanel(layout, "bible", "left", NOW);
    expect(layout).toEqual(snapshot);
    expect(next.panels.find((panel) => panel.panelId === "bible")).toMatchObject({ region: "left", visible: true, floating: false });
    expect(next.activeTabs.left).toBe("bible");
  });

  it("hides and restores a panel", () => {
    const layout = hidePanel(factoryLayouts()[0], "bible", NOW);
    expect(layout.panels.find((panel) => panel.panelId === "bible")?.visible).toBe(false);
    const restored = showPanel(layout, "bible", NOW);
    expect(restored.panels.find((panel) => panel.panelId === "bible")?.visible).toBe(true);
    expect(restored.activeTabs.right).toBe("bible");
  });

  it("clamps region sizes", () => {
    const next = resizeLayout(factoryLayouts()[0], { left: 10, right: 2000, centerSplit: 0.99 }, NOW);
    expect(next.regions.left).toBe(220);
    expect(next.regions.right).toBe(720);
    expect(next.regions.centerSplit).toBe(0.78);
  });

  it("floats a panel out of the dock and docks it back", () => {
    const floating = placeFloating(factoryLayouts()[0], "bible", { x: 40, y: 20 }, NOW);
    const presented = presentLayout(floating, 1600);
    expect(presented.floating.map((panel) => panel.panelId)).toEqual(["bible"]);
    expect(presented.right.map((panel) => panel.panelId)).not.toContain("bible");
    const docked = dockPanel(floating, "bible", "right", NOW);
    const restored = presentLayout(docked, 1600);
    expect(restored.floating).toEqual([]);
    expect(restored.right.map((panel) => panel.panelId)).toContain("bible");
    expect(restored.activeTabs.right).toBe("bible");
  });

  it("keeps a wide bible workspace in three columns", () => {
    const presented = presentLayout(factoryLayouts()[0], 1600);
    expect(presented.mode).toBe("full");
    expect(presented.left.map((panel) => panel.panelId)).toEqual(["service"]);
    expect(presented.center.map((panel) => panel.panelId)).toEqual(["preview", "program"]);
    expect(presented.right.map((panel) => panel.panelId)).toContain("bible");
    expect(gridPlan(presented).columns).toContain("minmax(0, 1fr)");
  });

  it("moves the service below preview on a medium window without rewriting the saved layout", () => {
    const layout = factoryLayouts()[0];
    const presented = presentLayout(layout, 1200);
    expect(viewportMode(1200)).toBe("medium");
    expect(presented.left).toEqual([]);
    expect(presented.bottom.map((panel) => panel.panelId)).toEqual(["service", "controls"]);
    expect(presented.bottomHeight).toBeGreaterThanOrEqual(220);
    expect(layout.panels.find((panel) => panel.panelId === "service")?.region).toBe("left");
  });

  it("overflows side panels on a small window and keeps preview and program", () => {
    const presented = presentLayout(factoryLayouts()[0], 900);
    expect(presented.mode).toBe("compact");
    expect(presented.center.map((panel) => panel.panelId)).toEqual(["preview", "program"]);
    expect(presented.overflow.map((panel) => panel.panelId)).toContain("service");
    expect(presented.overflow.map((panel) => panel.panelId)).toContain("bible");
    expect(presented.floating).toEqual([]);
  });

  it("hides the library while live and leaves the saved panels visible", () => {
    const layout = factoryLayouts()[0];
    const presented = presentLayout(layout, 1600, { live: true });
    expect(presented.right).toEqual([]);
    expect(layout.panels.find((panel) => panel.panelId === "bible")?.visible).toBe(true);
    expect(presented.center.map((panel) => panel.panelId)).toEqual(["preview", "program"]);
  });

  it("places preview beside program in the production workspace", () => {
    const presented = presentLayout(factoryLayouts()[1], 1600);
    expect(presented.centerAxis).toBe("row");
    expect(splitTracks("row", 0.5, false, false).columns).toBe("0.5fr 6px 0.5fr");
  });

  it("resets a built-in layout after it has been edited", () => {
    const edited = movePanel(factoryLayouts()[0], "preview", "left", NOW);
    const restored = resetLayout(edited, NOW);
    expect(restored.panels.find((panel) => panel.panelId === "preview")?.region).toBe("center");
    expect(restored.name).toBe("Bible Operator");
  });
});
