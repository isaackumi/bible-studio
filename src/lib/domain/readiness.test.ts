import { describe, expect, it } from "vitest";
import { backupCheck, cloudCheck, internetCheck, micCheck, isServiceDay, libraryCheck, planCheck, recordingMinutes, screenCheck, serviceCheck, sortChecks, spaceCheck } from "./readiness";

const now = Date.parse("2026-10-25T08:30:00Z");
const DAY = 86_400_000;

describe("Readiness check", () => {
  it("says what the audience screen needs", () => {
    expect(screenCheck({ online: true, displayName: "Projector", screens: 2, mode: "window" }).state).toBe("ok");
    expect(screenCheck({ online: false, displayName: "", screens: 1, mode: "window" })).toMatchObject({ state: "warn", fix: { action: "displays" } });
    expect(screenCheck({ online: false, displayName: "", screens: 2, mode: "window" })).toMatchObject({ state: "fail", fix: { action: "open-audience" } });
    // A projector mirrored by Windows looks like one screen: say how to extend it.
    expect(screenCheck({ online: false, displayName: "", screens: 1, mode: "window", os: "windows" }).detail).toContain("Windows key + P");
    expect(screenCheck({ online: false, displayName: "", screens: 1, mode: "window", os: "mac" }).detail).toContain("mirroring");
  });

  it("names what the service is missing", () => {
    expect(serviceCheck({ name: null, missing: [] }).state).toBe("warn");
    expect(serviceCheck({ name: "Sunday", missing: [] }).state).toBe("ok");
    expect(serviceCheck({ name: "Sunday", missing: ["Welcome loop", "Way Maker", "Logo", "Offering"] })).toMatchObject({ state: "fail", values: { items: "Welcome loop, Way Maker, Logo…" } });
  });

  it("turns free space into recording time", () => {
    expect(recordingMinutes(6_000_000_000, 6000)).toBe(133);
    expect(spaceCheck({ free: 1_000_000_000, kbps: 6000 }).state).toBe("fail");
    expect(spaceCheck({ free: 4_000_000_000, kbps: 6000 })).toMatchObject({ state: "warn", values: { minutes: 88 } });
    expect(spaceCheck({ free: 40_000_000_000, kbps: 6000 })).toMatchObject({ state: "ok", values: { hours: 14 } });
  });

  it("wants a recent backup", () => {
    expect(backupCheck({ folder: "", lastAt: null, now, desktop: true }).state).toBe("warn");
    expect(backupCheck({ folder: "/b", lastAt: new Date(now - 9 * DAY).toISOString(), now, desktop: true })).toMatchObject({ state: "warn", values: { days: 9 } });
    expect(backupCheck({ folder: "/b", lastAt: new Date(now - DAY / 2).toISOString(), now, desktop: true }).state).toBe("ok");
  });

  it("speaks of the plan only when there is one", () => {
    const dateText = (time: number) => new Date(time).toISOString().slice(0, 10);
    expect(planCheck({ plan: "free", endsAt: null, renewBy: null, now, dateText })).toBeNull();
    expect(planCheck({ plan: "premium", endsAt: now + 3 * DAY, renewBy: null, now, dateText })).toMatchObject({ state: "warn", fix: { action: "plans" } });
    expect(planCheck({ plan: "premium", endsAt: now + 90 * DAY, renewBy: now + DAY, now, dateText })?.title).toBe("Connect to the internet soon");
    expect(planCheck({ plan: "premium", endsAt: now + 90 * DAY, renewBy: now + 20 * DAY, now, dateText })?.state).toBe("ok");
  });

  it("puts what needs doing first, and skips what today does not use", () => {
    expect(internetCheck(true, [])).toBeNull();
    expect(sortChecks([libraryCheck(true), libraryCheck(false), spaceCheck({ free: 4e9, kbps: 6000 })]).map((check) => check.state)).toEqual(["fail", "warn", "ok"]);
  });
});

describe("the service-day check on the desk", () => {
  it("runs on Sundays, and on a day the open service is named for", () => {
    const sunday = new Date(2026, 9, 25, 9);
    const wednesday = new Date(2026, 9, 28, 18);
    const today = (date: Date) => date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    expect(isServiceDay(sunday, null)).toBe(true);
    expect(isServiceDay(wednesday, null)).toBe(false);
    expect(isServiceDay(wednesday, `Bible study, ${today(wednesday)}`)).toBe(true);
    expect(isServiceDay(wednesday, `Sunday service, ${today(sunday)}`)).toBe(false);
  });

  it("says whether a microphone sends sound, and which one listening will use", () => {
    const mic = (name: string, live: boolean, error: string | null = null) => ({ name, peak: live ? 0.02 : 0, live, error });
    const base = { chosen: null, fallback: "Microphone (Realtek(R) Audio)", listening: false, problem: null };
    expect(micCheck({ ...base, heard: [] })).toMatchObject({ state: "fail", title: "No microphone is plugged in", fix: { action: "sound" } });
    expect(micCheck({ ...base, heard: [mic("Microphone (Realtek(R) Audio)", false), mic("Camo", false)] })).toMatchObject({ state: "fail", title: "No microphone is sending sound" });
    expect(micCheck({ ...base, heard: [mic("Microphone (Realtek(R) Audio)", true)] })).toMatchObject({ state: "ok", values: { name: "Realtek(R) Audio" } });
    // The default is silent (a virtual one) but another is live: listening moves, worth a look.
    expect(micCheck({ ...base, heard: [mic("Microphone (Realtek(R) Audio)", false), mic("Shure MV7", true)] })).toMatchObject({ state: "warn", title: "{from} sends no sound", values: { from: "Realtek(R) Audio", name: "Shure MV7" } });
    expect(micCheck({ ...base, chosen: "Shure MV7", heard: [mic("Microphone (Realtek(R) Audio)", true)] })).toMatchObject({ state: "warn", title: "{from} is not plugged in", values: { from: "Shure MV7" } });
    // Already listening: no probing, only how it goes.
    expect(micCheck({ ...base, heard: [], listening: true })).toMatchObject({ state: "ok", title: "Listening is on" });
    expect(micCheck({ ...base, heard: [], listening: true, problem: "Nothing is reaching the microphone." })).toMatchObject({ state: "fail", detail: "Nothing is reaching the microphone." });
  });

  it("says whether this computer's songs and files reach the others", () => {
    const base = { held: 0, pendingMedia: 0, full: false, lastSyncAt: null, timeText: () => "9:05" };
    for (const status of ["off", "free", "signedOut"]) expect(cloudCheck({ ...base, status })).toBeNull();
    expect(cloudCheck({ ...base, status: "licenceChanged" })).toMatchObject({ state: "fail", fix: { action: "cloud" } });
    expect(cloudCheck({ ...base, status: "offline" })?.state).toBe("warn");
    expect(cloudCheck({ ...base, status: "readOnly" })).toMatchObject({ state: "warn", fix: { action: "plans" } });
    expect(cloudCheck({ ...base, status: "idle", held: 3 })).toMatchObject({ state: "warn", values: { n: 3 } });
    expect(cloudCheck({ ...base, status: "idle", full: true })?.title).toBe("Some files are only on this computer");
    expect(cloudCheck({ ...base, status: "syncing", pendingMedia: 2 })).toMatchObject({ state: "warn", values: { n: 2 } });
    expect(cloudCheck({ ...base, status: "idle", lastSyncAt: now })).toMatchObject({ state: "ok", values: { time: "9:05" } });
  });
});
