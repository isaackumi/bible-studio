import { describe, expect, it } from "vitest";
import { emptyTourProgress, placeCard, sanitizeTourProgress, TOUR_GROUPS, tourStatus, TOURS } from "./steps";

describe("screen tour", () => {
  it("has a tour for every page, each ending on the way back to it", () => {
    for (const tour of Object.values(TOURS)) {
      expect(tour.steps.length).toBeGreaterThan(4);
      expect(tour.steps[0]!.target).toBeUndefined();
      expect(tour.steps.at(-1)!.target).toEqual(['[data-tour="tours"]']);
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

describe("tour progress", () => {
  it("groups every tour once, by desk", () => {
    expect(TOUR_GROUPS.flatMap((group) => group.tours).sort()).toEqual(Object.keys(TOURS).sort());
  });

  it("reports not started, part way and done", () => {
    const progress = emptyTourProgress();
    expect(tourStatus(progress, "songs")).toMatchObject({ state: "new", label: "Not started" });
    progress.songs = { seen: 2, done: false };
    expect(tourStatus(progress, "songs")).toMatchObject({ state: "partial", label: `3 of ${TOURS.songs.steps.length}`, seen: 3 });
    progress.songs = { seen: 2, done: true };
    expect(tourStatus(progress, "songs")).toMatchObject({ state: "done", label: "Done" });
  });

  it("repairs saved progress", () => {
    const fixed = sanitizeTourProgress({ songs: { seen: 999, done: "yes" }, sermon: { seen: 1.5 }, nope: {} });
    expect(fixed.songs).toEqual({ seen: TOURS.songs.steps.length - 1, done: false });
    expect(fixed.sermon).toEqual({ seen: -1, done: false });
    expect(sanitizeTourProgress(undefined)).toEqual(emptyTourProgress());
  });
});
