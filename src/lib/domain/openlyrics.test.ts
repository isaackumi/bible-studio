import { describe, expect, it } from "vitest";
import { parseOpenLyrics, songFileName, songToOpenLyrics } from "./openlyrics";
import { songFromFile } from "./song";
import type { Song } from "./types";
import { createZip, crc32, readZip } from "./zip";

const ids = () => {
  let n = 0;
  return () => `s${++n}`;
};

const sample = `<?xml version='1.0' encoding='UTF-8'?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.8">
  <properties>
    <titles><title>Sample &amp; Song</title><title lang="es">Canción</title></titles>
    <authors><author type="words">Writer One</author><author>Writer Two</author></authors>
    <copyright>© 2001 Example Co</copyright>
    <ccliNo>555 123</ccliNo>
    <verseOrder>v1 c v2 c</verseOrder>
  </properties>
  <lyrics>
    <verse name="v1"><lines>First <chord name="G"/>line<br/>Second line</lines></verse>
    <verse name="v1" lang="es"><lines>Primera</lines></verse>
    <verse name="c"><lines><comment>softly</comment>Chorus line</lines><lines>More chorus</lines></verse>
    <verse name="v2"><lines>Third line</lines></verse>
    <verse name="p1"><lines>Build up</lines></verse>
  </lyrics>
</song>`;

describe("OpenLyrics", () => {
  it("reads titles, authors, copyright, CCLI and verses, skipping chords, comments and translations", () => {
    const parsed = parseOpenLyrics(sample, ids());
    expect(parsed).toMatchObject({ title: "Sample & Song", author: "Writer One, Writer Two", copyright: "2001 Example Co", ccli: "555123" });
    expect(parsed.sections.map((section) => [section.kind, section.label, section.lines])).toEqual([
      ["verse", "Verse 1", ["First line", "Second line"]],
      ["chorus", "Chorus", ["Chorus line", "More chorus"]],
      ["verse", "Verse 2", ["Third line"]],
      ["tag", "Pre-Chorus 1", ["Build up"]],
    ]);
  });

  it("is picked by the song file reader from .xml or from content", () => {
    expect(songFromFile("anything.xml", sample, "Imported", ids())?.title).toBe("Sample & Song");
    expect(songFromFile("weird.txt", sample, "", ids())?.ccli).toBe("555123");
  });

  it("writes a song that reads back the same", () => {
    const song: Song = {
      id: "x",
      title: "Round <Trip>",
      author: "A Writer, B Writer",
      ccli: "42",
      copyright: "1999 Co & Sons",
      sections: [
        { id: "1", kind: "verse", label: "Verse 1", lines: ["One", "Two"] },
        { id: "2", kind: "chorus", label: "Chorus", lines: ["Three"] },
        { id: "3", kind: "verse", label: "Verse 2", lines: ["Four"] },
      ],
    };
    const xml = songToOpenLyrics(song, new Date("2026-10-17T00:00:00Z"));
    expect(xml).toContain("<verseOrder>v1 c v2</verseOrder>");
    const back = parseOpenLyrics(xml, ids());
    expect(back).toMatchObject({ title: "Round <Trip>", author: "A Writer, B Writer", ccli: "42", copyright: "1999 Co & Sons" });
    expect(back.sections.map((section) => [section.label, section.lines])).toEqual([
      ["Verse 1", ["One", "Two"]],
      ["Chorus", ["Three"]],
      ["Verse 2", ["Four"]],
    ]);
    expect(songFileName({ title: "Holy, Holy / Holy?" })).toBe("Holy Holy Holy.xml");
  });
});

describe("zip", () => {
  it("round-trips stored files with UTF-8 names", async () => {
    const enc = new TextEncoder();
    const zip = createZip([
      { name: "Hymns/Ā song.xml", data: enc.encode("<song/>") },
      { name: "two.txt", data: enc.encode("hello") },
    ]);
    const back = await readZip(zip);
    expect(back.map((entry) => [entry.name, new TextDecoder().decode(entry.data)])).toEqual([
      ["Hymns/Ā song.xml", "<song/>"],
      ["two.txt", "hello"],
    ]);
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
  });

  it("rejects a file that is not a zip", async () => {
    await expect(readZip(new TextEncoder().encode("not a zip at all, just some text here"))).rejects.toThrow(/not a ZIP/);
  });
});
