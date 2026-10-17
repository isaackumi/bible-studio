import { describe, expect, it } from "vitest";
import { placeCard, TOURS } from "./steps";

describe("screen tour", () => {
  it("has a tour for every page, each ending on the way back to it", () => {
    for (const tour of Object.values(TOURS)) {
      expect(tour.steps.length).toBeGreaterThan(4);
      expect(tour.steps[0]!.target).toBeUndefined();
      expect(tour.steps.at(-1)!.target).toEqual(['[aria-label="Show me around"]']);
      for (const step of tour.steps) expect(step.body.length).toBeLessThan(200);
    }
  });

  it("puts the card below, above, beside, or centered, always on screen", () => {
    const view = { width: 1280, height: 800 };
    const card = { width: 360, height: 180 };
    expect(placeCard(null, card, view)).toEqual({ left: 460, top: 310 });
    expect(placeCard({ left: 100, top: 100, width: 200, height: 40 }, card, view)).toEqual({ left: 20, top: 154 });
    expect(placeCard({ left: 600, top: 700, width: 100, height: 40 }, card, view).top).toBe(506);
    const right = placeCard({ left: 0, top: 0, width: 300, height: 800 }, card, view);
    expect(right.left).toBe(314);
    const huge = placeCard({ left: 0, top: 0, width: 1280, height: 800 }, card, view);
    expect(huge.left).toBeGreaterThanOrEqual(12);
    expect(huge.top + card.height).toBeLessThanOrEqual(800 - 12);
  });
});
