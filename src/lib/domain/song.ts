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
