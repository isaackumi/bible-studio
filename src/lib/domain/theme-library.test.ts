import { describe, expect, it } from "vitest";
import { backgroundFill, frameBackground, MOTIONS } from "./backgrounds";
import { planIncludes } from "./plans";
import { presentScripture } from "./present";
import { defaultTheme, factoryThemes, sanitizePanel, sanitizeTheme } from "./theme";
import type { Theme } from "./types";

const theme = (patch: Partial<Theme>): Theme => sanitizeTheme({ ...defaultTheme(), ...patch } as Theme);

describe("theme library", () => {
  it("keeps valid gradient, motion and video backgrounds and repairs bad ones", () => {
    expect(theme({ background: { type: "gradient", from: "#112233", to: "#AABBCC", angle: 400 } }).background).toEqual({ type: "gradient", from: "#112233", to: "#aabbcc", angle: 40 });
    expect(theme({ background: { type: "motion", motionId: "aurora", tint: "nope", base: "#000000" } }).background).toEqual({ type: "motion", motionId: "aurora", tint: MOTIONS[0]!.tint, base: "#000000" });
    expect(theme({ background: { type: "motion", motionId: "lava" as never, tint: "#ffffff", base: "#000000" } }).background).toEqual({ type: "color", color: "#050505" });
    expect(theme({ background: { type: "video", assetId: "v1" } }).background).toEqual({ type: "video", assetId: "v1" });
    expect(theme({ dim: 2 }).dim).toBe(0.8);
    expect(theme({ dim: -1 }).dim).toBe(0);
  });

  it("paints gradient and motion bases, and leaves video to the video layer", () => {
    expect(backgroundFill({ type: "gradient", from: "#000000", to: "#ffffff", angle: 90 })).toBe("linear-gradient(90deg, #000000 0%, #ffffff 100%)");
    expect(backgroundFill({ type: "motion", motionId: "stars", tint: "#ffffff", base: "#010203" })).toBe("#010203");
    const video = presentScripture({ theme: theme({ background: { type: "video", assetId: "v1" } }), reference: "John 3:16", attribution: null, verses: [] });
    expect(frameBackground(video)).toBe("#000000");
  });

  it("ships more themes, with the new animated and seasonal ones on Premium", () => {
    const all = factoryThemes();
    const premium = all.filter((entry) => entry.premium);
    expect(all.length).toBeGreaterThanOrEqual(23);
    expect(premium.length).toBe(22);
    expect(premium.filter((entry) => entry.background.type === "motion").length).toBe(9);
    // Broadcast themes put the words on a panel.
    expect(premium.filter((entry) => entry.panel).map((entry) => entry.panel!.style).sort()).toEqual(["band", "band", "bar", "bar", "bar", "box", "glass", "glass"]);
    expect(all.filter((entry) => !entry.premium).every((entry) => entry.background.type !== "motion")).toBe(true);
    expect(planIncludes("free", "theme-library")).toBe(false);
    expect(planIncludes("premium", "theme-library")).toBe(true);
  });

  it("keeps a valid panel and drops a broken one", () => {
    expect(sanitizePanel({ style: "bar", color: "#0B1530", opacity: 3, accent: "nope", tag: true })).toEqual({ style: "bar", color: "#0b1530", opacity: 1, accent: "#fa4f00", tag: true });
    expect(sanitizePanel({ style: "spotlight" })).toBeUndefined();
    expect(sanitizePanel(null)).toBeUndefined();
  });
});
