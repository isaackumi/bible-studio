import { sanitizeRich } from "./rich-text";
import { isOpenLyrics, parseOpenLyrics } from "./openlyrics";
import { cleanOrder } from "./song-order";
import { moveInList } from "./service";
import type { PresentationLine, Song, SongSection, SongSectionKind } from "./types";

const KINDS = new Set<SongSectionKind>(["verse", "chorus", "bridge", "tag"]);

function defaultLabel(kind: SongSectionKind, existing: SongSection[]): string {
  if (kind === "chorus") return "Chorus";
  if (kind === "bridge") return "Bridge";
  if (kind === "tag") return "Tag";
  return `Verse ${existing.filter((section) => section.kind === "verse").length + 1}`;
}

export function sanitizeSong(song: Song): Song {
  const sections: SongSection[] = [];
  for (const section of song.sections ?? []) {
    if (!section || typeof section.id !== "string" || !section.id) continue;
    const kind = KINDS.has(section.kind) ? section.kind : "verse";
    const lines = Array.isArray(section.lines) ? section.lines.map((line) => String(line)) : [];
    // Formatted lyrics are one block per line. They are kept only while their words match the
    // lines: anything that changed the words without them (an import, a split) wins, plainly.
    const formatted = section.rich ? sanitizeRich(section.rich) : null;
    const trim = (list: string[]) => list.join("\n").replace(/\n+$/, "");
    const rich = formatted && trim(formatted.blocks.map((block) => block.runs.map((run) => run.text).join(""))) === trim(lines) ? formatted : null;
    const label = section.label?.trim() || defaultLabel(kind, sections);
    const second = Array.isArray(section.second) ? section.second.map((line) => String(line)) : [];
    sections.push({ id: section.id, kind, label, lines, ...(second.some((line) => line.trim()) ? { second } : {}), ...(rich ? { rich } : {}) });
  }
  const folder = cleanFolder(song.folder);
  const ccli = cleanCcli(song.ccli);
  const copyright = cleanCopyright(song.copyright);
  const order = cleanOrder(song.order, sections);
  const secondLanguage = typeof song.secondLanguage === "string" ? song.secondLanguage.trim().slice(0, 40) : "";
  return {
    id: song.id,
    title: song.title.trim(),
    author: song.author.trim(),
    sections,
    ...(folder ? { folder } : {}),
    ...(ccli ? { ccli } : {}),
    ...(copyright ? { copyright } : {}),
    ...(order ? { order } : {}),
    ...(secondLanguage ? { secondLanguage } : {}),
  };
}

/** CCLI numbers are digits; anything else (spaces, "#", "CCLI") is dropped. */
export function cleanCcli(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D+/g, "").slice(0, 12) : "";
}

/** A copyright line without a leading "©", "(c)" or "Copyright". */
export function cleanCopyright(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+/g, " ")
    .replace(/^\s*(©|\(c\)|copyright)\s*/i, "")
    .trim()
    .slice(0, 300);
}

/**
 * The small print under a lyric slide: © line, CCLI song number and the church's license.
 * Empty when the song has no copyright details (public-domain hymns, own songs).
 */
export function songCredit(song: Pick<Song, "copyright" | "ccli">, license: string): string {
  const copyright = cleanCopyright(song.copyright);
  const ccli = cleanCcli(song.ccli);
  if (!copyright && !ccli) return "";
  const lic = cleanCcli(license);
  return [copyright ? `© ${copyright}` : "", ccli ? `CCLI Song # ${ccli}` : "", lic ? `CCLI License # ${lic}` : ""].filter(Boolean).join(" · ");
}

/** CCLI asks for the credit at the start or end of a song: show it on the first and last section. */
export function creditFor(song: Song, sectionId: string, license: string): string | null {
  const first = song.sections[0]?.id;
  const last = song.sections[song.sections.length - 1]?.id;
  if (sectionId !== first && sectionId !== last) return null;
  return songCredit(song, license) || null;
}

/** A folder name: trimmed, single-spaced, at most 60 characters. Empty means no folder. */
export function cleanFolder(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 60) : "";
}

