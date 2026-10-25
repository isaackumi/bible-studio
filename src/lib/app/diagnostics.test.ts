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

  it("leaves out the development server's errors, old ones, and repeats, so real problems stand out", () => {
    const store = memory();
    recordProblem({ kind: "error", message: "ReferenceError: Can't find variable: t", where: "http://localhost:1420/node_modules/.vite/deps/runtime.js:2083" }, store);
    expect(readProblems(store)).toEqual([]);
    const now = new Date("2026-10-25T12:00:00Z");
    const problem = (at: string, message: string) => ({ at, kind: "error" as const, message, where: "tauri://localhost/_app/x.js:1" });
    const report = problemReport({
      version: "1",
      platform: "Desktop app",
      userAgent: "ua",
      counts: {},
      problems: [
        problem("2026-10-25T10:00:00Z", "Keyed each block has duplicate key `26-10-3` at indexes 1 and 3"),
        problem("2026-10-25T09:00:00Z", "Keyed each block has duplicate key `58-12-4` at indexes 0 and 2"),
        problem("2026-10-24T09:00:00Z", "Cannot read properties of null (reading 'id')"),
        problem("2026-10-10T09:00:00Z", "Something from two weeks ago"),
        { at: "2026-10-25T08:00:00Z", kind: "promise" as const, message: "undefined is not an object (evaluating 'module.default')", where: "@http://localhost:1420/@vite/client:651:54" },
      ],
      crashLog: "",
      sections: [["Log (last lines)", "[100] +5ms INFO a: start\n[101] +1000ms INFO displays: AUDIENCE_PLACE cg-points=0,0\n[102] +2000ms INFO displays: AUDIENCE_PLACE cg-points=0,0\n[103] +3000ms INFO displays: AUDIENCE_PLACE cg-points=0,0\n[104] +4000ms INFO a: done"]],
      now,
    });
    expect(report).toContain("Problems (2, last 7 days):");
    expect(report).toContain("(2 times since 2026-10-25T09:00:00.000Z)");
    expect(report).toContain("reading 'id'");
    expect(report).not.toContain("two weeks ago");
    expect(report).not.toContain("localhost:1420");
    expect(report).toContain("[101] +1000ms INFO displays: AUDIENCE_PLACE cg-points=0,0\n  … the same line 2 more times\n[104]");
  });
});
