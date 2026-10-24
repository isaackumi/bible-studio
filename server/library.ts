// A licence's library in the cloud: one Durable Object per licence (cloud.ts reaches it through the
// LIBRARIES binding). Its computers push changes (one per record: a song, a service, a deck…) and
// pull everything since the sequence number they last saw. The newest change to a record wins and
// the version it replaced is kept 30 days; a deleted record waits 30 days in the bin. Media is
// listed here by content hash (the bytes live in R2, written by the worker) and counted once per
// licence toward the plan's limit. The rules live in LibraryCore over a LibraryStore, so tests run
// them on a Map and the object runs them on its SQLite.

export type Change = { col: string; id: string; at: number; doc: unknown | null };

/** What one computer may hold in the cloud: the records of the app's library and the desk's own work. */
export const COLLECTIONS = new Set(["song", "service", "sermon", "theme", "deck", "composition", "game", "playlist", "template", "macro", "overlay", "layout", "source", "settings"]);

export const HISTORY_DAYS = 30;
export const BIN_DAYS = 30;
/** A claim to upload that never finished is forgotten after this long. */
export const CLAIM_HOURS = 24;
export const PAGE = 500;

export type RecordRow = { col: string; id: string; at: number; device: string; seq: number; doc: unknown | null; deletedAt: number | null };
export type HistoryRow = { col: string; id: string; at: number; device: string; doc: unknown; until: number };
export type MediaRow = { hash: string; mediaId: string; name: string; kind: string; bytes: number; storedAt: number | null; claimedAt: number; device: string };
export type DeviceRow = { device: string; name: string; lastSyncAt: number };

/** The object's storage, as the rules see it: a Map in tests, SQLite in the object. */
export type LibraryStore = {
  getRecord(col: string, id: string): Promise<RecordRow | null>;
  putRecord(row: RecordRow): Promise<void>;
  removeRecord(col: string, id: string): Promise<void>;
  /** Rows with seq > since, oldest first, at most `limit`. */
  recordsSince(since: number, limit: number): Promise<RecordRow[]>;
  allRecords(): Promise<RecordRow[]>;
  addHistory(row: HistoryRow): Promise<void>;
  historyOf(col: string, id: string): Promise<HistoryRow[]>;
  pruneHistory(now: number): Promise<void>;
  getMedia(hash: string): Promise<MediaRow | null>;
  putMedia(row: MediaRow): Promise<void>;
  removeMedia(hash: string): Promise<void>;
  listMedia(): Promise<MediaRow[]>;
  putDevice(row: DeviceRow): Promise<void>;
  listDevices(): Promise<DeviceRow[]>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  clear(): Promise<void>;
};

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (status: number, error: string): Result<never> => ({ ok: false, status, error });

const DAY = 86_400_000;
const text = (value: unknown, most: number) => (typeof value === "string" ? value.slice(0, most) : "");
const whole = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null);

/** What a deleted record was called, for the bin. */
function nameOf(doc: unknown): string {
  const record = doc && typeof doc === "object" ? (doc as Record<string, unknown>) : {};
  for (const key of ["title", "name", "label"]) if (typeof record[key] === "string" && (record[key] as string).trim()) return record[key] as string;
  return "";
}

export class LibraryCore {
  constructor(private store: LibraryStore) {}

  private async seq(): Promise<number> {
    return Number(await this.store.getMeta("seq")) || 0;
  }

  private async readOnly(): Promise<boolean> {
    return (await this.store.getMeta("readOnly")) === "1";
  }

  private async touch(device: string, name: string | undefined, now: number): Promise<void> {
    if (!device) return;
    const known = (await this.store.listDevices()).find((entry) => entry.device === device);
    await this.store.putDevice({ device, name: name || known?.name || "Computer", lastSyncAt: now });
  }

