import { describe, expect, it } from "vitest";
import { DEFAULT_LOGO_INK_URL, DEFAULT_LOGO_URL, darkText } from "./logo";

describe("default logo", () => {
  it("is the mark as a data URL, light and ink", () => {
    expect(DEFAULT_LOGO_URL.startsWith("data:image/svg+xml")).toBe(true);
    expect(decodeURIComponent(DEFAULT_LOGO_URL)).toContain("#fa4f00");
    expect(DEFAULT_LOGO_INK_URL).not.toBe(DEFAULT_LOGO_URL);
  });

  it("picks the ink mark for dark words", () => {
    expect(darkText("#111")).toBe(true);
    expect(darkText("#ffffff")).toBe(false);
    expect(darkText("rgb(0,0,0)")).toBe(false);
  });
});
