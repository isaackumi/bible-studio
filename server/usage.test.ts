import { describe, expect, it } from "vitest";
import { handleApi, type ApiConfig } from "./api";
import { mockProvider } from "./billing";
import { licenseKeyPair } from "../src/lib/domain/license";
import { memoryStore, putJson } from "./store";
import { readCounts, usageReport, type Usage } from "./usage";

const pair = licenseKeyPair();

function setup() {
  const points: Array<{ indexes: string[]; blobs: string[]; doubles: number[] }> = [];
  const config: ApiConfig = {
    store: memoryStore(),
    signingKey: pair.secretKey,
    publicKey: pair.publicKey,
    provider: mockProvider,
    admin: { users: { "Owner@HeiTech.test": "owner" } },
    leaseDays: 30,
    trialDays: 14,
    graceDays: 7,
    usage: { write: (point) => void points.push(point) },
    now: () => Date.UTC(2026, 9, 22, 12),
  };
  const hello = (body: Record<string, unknown>) => handleApi(new Request("https://keys.test/v1/hello", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), config);
  return { config, points, hello };
}

describe("usage over time", () => {
  it("records every check-in, with what was done since the last one, and never the team's or dev builds as churches", async () => {
    const { config, points, hello } = setup();
    await hello({ device: "mac-1", version: "0.3.0", os: "macos", plan: "premium", counts: { services: 1, scripture: 12, songs: 5 } });
    await hello({ device: "mac-1", version: "0.3.0", os: "macos", plan: "premium" });
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ indexes: ["mac-1"], blobs: ["mac-1", "", "premium", "macos", "0.3.0", "church", "app"], doubles: [1, 12, 5] });
    expect(points[1]!.doubles).toEqual([0, 0, 0]);
    // Signed in to an admin's account: the team's own.
    await putJson(config.store, "acct:u1", { id: "u1", email: "owner@heitech.test" });
    await putJson(config.store, "device:pc-2", { first: 1, last: 1, plan: "free", version: "", os: "windows", account: "u1" }, {});
    await hello({ device: "pc-2", version: "0.3.0", os: "windows", plan: "free" });
    expect(points[2]!.blobs.slice(1, 2)).toEqual(["u1"]);
    expect(points[2]!.blobs[5]).toBe("team");
    await hello({ device: "web-1", version: "0.3.0", os: "web-macos", plan: "free" });
    expect(points[3]!.blobs[6]).toBe("web");
    await hello({ device: "dev-1", version: "0.3.0", os: "macos", plan: "free", dev: true });
    expect(points).toHaveLength(4);
  });

  it("takes only small whole counts from the app", () => {
    expect(readCounts({ services: 2.7, scripture: -3, songs: "9" })).toEqual({ services: 2, scripture: 0, songs: 9 });
    expect(readCounts({ songs: 1e9 })).toEqual({ services: 0, scripture: 0, songs: 1000 });
    expect(readCounts(null)).toEqual({ services: 0, scripture: 0, songs: 0 });
  });

  it("reads daily, weekly and current actives for churches' installed apps only", async () => {
    const asked: string[] = [];
    const usage: Usage = {
      write: () => {},
      query: async (sql) => {
        asked.push(sql);
        if (sql.includes("toStartOfDay") && sql.includes("blob2 != ''")) return [{ day: "2026-10-18 00:00:00", people: "3" }];
        if (sql.includes("toStartOfDay")) return [{ day: "2026-10-18 00:00:00", computers: "5", services: "4", scripture: "40", songs: "22" }];
        if (sql.includes("toStartOfInterval") && sql.includes("blob2 != ''")) return [{ week: "2026-10-16 00:00:00", people: "6" }];
        if (sql.includes("toStartOfInterval")) return [{ week: "2026-10-16 00:00:00", computers: "9" }];
        return [{ n: sql.includes("blob2 != ''") ? "2" : "7" }];
      },
    };
    const report = (await usageReport(usage))!;
    expect(report.daily).toEqual([{ day: "2026-10-18", computers: 5, people: 3, services: 4, scripture: 40, songs: 22 }]);
    expect(report.weekly).toEqual([{ week: "2026-10-16", computers: 9, people: 6 }]);
    expect(report.active).toEqual({ computers: { day: 7, week: 7, month: 7 }, people: { day: 2, week: 2, month: 2 } });
    expect(asked.every((sql) => sql.includes("blob6 = 'church' AND blob7 = 'app'"))).toBe(true);
    expect(await usageReport({ write: () => {} })).toBeNull();
  });
});
