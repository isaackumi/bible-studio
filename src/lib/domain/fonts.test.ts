import { describe, expect, it } from "vitest";
import { defaultTheme } from "./theme";
import { SCREEN_FONTS, screenFont } from "./fonts";

describe("screen fonts", () => {
  it("offers the faces the app already loads", () => {
    expect(SCREEN_FONTS.map((font) => font.id)).toEqual(["instrument-serif", "instrument-sans", "inter", "figtree"]);
    expect(screenFont(defaultTheme().fontFamily)?.name).toBe("Inter");
  });

  it("leaves an unknown face unmatched", () => {
    expect(screenFont("Papyrus")).toBeNull();
  });
});
