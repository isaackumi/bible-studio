import { describe, expect, it } from "vitest";
import { evenGain, measureLoudness } from "./loudness";

const RATE = 8000;
const tone = (amplitude: number, seconds: number) => Float32Array.from({ length: RATE * seconds }, (_, n) => amplitude * Math.sin((2 * Math.PI * 440 * n) / RATE));
const join = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

describe("even volume", () => {
  it("measures a sine wave at its known level", () => {
    // A full-scale sine has a mean square of 0.5: -3 dB. Half the amplitude is 6 dB lower.
    expect(measureLoudness([tone(1, 2)], RATE)).toBeCloseTo(-3, 0);
    expect(measureLoudness([tone(0.5, 2)], RATE)).toBeCloseTo(-9, 0);
  });

  it("is not pulled down by silence or a soft intro", () => {
    const loud = measureLoudness([tone(0.5, 4)], RATE)!;
    expect(measureLoudness([join(new Float32Array(RATE * 4), tone(0.5, 4))], RATE)).toBeCloseTo(loud, 0);
    expect(measureLoudness([join(tone(0.01, 3), tone(0.5, 4))], RATE)).toBeCloseTo(loud, 0);
  });

  it("reads silence as nothing to measure", () => {
    expect(measureLoudness([new Float32Array(RATE)], RATE)).toBeNull();
    expect(measureLoudness([], RATE)).toBeNull();
  });

  it("turns loud tracks down to the target and leaves quieter ones alone", () => {
    expect(evenGain(-10, -16)).toBeCloseTo(0.5, 2);
    expect(evenGain(-16, -16)).toBe(1);
    expect(evenGain(-24, -16)).toBe(1);
    expect(evenGain(undefined)).toBe(1);
  });
});
