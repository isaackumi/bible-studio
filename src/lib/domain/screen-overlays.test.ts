import { describe, expect, it } from "vitest";
import { newOverlay, paintOverlays, sanitizeOverlays, slideOverlays } from "./screen-overlays";

describe("screen overlays", () => {
  it("starts each kind off, with sensible words", () => {
    const logo = newOverlay("logo", "Grace Chapel", "a");
    expect(logo).toMatchObject({ on: false, text: "Grace Chapel", corner: "top-right" });
    expect(newOverlay("badge", "", "b").text).toBe("LIVE");
  });

  it("paints only overlays that are on, with the logo picture resolved", () => {
    const overlays = [{ ...newOverlay("logo", "Grace", "a"), on: true, assetId: "pic" }, newOverlay("ticker", "", "t")];
    expect(paintOverlays(overlays, (id) => `asset://${id}`)).toEqual([expect.objectContaining({ id: "a", imageUrl: "asset://pic" })]);
  });

  it("never stacks two corner overlays in one corner", () => {
    const overlays = [
      { ...newOverlay("logo", "", "a"), on: true, corner: "top-left" as const },
      { ...newOverlay("clock", "", "c"), on: true, corner: "top-left" as const },
    ];
    expect(paintOverlays(overlays, () => null).map((overlay) => overlay.id)).toEqual(["c"]);
  });

  it("cleans saved overlays", () => {
    const clean = sanitizeOverlays([{ id: "x", kind: "ticker", on: true, speed: 9, color: "red" }, { id: "x", kind: "logo" }, { kind: "nope", id: "y" }]);
    expect(clean).toHaveLength(1);
    expect(clean[0]).toMatchObject({ id: "x", on: true, speed: 2, color: "#fa4f00" });
  });
});

describe("how a countdown or name card looks", () => {
  it("keeps full screen, time only and the box style, and drops anything else", () => {
    const [kept] = sanitizeOverlays([{ ...newOverlay("countdown", "", "c"), cover: true, showLabel: false, fill: "color" }]);
    expect(kept).toMatchObject({ cover: true, showLabel: false, fill: "color" });
    const [plain] = sanitizeOverlays([{ ...newOverlay("countdown", "", "d"), cover: "yes", showLabel: true, fill: "neon" }]);
    expect(plain!.cover).toBeUndefined();
    expect(plain!.showLabel).toBeUndefined();
    expect(plain!.fill).toBeUndefined();
  });

  it("puts a slideshow's title across the top and the clock in a corner", () => {
    const painted = slideOverlays({ layout: "image" }, null, { title: "Welcome to Grace Chapel", clock: true });
    expect(painted.map((overlay) => [overlay.kind, overlay.spot])).toEqual([["banner", "top"], ["clock", "bottom-right"]]);
    expect(painted[0]!.text).toBe("Welcome to Grace Chapel");
    expect(slideOverlays({ layout: "image" }, null, { title: "", clock: true }).map((overlay) => overlay.spot)).toEqual(["top-right"]);
    expect(slideOverlays({ layout: "image" }, null, null)).toEqual([]);
  });
});
