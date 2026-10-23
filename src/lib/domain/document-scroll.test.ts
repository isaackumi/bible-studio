import { describe, expect, it } from "vitest";
import { pageAt, pageStart, scrollLength, stepScroll } from "./document-scroll";

// Three A4 pages (height 1.414 × width) on a 16:9 screen: each page is about 2.5 screens tall.
const a4 = [1.414, 1.414, 1.414];
const wide = 16 / 9;

describe("a PDF scrolling as one long page", () => {
  it("knows how far it can scroll and where each page starts", () => {
    expect(scrollLength(a4, wide)).toBeCloseTo(3 * 1.414 * wide - 1, 5);
    expect(pageStart(1, a4, wide)).toBeCloseTo(1.414 * wide, 5);
    expect(scrollLength([0.5], wide)).toBe(0);
  });

  it("names the page in the middle of the screen", () => {
    expect(pageAt(0, a4, wide)).toBe(0);
    expect(pageAt(pageStart(2, a4, wide), a4, wide)).toBe(2);
  });

  it("steps by part of a screen, and hands on at either end", () => {
    const length = scrollLength(a4, wide);
    expect(stepScroll(0, 1, length)).toBeCloseTo(0.6, 5);
    expect(stepScroll(length - 0.2, 1, length)).toBeCloseTo(length, 5);
    expect(stepScroll(length, 1, length)).toBeNull();
    expect(stepScroll(0, -1, length)).toBeNull();
  });
});
