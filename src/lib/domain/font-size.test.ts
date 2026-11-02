import { describe, expect, it } from "vitest";
import { presentLyrics } from "./present";
import { FONT_SIZE_MAX, FONT_SIZE_MIN, defaultTheme, sanitizeTheme, steppedFontSize, themeForSong } from "./theme";

describe("A− and A+", () => {
  it("moves the size one step either way", () => {
    expect(steppedFontSize(62, 1)).toBe(66);
    expect(steppedFontSize(62, -1)).toBe(58);
  });

  it("stops at the ends of the range", () => {
    expect(steppedFontSize(FONT_SIZE_MAX, 1)).toBe(FONT_SIZE_MAX);
    expect(steppedFontSize(FONT_SIZE_MAX - 1, 1)).toBe(FONT_SIZE_MAX);
    expect(steppedFontSize(FONT_SIZE_MIN, -1)).toBe(FONT_SIZE_MIN);
    expect(steppedFontSize(FONT_SIZE_MIN + 1, -1)).toBe(FONT_SIZE_MIN);
  });
});

describe("songs' own size", () => {
  const theme = defaultTheme();

  it("is the theme's size until one is set", () => {
    expect(themeForSong(theme).fontSize).toBe(theme.fontSize);
  });

  it("reaches the lyrics and leaves verses alone", () => {
    const sized = { ...theme, songSize: 96 };
    expect(presentLyrics({ theme: sized, label: "Verse 1", lines: ["Amazing grace"] }).theme.fontSize).toBe(96);
    expect(sized.fontSize).toBe(theme.fontSize);
  });

  it("survives saving, and a bad value does not", () => {
    expect(sanitizeTheme({ ...theme, songSize: 96 }).songSize).toBe(96);
    expect(sanitizeTheme({ ...theme, songSize: "big" as never }).songSize).toBeUndefined();
  });
});
