import { describe, expect, it } from "vitest";
import { backupName, backupsToPrune, isBackupName, latestBackup, mergeById } from "./backup";

describe("folder backups", () => {
  it("names backups so they sort in time order", () => {
    expect(backupName(new Date(2026, 9, 17, 18, 5))).toBe("Church Studio backup 2026-10-17 1805.json");
    expect(isBackupName("Church Studio backup 2026-10-17 1805.json")).toBe(true);
    expect(isBackupName("../Church Studio backup x.json")).toBe(false);
    expect(latestBackup(["notes.txt", "Church Studio backup 2026-10-17 1805.json", "Church Studio backup 2026-10-18 0900.json"])).toBe("Church Studio backup 2026-10-18 0900.json");
    expect(latestBackup(["notes.txt"])).toBeNull();
  });

  it("keeps the newest twenty", () => {
    const names = Array.from({ length: 23 }, (_, n) => backupName(new Date(2026, 0, n + 1, 9)));
    expect(backupsToPrune([...names, "other.json"])).toEqual(names.slice(0, 3));
  });

  it("merges by id: the backup's copy wins, nothing is deleted", () => {
    expect(mergeById([{ id: "a", v: 1 }, { id: "b", v: 1 }], [{ id: "b", v: 2 }, { id: "c", v: 2 }])).toEqual([
      { id: "a", v: 1 },
      { id: "b", v: 2 },
      { id: "c", v: 2 },
    ]);
  });
});
