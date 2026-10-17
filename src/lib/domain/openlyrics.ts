import type { Song, SongSection, SongSectionKind } from "./types";

// OpenLyrics (openlyrics.org) is the open XML format for worship songs: one song per file, used
// by OpenLP, FreeShow and others. This reads the parts a lyric projector needs (titles, authors,
// copyright, CCLI number, verses) and writes the same back. No DOM: it runs in tests and workers.

export type ParsedOpenLyrics = { title?: string; author?: string; ccli?: string; copyright?: string; sections: SongSection[] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const value = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function encode(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Text of every <tag>…</tag> (namespace prefixes allowed), with inner markup removed. */
function texts(xml: string, tag: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "gi");
  for (const match of xml.matchAll(pattern)) found.push(decode(match[1]!.replace(/<[^>]+>/g, "")).trim());
  return found.filter(Boolean);
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? decode(match[2] ?? match[3] ?? "") : null;
}

const KIND_BY_LETTER: Record<string, { kind: SongSectionKind; label: string }> = {
  v: { kind: "verse", label: "Verse" },
  c: { kind: "chorus", label: "Chorus" },
  b: { kind: "bridge", label: "Bridge" },
  p: { kind: "tag", label: "Pre-Chorus" },
  i: { kind: "tag", label: "Intro" },
  e: { kind: "tag", label: "Ending" },
  o: { kind: "tag", label: "Other" },
};

/** "v1" → Verse 1, "c" → Chorus, "c2" → Chorus 2, "p1" → Pre-Chorus 1. */
function sectionName(name: string): { kind: SongSectionKind; label: string } {
  const match = /^([a-z])(\d*)([a-z]?)$/i.exec(name.trim());
  const known = match ? KIND_BY_LETTER[match[1]!.toLowerCase()] : undefined;
  if (!known) return { kind: "verse", label: name.trim() || "Verse" };
  const number = match![2] ? ` ${match![2]}` : known.kind === "verse" ? " 1" : "";
  return { kind: known.kind, label: `${known.label}${number}${match![3] ? match![3] : ""}` };
}

/** Lines of one <lines> block: <br/> breaks lines, chords and comments drop out. */
function linesOf(block: string): string[] {
  const withBreaks = block
    .replace(/<(?:\w+:)?comment\b[^>]*>[\s\S]*?<\/(?:\w+:)?comment>/gi, "")
    .replace(/<(?:\w+:)?br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decode(withBreaks)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function isOpenLyrics(text: string): boolean {
  return /<(?:\w+:)?song\b[^>]*openlyrics/i.test(text) || (/<(?:\w+:)?song\b/i.test(text) && /<(?:\w+:)?lyrics\b/i.test(text));
}

export function parseOpenLyrics(xml: string, newId: () => string = () => crypto.randomUUID()): ParsedOpenLyrics {
  const properties = /<(?:\w+:)?properties\b[^>]*>([\s\S]*?)<\/(?:\w+:)?properties>/i.exec(xml)?.[1] ?? "";
  const title = texts(properties, "title")[0];
  const author = [...new Set(texts(properties, "author"))].join(", ");
  const copyright = texts(properties, "copyright")[0]?.replace(/^\s*(©|\(c\)|copyright)\s*/i, "");
  const ccli = (texts(properties, "ccliNo")[0] ?? "").replace(/\D+/g, "");
  const lyrics = /<(?:\w+:)?lyrics\b[^>]*>([\s\S]*?)<\/(?:\w+:)?lyrics>/i.exec(xml)?.[1] ?? "";

  // A song may carry each verse in several languages (lang="…"): keep the first one of each name.
  const seen = new Set<string>();
  const sections: SongSection[] = [];
  for (const match of lyrics.matchAll(/<(?:\w+:)?verse\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?verse>/gi)) {
    const name = attr(match[1]!, "name") ?? `v${sections.length + 1}`;
    if (seen.has(name)) continue;
    seen.add(name);
    const lines = [...match[2]!.matchAll(/<(?:\w+:)?lines\b[^>]*>([\s\S]*?)<\/(?:\w+:)?lines>/gi)].flatMap((block) => linesOf(block[1]!));
    if (lines.length === 0) continue;
    sections.push({ id: newId(), ...sectionName(name), lines });
  }
  return {
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
    ...(ccli ? { ccli } : {}),
    ...(copyright ? { copyright } : {}),
    sections,
  };
}

/** Section names for export: v1, v2, c, c2, b, p1… unique within the song. */
function exportNames(sections: SongSection[]): string[] {
  const counts = new Map<string, number>();
  return sections.map((section) => {
    const letter = section.kind === "chorus" ? "c" : section.kind === "bridge" ? "b" : section.kind === "tag" ? (/pre/i.test(section.label) ? "p" : /intro/i.test(section.label) ? "i" : /end/i.test(section.label) ? "e" : "o") : "v";
    const count = (counts.get(letter) ?? 0) + 1;
    counts.set(letter, count);
    return letter === "v" || count > 1 ? `${letter}${count}` : letter;
  });
}

export function songToOpenLyrics(song: Song, now = new Date()): string {
  const names = exportNames(song.sections);
  const authors = song.author.split(/\s*[,|&]\s*|\s+and\s+/i).map((name) => name.trim()).filter(Boolean);
  const props = [
    `    <titles>\n      <title>${encode(song.title)}</title>\n    </titles>`,
    authors.length ? `    <authors>\n${authors.map((name) => `      <author>${encode(name)}</author>`).join("\n")}\n    </authors>` : "",
    song.copyright ? `    <copyright>${encode(song.copyright)}</copyright>` : "",
    song.ccli ? `    <ccliNo>${encode(song.ccli)}</ccliNo>` : "",
    `    <verseOrder>${names.join(" ")}</verseOrder>`,
  ].filter(Boolean);
  const verses = song.sections.map(
    (section, index) =>
      `    <verse name="${names[index]}">\n      <lines>${section.lines.filter((line) => line.trim()).map((line) => encode(line.trim())).join("<br/>")}</lines>\n    </verse>`,
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9" createdIn="Church Studio" modifiedIn="Church Studio" modifiedDate="${now.toISOString().slice(0, 19)}">`,
    `  <properties>`,
    ...props,
    `  </properties>`,
    `  <lyrics>`,
    ...verses,
    `  </lyrics>`,
    `</song>`,
    ``,
  ].join("\n");
}

/** A safe file name for a song: letters, digits, spaces and dashes. */
export function songFileName(song: Pick<Song, "title">, extension = "xml"): string {
  const base = song.title.normalize("NFKD").replace(/[^\w\s-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled song";
  return `${base}.${extension}`;
}
