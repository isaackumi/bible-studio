import { describe, expect, it } from "vitest";
import { songFromEasyWorship, songFromImport } from "./songs";

let n = 0;
const newId = () => `id${(n += 1)}`;

describe("imported songs", () => {
  it("turns a ProPresenter song into a library song, keeping kinds, order and credits", () => {
    const song = songFromImport({ title: "Amazing Grace", author: "John Newton", ccli: "22025", copyright: "1779 Public Domain", parts: [{ id: "G1", label: "Verse 1", lines: ["Amazing grace"] }, { id: "G2", label: "Chorus", lines: ["My chains are gone"] }], order: ["G1", "G2", "G1"] }, "Hymns", newId)!;
    expect(song.sections.map((section) => [section.label, section.kind])).toEqual([["Verse 1", "verse"], ["Chorus", "chorus"]]);
    expect(song.order).toEqual([song.sections[0]!.id, song.sections[1]!.id, song.sections[0]!.id]);
    expect(song).toMatchObject({ title: "Amazing Grace", author: "John Newton", ccli: "22025", copyright: "1779 Public Domain", folder: "Hymns" });
  });

  it("reads EasyWorship words, with part names on their own lines", () => {
    const song = songFromEasyWorship({ title: "Amazing Grace", author: "John Newton", copyright: "", ccli: "22025", words: String.raw`{\rtf1 Verse 1\par Amazing grace how sweet the sound\par\par Chorus\par My chains are gone}` }, "", newId)!;
    expect(song.sections.map((section) => section.label)).toEqual(["Verse 1", "Chorus"]);
    expect(song.sections[0]!.lines).toEqual(["Amazing grace how sweet the sound"]);
    expect(song.ccli).toBe("22025");
  });

  it("skips a song with no words", () => {
    expect(songFromEasyWorship({ title: "Empty", author: "", copyright: "", ccli: "", words: "" }, "", newId)).toBeNull();
  });
});