  /** Apply changes from one computer: the newest wins, the replaced version goes to history. */
  async push(input: { device: string; name?: string; now: number; changes: Change[] }): Promise<Result<{ seq: number; applied: number; conflicts: Array<{ col: string; id: string; keptAt: number }> }>> {
    if (await this.readOnly()) return fail(403, "This plan has ended: the cloud copy can be read but not changed.");
    const changes = Array.isArray(input.changes) ? input.changes : [];
    for (const change of changes) {
      if (!COLLECTIONS.has(change.col)) return fail(400, `Unknown collection: ${text(change.col, 40)}`);
      if (!text(change.id, 200) || whole(change.at) === null) return fail(400, "A change needs an id and a time.");
    }
    let seq = await this.seq();
    let applied = 0;
    const conflicts: Array<{ col: string; id: string; keptAt: number }> = [];
    for (const change of changes) {
      const existing = await this.store.getRecord(change.col, change.id);
      if (existing && existing.at >= change.at) {
        conflicts.push({ col: change.col, id: change.id, keptAt: existing.at });
        continue;
      }
      if (existing && existing.doc !== null && existing.deletedAt === null) await this.store.addHistory({ col: existing.col, id: existing.id, at: existing.at, device: existing.device, doc: existing.doc, until: input.now + HISTORY_DAYS * DAY });
      seq += 1;
      applied += 1;
      const deleting = change.doc === null || change.doc === undefined;
      await this.store.putRecord({ col: change.col, id: change.id, at: change.at, device: input.device, seq, doc: deleting ? (existing?.doc ?? null) : change.doc, deletedAt: deleting ? change.at : null });
    }
    await this.store.setMeta("seq", String(seq));
    await this.touch(input.device, input.name, input.now);
    return ok({ seq, applied, conflicts });
  }

  /** Everything since a sequence number, oldest first, a page at a time (deletions as doc: null). */
  async pull(input: { since: number; limit?: number; device?: string; name?: string; now?: number }): Promise<Result<{ seq: number; changes: Change[]; more: boolean }>> {
    const since = whole(input.since) ?? 0;
    const limit = Math.min(PAGE, whole(input.limit) ?? PAGE) || PAGE;
    const rows = await this.store.recordsSince(since, limit + 1);
    const more = rows.length > limit;
    const changes = rows.slice(0, limit).map((row) => ({ col: row.col, id: row.id, at: row.at, doc: row.deletedAt !== null ? null : row.doc }));
    if (input.device) await this.touch(input.device, input.name, input.now ?? Date.now());
    return ok({ seq: await this.seq(), changes, more });
  }

  async history(input: { col: string; id: string }): Promise<Result<{ versions: Array<{ at: number; device: string; doc: unknown }> }>> {
    const rows = await this.store.historyOf(text(input.col, 40), text(input.id, 200));
    return ok({ versions: rows.sort((a, b) => b.at - a.at).map((row) => ({ at: row.at, device: row.device, doc: row.doc })) });
  }

  async bin(input: { now: number }): Promise<Result<{ items: Array<{ col: string; id: string; deletedAt: number; name: string }> }>> {
    const rows = (await this.store.allRecords()).filter((row) => row.deletedAt !== null && input.now - row.deletedAt < BIN_DAYS * DAY);
    return ok({ items: rows.sort((a, b) => b.deletedAt! - a.deletedAt!).map((row) => ({ col: row.col, id: row.id, deletedAt: row.deletedAt!, name: nameOf(row.doc) })) });
  }

  async restore(input: { col: string; id: string; now: number }): Promise<Result<{ seq: number }>> {
    const row = await this.store.getRecord(text(input.col, 40), text(input.id, 200));
    if (!row || row.deletedAt === null || row.doc === null) return fail(404, "That is not in the bin.");
    const seq = (await this.seq()) + 1;
    await this.store.putRecord({ ...row, at: input.now, seq, deletedAt: null, device: "cloud" });
    await this.store.setMeta("seq", String(seq));
    return ok({ seq });
  }

  async emptyBin(input: { now: number }): Promise<Result<{ removed: number }>> {
    const rows = (await this.store.allRecords()).filter((row) => row.deletedAt !== null);
    for (const row of rows) await this.store.removeRecord(row.col, row.id);
    void input;
    return ok({ removed: rows.length });
  }

