import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState, frame, sameProgram, setPreview } from "./live";
import { presentLyrics, presentScripture } from "./present";
import { defaultTheme, sanitizeTheme } from "./theme";
import type { Song } from "./types";
import { lyricsFor, moveSongSection, parseLyrics, sanitizeSong, sectionPlace, songError, stepSongSection } from "./song";

const theme = defaultTheme();

const hymn: Song = {
  id: "song-1",
  title: "Morning light",
  author: "Ada",
  sections: [
    { id: "v1", kind: "verse", label: "Verse 1", lines: ["First line"] },
    { id: "c1", kind: "chorus", label: "Chorus", lines: ["Sing again"] },
    { id: "b1", kind: "bridge", label: "Bridge", lines: ["Hold"] },
  ],
};

describe("song sections", () => {
  it("keeps section order and ids while stepping and reordering", () => {
    expect(hymn.sections.map((section) => section.kind)).toEqual(["verse", "chorus", "bridge"]);
    expect(stepSongSection(hymn, "v1", 1)?.id).toBe("c1");
    expect(stepSongSection(hymn, "c1", -1)?.id).toBe("v1");
    expect(stepSongSection(hymn, "v1", -1)?.id).toBe("v1");
    expect(stepSongSection(hymn, "b1", 1)?.id).toBe("b1");
    const moved = moveSongSection(hymn, "c1", -1);
    expect(moved.sections.map((section) => section.id)).toEqual(["c1", "v1", "b1"]);
    expect(sectionPlace(moved, "v1")).toEqual({ index: 1, count: 3, label: "Verse 1" });
  });

  it("repairs a bad section and rejects a song with no title or lyric line", () => {
    const repaired = sanitizeSong({
      id: "song-2",
      title: "  Evening  ",
      author: " Ada ",
      sections: [{ id: "s1", kind: "solo" as "verse", label: "", lines: ["  One line  "] }],
    });
    expect(repaired.title).toBe("Evening");
    expect(repaired.author).toBe("Ada");
    expect(repaired.sections[0]).toMatchObject({ id: "s1", kind: "verse", label: "Verse 1" });
    expect(songError(sanitizeSong({ ...hymn, title: " " }))).toMatch(/title/i);
    expect(songError(sanitizeSong({ ...hymn, sections: [] }))).toMatch(/section/i);
    expect(songError(repaired)).toBeNull();
  });

  it("selects and steps a song on preview only, then take publishes that section", () => {
    let state = createLiveState(theme);
    const before = state;
    const verse = presentLyrics({ theme, label: "Verse 1", lines: ["First line"] });
    state = setPreview(state, frame(verse, "song:song-1:v1", "cut"));
    expect(sameProgram(before, state)).toBe(true);
    expect(state.preview.model.layout).toBe("lyrics");
    expect(state.program.model.layout).toBe("empty");

    const chorus = presentLyrics({ theme, label: stepSongSection(hymn, "v1", 1)?.label ?? "", lines: ["Sing again"] });
    state = setPreview(state, frame(chorus, "song:song-1:c1", "cut"));
    expect(sameProgram(before, state)).toBe(true);
    expect(state.preview.model.reference).toBe("Chorus");

    state = applyProgramAction(state, "take", theme, { title: "Logo", imageUrl: null });
    expect(state.program.model.reference).toBe("Chorus");
    const onAir = state;
    const lower = presentLyrics({ theme: { ...theme, layout: "lower-third" }, label: "Chorus", lines: ["Sing again"] });
    state = setPreview(state, frame(lower, "song:song-1:c1", "cut"));
    expect(state.preview.model.theme.layout).toBe("lower-third");
    expect(sameProgram(onAir, state)).toBe(true);

    const scripture = presentScripture({
      theme,
      reference: "John 3:16",
      attribution: "KJV",
      verses: [{ verse: 16, text: "For God so loved the world" }],
    });
    state = setPreview(state, frame(scripture, null, "cut"));
    expect(state.preview.model.layout).toBe("scripture");
    expect(state.preview.model.reference).toBe("John 3:16");
    expect(sameProgram(onAir, state)).toBe(true);
    expect(sanitizeTheme({ ...defaultTheme(), layout: undefined as unknown as "frame" }).layout).toBe("frame");
  });

  it("describes a missing section without throwing", () => {
    expect(lyricsFor(undefined, "missing", "Morning light")).toEqual({
      label: "Morning light",
      lines: ["This section is missing."],
    });
    expect(lyricsFor(hymn, "gone", "Morning light").lines).toEqual(["This section is missing."]);
  });
});

describe("paste-to-song lyric import", () => {
  let n = 0;
  const id = () => `s${++n}`;

  it("splits plain lyrics on blank lines and reads section headers", () => {
    const parsed = parseLyrics(
      "Amazing Grace\n\nVerse 1\nAmazing grace how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\nMy chains are gone\nI've been set free\n\nBridge:\nThe earth shall soon dissolve like snow\n\nAmazing grace how sweet the sound\nThat saved a wretch like me",
      id,
    );
    expect(parsed.title).toBe("Amazing Grace");
    expect(parsed.sections.map((section) => [section.kind, section.label, section.lines.length])).toEqual([
      ["verse", "Verse 1", 2],
      ["chorus", "Chorus", 2],
      ["bridge", "Bridge", 1],
      ["verse", "Verse 2", 2],
    ]);
  });

  it("numbers unlabeled blocks as verses and keeps a repeated chorus label", () => {
    const parsed = parseLyrics("Line one\nLine two\n\nChorus\nSing\n\nLine three\n\nChorus\nSing", id);
    expect(parsed.title).toBeUndefined();
    expect(parsed.sections.map((section) => section.label)).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"]);
  });

  it("maps pre-chorus, intro, outro and ending to sensible kinds", () => {
    const parsed = parseLyrics("Pre-Chorus\nRise\n\nOutro\nAmen\n\nIntro\nHum", id);
    expect(parsed.sections.map((section) => [section.kind, section.label])).toEqual([
      ["chorus", "Pre-Chorus"],
      ["tag", "Outro"],
      ["tag", "Intro"],
    ]);
  });

  it("reads ChordPro directives and strips chords", () => {
    const parsed = parseLyrics(
      "{title: How Great Is Our God}\n{artist: Chris Tomlin}\n{comment: Verse 1}\n[C]The splendor of a [Am]King\nClothed in [F]majesty\n\n{start_of_chorus}\n[C]How great is our [Am]God\n{end_of_chorus}\n\n{c: Verse 2}\nAnd age to age He stands",
      id,
    );
    expect(parsed.title).toBe("How Great Is Our God");
    expect(parsed.author).toBe("Chris Tomlin");
    expect(parsed.sections.map((section) => [section.kind, section.label, section.lines])).toEqual([
      ["verse", "Verse 1", ["The splendor of a King", "Clothed in majesty"]],
      ["chorus", "Chorus", ["How great is our God"]],
      ["verse", "Verse 2", ["And age to age He stands"]],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseLyrics("   \n\n ", id).sections).toEqual([]);
  });
});
