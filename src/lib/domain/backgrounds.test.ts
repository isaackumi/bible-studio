import { describe, expect, it } from "vitest";
import { frameBackground } from "./backgrounds";
import { blackModel, defaultTheme, emptyModel } from "./theme";

describe("frame background", () => {
  it("paints the theme colour so the audience margins match the frame", () => {
    const theme = { ...defaultTheme(), background: { type: "color" as const, color: "#123456" } };
    expect(frameBackground(emptyModel(theme))).toBe("#123456");
    expect(frameBackground(blackModel(theme))).toBe("#000000");
  });

  it("keeps nested overlay layers transparent", () => {
    expect(frameBackground(emptyModel(defaultTheme()), true)).toBe("transparent");
  });
});
