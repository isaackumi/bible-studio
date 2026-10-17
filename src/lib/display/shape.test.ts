import { describe, expect, it } from "vitest";
import { aspectFor, canvasFor, cleanAspect, describeAspect, sanitizeScreenShape } from "./shape";

describe("screen shape", () => {
  it("paints 1080 on the short side, so words keep their size on any screen", () => {
    expect(canvasFor(16 / 9)).toEqual({ width: 1920, height: 1080 });
    expect(canvasFor(16 / 10)).toEqual({ width: 1728, height: 1080 });
    expect(canvasFor(4 / 3)).toEqual({ width: 1440, height: 1080 });
    expect(canvasFor(21 / 9)).toEqual({ width: 2520, height: 1080 });
    expect(canvasFor(9 / 16)).toEqual({ width: 1080, height: 1920 });
  });

  it("follows the measured screen when set to match, and a chosen shape otherwise", () => {
    expect(aspectFor("auto", null)).toBeCloseTo(16 / 9);
    expect(aspectFor("auto", 1.6)).toBeCloseTo(1.6);
    expect(aspectFor("4:3", 1.6)).toBeCloseTo(4 / 3);
  });

  it("keeps odd measurements sensible and names common shapes", () => {
    expect(cleanAspect(0)).toBeCloseTo(16 / 9);
    expect(cleanAspect(Number.NaN)).toBeCloseTo(16 / 9);
    expect(cleanAspect(12)).toBe(3.6);
    expect(sanitizeScreenShape("5:4")).toBe("auto");
    expect(describeAspect(1920 / 1200)).toBe("16:10");
    expect(describeAspect(1.85)).toBe("1.85:1");
  });
});