  private async usedBytes(): Promise<number> {
    return (await this.store.listMedia()).reduce((sum, row) => sum + (row.storedAt !== null ? row.bytes : 0), 0);
  }

  /** May this file go up? Already stored: no upload and no second count. */
  async claimMedia(input: { hash: string; bytes: number; name: string; kind: string; mediaId: string; device: string; now: number; limitBytes: number; maxFileBytes: number; paused: boolean }): Promise<Result<{ upload: boolean; stored: boolean; full?: boolean; tooLarge?: boolean; paused?: boolean; usedBytes: number; limitBytes: number }>> {
    // The worker checks the hash is a real SHA-256; here any name up to 64 characters will do.
    const hash = text(input.hash, 64);
    const bytes = whole(input.bytes);
    if (!hash || bytes === null) return fail(400, "A file needs its hash and size.");
    const usedBytes = await this.usedBytes();
    const existing = await this.store.getMedia(hash);
    const base = { stored: false, usedBytes, limitBytes: input.limitBytes };
    if (existing?.storedAt !== null && existing !== null) return ok({ ...base, upload: false, stored: true });
    if (input.paused) return ok({ ...base, upload: false, paused: true });
    if (bytes > input.maxFileBytes) return ok({ ...base, upload: false, tooLarge: true });
    if (usedBytes + bytes > input.limitBytes) return ok({ ...base, upload: false, full: true });
    await this.store.putMedia({ hash, mediaId: text(input.mediaId, 80), name: text(input.name, 200), kind: text(input.kind, 20), bytes, storedAt: null, claimedAt: input.now, device: input.device });
    return ok({ ...base, upload: true });
  }

  /** A file's claim, for the worker to check before it takes the upload. */
  async claim(input: { hash: string }): Promise<Result<MediaRow>> {
    const row = await this.store.getMedia(text(input.hash, 64));
    return row ? ok(row) : fail(404, "That file was not claimed.");
  }

  async mediaDone(input: { hash: string; bytes: number; now: number }): Promise<Result<{ usedBytes: number }>> {
    const row = await this.store.getMedia(text(input.hash, 64));
    if (!row) return fail(404, "That file was not claimed.");
    await this.store.putMedia({ ...row, bytes: whole(input.bytes) ?? row.bytes, storedAt: input.now });
    return ok({ usedBytes: await this.usedBytes() });
  }

  /** Records (not deleted) whose text mentions a media id: where a file is used. */
  private async usersOf(mediaId: string): Promise<RecordRow[]> {
    if (!mediaId) return [];
    return (await this.store.allRecords()).filter((row) => row.deletedAt === null && row.doc !== null && JSON.stringify(row.doc).includes(mediaId));
  }

  async media(input: { now: number }): Promise<Result<{ items: Array<{ hash: string; mediaId: string; name: string; kind: string; bytes: number; usedIn: number; lastUsedAt: number | null; storedAt: number }>; usedBytes: number; binBytes: number }>> {
    void input;
    const rows = (await this.store.listMedia()).filter((row) => row.storedAt !== null);
    const items = [];
    for (const row of rows) {
      const users = await this.usersOf(row.mediaId);
      items.push({ hash: row.hash, mediaId: row.mediaId, name: row.name, kind: row.kind, bytes: row.bytes, usedIn: users.length, lastUsedAt: users.length ? Math.max(...users.map((user) => user.at)) : null, storedAt: row.storedAt! });
    }
    items.sort((a, b) => b.bytes - a.bytes);
    return ok({ items, usedBytes: await this.usedBytes(), binBytes: 0 });
  }

  /** Take a file out of the cloud; `everywhere` also deletes every record that used it. */
  async removeMedia(input: { hash: string; everywhere: boolean; now: number }): Promise<Result<{ usedBytes: number; deleteKey: boolean }>> {
    const row = await this.store.getMedia(text(input.hash, 64));
    if (!row) return fail(404, "That file is not in the cloud.");
    if (input.everywhere) {
      const users = await this.usersOf(row.mediaId);
      if (users.length) await this.push({ device: "cloud", now: input.now, changes: users.map((user) => ({ col: user.col, id: user.id, at: input.now, doc: null })) });
    }
    await this.store.removeMedia(row.hash);
    return ok({ usedBytes: await this.usedBytes(), deleteKey: true });
  }

