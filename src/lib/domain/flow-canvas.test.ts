import { describe, expect, it } from "vitest";
import { autoLayout, bestPerRow, connector, fitView, NODE_W, placesFor, pills, PORT_Y, snap, toCanvas, wireTo, zoomAt } from "./flow-canvas";

const parts = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `p${index}`, items: [] }));

describe("flow canvas", () => {
  it("lays parts out in rows of four after the Start pill", () => {
    const places = autoLayout(parts(6));
    const xs = [...places.values()].map((point) => point.x);
    expect(xs.slice(0, 4)).toEqual([...xs.slice(0, 4)].sort((a, b) => a - b));
    expect(places.get("p4")!.x).toBe(places.get("p0")!.x);
    expect(places.get("p4")!.y).toBeGreaterThan(places.get("p0")!.y);
    expect(places.get("p0")!.x).toBeGreaterThan(0);
  });

  it("keeps a card where it was put", () => {
    const places = placesFor([{ id: "a", items: [], canvas: { x: 500, y: -40 } }, { id: "b", items: [] }]);
    expect(places.get("a")).toEqual({ x: 500, y: -40 });
    expect(places.get("b")).toBeDefined();
  });

  it("puts Start before the first card and End after the last", () => {
    const sections = parts(2);
    const places = autoLayout(sections);
    const { start, end } = pills(sections, places);
    expect(start.x).toBeLessThan(places.get("p0")!.x);
    expect(end.x).toBeGreaterThan(places.get("p1")!.x + NODE_W);
    expect(start.y).toBeLessThan(places.get("p0")!.y + PORT_Y);
  });

  it("draws a connector as a curve between the ports", () => {
    expect(connector({ x: 0, y: 0 }, { x: 200, y: 50 })).toBe("M 0 0 C 100 0, 100 50, 200 50");
    // Going back left loops out wide instead of cutting through the cards.
    expect(connector({ x: 400, y: 0 }, { x: 0, y: 300 })).toContain("C 600 0");
  });

  it("rewires: the target comes right after the source", () => {
    const order = ["a", "b", "c", "d"];
    expect(wireTo(order, "a", "c")).toBe(1);
    expect(wireTo(order, "c", "a")).toBe(2);
    expect(wireTo(order, "a", "b")).toBeNull();
    expect(wireTo(order, "a", "a")).toBeNull();
    expect(wireTo(order, "a", "x")).toBeNull();
  });

  it("fits everything in view, never past full size", () => {
    const view = fitView([{ x: 0, y: 0, w: 2000, h: 500 }], { w: 1000, h: 600 }, 0);
    expect(view.zoom).toBe(0.5);
    expect(view.x).toBe(0);
    expect(view.y).toBe(175);
    expect(fitView([{ x: 0, y: 0, w: 100, h: 100 }], { w: 1000, h: 600 }).zoom).toBe(1);
  });

  it("zooms around the cursor and maps points back to the canvas", () => {
    const view = zoomAt({ x: 0, y: 0, zoom: 1 }, 2, { x: 100, y: 100 });
    expect(view).toEqual({ x: -100, y: -100, zoom: 2 });
    expect(toCanvas(view, { x: 100, y: 100 })).toEqual({ x: 100, y: 100 });
    expect(snap({ x: 37, y: 13 })).toEqual({ x: 48, y: 24 });
  });

  it("picks more rows for a narrow canvas and longer rows for a wide one", () => {
    const sections = parts(8);
    expect(bestPerRow(sections, { w: 600, h: 900 })).toBeLessThan(bestPerRow(sections, { w: 2400, h: 500 }));
  });
});
