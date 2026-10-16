import { moveInList } from "./service";
import type { Song, SongSection, SongSectionKind } from "./types";

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
    const label = section.label?.trim() || defaultLabel(kind, sections);
    sections.push({ id: section.id, kind, label, lines });
  }
  return {
    id: song.id,
    title: song.title.trim(),
    author: song.author.trim(),
    sections,
  };
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

export function lyricsFor(song: Song | undefined, sectionId: string, fallbackTitle: string): { label: string; lines: string[] } {
  const section = song?.sections.find((entry) => entry.id === sectionId);
  if (!song || !section) return { label: fallbackTitle || "Song", lines: ["This section is missing."] };
  const lines = section.lines.filter((line) => line.trim());
  return { label: section.label, lines: lines.length > 0 ? lines : ["This section is empty."] };
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
): { title?: string; author?: string; sections: SongSection[] } {
  let title: string | undefined;
  let author: string | undefined;
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
  return { ...(title ? { title } : {}), ...(author ? { author } : {}), sections };
}