  async devices(input: Record<string, never>): Promise<Result<DeviceRow[]>> {
    void input;
    return ok((await this.store.listDevices()).sort((a, b) => a.lastSyncAt - b.lastSyncAt));
  }

  async settings(input: { syncVideos?: unknown }): Promise<Result<{ syncVideos: boolean }>> {
    if (typeof input.syncVideos === "boolean") await this.store.setMeta("syncVideos", input.syncVideos ? "1" : "0");
    return ok({ syncVideos: (await this.store.getMeta("syncVideos")) !== "0" });
  }

  async status(input: { now: number }): Promise<Result<{ seq: number; usedBytes: number; binBytes: number; readOnly: boolean; wipeAt: number | null; syncVideos: boolean; devices: DeviceRow[] }>> {
    void input;
    const wipe = Number(await this.store.getMeta("wipeAt"));
    return ok({ seq: await this.seq(), usedBytes: await this.usedBytes(), binBytes: 0, readOnly: await this.readOnly(), wipeAt: wipe > 0 ? wipe : null, syncVideos: (await this.store.getMeta("syncVideos")) !== "0", devices: await this.store.listDevices() });
  }

  /** The plan ended (or came back): read-only, and gone at `wipeAt`. */
  async lapse(input: { readOnly: boolean; wipeAt: number | null }): Promise<Result<{ readOnly: boolean }>> {
    await this.store.setMeta("readOnly", input.readOnly ? "1" : "0");
    await this.store.setMeta("wipeAt", input.wipeAt ? String(input.wipeAt) : "");
    return ok({ readOnly: input.readOnly });
  }

  /** Daily: history and the bin age out, unfinished claims are forgotten, and a lapsed library is wiped. */
  async ageOut(now: number): Promise<void> {
    const wipe = Number(await this.store.getMeta("wipeAt"));
    if (wipe > 0 && now >= wipe) {
      await this.store.clear();
      return;
    }
    await this.store.pruneHistory(now);
    for (const row of await this.store.allRecords()) if (row.deletedAt !== null && now - row.deletedAt >= BIN_DAYS * DAY) await this.store.removeRecord(row.col, row.id);
    for (const row of await this.store.listMedia()) if (row.storedAt === null && now - row.claimedAt >= CLAIM_HOURS * 3_600_000) await this.store.removeMedia(row.hash);
  }
}

// --- Storage: a Map for tests, SQLite in the object -----------------------------------------------

export function memoryLibraryStore(): LibraryStore {
  const records = new Map<string, RecordRow>();
  const history: HistoryRow[] = [];
  const media = new Map<string, MediaRow>();
  const devices = new Map<string, DeviceRow>();
  const meta = new Map<string, string>();
  const key = (col: string, id: string) => `${col}\u0000${id}`;
  return {
    getRecord: async (col, id) => records.get(key(col, id)) ?? null,
    putRecord: async (row) => void records.set(key(row.col, row.id), structuredClone(row)),
    removeRecord: async (col, id) => void records.delete(key(col, id)),
    recordsSince: async (since, limit) => [...records.values()].filter((row) => row.seq > since).sort((a, b) => a.seq - b.seq).slice(0, limit).map((row) => structuredClone(row)),
    allRecords: async () => [...records.values()].map((row) => structuredClone(row)),
    addHistory: async (row) => void history.push(structuredClone(row)),
    historyOf: async (col, id) => history.filter((row) => row.col === col && row.id === id).map((row) => structuredClone(row)),
    pruneHistory: async (now) => {
      for (let i = history.length - 1; i >= 0; i--) if (history[i]!.until <= now) history.splice(i, 1);
    },
    getMedia: async (hash) => media.get(hash) ?? null,
    putMedia: async (row) => void media.set(row.hash, { ...row }),
    removeMedia: async (hash) => void media.delete(hash),
    listMedia: async () => [...media.values()].map((row) => ({ ...row })),
    putDevice: async (row) => void devices.set(row.device, { ...row }),
    listDevices: async () => [...devices.values()].map((row) => ({ ...row })),
    getMeta: async (name) => meta.get(name) ?? null,
    setMeta: async (name, value) => void meta.set(name, value),
    clear: async () => {
      records.clear();
      history.length = 0;
      media.clear();
      devices.clear();
      meta.clear();
    },
  };
}

