import { describe, expect, it } from "vitest";
import { screenful, stepScreenful } from "./passage";

const psalm = { startVerse: 1, endVerse: 6 };

describe("a passage a few verses at a time", () => {
  it("shows N verses per screen, the last screen shorter", () => {
    expect(screenful(psalm, 1, 2)).toEqual({ start: 1, end: 2 });
    expect(screenful(psalm, 5, 4)).toEqual({ start: 5, end: 6 });
    expect(screenful(psalm, 1, null)).toEqual({ start: 1, end: 6 });
  });

  it("steps screen by screen and stops at either end", () => {
    expect(stepScreenful(psalm, 1, 2, 1)).toBe(3);
    expect(stepScreenful(psalm, 5, 2, 1)).toBeNull();
    expect(stepScreenful(psalm, 3, 2, -1)).toBe(1);
    expect(stepScreenful(psalm, 1, 2, -1)).toBeNull();
    expect(stepScreenful(psalm, 1, null, 1)).toBeNull();
    expect(stepScreenful(psalm, 4, 3, -1)).toBe(1);
  });
});
