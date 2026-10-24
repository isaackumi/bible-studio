// The library as records for the cloud: one per song, service, sermon, theme, and per item of the
// desk's own work (decks, looks, games, playlists, templates, macros, overlays, layouts, sources),
// plus one "settings" record for what the church shares (its name, logo, folders, favourites).
// Nothing that belongs to one computer (screens, sound, shortcuts) and no secret ever becomes a
// record. A manifest remembers what the cloud last agreed to, so only changes travel.

import type { Service, Sermon, Song, Theme, Workspace } from "../domain/types";
import { mergeById } from "../platform/backup";
import { MEDIA_FILE } from "../platform/relink";

export type SyncRecord = { col: string; id: string; doc: unknown };
export type Change = { col: string; id: string; at: number; doc: unknown | null };

/** What the cloud last agreed to, per record key `${col}/${id}`: its hash and time; `pending` while an edit has not been accepted yet. */
export type Manifest = { seq: number; hashes: Record<string, { hash: string; at: number; pending?: { hash: string; at: number } }>; media?: Record<string, string> };

export const emptyManifest = (): Manifest => ({ seq: 0, hashes: {} });

export type LibraryInput = { songs: Song[]; services: Service[]; sermons: Sermon[]; themes: Theme[]; workspace: Workspace };

/** Workspace lists that sync, each item by its id, and the collection name the cloud knows. */
const LISTS: Array<[keyof Workspace, string]> = [
  ["decks", "deck"],
  ["compositions", "composition"],
  ["games", "game"],
  ["playlists", "playlist"],
  ["serviceTemplates", "template"],
  ["macros", "macro"],
  ["overlays", "overlay"],
  ["customLayouts", "layout"],
  ["sources", "source"],
];

const key = (col: string, id: string) => `${col}/${id}`;

/** JSON with keys in order at every level, so the same document always reads the same. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((name) => record[name] !== undefined)
      .map((name) => `${JSON.stringify(name)}:${stable(record[name])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** FNV-1a over the stable text, 64 bits as hex: enough to tell one version of a record from another. */
export function hashDoc(doc: unknown): string {
  const text = stable(doc);
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  for (let i = 0; i < text.length; i++) {
    lo ^= text.charCodeAt(i);
    // 64-bit multiply by the FNV prime (0x100000001b3) in two 32-bit halves.
    const loMul = lo * 0x1b3;
    hi = (Math.imul(hi, 0x1b3) + lo + Math.floor(loMul / 0x100000000)) >>> 0;
    lo = loMul >>> 0;
  }
  return hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0");
}

/** The church's shared settings as one record. */
function settingsOf(workspace: Workspace) {
  return {
    id: "church",
    churchName: workspace.churchName,
    logoAssetId: workspace.logoAssetId,
    logoText: workspace.logoText,
    logoPicture: workspace.logoPicture ?? null,
    songFolders: workspace.songFolders,
    favorites: workspace.favorites,
    ccliLicense: workspace.ccliLicense,
    voiceWords: workspace.voice.words ?? [],
  };
}

export function collectRecords(input: LibraryInput): SyncRecord[] {
  const records: SyncRecord[] = [];
  for (const song of input.songs) records.push({ col: "song", id: song.id, doc: song });
  for (const service of input.services) records.push({ col: "service", id: service.id, doc: service });
  for (const sermon of input.sermons) records.push({ col: "sermon", id: sermon.id, doc: sermon });
  for (const theme of input.themes) records.push({ col: "theme", id: theme.id, doc: theme });
  for (const [field, col] of LISTS) {
    const list = input.workspace[field];
    if (!Array.isArray(list)) continue;
    for (const item of list as Array<{ id?: unknown }>) if (typeof item.id === "string" && item.id) records.push({ col, id: item.id, doc: item });
  }
  records.push({ col: "settings", id: "church", doc: settingsOf(input.workspace) });
  return records;
}

/**
 * What to send: records whose hash differs from what the cloud agreed to (keeping the time of the
 * first attempt while one waits), and deletions for records the cloud knows that are gone here.
 */
export function diffRecords(current: SyncRecord[], manifest: Manifest, now: number): { changes: Change[]; manifest: Manifest } {
  const changes: Change[] = [];
  const hashes: Manifest["hashes"] = { ...manifest.hashes };
  const seen = new Set<string>();
  for (const record of current) {
    const name = key(record.col, record.id);
    seen.add(name);
    const hash = hashDoc(record.doc);
    const known = hashes[name];
    if (known && known.hash === hash && !known.pending) continue;
    const at = known?.pending?.hash === hash ? known.pending.at : now;
    changes.push({ col: record.col, id: record.id, at, doc: record.doc });
    hashes[name] = { hash: known?.hash ?? "", at: known?.at ?? 0, pending: { hash, at } };
  }
  for (const name of Object.keys(hashes)) {
    if (seen.has(name)) continue;
    const known = hashes[name]!;
    if (known.pending?.hash === "") {
      changes.push({ col: name.slice(0, name.indexOf("/")), id: name.slice(name.indexOf("/") + 1), at: known.pending.at, doc: null });
      continue;
    }
    const col = name.slice(0, name.indexOf("/"));
    const id = name.slice(name.indexOf("/") + 1);
    changes.push({ col, id, at: now, doc: null });
    hashes[name] = { ...known, pending: { hash: "", at: now } };
  }
  return { changes, manifest: { ...manifest, hashes } };
}

