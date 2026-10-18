import { describe, expect, it } from "vitest";
import { chorusAfterVerses, cleanOrder, hasOwnOrder, orderFromNames, slotFor, songSlots, stepSlot } from "./song-order";
import type { Song } from "./types";

const song: Song = {
  id: "s",
  title: "Song",
  author: "",
  sections: [
    { id: "v1", kind: "verse", label: "Verse 1", lines: ["a"] },
    { id: "v2", kind: "verse", label: "Verse 2", lines: ["b"] },
    { id: "c", kind: "chorus", label: "Chorus", lines: ["c"] },
    { id: "b", kind: "bridge", label: "Bridge", lines: ["d"] },
  ],
};
const arranged: Song = { ...song, order: ["v1", "c", "v2", "c", "b", "c"] };

describe("song arrangements", () => {
  it("runs through the sections as written without an order", () => {
    expect(songSlots(song).map((s) => s.id)).toEqual(["v1", "v2", "c", "b"]);
    expect(hasOwnOrder(song)).toBe(false);
  });

  it("steps through the order with repeats", () => {
    expect(songSlots(arranged).map((s) => s.id)).toEqual(["v1", "c", "v2", "c", "b", "c"]);
    expect(stepSlot(arranged, 1, 1)).toMatchObject({ slot: 2, section: { id: "v2" } });
    expect(stepSlot(arranged, 5, 1)).toBeNull();
    expect(stepSlot(arranged, 0, -1)).toBeNull();
    expect(stepSlot(arranged, null, 1)?.slot).toBe(0);
  });

  it("clicking a part goes to its next place in the order", () => {
    expect(slotFor(arranged, "c", null)).toBe(1);
    expect(slotFor(arranged, "c", 2)).toBe(3);
    expect(slotFor(arranged, "c", 3)).toBe(3);
    expect(slotFor(arranged, "c", 5)).toBe(5);
    expect(slotFor(arranged, "v1", 4)).toBe(0);
  });

  it("drops unknown parts and an order that is just the sections", () => {
    expect(cleanOrder(["v1", "zz", "c"], song.sections)).toEqual(["v1", "c"]);
    expect(cleanOrder(["v1", "v2", "c", "b"], song.sections)).toBeUndefined();
    expect(cleanOrder("v1", song.sections)).toBeUndefined();
  });

  it("puts the chorus after each verse", () => {
    expect(chorusAfterVerses(song)).toEqual(["v1", "c", "v2", "c", "b", "c"]);
  });

  it("reads OpenLyrics and Planning Center names", () => {
    expect(orderFromNames(song.sections, "v1 c v2 c b c c".split(" "))).toEqual(["v1", "c", "v2", "c", "b", "c", "c"]);
    expect(orderFromNames(song.sections, ["Verse 1", "Chorus", "Verse 2", "CHORUS", "Bridge", "Outro"])).toEqual(["v1", "c", "v2", "c", "b"]);
  });
});

describe("OpenLyrics order", () => {
  it("reads verseOrder and writes the order back", async () => {
    const { parseOpenLyrics, songToOpenLyrics } = await import("./openlyrics");
    const xml = `<song xmlns="http://openlyrics.info/namespace/2009/song"><properties><titles><title>T</title></titles><verseOrder>v1 c v2 c</verseOrder></properties><lyrics><verse name="v1"><lines>one</lines></verse><verse name="c"><lines>chorus</lines></verse><verse name="v2"><lines>two</lines></verse></lyrics></song>`;
    let n = 0;
    const parsed = parseOpenLyrics(xml, () => `id${++n}`);
    expect(parsed.order).toEqual(["id1", "id2", "id3", "id2"]);
    const back = songToOpenLyrics({ id: "x", title: "T", author: "", sections: parsed.sections, order: parsed.order });
    expect(back).toContain("<verseOrder>v1 c v2 c</verseOrder>");
  });
});