export function sanitizeFolderNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of value) {
    const name = cleanFolder(entry);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
}

/** Every folder: the saved (possibly empty) ones plus any a song names, sorted, with counts. */
export function songFolders(songs: Song[], saved: string[]): { name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const name of saved) counts.set(name.toLowerCase(), { name, count: 0 });
  for (const song of songs) {
    const name = cleanFolder(song.folder);
    if (!name) continue;
    const entry = counts.get(name.toLowerCase());
    if (entry) entry.count += 1;
    else counts.set(name.toLowerCase(), { name, count: 1 });
  }
  return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Songs in a folder (null: all songs) matching a query in title, author or lyrics. Title matches first. */
export function filterSongs(songs: Song[], folder: string | null, query: string): Song[] {
  const needle = query.trim().toLowerCase();
  const inFolder = folder === null ? songs : songs.filter((song) => cleanFolder(song.folder).toLowerCase() === folder.toLowerCase());
  const byTitle = (a: Song, b: Song) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  if (!needle) return [...inFolder].sort(byTitle);
  const head: Song[] = [];
  const body: Song[] = [];
  for (const song of inFolder) {
    if (`${song.title} ${song.author}`.toLowerCase().includes(needle)) head.push(song);
    else if (song.sections.some((section) => section.lines.join(" ").toLowerCase().includes(needle))) body.push(song);
  }
  return [...head.sort(byTitle), ...body.sort(byTitle)];
}

/** A song from a lyric or ChordPro file. The title falls back to the file name. Null when no lyrics. */
export function songFromFile(filename: string, text: string, folder: string, newId: () => string = () => crypto.randomUUID()): Song | null {
  const parsed = parseSongFile(filename, text, newId);
  if (parsed.sections.length === 0) return null;
  const fallback = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled song";
  return sanitizeSong({
    id: newId(),
    title: parsed.title?.trim() || fallback,
    author: parsed.author?.trim() ?? "",
    sections: parsed.sections,
    folder,
    ...(parsed.ccli ? { ccli: parsed.ccli } : {}),
    ...(parsed.copyright ? { copyright: parsed.copyright } : {}),
    ...(parsed.order ? { order: parsed.order } : {}),
    ...(parsed.secondLanguage ? { secondLanguage: parsed.secondLanguage } : {}),
  });
}

export function songError(song: Song): string | null {
  if (!song.title.trim()) return "Add a song title.";
  if (song.sections.length === 0) return "Add a section.";
  if (song.sections.some((section) => !section.lines.some((line) => line.trim()))) return "Each section needs a line.";
  return null;
}

/** Next or previous section. Stays on the current section at either end. */
export function stepSongSection(song: Song, sectionId: string | null, direction: 1 | -1): SongSection | null {
  if (song.sections.length === 0) return null;
  const index = song.sections.findIndex((section) => section.id === sectionId);
  const next = index === -1 ? (direction > 0 ? 0 : song.sections.length - 1) : index + direction;
  if (next < 0 || next >= song.sections.length) return song.sections[index] ?? song.sections[0] ?? null;
  return song.sections[next] ?? null;
}

export function moveSongSection(song: Song, sectionId: string, direction: 1 | -1): Song {
  const index = song.sections.findIndex((section) => section.id === sectionId);
  return { ...song, sections: moveInList(song.sections, index, direction) };
}

export function removeSongSection(song: Song, sectionId: string): Song {
  return { ...song, sections: song.sections.filter((section) => section.id !== sectionId) };
}

export function sectionPlace(song: Song, sectionId: string): { index: number; count: number; label: string } | null {
  const index = song.sections.findIndex((section) => section.id === sectionId);
  const section = song.sections[index];
  if (!section || index < 0) return null;
  return { index, count: song.sections.length, label: section.label };
}

/** Songs in two languages: show the first, the second, or both (the second under each line). */
export type SongLanguage = "first" | "second" | "both";