/**
 * The cloud accepted these changes: their pending versions are now what it holds. The pull
 * cursor (`seq`) is left alone: only a pull moves it, or changes made elsewhere just before this
 * push would be skipped.
 */
export function acceptChanges(manifest: Manifest, changes: Change[]): Manifest {
  const hashes = { ...manifest.hashes };
  for (const change of changes) {
    const name = key(change.col, change.id);
    if (change.doc === null) delete hashes[name];
    else hashes[name] = { hash: hashDoc(change.doc), at: change.at };
  }
  return { ...manifest, hashes };
}

export type Apply = {
  song(doc: Song | null, id: string): Promise<void>;
  service(doc: Service | null, id: string): Promise<void>;
  sermon(doc: Sermon | null, id: string): Promise<void>;
  theme(doc: Theme | null, id: string): Promise<void>;
  workspace(patch: (workspace: Workspace) => Workspace): void;
};

/** A pulled settings record onto this computer's: the newest wins, field by field as sent. */
function applySettings(workspace: Workspace, doc: Record<string, unknown>): Workspace {
  const next = { ...workspace };
  if (typeof doc.churchName === "string") next.churchName = doc.churchName;
  if (doc.logoAssetId === null || typeof doc.logoAssetId === "string") next.logoAssetId = doc.logoAssetId;
  if (typeof doc.logoText === "string") next.logoText = doc.logoText;
  if (doc.logoPicture === "default" || doc.logoPicture === "none") next.logoPicture = doc.logoPicture;
  if (Array.isArray(doc.songFolders)) next.songFolders = doc.songFolders.filter((entry): entry is string => typeof entry === "string");
  if (doc.favorites && typeof doc.favorites === "object") next.favorites = { ...workspace.favorites, ...(doc.favorites as Workspace["favorites"]) };
  if (typeof doc.ccliLicense === "string") next.ccliLicense = doc.ccliLicense;
  if (Array.isArray(doc.voiceWords)) next.voice = { ...workspace.voice, words: doc.voiceWords as NonNullable<Workspace["voice"]["words"]> };
  return next;
}

/**
 * Write what the cloud sent. A record this computer changed since its last sync, and changed
 * later than the cloud's version, keeps the local version (its push wins next); otherwise the
 * cloud's version lands and is marked as agreed, so it is not pushed back.
 */
export async function applyChanges(changes: Change[], apply: Apply, manifest: Manifest): Promise<Manifest> {
  const hashes = { ...manifest.hashes };
  for (const change of changes) {
    const name = key(change.col, change.id);
    const known = hashes[name];
    if (known?.pending && known.pending.at > change.at) continue;
    if (change.doc === null) {
      // Deleted elsewhere: gone here too, even when this computer never synced it (the samples
      // every install ships with share their ids).
      delete hashes[name];
    } else {
      const hash = hashDoc(change.doc);
      // This computer's own change coming back round, or one it already has: nothing to write.
      if (known && !known.pending && known.hash === hash && known.at === change.at) continue;
      hashes[name] = { hash, at: change.at };
    }
    switch (change.col) {
      case "song":
        await apply.song(change.doc as Song | null, change.id);
        break;
      case "service":
        await apply.service(change.doc as Service | null, change.id);
        break;
      case "sermon":
        await apply.sermon(change.doc as Sermon | null, change.id);
        break;
      case "theme":
        await apply.theme(change.doc as Theme | null, change.id);
        break;
      case "settings":
        if (change.doc && typeof change.doc === "object") apply.workspace((workspace) => applySettings(workspace, change.doc as Record<string, unknown>));
        break;
      default: {
        const list = LISTS.find(([, col]) => col === change.col);
        if (!list) break;
        const [field] = list;
        apply.workspace((workspace) => {
          const current = (workspace[field] as Array<{ id: string }>) ?? [];
          const next = change.doc === null ? current.filter((item) => item.id !== change.id) : mergeById(current, [change.doc as { id: string }]);
          return { ...workspace, [field]: next };
        });
      }
    }
  }
  return { ...manifest, hashes };
}

/** Every media id the records mention: picture and video ids, the logo, and media paths in saved addresses. */
export function mediaIdsIn(records: SyncRecord[]): Set<string> {
  const ids = new Set<string>();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      const found = new RegExp(MEDIA_FILE.source, "gi");
      for (const match of value.matchAll(found)) ids.add(match[1]!.toLowerCase());
      return;
    }
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;
    for (const [name, entry] of Object.entries(value)) {
      if ((name === "assetId" || name === "logoAssetId" || name === "imageId") && typeof entry === "string" && uuid.test(entry)) ids.add(entry.toLowerCase());
      walk(entry);
    }
  };
  for (const record of records) walk(record.doc);
  return ids;
}
