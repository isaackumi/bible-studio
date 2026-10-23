import { describe, expect, it } from "vitest";
import { captionOf, cleanSlideOptions, DEFAULT_SLIDE_OPTIONS, slideOrder } from "./slideshow";

describe("slideshow choices", () => {
  it("keeps saved choices and falls back to the defaults for anything odd", () => {
    expect(cleanSlideOptions(null)).toEqual(DEFAULT_SLIDE_OPTIONS);
    const saved = cleanSlideOptions({ seconds: 99, order: "shuffle", kenBurns: true, countdownMinutes: 0, countdownLabel: "  ", playlistId: 3 });
    expect(saved.seconds).toBe(30);
    expect(saved.order).toBe("shuffle");
    expect(saved.kenBurns).toBe(true);
    expect(saved.countdownMinutes).toBe(1);
    expect(saved.countdownLabel).toBe("Service starts in");
    expect(saved.playlistId).toBeNull();
    expect(saved.watch).toBe(true);
  });

  it("plays in folder order from the chosen picture, or newest first", () => {
    const entries = [{ modified: 10 }, { modified: 30 }, { modified: 20 }];
    expect(slideOrder(entries, "name", 1)).toEqual([1, 0, 2]);
    expect(slideOrder(entries, "newest", -1)).toEqual([1, 2, 0]);
  });

  it("shuffles every picture once", () => {
    const order = slideOrder(Array.from({ length: 8 }, () => ({ modified: 0 })), "shuffle", 3, () => 0.42);
    expect(order[0]).toBe(3);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("turns a file name into a caption", () => {
    expect(captionOf("Youth_Night - Friday 7pm.jpg")).toBe("Youth Night – Friday 7pm");
    expect(captionOf("IMG_2041.JPG")).toBe("IMG 2041");
    expect(captionOf("easter-sunrise.png")).toBe("easter sunrise");
  });
});

describe("slideshow transitions", () => {
  it("keeps a chosen change and its length, within limits", async () => {
    const { cleanSlideOptions } = await import("./slideshow");
    expect(cleanSlideOptions({ transition: "zoom", transitionSeconds: 1.26 })).toMatchObject({ transition: "zoom", transitionSeconds: 1.3 });
    expect(cleanSlideOptions({ transition: "spin", transitionSeconds: 9 })).toMatchObject({ transition: "fade", transitionSeconds: 3 });
    expect(cleanSlideOptions({}).transitionSeconds).toBe(1);
  });

  it("slides with the direction of travel, and Mix takes turns", async () => {
    const { screenTransition } = await import("./slideshow");
    expect(screenTransition("slide", 1, 0)).toBe("push-left");
    expect(screenTransition("slide", -1, 0)).toBe("push-right");
    expect(screenTransition("fade", 1, 3)).toBe("dissolve");
    expect([1, 2, 3, 4, 5].map((step) => screenTransition("mix", 1, step))).toEqual(["push-left", "zoom", "dip", "dissolve", "push-left"]);
    expect(screenTransition("cut", 1, 1)).toBe("cut");
  });
});
