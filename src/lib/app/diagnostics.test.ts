import { describe, expect, it } from "vitest";
import { problemReport, readProblems, recordProblem } from "./diagnostics";

function memory() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key) };
}

describe("problem reports", () => {
  it("keeps the newest problems once each, capped", () => {
    const store = memory();
    for (let n = 0; n < 60; n += 1) recordProblem({ kind: "error", message: `boom ${n}`, where: "a.js:1" }, store);
    recordProblem({ kind: "error", message: "boom 59", where: "a.js:1" }, store);
    const list = readProblems(store);
    expect(list).toHaveLength(50);
    expect(list[0]!.message).toBe("boom 59");
    expect(list.filter((entry) => entry.message === "boom 59")).toHaveLength(1);
  });

  it("writes a plain report without church content", () => {
    const report = problemReport({ version: "0.1.0", platform: "macOS", userAgent: "WebKit", counts: { songs: 12, services: 3 }, problems: [{ at: "2026-10-17T10:00:00.000Z", kind: "promise", message: "fetch failed", where: "" }], crashLog: "", now: new Date("2026-10-17T11:00:00Z") });
    expect(report).toContain("Version: 0.1.0");
    expect(report).toContain("Library: 12 songs, 3 services");
    expect(report).toContain("- 2026-10-17T10:00:00.000Z [promise] fetch failed");
    expect(report).not.toContain("Desktop crash log");
  });
});
