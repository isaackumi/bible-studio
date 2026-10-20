// Imported songs (ProPresenter, EasyWorship) turned into Church Studio songs.

import { parseLyrics, readHeader, sanitizeSong } from "../domain/song";
import type { Song, SongSection } from "../domain/types";
import type { ImportedSong } from "./propresenter";
import { rtfToText } from "./rtf";

/** A ProPresenter song as a library song: its parts, kinds read from their names, and its order. */
export function songFromImport(imported: ImportedSong, folder: string, newId: () => string = () => crypto.randomUUID()): Song | null {
  const ids = new Map<string, string>();
  const sections: SongSection[] = imported.parts.map((part) => {
    const id = newId();
    ids.set(part.id, id);
    const header = readHeader(part.label);
    return { id, kind: header?.kind ?? "verse", label: part.label, lines: part.lines };
  });
  if (!sections.length) return null;
  const order = imported.order.map((id) => ids.get(id)).filter((id): id is string => !!id);
  return sanitizeSong({
    id: newId(),
    title: imported.title.trim() || "Untitled song",
    author: imported.author,
    sections,
    folder,
    ...(imported.ccli ? { ccli: imported.ccli } : {}),
    ...(imported.copyright ? { copyright: imported.copyright } : {}),
    ...(order.length ? { order } : {}),
  });
}

export type EasyWorshipRow = { title: string; author: string; copyright: string; ccli: string; words: string };

/** An EasyWorship song: its RTF words read as lyrics, with "Verse 1", "Chorus"… lines as parts. */
export function songFromEasyWorship(row: EasyWorshipRow, folder: string, newId: () => string = () => crypto.randomUUID()): Song | null {
  const parsed = parseLyrics(rtfToText(row.words), newId);
  if (!parsed.sections.length) return null;
  return sanitizeSong({
    id: newId(),
    title: row.title.trim() || parsed.title?.trim() || "Untitled song",
    author: row.author || parsed.author || "",
    sections: parsed.sections,
    folder,
    ...(row.ccli ? { ccli: row.ccli } : {}),
    ...(row.copyright ? { copyright: row.copyright } : {}),
  });
}
