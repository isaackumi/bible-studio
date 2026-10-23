import { describe, expect, it } from "vitest";
import { backupCheck, internetCheck, libraryCheck, planCheck, recordingMinutes, screenCheck, serviceCheck, sortChecks, spaceCheck } from "./readiness";

const now = Date.parse("2026-10-25T08:30:00Z");
const DAY = 86_400_000;

describe("Ready for Sunday", () => {
  it("says what the audience screen needs", () => {
    expect(screenCheck({ online: true, displayName: "Projector", screens: 2, mode: "window" }).state).toBe("ok");
    expect(screenCheck({ online: false, displayName: "", screens: 1, mode: "window" })).toMatchObject({ state: "warn", fix: { action: "displays" } });
    expect(screenCheck({ online: false, displayName: "", screens: 2, mode: "window" })).toMatchObject({ state: "fail", fix: { action: "open-audience" } });
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
