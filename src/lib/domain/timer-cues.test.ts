import { describe, expect, it } from "vitest";
import { cuesBetween, defaultTimerSounds, sanitizeTimerSounds } from "./timer-cues";

const sounds = defaultTimerSounds();

describe("timer sounds", () => {
  it("beeps once when a warning time is crossed", () => {
    expect(cuesBetween(5 * 60_000 + 200, 5 * 60_000 - 50, sounds)).toEqual(["warn"]);
    expect(cuesBetween(5 * 60_000 - 50, 5 * 60_000 - 300, sounds)).toEqual([]);
    expect(cuesBetween(60_100, 59_900, sounds)).toEqual(["warn"]);
  });

  it("ticks through the last ten seconds and chimes at zero", () => {
    expect(cuesBetween(10_100, 9_900, sounds)).toEqual(["tick"]);
    expect(cuesBetween(3_050, 2_800, sounds)).toEqual(["tick"]);
    expect(cuesBetween(250, 0, sounds)).toEqual(["end"]);
    expect(cuesBetween(1_100, 0, sounds)).toEqual(["end"]);
    expect(cuesBetween(0, 0, sounds)).toEqual([]);
  });

  it("stays quiet when off, without ticks, or when time goes up", () => {
    expect(cuesBetween(10_100, 9_900, { ...sounds, on: false })).toEqual([]);
    expect(cuesBetween(10_100, 9_900, { ...sounds, ticks: false })).toEqual([]);
    expect(cuesBetween(9_000, 60_000, sounds)).toEqual([]);
  });

  it("cleans saved settings", () => {
    expect(sanitizeTimerSounds({ volume: 4, warnAt: [1, 5, 5, -2, "x"] })).toEqual({ on: true, volume: 1, warnAt: [5, 1], ticks: true });
    expect(sanitizeTimerSounds(null)).toEqual(defaultTimerSounds());
  });
});
