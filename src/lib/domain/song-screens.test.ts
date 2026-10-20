import { describe, expect, it } from "vitest";
import { clampScreen, sanitizeSongLines, screensOf } from "./song-screens";

const verse = ["Amazing grace how sweet the sound", "That saved a wretch like me", "I once was lost but now am found", "Was blind but now I see"];

describe("songs line by line", () => {
  it("shows the whole part as one screen by default", () => {
    expect(screensOf(verse, 0)).toEqual([{ from: 0, to: 4 }]);
  });

  it("splits a part into screens of the chosen number of lines", () => {
    expect(screensOf(verse, 1)).toEqual([{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }]);
    expect(screensOf(verse, 2)).toEqual([{ from: 0, to: 2 }, { from: 2, to: 4 }]);
    // A last screen may hold fewer lines.
    expect(screensOf(verse, 3)).toEqual([{ from: 0, to: 3 }, { from: 3, to: 4 }]);
  });

  it("always breaks at a blank line, so a church can place breaks by hand", () => {
    const lines = ["One", "Two", "", "Three", "Four", "Five"];
    expect(screensOf(lines, 4)).toEqual([{ from: 0, to: 2 }, { from: 3, to: 6 }]);
    expect(screensOf(lines, 2)).toEqual([{ from: 0, to: 2 }, { from: 3, to: 5 }, { from: 5, to: 6 }]);
    // Blank lines at the ends or repeated make no empty screens.
    expect(screensOf(["", "One", "", "", "Two", ""], 1)).toEqual([{ from: 1, to: 2 }, { from: 4, to: 5 }]);
  });

  it("gives an empty part one screen, and keeps settings and positions in range", () => {
    expect(screensOf(["", ""], 2)).toEqual([{ from: 0, to: 2 }]);
    expect(sanitizeSongLines(2)).toBe(2);
    expect(sanitizeSongLines(7)).toBe(0);
    expect(sanitizeSongLines("2")).toBe(0);
    expect(clampScreen(5, 3)).toBe(2);
    expect(clampScreen(-1, 3)).toBe(0);
    expect(clampScreen(undefined, 3)).toBe(0);
  });
});
