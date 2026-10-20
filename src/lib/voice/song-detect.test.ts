import { describe, expect, it } from "vitest";
import type { Song } from "../domain/types";
import { buildSongIndex, chooseSung, matchSung, screenForSung } from "./song-detect";

const amazing: Song = {
  id: "amazing",
  title: "Amazing Grace",
  author: "John Newton",
  sections: [
    { id: "v1", kind: "verse", label: "Verse 1", lines: ["Amazing grace how sweet the sound", "That saved a wretch like me"] },
    { id: "v2", kind: "verse", label: "Verse 2", lines: ["Twas grace that taught my heart to fear", "And grace my fears relieved"] },
  ],
};
const how: Song = {
  id: "how-great",
  title: "How Great Thou Art",
  author: "",
  sections: [
    { id: "v1", kind: "verse", label: "Verse 1", lines: ["O Lord my God when I in awesome wonder", "Consider all the worlds thy hands have made"] },
    { id: "c", kind: "chorus", label: "Chorus", lines: ["Then sings my soul my Saviour God to thee", "How great thou art how great thou art"] },
  ],
};
const index = buildSongIndex([amazing, how]);

describe("song detection", () => {
  it("finds the song and section from a sung line, with misheard and missing words", () => {
    expect(matchSung("amazing grace how sweet the sound", index)).toMatchObject({ songId: "amazing", sectionId: "v1" });
    expect(matchSung("that saved a wrench like me", index)).toMatchObject({ songId: "amazing", sectionId: "v1" });
    expect(matchSung("then sings my soul my saviour god", index)).toMatchObject({ songId: "how-great", sectionId: "c" });
    expect(matchSung("grace that taught my heart to fear", index)).toMatchObject({ songId: "amazing", sectionId: "v2" });
  });

  it("stays quiet on short or vague speech", () => {
    expect(matchSung("grace", index)).toBeNull();
    expect(matchSung("good morning church please be seated", index)).toBeNull();
    expect(matchSung("", buildSongIndex([]))).toBeNull();
  });

  it("follows the song on screen when a line fits two songs equally", () => {
    const copy: Song = { ...amazing, id: "amazing-2", title: "Amazing Grace (My Chains)" };
    const both = buildSongIndex([amazing, copy]);
    expect(matchSung("amazing grace how sweet the sound", both)).toBeNull();
    expect(matchSung("amazing grace how sweet the sound", both, "amazing-2")).toMatchObject({ songId: "amazing-2" });
  });

  it("keeps the strongest recognizer alternative", () => {
    expect(chooseSung(["hello there friends", "how great thou art how great thou art"], index)).toMatchObject({ songId: "how-great", sectionId: "c" });
  });
});

describe("following a song line by line", () => {
  const lines = ["Amazing grace how sweet the sound", "That saved a wretch like me", "I once was lost but now am found", "Was blind but now I see"];
  const screens = [{ from: 0, to: 2 }, { from: 2, to: 4 }];
  it("picks the screen with the words just sung", () => {
    expect(screenForSung("amazing grace how sweet the sound", lines, screens)).toBe(0);
    expect(screenForSung("that saved a wretch like me i once was lost but now am found", lines, screens)).toBe(1);
  });
  it("keeps the screen showing when the words say nothing", () => {
    expect(screenForSung("hallelujah hallelujah", lines, screens, 1)).toBe(1);
    expect(screenForSung("anything", lines, [{ from: 0, to: 4 }])).toBe(0);
  });
});