/**
 * A section's words for the screen. With a second language, `language` picks what shows; "both"
 * pairs the lines (the second under the first), and a missing second language falls back to the first.
 */
export function lyricsFor(
  song: Song | undefined,
  sectionId: string,
  fallbackTitle: string,
  language: SongLanguage = "first",
  /** One screen of the part (song-screens.ts); missing: the whole part. */
  range?: { from: number; to: number },
): { label: string; lines: PresentationLine[] } {
  const section = song?.sections.find((entry) => entry.id === sectionId);
  if (!song || !section) return { label: fallbackTitle || "Song", lines: [{ text: "This section is missing." }] };
  const inRange = (n: number) => !range || (n >= range.from && n < range.to);
  // First-language lines carry their formatting (block n of `rich` is line n).
  const first: PresentationLine[] = section.lines
    .map((text, n): PresentationLine | null => {
      if (!inRange(n)) return null;
      const runs = section.rich?.blocks[n]?.runs;
      return runs?.some((run) => Object.keys(run).length > 1) ? { text, runs } : { text };
    })
    .filter((line): line is PresentationLine => !!line && !!line.text.trim());
  // The second language's line n goes with the first language's line n.
  const second = (section.second ?? []).filter((line, n) => inRange(n) && line.trim());
  if (!first.length && !second.length) return { label: section.label, lines: [{ text: "This section is empty." }] };
  if (!second.length || language === "first") return { label: section.label, lines: first.length ? first : second.map((text) => ({ text })) };
  if (language === "second" || !first.length) return { label: section.label, lines: second.map((text) => ({ text })) };
  const rows = Math.max(first.length, second.length);
  const lines: PresentationLine[] = [];
  for (let n = 0; n < rows; n += 1) {
    const line = first[n];
    const alt = second[n];
    if (line) lines.push(alt ? { ...line, alt } : line);
    else if (alt) lines.push({ text: alt });
  }
  return { label: section.label, lines };
}

/** How a section is coloured and abbreviated on the desk. The label wins (people rename sections), then the kind. */
export type SectionTone = "verse" | "pre-chorus" | "chorus" | "bridge" | "ending";

export function sectionTone(section: Pick<SongSection, "kind" | "label">): SectionTone {
  const label = section.label.trim().toLowerCase();
  if (/^pre[- ]?chorus/.test(label)) return "pre-chorus";
  if (/^(chorus|refrain)/.test(label)) return "chorus";
  if (/^bridge/.test(label)) return "bridge";
  if (/^(tag|outro|ending|intro|coda|interlude|vamp)/.test(label)) return "ending";
  if (/^verse/.test(label)) return "verse";
  return section.kind === "tag" ? "ending" : section.kind;
}

/** "Verse 2" → "V2", "Chorus" → "C", "Pre-Chorus" → "PC", "Bridge 2" → "B2", "Intro" → "I", "Tag" → "T". */
export function sectionShort(section: Pick<SongSection, "kind" | "label">): string {
  const number = section.label.match(/(\d+)\s*$/)?.[1] ?? "";
  const tone = sectionTone(section);
  if (tone === "ending") {
    const word = section.label.trim().toLowerCase().replace(/\s*\d+$/, "");
    const ENDINGS: Record<string, string> = { intro: "I", outro: "O", ending: "E", coda: "Co", interlude: "It", vamp: "Va" };
    return (ENDINGS[word] ?? "T") + number;
  }
  return { verse: "V", "pre-chorus": "PC", chorus: "C", bridge: "B" }[tone] + number;
}

const HEADERS: Array<[RegExp, SongSectionKind, string | null]> = [
  [/^pre[- ]?chorus(?:\s+\d+)?$/i, "chorus", "Pre-Chorus"],
  [/^chorus(?:\s+\d+)?$/i, "chorus", null],
  [/^refrain$/i, "chorus", "Chorus"],
  [/^verse(?:\s+\d+)?$/i, "verse", null],
  [/^bridge(?:\s+\d+)?$/i, "bridge", null],
  [/^(?:tag|outro|ending|intro|coda|interlude)(?:\s+\d+)?$/i, "tag", null],
];

