import { describe, expect, it } from "vitest";
import { cleanThresholds, DEFAULT_THRESHOLDS, loadAlert, loadLevels, shouldAlert, type LoadContext, type LoadKind, type LoadLevel, type LoadSample } from "./load-watch";

const GB = 1024 ** 3;
const OK: Record<LoadKind, LoadLevel> = { cpu: "ok", memory: "ok", "app-memory": "ok" };
const sample = (at: number, cpu: number, free = 0.5, appCpu = cpu / 2, appMemory = 0.8 * GB): LoadSample => ({ at, cpu, appCpu, memoryTotal: 8 * GB, memoryAvailable: free * 8 * GB, appMemory, cores: 4 });
/** Readings every 5 s over `seconds`, ending at `end`. */
const run = (seconds: number, end: number, make: (at: number) => LoadSample) => Array.from({ length: seconds / 5 + 1 }, (_, i) => make(end - seconds * 1000 + i * 5000));
const QUIET: LoadContext = { showing: false, listening: false, heavyListening: false, movingBackgrounds: false };

describe("the load watch", () => {
  it("never alarms on a spike: the processors must stay busy for the whole run", () => {
    const now = 100_000;
    const spike = [...run(25, now - 5000, (at) => sample(at, 40)), sample(now, 99)];
    expect(loadLevels(spike, OK, DEFAULT_THRESHOLDS, now).cpu).toBe("ok");
    const busy = run(30, now, (at) => sample(at, 90));
    expect(loadLevels(busy, OK, DEFAULT_THRESHOLDS, now).cpu).toBe("warn");
    expect(loadLevels(run(30, now, (at) => sample(at, 97)), OK, DEFAULT_THRESHOLDS, now).cpu).toBe("critical");
  });

  it("waits for enough readings after launch before judging", () => {
    expect(loadLevels([sample(0, 99), sample(5000, 99)], OK, DEFAULT_THRESHOLDS, 5000).cpu).toBe("ok");
  });

  it("does not flicker: a warning stays until the processors are well under the line", () => {
    const now = 200_000;
    const easing = run(30, now, (at) => sample(at, 80));
    expect(loadLevels(easing, { ...OK, cpu: "warn" }, DEFAULT_THRESHOLDS, now).cpu).toBe("warn");
    expect(loadLevels(easing, OK, DEFAULT_THRESHOLDS, now).cpu).toBe("ok");
    expect(loadLevels(run(30, now, (at) => sample(at, 60)), { ...OK, cpu: "warn" }, DEFAULT_THRESHOLDS, now).cpu).toBe("ok");
  });

  it("warns when free memory stays low, and when Church Studio itself holds too much", () => {
    const now = 50_000;
    expect(loadLevels(run(10, now, (at) => sample(at, 20, 0.1)), OK, DEFAULT_THRESHOLDS, now).memory).toBe("warn");
    expect(loadLevels(run(10, now, (at) => sample(at, 20, 0.04)), OK, DEFAULT_THRESHOLDS, now).memory).toBe("critical");
    expect(loadLevels([sample(now, 20, 0.5, 10, 3.5 * GB)], OK, DEFAULT_THRESHOLDS, now)["app-memory"]).toBe("warn");
    expect(loadLevels([sample(now, 20, 0.5, 10, 6 * GB)], OK, DEFAULT_THRESHOLDS, now)["app-memory"]).toBe("critical");
  });

  it("says whose doing it is, and offers only what helps", () => {
    const ours = loadAlert("cpu", "warn", sample(0, 92, 0.5, 70), { ...QUIET, listening: true, heavyListening: true, movingBackgrounds: true });
    expect(ours.detail).toContain("mostly with Church Studio");
    expect(ours.actions.map((action) => action.id)).toEqual(["lighter-listening", "calm-backgrounds", "open-monitor", "settings"]);
    const others = loadAlert("cpu", "warn", sample(0, 92, 0.5, 8), { ...QUIET, listening: true, heavyListening: true });
    expect(others.detail).toContain("other apps");
    expect(others.actions.map((action) => action.id)).toEqual(["open-monitor", "settings"]);
  });

  it("never offers a restart while something is on the screen", () => {
    const showing = loadAlert("app-memory", "warn", sample(0, 20, 0.5, 10, 4 * GB), { ...QUIET, showing: true });
    expect(showing.actions.map((action) => action.id)).not.toContain("restart");
    expect(showing.detail).toContain("after the service");
    expect(loadAlert("app-memory", "warn", sample(0, 20, 0.5, 10, 4 * GB), QUIET).actions.map((action) => action.id)).toContain("restart");
  });

  it("alerts on a rise at once, and repeats the same level only after a while", () => {
    expect(shouldAlert("warn", "ok", undefined, 0)).toBe(true);
    expect(shouldAlert("critical", "warn", 0, 1000)).toBe(true);
    expect(shouldAlert("warn", "warn", 0, 60_000)).toBe(false);
    expect(shouldAlert("warn", "warn", 0, 11 * 60_000)).toBe(true);
    expect(shouldAlert("ok", "warn", 0, 0)).toBe(false);
  });

  it("keeps stored thresholds sensible", () => {
    expect(cleanThresholds({ cpuWarn: 200, cpuCritical: 10, memoryWarn: -5, memoryCritical: 50, sustainMs: 1 })).toEqual({ cpuWarn: 98, cpuCritical: 99, memoryWarn: 3, memoryCritical: 2, sustainMs: 5000 });
    expect(cleanThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
  });
});
