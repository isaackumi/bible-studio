import { sanitizeTheme } from "../domain/theme";
import type { Service, Song, Theme } from "../domain/types";

export type LibrarySnapshot = {
  schemaVersion: 1;
  exportedAt: string;
  songs: Song[];
  services: Service[];
  themes: Theme[];
};

function isSong(value: unknown): value is Song {
  if (!value || typeof value !== "object") return false;
  const song = value as Song;
  return typeof song.id === "string" && typeof song.title === "string" && Array.isArray(song.sections);
}

function isService(value: unknown): value is Service {
  if (!value || typeof value !== "object") return false;
  const service = value as Service;
  return typeof service.id === "string" && typeof service.name === "string" && Array.isArray(service.sections);
}

function isTheme(value: unknown): value is Theme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Theme;
  return typeof theme.id === "string" && typeof theme.name === "string" && typeof theme.fontFamily === "string" && typeof theme.background === "object";
}

/** Rejects the file before any record is written. */
export function parseLibrarySnapshot(value: unknown): LibrarySnapshot {
  if (!value || typeof value !== "object") throw new Error("Library file is not valid.");
  const record = value as Partial<LibrarySnapshot>;
  if (record.schemaVersion !== 1) throw new Error("This library file needs a newer version of Church Studio.");
  if (!Array.isArray(record.songs) || !Array.isArray(record.services)) throw new Error("Library file is not valid.");
  if (record.themes !== undefined && !Array.isArray(record.themes)) throw new Error("Library file is not valid.");
  if (!record.songs.every(isSong)) throw new Error("A song in the library file is not valid.");
  if (!record.services.every(isService)) throw new Error("A service in the library file is not valid.");
  const themes = record.themes ?? [];
  if (!themes.every(isTheme)) throw new Error("A theme in the library file is not valid.");
  return {
    schemaVersion: 1,
    exportedAt: typeof record.exportedAt === "string" ? record.exportedAt : new Date(0).toISOString(),
    songs: record.songs,
    services: record.services,
    themes: themes.map((theme) => sanitizeTheme(theme)),
  };
}
