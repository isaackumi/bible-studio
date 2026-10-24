// Backups to a folder that a cloud drive keeps in step (Google Drive, OneDrive, Dropbox, iCloud),
// and the .churchstudio file that moves a church to a new computer: the library file, plus
// sermons and the desk's own work (decks, looks, layouts, games, playlists, templates, macros),
// so another computer can restore everything. Screens, sound and every password or key stay on
// each computer: nothing here reads pco, ai, onlineBibles, broadcast, switcher or speechKeys.

import type { Sermon, Workspace } from "../domain/types";

export const BACKUP_PREFIX = "Church Studio backup ";
export const BACKUPS_KEPT = 20;

/** "Church Studio backup 2026-10-17 1830.json": sorts by name in time order. */
export function backupName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${BACKUP_PREFIX}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

export function isBackupName(name: string): boolean {
  return name.startsWith(BACKUP_PREFIX) && name.endsWith(".json") && !/[\\/]/.test(name);
}

export function latestBackup(names: string[]): string | null {
  return names.filter(isBackupName).sort().at(-1) ?? null;
}

/** Of the backups in a folder, the old ones to delete so only the newest few stay. */
export function backupsToPrune(names: string[], keep = BACKUPS_KEPT): string[] {
  return names.filter(isBackupName).sort().slice(0, Math.max(0, names.filter(isBackupName).length - keep));
}

/** The parts of the workspace worth carrying to another computer. */
export type BackupExtras = Pick<
  Workspace,
  "decks" | "compositions" | "sources" | "customLayouts" | "songFolders" | "churchName" | "ccliLicense" | "logoAssetId" | "logoText" | "logoPicture" | "games" | "hiddenGames" | "playlists" | "serviceTemplates" | "macros" | "overlays" | "favorites" | "songUses"
> & { sermons: Sermon[]; voiceWords: NonNullable<Workspace["voice"]["words"]> };

export function extrasFrom(workspace: Workspace, sermons: Sermon[]): BackupExtras {
  return {
    decks: workspace.decks,
    compositions: workspace.compositions,
    sources: workspace.sources,
    customLayouts: workspace.customLayouts,
    songFolders: workspace.songFolders,
    churchName: workspace.churchName,
    ccliLicense: workspace.ccliLicense,
    logoAssetId: workspace.logoAssetId,
    logoText: workspace.logoText,
    logoPicture: workspace.logoPicture,
    games: workspace.games,
    hiddenGames: workspace.hiddenGames,
    playlists: workspace.playlists,
    serviceTemplates: workspace.serviceTemplates,
    macros: workspace.macros,
    overlays: workspace.overlays,
    favorites: workspace.favorites,
    songUses: workspace.songUses,
    voiceWords: workspace.voice.words ?? [],
    sermons,
  };
}

/** Same id: the backup's copy wins. New ids are added; nothing here is deleted. */
export function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map(incoming.map((entry) => [entry.id, entry]));
  const kept = current.map((entry) => byId.get(entry.id) ?? entry);
  const known = new Set(current.map((entry) => entry.id));
  return [...kept, ...incoming.filter((entry) => !known.has(entry.id))];
}

/** Both lists, nothing twice: an entry is the same when its key is. */
function union<T>(current: T[], incoming: T[], key: (entry: T) => string = (entry) => JSON.stringify(entry)): T[] {
  const known = new Set(current.map(key));
  return [...current, ...incoming.filter((entry) => !known.has(key(entry)))];
}

export function applyExtras(workspace: Workspace, extras: Partial<BackupExtras>): Workspace {
  const list = <T>(value: T[] | undefined) => (Array.isArray(value) ? value : []);
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const favorites = extras.favorites && typeof extras.favorites === "object" ? extras.favorites : null;
  const words = list(extras.voiceWords);
  const heard = new Map(words.map((entry) => [entry.heard, entry]));
  const localWords = workspace.voice.words ?? [];
  const localHeard = new Set(localWords.map((entry) => entry.heard));
  return {
    ...workspace,
    decks: mergeById(workspace.decks ?? [], list(extras.decks)),
    compositions: mergeById(workspace.compositions, list(extras.compositions)),
    sources: mergeById(workspace.sources, list(extras.sources)),
    customLayouts: mergeById(workspace.customLayouts, list(extras.customLayouts)),
    songFolders: [...new Set([...workspace.songFolders, ...list(extras.songFolders)])],
    churchName: workspace.churchName || (typeof extras.churchName === "string" ? extras.churchName : ""),
    ccliLicense: workspace.ccliLicense || (typeof extras.ccliLicense === "string" ? extras.ccliLicense : ""),
    logoAssetId: workspace.logoAssetId ?? (text(extras.logoAssetId) || null),
    logoText: workspace.logoText || text(extras.logoText),
    logoPicture: workspace.logoPicture ?? extras.logoPicture,
    games: mergeById(workspace.games, list(extras.games)),
    hiddenGames: union(workspace.hiddenGames, list(extras.hiddenGames)),
    playlists: mergeById(workspace.playlists, list(extras.playlists)),
    serviceTemplates: mergeById(workspace.serviceTemplates, list(extras.serviceTemplates)),
    macros: mergeById(workspace.macros, list(extras.macros)),
    overlays: mergeById(workspace.overlays, list(extras.overlays)),
    favorites: favorites
      ? {
          songs: union(workspace.favorites.songs, list(favorites.songs)),
          themes: union(workspace.favorites.themes, list(favorites.themes)),
          layouts: union(workspace.favorites.layouts, list(favorites.layouts)),
          looks: union(workspace.favorites.looks, list(favorites.looks)),
          media: union(workspace.favorites.media, list(favorites.media)),
          passages: union(workspace.favorites.passages, list(favorites.passages)),
        }
      : workspace.favorites,
    songUses: union(workspace.songUses, list(extras.songUses), (use) => `${use.songId} ${use.date}`),
    voice: words.length
      ? { ...workspace.voice, words: [...localWords.map((entry) => heard.get(entry.heard) ?? entry), ...words.filter((entry) => !localHeard.has(entry.heard))] }
      : workspace.voice,
  };
}
