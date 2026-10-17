import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState, frame, setPreview } from "./live";
import { presentLyrics } from "./present";
import { recentSongHits, searchSongHits } from "./song-search";
import { lyricsFor } from "./song";
import { defaultTheme } from "./theme";
import type { Song } from "./types";

const theme = defaultTheme();

const morning: Song = {
  id: "song-1",
  title: "Morning light",
  author: "Ada",
  sections: [
    { id: "v1", kind: "verse", label: "Verse 1", lines: ["First light on the hill"] },
    { id: "c1", kind: "chorus", label: "Chorus", lines: ["Sing again"] },
  ],
};

const grace: Song = {
  id: "song-2",
  title: "Grace",
  author: "Newton",
  sections: [{ id: "v1", kind: "verse", label: "Verse 1", lines: ["Amazing grace, how sweet the sound"] }],
};

describe("song search hits", () => {
  it("matches title, author, and lyric text and keeps a snippet", () => {
    expect([...new Set(searchSongHits([morning, grace], "morning").map((hit) => hit.songId))]).toEqual(["song-1"]);
    expect(searchSongHits([morning, grace], "newton").map((hit) => `${hit.songId}:${hit.sectionId}`)).toEqual(["song-2:v1"]);
    const lyric = searchSongHits([morning, grace], "sweet the sound");
    expect(lyric).toHaveLength(1);
    expect(lyric[0]?.sectionId).toBe("v1");
    expect(lyric[0]?.snippet).toMatch(/Amazing grace/i);
  });

  it("forgives slips and partial words, exact phrase first", () => {
    const ids = (query: string) => searchSongHits([morning, grace], query).map((hit) => hit.songId);
    expect(ids("amazng grase")[0]).toBe("song-2");
    expect(ids("how swet the sond")[0]).toBe("song-2");
    expect(ids("amaz")).toEqual(["song-2"]);
    expect(ids("mornin ligt")[0]).toBe("song-1");
    expect(ids("zebra")).toEqual([]);
    const both: Song = { ...grace, id: "song-3", title: "Sweet sound", sections: [{ id: "v1", kind: "verse", label: "Verse 1", lines: ["Grace so amazing"] }] };
    expect(ids.call(null, "sweet the sound")).toEqual(["song-2"]);
    expect(searchSongHits([both, grace], "sweet the sound").map((hit) => hit.songId)[0]).toBe("song-2");
  });

  it("returns recent section hits when the query is empty", () => {
    expect(searchSongHits([morning, grace], "   ")).toEqual([]);
    const recent = recentSongHits([morning, grace], [
      { songId: "song-2", sectionId: "v1" },
      { songId: "missing", sectionId: "x" },
    ]);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.title).toBe("Grace");
  });

  it("a selected hit compiles to Preview lyrics and does not change Program", () => {
    const hit = searchSongHits([morning], "sing again")[0];
    expect(hit).toBeTruthy();
    const lyrics = lyricsFor(morning, hit!.sectionId, morning.title);
    const model = presentLyrics({ theme, label: lyrics.label, lines: lyrics.lines });
    expect(JSON.stringify(model)).not.toMatch(/newton/i);
    let live = createLiveState(theme);
    const program = live.program;
    live = setPreview(live, frame(model, `song:${hit!.songId}:${hit!.sectionId}`, "cut"));
    expect(live.program).toEqual(program);
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.lines.map((line) => line.text)).toEqual(["Sing again"]);
  });
});
