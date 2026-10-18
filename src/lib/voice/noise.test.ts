import { describe, expect, it } from "vitest";
import { noiseCut } from "./noise";

describe("noiseCut", () => {
  it("measures the background between words, not the speech", () => {
    const room = [...Array(40).fill(0.02), ...Array(10).fill(0.3)];
    const cleaned = [...Array(40).fill(0.002), ...Array(10).fill(0.25)];
    expect(noiseCut(room, cleaned)).toBe(20);
  });

  it("waits for enough levels and never reports a negative cut", () => {
    expect(noiseCut([0.1, 0.1], [0.1, 0.1])).toBeNull();
    expect(noiseCut(Array(20).fill(0.01), Array(20).fill(0.02))).toBe(0);
    expect(noiseCut(Array(20).fill(0), Array(20).fill(0))).toBeNull();
  });
});
