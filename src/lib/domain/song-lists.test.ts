import { describe, expect, it } from "vitest";
import { songLists } from "./song-lists";
import type { Song } from "./types";

const song = (id: string): Song => ({ id, title: id.toUpperCase(), author: "", sections: [{ id: `${id}1`, kind: "verse", label: "Verse 1", lines: ["la"] }] });
const songs = ["a", "b", "c", "d"].map(song);
const use = (songId: string, date: string) => ({ songId, title: songId, author: "", ccli: "", date });

describe("song lists", () => {
  const lists = songLists({
    songs,
    favoriteIds: ["c", "gone"],
    sessionRecentIds: ["d"],
    uses: [use("a", "2026-10-11"), use("b", "2026-10-04"), use("a", "2026-10-04"), use("d", "2026-10-11")],
    serviceSongIds: ["b", "a", "b"],
    now: new Date("2026-10-18T12:00:00"),
  });
  const ids = (id: string) => lists.find((list) => list.id === id)!.songs.map((entry) => entry.id);

  it("keeps favorites that still exist", () => {
    expect(ids("favorites")).toEqual(["c"]);
  });

  it("puts this session's songs before older use, each song once", () => {
    expect(ids("recent")).toEqual(["d", "a", "b"]);
  });

  it("orders most sung by how many Sundays", () => {
    expect(ids("most")[0]).toBe("a");
  });

  it("follows the service's running order without repeats", () => {
    expect(ids("service")).toEqual(["b", "a"]);
  });
});