/** "[Verse 1]" / "Chorus:" / "(Bridge)" → a known section header, else null. */
function readHeader(line: string): { kind: SongSectionKind; label: string } | null {
  const bare = line.trim().replace(/^[[(]\s*|\s*[\])]$/g, "").replace(/:$/, "").trim();
  if (!bare || bare.length > 24) return null;
  for (const [pattern, kind, label] of HEADERS) {
    if (pattern.test(bare)) return { kind, label: label ?? bare.replace(/\b\w/g, (letter) => letter.toUpperCase()) };
  }
  return null;
}

const stripChords = (line: string) => line.replace(/\[[^\]]*\]/g, "").replace(/\s{2,}/g, " ").trim();

/**
 * Turn pasted lyrics or a ChordPro file into song sections. Blank lines separate sections;
 * headers like "Verse 1", "[Chorus]" or "Bridge:" name them; unlabeled blocks become numbered
 * verses. A lone first line followed by a blank line is taken as the title.
 */
export function parseLyrics(
  text: string,
  newId: () => string = () => crypto.randomUUID(),
): { title?: string; author?: string; ccli?: string; copyright?: string; sections: SongSection[] } {
  let title: string | undefined;
  let author: string | undefined;
  let ccli: string | undefined;
  let copyright: string | undefined;
  const blocks: Array<{ header: { kind: SongSectionKind; label: string } | null; lines: string[] }> = [];
  let current: (typeof blocks)[number] | null = null;
  const close = () => {
    if (current && current.lines.length) blocks.push(current);
    current = null;
  };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    const directive = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line);
    if (directive) {
      const name = directive[1]!.toLowerCase();
      const value = (directive[2] ?? "").trim();
      if (name === "title" || name === "t") title = value || title;
      else if (name === "ccli") ccli = cleanCcli(value) || ccli;
      else if (name === "copyright" || name === "footer") copyright = cleanCopyright(value) || copyright;
      else if (name === "artist" || name === "subtitle" || name === "st" || name === "composer") author = author || value || undefined;
      else if (name === "start_of_chorus" || name === "soc") {
        close();
        current = { header: { kind: "chorus", label: "Chorus" }, lines: [] };
      } else if (name === "start_of_bridge" || name === "sob") {
        close();
        current = { header: { kind: "bridge", label: "Bridge" }, lines: [] };
      } else if (name === "start_of_verse" || name === "sov") {
        close();
        current = { header: null, lines: [] };
      } else if (name.startsWith("end_of_") || name === "eoc" || name === "eob" || name === "eov") close();
      else if (name === "comment" || name === "c" || name === "comment_italic" || name === "ci") {
        const header = readHeader(value);
        if (header) {
          close();
          current = { header, lines: [] };
        }
      }
      continue;
    }
    if (!line) {
      close();
      continue;
    }
    const header = readHeader(line);
    if (header) {
      close();
      current = { header, lines: [] };
      continue;
    }
    current ??= { header: null, lines: [] };
    const lyric = stripChords(line);
    if (lyric) current.lines.push(lyric);
  }
  close();

  // A single unlabeled one-line block at the top is the title, when no {title} was given.
  if (!title && blocks.length > 1 && !blocks[0]!.header && blocks[0]!.lines.length === 1) {
    title = blocks.shift()!.lines[0];
  }

  const sections: SongSection[] = [];
  for (const block of blocks) {
    const kind = block.header?.kind ?? "verse";
    const label = block.header?.label && !(kind === "verse" && /^verse$/i.test(block.header.label))
      ? block.header.label
      : defaultLabel(kind, sections);
    sections.push({ id: newId(), kind, label, lines: block.lines });
  }
  return { ...(title ? { title } : {}), ...(author ? { author } : {}), ...(ccli ? { ccli } : {}), ...(copyright ? { copyright } : {}), sections };
}

type ParsedSong = { title?: string; author?: string; ccli?: string; copyright?: string; sections: SongSection[]; order?: string[]; secondLanguage?: string };

