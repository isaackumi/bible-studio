import { describe, expect, it } from "vitest";
import { letterOf, quickFilter, sortSongs, withLetters } from "./song-browse";
import type { Song } from "./types";

const song = (id: string, title: string, author = "", first = ""): Song => ({ id, title, author, sections: [{ id: `${id}-v`, kind: "verse", label: "Verse 1", lines: [first] }] });

const songs = [song("1", "Great Is Thy Faithfulness", "Chisholm", "Great is thy faithfulness"), song("2", "Amazing Grace", "Newton"), song("3", "10,000 Reasons"), song("4", "Èl Shaddai")];

describe("song browsing", () => {
  it("filters by every word, ignoring case and accents", () => {
    expect(quickFilter(songs, "great faith").map((entry) => entry.id)).toEqual(["1"]);
    expect(quickFilter(songs, "newton").map((entry) => entry.id)).toEqual(["2"]);
    expect(quickFilter(songs, "el shad").map((entry) => entry.id)).toEqual(["4"]);
    expect(quickFilter(songs, "  ")).toHaveLength(4);
  });

  it("sorts A–Z, by most sung, or favorites first", () => {
    const context = { starred: (entry: Song) => entry.id === "4", mostSung: ["2", "1"] };
    expect(sortSongs(songs, "az", context).map((entry) => entry.id)).toEqual(["3", "2", "4", "1"]);
    expect(sortSongs(songs, "most", context).map((entry) => entry.id).slice(0, 2)).toEqual(["2", "1"]);
    expect(sortSongs(songs, "favorites", context)[0]!.id).toBe("4");
  });

  it("files titles under a letter, numbers under #, with a heading per letter", () => {
    expect(letterOf("10,000 Reasons")).toBe("#");
    expect(letterOf("Èl Shaddai")).toBe("E");
    const rows = withLetters(sortSongs(songs, "az", { starred: () => false, mostSung: [] }));
    expect(rows.filter((row) => row.kind === "letter").map((row) => (row.kind === "letter" ? row.letter : ""))).toEqual(["#", "A", "E", "G"]);
  });
});
