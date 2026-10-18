import { describe, expect, it } from "vitest";
import { cleanTrim, clockText, endPoint, playPosition, readClock, videoEnd } from "./video-play";

describe("video play", () => {
  it("reads older items' loop as an end action", () => {
    expect(videoEnd({ loop: true })).toBe("loop");
    expect(videoEnd({ loop: false })).toBe("hold");
    expect(videoEnd({ loop: true, end: "next" })).toBe("next");
  });

  it("keeps trim points sensible", () => {
    expect(cleanTrim({ start: 5, stop: 30 })).toEqual({ start: 5, stop: 30 });
    expect(cleanTrim({ start: -3, stop: 2 })).toEqual({ stop: 2 });
    expect(cleanTrim({ start: 10, stop: 10.2 })).toEqual({ start: 10 });
  });

  it("plays inside the trim, looping or holding at the end", () => {
    expect(playPosition(0, { start: 5, stop: 20, loop: false, duration: 60 })).toBe(5);
    expect(playPosition(25, { start: 5, stop: 20, loop: false, duration: 60 })).toBe(20);
    expect(playPosition(22, { start: 5, stop: 20, loop: true, duration: 60 })).toBe(7);
    expect(playPosition(70, { loop: true, duration: 60 })).toBe(10);
    expect(playPosition(70, { loop: false, duration: 0 })).toBe(70);
  });

  it("knows when the video is over", () => {
    expect(endPoint({ stop: 12 }, 60)).toBe(12);
    expect(endPoint({}, 60)).toBe(60);
    expect(endPoint({}, 0)).toBeNull();
  });

  it("reads and writes clock times", () => {
    expect(readClock("1:05")).toBe(65);
    expect(readClock("1:00:00")).toBe(3600);
    expect(readClock("90")).toBe(90);
    expect(readClock("")).toBeUndefined();
    expect(readClock("abc")).toBeUndefined();
    expect(clockText(65)).toBe("1:05");
    expect(clockText(3725)).toBe("1:02:05");
  });
});
