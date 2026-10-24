// Moving to a new computer: the library and the desk's own work as one .churchstudio file, its
// media written beside it by the app (src-tauri/src/bundle.rs). On the new computer the media
// comes back with the same ids, and every saved address is rebuilt for this computer's folder.

import type { BackupExtras } from "../platform/backup";
import type { LibrarySnapshot } from "../platform/library";
import { relinkMedia } from "../platform/relink";

export const MOVE_EXTENSION = "churchstudio";

/** "Grace Chapel 2026-10-24.churchstudio": the church's name, without what Windows refuses in a name. */
export function moveFileName(churchName: string, now = new Date()): string {
  const name = churchName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() || "Church Studio";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${name} ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${MOVE_EXTENSION}`;
}

/** The library as the file holds it: the snapshot, with the desk's own work under `extras`. */
export function buildMoveLibrary(snapshot: LibrarySnapshot, extras: Partial<BackupExtras>): string {
  return JSON.stringify({ ...snapshot, extras });
}

/**
 * Bring the file's library in: addresses rebuilt for this computer first, then the songs,
 * services and looks go to `importer`. Returns the extras for the desk to merge.
 */
export async function restoreMoveLibrary(json: string, urlFor: (id: string) => string | null, importer: (payload: unknown) => Promise<void>): Promise<Partial<BackupExtras>> {
  const payload = relinkMedia(JSON.parse(json) as { extras?: Partial<BackupExtras> }, urlFor);
  const { extras, ...library } = payload;
  await importer(library);
  return extras ?? {};
}

/** "48 MB", "3.2 GB": a file size the way a church reads it. */
export function formatBytes(bytes: number): string {
  const GB = 1_000_000_000;
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes < 10 * GB ? 1 : 0)} GB`;
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

/** When the file was saved: the app writes seconds since 1970; an ISO date reads too. */
export function movedAt(createdAt: string): Date {
  return /^\d+$/.test(createdAt) ? new Date(Number(createdAt) * 1000) : new Date(createdAt);
}