/** Cloudflare's SQLite in a Durable Object: the part of the API this file uses. */
export type SqlStorage = { exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): { toArray(): T[] } };

export function sqlLibraryStore(sql: SqlStorage): LibraryStore {
  sql.exec(`CREATE TABLE IF NOT EXISTS records (col TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, device TEXT NOT NULL, seq INTEGER NOT NULL, doc TEXT, deleted_at INTEGER, PRIMARY KEY (col, id));
    CREATE INDEX IF NOT EXISTS records_seq ON records (seq);
    CREATE TABLE IF NOT EXISTS history (col TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, device TEXT NOT NULL, doc TEXT NOT NULL, until INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS history_record ON history (col, id);
    CREATE TABLE IF NOT EXISTS media (hash TEXT PRIMARY KEY, media_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, bytes INTEGER NOT NULL, stored_at INTEGER, claimed_at INTEGER NOT NULL, device TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS devices (device TEXT PRIMARY KEY, name TEXT NOT NULL, last_sync_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  type R = { col: string; id: string; at: number; device: string; seq: number; doc: string | null; deleted_at: number | null };
  const record = (row: R): RecordRow => ({ col: row.col, id: row.id, at: row.at, device: row.device, seq: row.seq, doc: row.doc === null ? null : JSON.parse(row.doc), deletedAt: row.deleted_at });
  type M = { hash: string; media_id: string; name: string; kind: string; bytes: number; stored_at: number | null; claimed_at: number; device: string };
  const mediaRow = (row: M): MediaRow => ({ hash: row.hash, mediaId: row.media_id, name: row.name, kind: row.kind, bytes: row.bytes, storedAt: row.stored_at, claimedAt: row.claimed_at, device: row.device });
  return {
    getRecord: async (col, id) => sql.exec<R>("SELECT * FROM records WHERE col = ? AND id = ?", col, id).toArray().map(record)[0] ?? null,
    putRecord: async (row) => void sql.exec("INSERT OR REPLACE INTO records (col, id, at, device, seq, doc, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)", row.col, row.id, row.at, row.device, row.seq, row.doc === null ? null : JSON.stringify(row.doc), row.deletedAt),
    removeRecord: async (col, id) => void sql.exec("DELETE FROM records WHERE col = ? AND id = ?", col, id),
    recordsSince: async (since, limit) => sql.exec<R>("SELECT * FROM records WHERE seq > ? ORDER BY seq LIMIT ?", since, limit).toArray().map(record),
    allRecords: async () => sql.exec<R>("SELECT * FROM records").toArray().map(record),
    addHistory: async (row) => void sql.exec("INSERT INTO history (col, id, at, device, doc, until) VALUES (?, ?, ?, ?, ?, ?)", row.col, row.id, row.at, row.device, JSON.stringify(row.doc), row.until),
    historyOf: async (col, id) => sql.exec<{ col: string; id: string; at: number; device: string; doc: string; until: number }>("SELECT * FROM history WHERE col = ? AND id = ?", col, id).toArray().map((row) => ({ ...row, doc: JSON.parse(row.doc) })),
    pruneHistory: async (now) => void sql.exec("DELETE FROM history WHERE until <= ?", now),
    getMedia: async (hash) => sql.exec<M>("SELECT * FROM media WHERE hash = ?", hash).toArray().map(mediaRow)[0] ?? null,
    putMedia: async (row) => void sql.exec("INSERT OR REPLACE INTO media (hash, media_id, name, kind, bytes, stored_at, claimed_at, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", row.hash, row.mediaId, row.name, row.kind, row.bytes, row.storedAt, row.claimedAt, row.device),
    removeMedia: async (hash) => void sql.exec("DELETE FROM media WHERE hash = ?", hash),
    listMedia: async () => sql.exec<M>("SELECT * FROM media").toArray().map(mediaRow),
    putDevice: async (row) => void sql.exec("INSERT OR REPLACE INTO devices (device, name, last_sync_at) VALUES (?, ?, ?)", row.device, row.name, row.lastSyncAt),
    listDevices: async () => sql.exec<{ device: string; name: string; last_sync_at: number }>("SELECT * FROM devices").toArray().map((row) => ({ device: row.device, name: row.name, lastSyncAt: row.last_sync_at })),
    getMeta: async (key) => sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray()[0]?.value ?? null,
    setMeta: async (key, value) => void sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", key, value),
    clear: async () => void sql.exec("DELETE FROM records; DELETE FROM history; DELETE FROM media; DELETE FROM devices; DELETE FROM meta;"),
  };
}

// --- The Durable Object -------------------------------------------------------------------------

type LibraryState = { storage: { sql: SqlStorage; setAlarm(at: number): Promise<void> } };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Methods the worker may call, by the last part of the path (`https://library/<method>`). */
const METHODS = ["push", "pull", "history", "bin", "restore", "emptyBin", "claimMedia", "claim", "mediaDone", "media", "removeMedia", "devices", "settings", "status", "lapse"] as const;
type Method = (typeof METHODS)[number];

/** One licence's library: its rows in the object's SQLite, its rules in LibraryCore. */
export class LibraryObject {
  private core: LibraryCore;
  // Cloudflare makes the object with (state, env): nothing else may sit in the second place.
  constructor(private state: LibraryState) {
    this.core = new LibraryCore(sqlLibraryStore(state.storage.sql));
  }

  async fetch(request: Request): Promise<Response> {
    const method = new URL(request.url).pathname.replace(/^\//, "") as Method;
    if (!METHODS.includes(method)) return json(404, { error: "Unknown call." });
    let input: Record<string, unknown> = {};
    try {
      input = ((await request.json()) ?? {}) as Record<string, unknown>;
    } catch {
      return json(400, { error: "Bad request." });
    }
    const result = await (this.core[method] as (input: unknown) => Promise<Result<unknown>>).call(this.core, { now: Date.now(), ...input });
    // Something changed: the daily tidy-up is due within a day.
    if (method === "push" || method === "claimMedia" || method === "lapse") await this.state.storage.setAlarm(Date.now() + DAY).catch(() => {});
    return result.ok ? json(200, result.data) : json(result.status, { error: result.error });
  }

  async alarm(): Promise<void> {
    await this.core.ageOut(Date.now());
    const status = await this.core.status({ now: Date.now() });
    if (status.ok && (status.data.seq > 0 || status.data.wipeAt)) await this.state.storage.setAlarm(Date.now() + DAY).catch(() => {});
  }
}

/** A namespace of libraries in memory (tests and local runs), each on a Map. */
export function memoryLibraries(now: () => number = () => Date.now()): { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string | Request, init?: RequestInit): Promise<Response> }; core(name: string): LibraryCore } {
  const cores = new Map<string, LibraryCore>();
  const core = (name: string) => {
    if (!cores.has(name)) cores.set(name, new LibraryCore(memoryLibraryStore()));
    return cores.get(name)!;
  };
  return {
    idFromName: (name) => name,
    core,
    get: (id) => ({
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const method = new URL(request.url).pathname.replace(/^\//, "") as Method;
        if (!METHODS.includes(method)) return json(404, { error: "Unknown call." });
        const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
        const lib = core(String(id));
        const result = await (lib[method] as (input: unknown) => Promise<Result<unknown>>).call(lib, { now: now(), ...body });
        return result.ok ? json(200, result.data) : json(result.status, { error: result.error });
      },
    }),
  };
}
