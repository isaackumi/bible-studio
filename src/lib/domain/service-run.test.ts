import { describe, expect, it } from "vitest";
import { activeRun, endRun, markPart, overBy, runCsv, runParts, usedBySection, usedLabel, usualOver } from "./service-run";
import type { Service } from "./types";

const MIN = 60_000;
const nine = new Date(2026, 9, 18, 9, 0, 0).getTime();

const service: Service = {
  id: "s",
  name: "Sunday",
  updatedAt: "",
  startTime: "09:00",
  sections: [
    { id: "prayer", name: "Opening prayer", items: [], minutes: 5, leader: "Kojo" },
    { id: "worship", name: "Worship", items: [], minutes: 30, leader: "Ama" },
    { id: "notes", name: "Notices", items: [] },
  ],
};

describe("service run", () => {
  it("records each part and keeps counting after the planned time is up", () => {
    let run = markPart(service, "prayer", nine, "r1");
    run = markPart(run, "worship", nine + 8 * MIN, "r2");
    const going = activeRun(run)!;
    expect(going.id).toBe("r1");
    expect(going.marks).toHaveLength(2);
    // Worship planned 30 min; 42 minutes in, it is 12 over (the screen stops at 00:00:00).
    const parts = runParts(run, going, nine + 50 * MIN);
    expect(parts.map((part) => [part.name, part.leader, part.planned, part.usedMs / MIN])).toEqual([
      ["Opening prayer", "Kojo", 5, 8],
      ["Worship", "Ama", 30, 42],
      ["Notices", "", null, 0],
    ]);
    expect(overBy(parts[0]!)).toBe(3);
    expect(overBy(parts[1]!)).toBe(12);
    expect(overBy(parts[2]!)).toBeNull();
  });

  it("adds up a part that is gone back to, and ignores the same part twice in a row", () => {
    let run = markPart(service, "prayer", nine, "r1");
    run = markPart(run, "prayer", nine + MIN, "x");
    run = markPart(run, "worship", nine + 4 * MIN, "x");
    run = markPart(run, "prayer", nine + 10 * MIN, "x");
    const used = usedBySection(activeRun(run)!, nine + 12 * MIN);
    expect(used.get("prayer")).toBe(6 * MIN);
    expect(used.get("worship")).toBe(6 * MIN);
  });

  it("ends a run and keeps its parts as they were", () => {
    let run = markPart(service, "prayer", nine, "r1");
    run = endRun(run, nine + 6 * MIN);
    expect(activeRun(run)).toBeNull();
    const ended = run.runs![0]!;
    expect(ended.endedAt).toBe(nine + 6 * MIN);
    const renamed = { ...run, sections: run.sections.map((section) => ({ ...section, name: "Changed" })) };
    expect(runParts(renamed, ended, Date.now())[0]!.name).toBe("Opening prayer");
    expect(ended.parts![0]!.usedMs).toBe(6 * MIN);
  });

  it("starts a new run after one has ended, and closes one left open since another day", () => {
    let run = endRun(markPart(service, "prayer", nine, "r1"), nine + MIN);
    run = markPart(run, "prayer", nine + 2 * MIN, "r2");
    expect(run.runs!.map((entry) => entry.id)).toEqual(["r1", "r2"]);
    const nextWeek = nine + 7 * 24 * 60 * MIN;
    run = markPart(run, "worship", nextWeek, "r3");
    expect(run.runs!.map((entry) => entry.id)).toEqual(["r1", "r2", "r3"]);
    expect(run.runs![1]!.endedAt).toBe(nine + 2 * MIN);
  });

  it("writes times and a spreadsheet", () => {
    expect(usedLabel(65_000)).toBe("1:05");
    expect(usedLabel(3_725_000)).toBe("1:02:05");
    const parts = runParts(service, activeRun(markPart(service, "prayer", nine, "r"))!, nine + 7.5 * MIN);
    expect(runCsv(parts).split("\n")).toEqual([
      "Part,Led by,Planned (min),Used (min),Over (min)",
      "Opening prayer,Kojo,5,7.5,2.5",
      "Worship,Ama,30,,",
      "Notices,,,,",
    ]);
  });

  it("says how far a part usually runs over", () => {
    let run = endRun(markPart(service, "worship", nine, "r1"), nine + 40 * MIN);
    run = endRun(markPart(run, "worship", nine + 60 * MIN, "r2"), nine + 96 * MIN);
    run = markPart(run, "worship", nine + 120 * MIN, "r3");
    // 10 and 6 over; the run still going is not counted.
    expect(usualOver(run).get("worship")).toEqual({ over: 8, runs: 2 });
    expect(usualOver(run).has("prayer")).toBe(false);
  });
});