/** Pick the reader by file name and content: OpenLyrics, SongSelect .usr, SongSelect text, else plain lyrics / ChordPro. */
export function parseSongFile(filename: string, text: string, newId: () => string = () => crypto.randomUUID()): ParsedSong {
  if (/\.xml$/i.test(filename) || isOpenLyrics(text)) return parseOpenLyrics(text, newId);
  if (/\.usr$/i.test(filename) || (/^\s*\[File\]/m.test(text) && /^\s*Type\s*=\s*SongSelect/im.test(text))) return parseSongSelectUsr(text, newId);
  if (/^\s*CCLI Song\s*#/im.test(text)) return parseSongSelectText(text, newId);
  return parseLyrics(text, newId);
}

function sectionFor(label: string, lines: string[], existing: SongSection[], newId: () => string): SongSection {
  const header = readHeader(label);
  const kind = header?.kind ?? "verse";
  return { id: newId(), kind, label: header?.label || label.trim() || defaultLabel(kind, existing), lines };
}

/**
 * SongSelect "USR" download (INI style). Fields= names the sections and Words= holds them, both split
 * by "/t"; lines inside a section are split by "/n". The CCLI number is in the "[S A123…]" header.
 */
export function parseSongSelectUsr(text: string, newId: () => string = () => crypto.randomUUID()): ParsedSong {
  const values = new Map<string, string>();
  let ccli = "";
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const header = /^\[S\s+A?(\d+)\s*\]/i.exec(line);
    if (header) {
      ccli = header[1]!;
      continue;
    }
    const eq = line.indexOf("=");
    if (eq > 0) values.set(line.slice(0, eq).trim().toLowerCase(), line.slice(eq + 1).trim());
  }
  const labels = (values.get("fields") ?? "").split("/t");
  const sections: SongSection[] = [];
  (values.get("words") ?? "").split("/t").forEach((block, index) => {
    const lines = block.split("/n").map((entry) => entry.trim()).filter(Boolean);
    if (lines.length) sections.push(sectionFor(labels[index] ?? "", lines, sections, newId));
  });
  const author = (values.get("author") ?? "").split("|").map((name) => name.trim()).filter(Boolean).join(", ");
  const copyright = cleanCopyright((values.get("copyright") ?? "").split("|").map((part) => part.trim()).filter(Boolean).join(", "));
  const title = values.get("title")?.trim();
  return { ...(title ? { title } : {}), ...(author ? { author } : {}), ...(ccli ? { ccli } : {}), ...(copyright ? { copyright } : {}), sections };
}

/**
 * SongSelect lyrics text download: title, labelled sections, then a footer with "CCLI Song #",
 * the writers, a "©" line, the terms-of-use line and the church's "CCLI License #".
 */
export function parseSongSelectText(text: string, newId: () => string = () => crypto.randomUUID()): ParsedSong {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const footerAt = lines.findIndex((line) => /^\s*CCLI Song\s*#/i.test(line));
  const body = footerAt >= 0 ? lines.slice(0, footerAt) : lines;
  const footer = footerAt >= 0 ? lines.slice(footerAt) : [];
  const ccli = cleanCcli(footer[0] ?? "");
  let author = "";
  let copyright = "";
  for (const raw of footer.slice(1)) {
    const line = raw.trim();
    if (!line || /^for use solely/i.test(line) || /^ccli licen[cs]e/i.test(line) || /^note:/i.test(line)) continue;
    if (/^(©|\(c\)|copyright)/i.test(line)) copyright ||= cleanCopyright(line);
    else if (!author) author = line.split("|").map((name) => name.trim()).filter(Boolean).join(", ");
  }
  const firstAt = body.findIndex((line) => line.trim());
  const title = firstAt >= 0 ? body[firstAt]!.trim() : "";
  const parsed = parseLyrics(body.slice(firstAt + 1).join("\n"), newId);
  return {
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
    ...(ccli ? { ccli } : {}),
    ...(copyright ? { copyright } : {}),
    sections: parsed.sections,
  };
}
