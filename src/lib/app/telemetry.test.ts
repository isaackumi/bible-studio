import { describe, expect, it } from "vitest";
import { crashReport, newCrashLines, scrub } from "./telemetry";

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

  it("report a freeze as a hang, grouped by what the app was doing and the last command", () => {
    const hang = crashReport("HANG Not responding for 9s while creating the audience window (began 9.1s ago); last command open_audience (9.2s ago); 14s after launch; windows 0.3.1");
    expect(hang.level).toBe("error");
    expect(hang.title.startsWith("Desktop hang: Not responding for 9s while creating the audience window")).toBe(true);
    expect(hang.fingerprint).toEqual(["desktop-hang", "creating the audience window", "open_audience"]);
    expect(crashReport("HANG Not responding for 8s while starting; last command none yet; 8s after launch; windows 0.3.1").fingerprint).toEqual(["desktop-hang", "starting", "none"]);
    const crash = crashReport("panicked at C:\\Users\\Grace\\x.rs:2");
    expect(crash.level).toBe("fatal");
    expect(crash.title).toContain("Users\\[user]");
  });
});
