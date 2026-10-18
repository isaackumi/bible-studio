import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState, frame, sameProgram, setPreview } from "./live";
import { presentLyrics, presentScripture } from "./present";
import { defaultTheme, sanitizeTheme } from "./theme";
import type { Song } from "./types";
import { creditFor, filterSongs, lyricsFor, parseSongFile, songCredit, moveSongSection, parseLyrics, sanitizeFolderNames, sanitizeSong, sectionPlace, sectionShort, sectionTone, songError, songFolders, songFromFile, stepSongSection } from "./song";

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
      lines: [{ text: "This section is missing." }],
    });
    expect(lyricsFor(hymn, "gone", "Morning light").lines).toEqual([{ text: "This section is missing." }]);
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

describe("song folders", () => {
  const song = (id: string, title: string, folder?: string, line = "Line one"): Song => ({
    id,
    title,
    author: "",
    sections: [{ id: `${id}-s`, kind: "verse", label: "Verse 1", lines: [line] }],
    ...(folder !== undefined ? { folder } : {}),
  });

  it("keeps a cleaned folder on a song and drops an empty one", () => {
    expect(sanitizeSong(song("a", "A", "  Hymns   Old ")).folder).toBe("Hymns Old");
    expect("folder" in sanitizeSong(song("a", "A", "   "))).toBe(false);
  });

  it("lists saved and used folders once each, with counts", () => {
    const songs = [song("a", "A", "Hymns"), song("b", "B", "hymns"), song("c", "C", "Worship"), song("d", "D")];
    expect(songFolders(songs, ["Christmas", "Hymns"])).toEqual([
      { name: "Christmas", count: 0 },
      { name: "Hymns", count: 2 },
      { name: "Worship", count: 1 },
    ]);
    expect(sanitizeFolderNames(["Hymns", " hymns ", "", 4, "Kids"])).toEqual(["Hymns", "Kids"]);
  });

  it("filters by folder and query, title matches before lyric matches", () => {
    const songs = [song("a", "Zion", "Hymns", "grace abounds"), song("b", "Grace Alone", "Hymns"), song("c", "Other", "Worship", "grace")];
    expect(filterSongs(songs, "Hymns", "grace").map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(filterSongs(songs, null, "").map((entry) => entry.id)).toEqual(["b", "c", "a"]);
  });

  it("makes a song from a lyric file, titled by the file when the file has no title", () => {
    let n = 0;
    const id = () => `id${++n}`;
    const made = songFromFile("blessed_assurance.txt", "Blessed assurance Jesus is mine\nOh what a foretaste\n\nThis is my story", "Hymns", id);
    expect(made).toMatchObject({ title: "blessed assurance", folder: "Hymns" });
    expect(made?.sections).toHaveLength(2);
    expect(songFromFile("empty.txt", "   \n\n", "Hymns", id)).toBeNull();
  });
});

describe("song copyright and SongSelect files", () => {
  const ids = () => {
    let n = 0;
    return () => `s${++n}`;
  };

  it("keeps a clean CCLI number and copyright, and builds the credit line", () => {
    const song = sanitizeSong({ id: "a", title: "A", author: "", sections: [{ id: "x", kind: "verse", label: "Verse 1", lines: ["l"] }], ccli: "CCLI # 1234 567", copyright: "© 2010 Example Music" });
    expect(song.ccli).toBe("1234567");
    expect(song.copyright).toBe("2010 Example Music");
    expect(songCredit(song, "  99 88 ")).toBe("© 2010 Example Music · CCLI Song # 1234567 · CCLI License # 9988");
    expect(songCredit({ copyright: "", ccli: "" }, "9988")).toBe("");
  });

  it("puts the credit on the first and last section only", () => {
    const song: Song = {
      id: "a",
      title: "A",
      author: "",
      ccli: "1",
      sections: ["v1", "c", "v2"].map((id) => ({ id, kind: "verse" as const, label: id, lines: ["l"] })),
    };
    expect(creditFor(song, "v1", "")).toBe("CCLI Song # 1");
    expect(creditFor(song, "c", "")).toBeNull();
    expect(creditFor(song, "v2", "")).toBe("CCLI Song # 1");
  });

  it("reads ChordPro ccli and copyright tags", () => {
    const parsed = parseLyrics("{title: T}\n{ccli: 777}\n{copyright: 1999 Someone}\nLine one\nLine two", ids());
    expect(parsed).toMatchObject({ title: "T", ccli: "777", copyright: "1999 Someone" });
  });

  it("reads a SongSelect .usr file", () => {
    const usr = [
      "[File]",
      "Type=SongSelect Import File",
      "Version=3.0",
      "[S A1234567]",
      "Title=Example Song",
      "Author=First Writer | Second Writer",
      "Copyright=2015 Example Publishing | Other Music",
      "Fields=Verse 1/tChorus/tVerse 2",
      "Words=Line a/nLine b/tChorus a/nChorus b/tLine c",
    ].join("\r\n");
    const parsed = parseSongFile("example.usr", usr, ids());
    expect(parsed).toMatchObject({ title: "Example Song", author: "First Writer, Second Writer", ccli: "1234567", copyright: "2015 Example Publishing, Other Music" });
    expect(parsed.sections.map((section) => [section.kind, section.label, section.lines.length])).toEqual([
      ["verse", "Verse 1", 2],
      ["chorus", "Chorus", 2],
      ["verse", "Verse 2", 1],
    ]);
  });

  it("reads a SongSelect lyrics text file and drops its footer from the lyrics", () => {
    const txt = [
      "Example Song",
      "",
      "Verse 1",
      "Line a",
      "Line b",
      "",
      "Chorus",
      "Chorus a",
      "",
      "CCLI Song # 7654321",
      "First Writer | Second Writer",
      "© 2015 Example Publishing",
      "For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com",
      "CCLI License # 11111",
    ].join("\n");
    const song = songFromFile("whatever.txt", txt, "Worship", ids());
    expect(song).toMatchObject({ title: "Example Song", author: "First Writer, Second Writer", ccli: "7654321", copyright: "2015 Example Publishing", folder: "Worship" });
    expect(song?.sections.map((section) => section.label)).toEqual(["Verse 1", "Chorus"]);
    expect(song?.sections.flatMap((section) => section.lines).join(" ")).not.toMatch(/CCLI|Terms|©/);
  });
});

describe("section colours and short names", () => {
  const at = (kind: "verse" | "chorus" | "bridge" | "tag", label: string) => ({ kind, label });
  it("reads the label first, then the kind", () => {
    expect(sectionTone(at("chorus", "Pre-Chorus"))).toBe("pre-chorus");
    expect(sectionTone(at("verse", "Chorus 2"))).toBe("chorus");
    expect(sectionTone(at("verse", "Refrain"))).toBe("chorus");
    expect(sectionTone(at("tag", "Outro"))).toBe("ending");
    expect(sectionTone(at("bridge", "Part B"))).toBe("bridge");
    expect(sectionTone(at("verse", "Verse 3"))).toBe("verse");
  });
  it("abbreviates for the song map", () => {
    expect(sectionShort(at("verse", "Verse 2"))).toBe("V2");
    expect(sectionShort(at("chorus", "Chorus"))).toBe("C");
    expect(sectionShort(at("chorus", "Pre-Chorus"))).toBe("PC");
    expect(sectionShort(at("bridge", "Bridge 2"))).toBe("B2");
    expect(sectionShort(at("tag", "Intro"))).toBe("I");
    expect(sectionShort(at("tag", "Tag"))).toBe("T");
  });
});

describe("songs in two languages", () => {
  it("shows the first, the second, or both line by line", async () => {
    const { lyricsFor } = await import("./song");
    const song = {
      id: "s",
      title: "Placeholder",
      author: "",
      secondLanguage: "Twi",
      sections: [{ id: "v", kind: "verse" as const, label: "Verse 1", lines: ["first line one", "first line two"], second: ["second line one", "second line two", "second line three"] }],
    };
    expect(lyricsFor(song, "v", "", "first").lines).toEqual([{ text: "first line one" }, { text: "first line two" }]);
    expect(lyricsFor(song, "v", "", "second").lines.map((line) => line.text)).toEqual(["second line one", "second line two", "second line three"]);
    expect(lyricsFor(song, "v", "", "both").lines).toEqual([
      { text: "first line one", alt: "second line one" },
      { text: "first line two", alt: "second line two" },
      { text: "second line three" },
    ]);
    // A section without the second language shows the first whatever is chosen.
    const plain = { ...song, sections: [{ ...song.sections[0]!, second: [] }] };
    expect(lyricsFor(plain, "v", "", "second").lines.map((line) => line.text)).toEqual(["first line one", "first line two"]);
  });
});
