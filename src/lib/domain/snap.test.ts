import { describe, expect, it } from "vitest";
import { alignToPage, alignTogether, snapBounds } from "./snap";

describe("snapping", () => {
  it("catches a moved box's centre on the page's centre, and shows the line", () => {
    const { bounds, guides } = snapBounds({ x: 30.5, y: 10, w: 40, h: 20 }, [], "move");
    expect(bounds.x).toBeCloseTo(30);
    expect(guides).toContainEqual({ axis: "x", at: 50 });
  });

  it("catches on another element's edge, and leaves a box alone when nothing is near", () => {
    const other = { x: 10, y: 60, w: 30, h: 10 };
    const caught = snapBounds({ x: 40.6, y: 20, w: 20, h: 10 }, [other], "move");
    expect(caught.bounds.x).toBeCloseTo(40);
    expect(snapBounds({ x: 22, y: 22, w: 13, h: 13 }, [other], "move").guides).toEqual([]);
  });

  it("moves only the dragged edge when resizing", () => {
    const { bounds, guides } = snapBounds({ x: 20, y: 20, w: 79.5, h: 30 }, [], "e");
    expect(bounds).toEqual({ x: 20, y: 20, w: 80, h: 30 });
    expect(guides).toEqual([{ axis: "x", at: 100 }]);
  });

  it("lines a box up with the page", () => {
    expect(alignToPage({ x: 5, y: 5, w: 20, h: 10 }, "center")).toEqual({ x: 40, y: 5, w: 20, h: 10 });
    expect(alignToPage({ x: 5, y: 5, w: 20, h: 10 }, "bottom")).toEqual({ x: 5, y: 90, w: 20, h: 10 });
  });

  it("lines several elements up with each other", () => {
    const boxes = [{ x: 10, y: 10, w: 20, h: 10 }, { x: 40, y: 30, w: 10, h: 10 }];
    expect(alignTogether(boxes, "left").map((box) => box.x)).toEqual([10, 10]);
    expect(alignTogether(boxes, "center").map((box) => box.x + box.w / 2)).toEqual([30, 30]);
    expect(alignTogether(boxes, "bottom").map((box) => box.y + box.h)).toEqual([40, 40]);
  });
});
