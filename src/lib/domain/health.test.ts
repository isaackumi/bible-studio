import { describe, expect, it } from "vitest";
import { frameStats, healthRows, healthTips, type HealthFacts } from "./health";

const GB = 1_000_000_000;
const base: HealthFacts = { launches: [], hangs: [], memory: { total: 16 * GB, available: 8 * GB }, libraryFree: 200 * GB, frames: null, audienceOpen: true, spare: { model: 0, cache: 0, unused: 0 }, dateText: (at) => `day ${at}` };

describe("Performance page", () => {
  it("measures frames a second and hiccups from frame gaps", () => {
    expect(frameStats(Array(60).fill(16.7))).toEqual({ fps: 60, hiccups: 0, worstMs: 17 });
    expect(frameStats([16.7, 16.7, 120, 16.7, 80])).toMatchObject({ hiccups: 2, worstMs: 120 });
    expect(frameStats([])).toEqual({ fps: 0, hiccups: 0, worstMs: 0 });
  });

  it("reads launches, freezes, smoothness, memory and space in plain words", () => {
    const rows = healthRows({ ...base, launches: [3000, 4000, 12500], hangs: [{ at: 50, seconds: 9, during: "importing a video" }], frames: { fps: 41, hiccups: 6, worstMs: 140 }, memory: { total: 8 * GB, available: 0.6 * GB }, libraryFree: 5 * GB });
    const by = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(by.launch).toMatchObject({ state: "warn", values: { seconds: "12.5", usual: "6.5" } });
    expect(by.freezes).toMatchObject({ state: "warn", title: "1 freeze in the last 30 days", values: { date: "day 50", seconds: 9 } });
    expect(by.smooth).toMatchObject({ state: "warn", values: { fps: 41, n: 6 } });
    expect(by.memory).toMatchObject({ state: "warn", values: { free: "0.6", total: "8.0" } });
    expect(by.space).toMatchObject({ state: "warn", action: { action: "storage" } });
  });

  it("asks to open the audience screen before measuring", () => {
    expect(healthRows({ ...base, audienceOpen: false }).find((row) => row.id === "smooth")?.action?.action).toBe("open-audience");
    expect(healthRows(base).find((row) => row.id === "launch")?.state).toBe("unknown");
  });

  it("suggests what to do, from what it saw", () => {
    const tips = healthTips({ ...base, launches: [15000], hangs: [{ at: 1, seconds: 10, during: "importing a video (began 1s ago)" }], spare: { model: 540_000_000, cache: 400_000_000, unused: 1_200_000_000 } });
    expect(tips.map((tip) => tip.id)).toEqual(["freeze-import", "freeze-restart", "slow-launch", "unused", "model", "cache"]);
    expect(tips.find((tip) => tip.id === "unused")?.values).toEqual({ size: "1.2 GB" });
    expect(healthTips(base)).toEqual([]);
  });
});
