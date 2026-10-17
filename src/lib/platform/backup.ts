// Backups to a folder that a cloud drive keeps in step (Google Drive, OneDrive, Dropbox, iCloud):
// the library file, plus sermons and the desk's own work (decks, looks, layouts), so a second
// computer can restore everything from the same folder. Display settings stay per computer.

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
export type BackupExtras = Pick<Workspace, "decks" | "compositions" | "sources" | "customLayouts" | "songFolders" | "churchName" | "ccliLicense"> & { sermons: Sermon[] };

export function extrasFrom(workspace: Workspace, sermons: Sermon[]): BackupExtras {
  return {
    decks: workspace.decks,
    compositions: workspace.compositions,
    sources: workspace.sources,
    customLayouts: workspace.customLayouts,
    songFolders: workspace.songFolders,
    churchName: workspace.churchName,
    ccliLicense: workspace.ccliLicense,
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

export function applyExtras(workspace: Workspace, extras: Partial<BackupExtras>): Workspace {
  const list = <T>(value: T[] | undefined) => (Array.isArray(value) ? value : []);
  return {
    ...workspace,
    decks: mergeById(workspace.decks ?? [], list(extras.decks)),
    compositions: mergeById(workspace.compositions, list(extras.compositions)),
    sources: mergeById(workspace.sources, list(extras.sources)),
    customLayouts: mergeById(workspace.customLayouts, list(extras.customLayouts)),
    songFolders: [...new Set([...workspace.songFolders, ...list(extras.songFolders)])],
    churchName: workspace.churchName || (typeof extras.churchName === "string" ? extras.churchName : ""),
    ccliLicense: workspace.ccliLicense || (typeof extras.ccliLicense === "string" ? extras.ccliLicense : ""),
  };
}
