import { describe, expect, it } from "vitest";
import { newCrashLines, scrub } from "./telemetry";

describe("error reports", () => {
  it("take personal details out before anything leaves the computer", () => {
    expect(scrub("Failed for pastor@grace.org")).toBe("Failed for [email]");
    expect(scrub("at /Users/isaac/Library/app.js:3")).toBe("at /Users/[user]/Library/app.js:3");
    expect(scrub("open C:\\Users\\Mary\\Documents\\songs.json")).toBe("open C:\\Users\\[user]\\Documents\\songs.json");
    expect(scrub("GET https://api.example.com/v1/songs?key=secret#x failed")).toBe("GET https://api.example.com/v1/songs failed");
    expect(scrub("x".repeat(5000))).toHaveLength(2000);
  });

  it("send only the crash lines not sent before", () => {
    const log = "[100] panicked at src/a.rs:1\nnot a crash line\n[200] panicked at src/b.rs:2\n";
    expect(newCrashLines(log, 0).map((line) => line.at)).toEqual([100, 200]);
    expect(newCrashLines(log, 100)).toEqual([{ at: 200, message: "panicked at src/b.rs:2" }]);
    expect(newCrashLines(log, 200)).toEqual([]);
  });
});
