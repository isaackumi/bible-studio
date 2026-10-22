import { describe, expect, it } from "vitest";
import { fitted, isSvg, LONGEST_EDGE } from "./fit-image";

describe("fitting pictures", () => {
  it("keeps the shape and caps the longer side", () => {
    expect(fitted(6000, 4000, LONGEST_EDGE)).toEqual({ width: 3840, height: 2560 });
    expect(fitted(2000, 9000, LONGEST_EDGE)).toEqual({ width: 853, height: 3840 });
    expect(fitted(1920, 1080, LONGEST_EDGE)).toEqual({ width: 1920, height: 1080 });
  });

  it("knows an SVG by its type or name", () => {
    expect(isSvg(new Blob([], { type: "image/svg+xml" }))).toBe(true);
    expect(isSvg(new Blob([]), "Logo.SVG")).toBe(true);
    expect(isSvg(new Blob([], { type: "image/png" }), "logo.png")).toBe(false);
  });
});
