import { describe, expect, it } from "vitest";
import { noteSongUse, sanitizeSongUses, usageCsv, usageReport } from "./song-usage";
import type { Song } from "./types";

const grace: Song = { id: "s1", title: "Amazing Grace", author: "John Newton", ccli: "22025", sections: [] };
const holy: Song = { id: "s2", title: "Holy, Holy, Holy", author: "Heber", sections: [] };

describe("CCLI song usage", () => {
  it("counts a song once per day, however often it goes live", () => {
    let uses = noteSongUse([], grace, new Date(2026, 9, 18, 9));
    uses = noteSongUse(uses, grace, new Date(2026, 9, 18, 11));
    uses = noteSongUse(uses, holy, new Date(2026, 9, 18, 11));
    uses = noteSongUse(uses, grace, new Date(2026, 9, 25, 9));
    expect(uses).toHaveLength(3);
    const report = usageReport(uses, "2026-10-01", "2026-10-31");
    expect(report.map((row) => [row.title, row.times, row.last])).toEqual([
      ["Amazing Grace", 2, "2026-10-25"],
      ["Holy, Holy, Holy", 1, "2026-10-18"],
    ]);
    expect(usageReport(uses, "2026-10-20", "2026-10-31")).toHaveLength(1);
  });

  it("writes a CSV with the CCLI number and quotes commas", () => {
    const uses = noteSongUse(noteSongUse([], grace, new Date(2026, 9, 18)), holy, new Date(2026, 9, 18));
    const csv = usageCsv(usageReport(uses, "2026-01-01", "2026-12-31"), "1234567");
    expect(csv.split("\n")[0]).toBe("CCLI Song Number,Title,Author,Times Used,Last Used,Church CCLI License");
    expect(csv).toContain('22025,Amazing Grace,John Newton,1,2026-10-18,1234567');
    expect(csv).toContain(',"Holy, Holy, Holy",Heber,1,');
  });

  it("repairs a saved log", () => {
    expect(sanitizeSongUses([{ songId: "a", title: "A", date: "2026-10-18", ccli: "12-34" }, { songId: "b", date: "yesterday" }, 5])).toEqual([
      { songId: "a", title: "A", author: "", ccli: "1234", date: "2026-10-18" },
    ]);
  });
});
