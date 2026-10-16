import { sanitizeSermon } from "../domain/sermon";
import { sanitizeTheme } from "../domain/theme";
import type { Sermon, Service, Song, Theme } from "../domain/types";
import type { LibrarySnapshot } from "./library";

export const BROWSER_DB_NAME = "church-studio";
export const BROWSER_SCHEMA_VERSION = 3;
export const BROWSER_MEDIA_STORE = "media";

const LEGACY_SONGS = "church-studio.songs";
const LEGACY_SERVICES = "church-studio.services";
export const MIGRATION_META = "local-lists-v1";
const MIGRATION_COMPLETE = "complete";

export type StoreName = "songs" | "services" | "themes" | "sermons";

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type Stored<T extends { id: string }> = T & { ordinal: number };

export type RecordStore = {
  list<T extends { id: string }>(store: StoreName): Promise<Array<Stored<T>>>;
  put<T extends { id: string }>(store: StoreName, row: Stored<T>): Promise<void>;
  remove(store: StoreName, id: string): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
};

export type BrowserLibrary = {
  songs(): Promise<Song[]>;
  saveSong(song: Song): Promise<void>;
  deleteSong(id: string): Promise<void>;
  services(): Promise<Service[]>;
  getService(id: string): Promise<Service | null>;
  saveService(service: Service): Promise<void>;
  themes(): Promise<Theme[]>;
  saveTheme(theme: Theme): Promise<void>;
  sermons(): Promise<Sermon[]>;
  saveSermon(sermon: Sermon): Promise<void>;
  deleteSermon(id: string): Promise<void>;
  importSnapshot(snapshot: LibrarySnapshot): Promise<void>;
};

function ensureStore(db: IDBDatabase, name: string, options?: IDBObjectStoreParameters) {
  if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, options);
}

export function upgradeBrowserDatabase(db: IDBDatabase, oldVersion: number, newVersion = BROWSER_SCHEMA_VERSION) {
  if (oldVersion < 1 && newVersion >= 1) {
    ensureStore(db, "songs", { keyPath: "id" });
    ensureStore(db, "services", { keyPath: "id" });
    ensureStore(db, "themes", { keyPath: "id" });
    ensureStore(db, "meta", { keyPath: "key" });
  }
  if (oldVersion < 2 && newVersion >= 2) {
    ensureStore(db, BROWSER_MEDIA_STORE, { keyPath: "id" });
  }
  if (oldVersion < 3 && newVersion >= 3) {
    ensureStore(db, "sermons", { keyPath: "id" });
  }
}

export function openBrowserDatabase(factory: IDBFactory, version = BROWSER_SCHEMA_VERSION): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(BROWSER_DB_NAME, version);
    request.onupgradeneeded = (event) => {
      upgradeBrowserDatabase(request.result, event.oldVersion, event.newVersion ?? version);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open the browser library."));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser storage failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage write was aborted."));
  });
}

export function idbRecordStore(db: IDBDatabase): RecordStore {
  return {
    async list<T extends { id: string }>(store: StoreName) {
      const transaction = db.transaction(store, "readonly");
      const rows = await requestResult(transaction.objectStore(store).getAll());
      await transactionDone(transaction);
      return rows as Array<Stored<T>>;
    },
    async put<T extends { id: string }>(store: StoreName, row: Stored<T>) {
      const transaction = db.transaction(store, "readwrite");
      transaction.objectStore(store).put(row);
      await transactionDone(transaction);
    },
    async remove(store: StoreName, id: string) {
      const transaction = db.transaction(store, "readwrite");
      transaction.objectStore(store).delete(id);
      await transactionDone(transaction);
    },
    async getMeta(key: string) {
      const transaction = db.transaction("meta", "readonly");
      const row = await requestResult(transaction.objectStore("meta").get(key));
      await transactionDone(transaction);
      return row ? (row as { value: string }).value : null;
    },
    async setMeta(key: string, value: string) {
      const transaction = db.transaction("meta", "readwrite");
      transaction.objectStore("meta").put({ key, value });
      await transactionDone(transaction);
    },
  };
}

export function memoryRecordStore(): RecordStore {
  const tables = new Map<StoreName, Map<string, Stored<{ id: string }>>>();
  const meta = new Map<string, string>();
  const table = (store: StoreName) => {
    const existing = tables.get(store);
    if (existing) return existing;
    const created = new Map<string, Stored<{ id: string }>>();
    tables.set(store, created);
    return created;
  };
  return {
    async list<T extends { id: string }>(store: StoreName) {
      return [...table(store).values()] as Array<Stored<T>>;
    },
    async put<T extends { id: string }>(store: StoreName, row: Stored<T>) {
      table(store).set(row.id, structuredClone(row));
    },
    async remove(store, id) {
      table(store).delete(id);
    },
    async getMeta(key) {
      return meta.get(key) ?? null;
    },
    async setMeta(key, value) {
      meta.set(key, value);
    },
  };
}

function withoutOrdinal<T extends { id: string }>(row: Stored<T>): Omit<T, "ordinal"> {
  const { ordinal, ...copy } = row;
  void ordinal;
  return copy;
}

function byRecent<T extends { id: string }>(rows: Array<Stored<T>>): Array<Omit<T, "ordinal">> {
  return [...rows].sort((a, b) => b.ordinal - a.ordinal).map(withoutOrdinal);
}

function nextOrdinal(rows: Array<{ ordinal: number }>): number {
  return rows.reduce((max, row) => Math.max(max, row.ordinal), 0) + 1;
}

type LegacyList<T> = {
  status: "missing" | "empty" | "ready" | "partial" | "unreadable";
  records: T[];
};

function isSongRecord(value: unknown): value is Song {
  if (!value || typeof value !== "object") return false;
  const song = value as Song;
  return typeof song.id === "string" && typeof song.title === "string" && Array.isArray(song.sections);
}

function isServiceRecord(value: unknown): value is Service {
  if (!value || typeof value !== "object") return false;
  const service = value as Service;
  return typeof service.id === "string" && typeof service.name === "string" && Array.isArray(service.sections);
}

function readLegacy<T>(storage: KeyValueStore, key: string, accept: (value: unknown) => value is T): LegacyList<T> {
  const raw = storage.getItem(key);
  if (raw === null) return { status: "missing", records: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { status: "unreadable", records: [] };
    if (parsed.length === 0) return { status: "empty", records: [] };
    const records = parsed.filter(accept);
    if (records.length === parsed.length) return { status: "ready", records };
    return { status: records.length > 0 ? "partial" : "unreadable", records };
  } catch {
    return { status: "unreadable", records: [] };
  }
}

async function verified(records: RecordStore, store: StoreName, ids: string[]) {
  const stored = new Set((await records.list(store)).map((row) => row.id));
  return ids.every((id) => stored.has(id));
}

async function writeImported<T extends { id: string }>(records: RecordStore, store: StoreName, values: T[]) {
  let ordinal = values.length;
  for (const value of values) {
    await records.put(store, { ...value, ordinal });
    ordinal -= 1;
  }
}

/**
 * Copies legacy lists once. The completion mark is written only after the copied ids are read back.
 * A key is removed only when every record in it was valid and verified. Unreadable keys stay put.
 * An older mark of "1" counts as complete so a finished migration is not run again.
 */
export async function migrateLocalLists(records: RecordStore, storage: KeyValueStore) {
  const mark = await records.getMeta(MIGRATION_META);
  if (mark === MIGRATION_COMPLETE || mark === "1") return;
  const songs = readLegacy(storage, LEGACY_SONGS, isSongRecord);
  const services = readLegacy(storage, LEGACY_SERVICES, isServiceRecord);
  if (songs.records.length > 0) await writeImported(records, "songs", songs.records);
  if (services.records.length > 0) await writeImported(records, "services", services.records);
  const songsVerified = songs.records.length === 0 || (await verified(records, "songs", songs.records.map((song) => song.id)));
  const servicesVerified = services.records.length === 0 || (await verified(records, "services", services.records.map((service) => service.id)));
  if (!songsVerified || !servicesVerified) throw new Error("Browser library migration could not be read back.");
  if (songs.status === "ready" || songs.status === "empty") storage.removeItem(LEGACY_SONGS);
  if (services.status === "ready" || services.status === "empty") storage.removeItem(LEGACY_SERVICES);
  const finished = songs.status !== "partial" && songs.status !== "unreadable" && services.status !== "partial" && services.status !== "unreadable";
  if (finished) await records.setMeta(MIGRATION_META, MIGRATION_COMPLETE);
}

/** Writes an import, then puts the previous rows back if a later write throws. */
export async function importLibraryRecords(records: RecordStore, snapshot: LibrarySnapshot) {
  const applied: Array<{ store: StoreName; id: string; previous: Stored<{ id: string }> | null }> = [];
  const write = async <T extends { id: string }>(store: StoreName, value: T) => {
    const rows = await records.list<T>(store);
    const previous = rows.find((row) => row.id === value.id) ?? null;
    const ordinal = previous?.ordinal ?? nextOrdinal(rows);
    await records.put(store, { ...value, ordinal });
    applied.push({ store, id: value.id, previous });
  };
  try {
    for (const song of snapshot.songs) await write("songs", song);
    for (const service of snapshot.services) await write("services", service);
    for (const theme of snapshot.themes) await write("themes", sanitizeTheme(theme));
  } catch (error) {
    for (const change of applied.reverse()) {
      if (change.previous) await records.put(change.store, change.previous);
      else await records.remove(change.store, change.id);
    }
    throw error;
  }
}

export function createLibrary(getStore: () => Promise<RecordStore>): BrowserLibrary {
  let storePromise: Promise<RecordStore> | null = null;
  const records = () => {
    storePromise ??= getStore();
    return storePromise;
  };
  const save = async <T extends { id: string }>(store: StoreName, value: T) => {
    const database = await records();
    const rows = await database.list<T>(store);
    await database.put(store, { ...value, ordinal: nextOrdinal(rows) });
  };
  return {
    async songs() {
      return byRecent(await (await records()).list<Song>("songs"));
    },
    saveSong: (song) => save("songs", song),
    async deleteSong(id) {
      await (await records()).remove("songs", id);
    },
    async services() {
      return byRecent(await (await records()).list<Service>("services"));
    },
    async getService(id) {
      const services = await this.services();
      return services.find((service) => service.id === id) ?? null;
    },
    saveService: (service) => save("services", service),
    async themes() {
      return byRecent(await (await records()).list<Theme>("themes")).map(sanitizeTheme);
    },
    saveTheme: (theme) => save("themes", sanitizeTheme(theme)),
    async sermons() {
      return byRecent(await (await records()).list<Sermon>("sermons")).map(sanitizeSermon);
    },
    saveSermon: (sermon) => save("sermons", sanitizeSermon(sermon)),
    async deleteSermon(id) {
      await (await records()).remove("sermons", id);
    },
    async importSnapshot(snapshot) {
      await importLibraryRecords(await records(), snapshot);
    },
  };
}

export async function openLibrary(factory: IDBFactory, legacy?: KeyValueStore): Promise<BrowserLibrary> {
  const db = await openBrowserDatabase(factory);
  const records = idbRecordStore(db);
  if (legacy) await migrateLocalLists(records, legacy);
  return createLibrary(async () => records);
}

function legacyStorage(): KeyValueStore {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.getItem("__church_studio_probe__");
      return localStorage;
    }
  } catch {
    // Private mode. Migration has nothing durable to read.
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

async function openDefault(): Promise<BrowserLibrary> {
  if (typeof indexedDB === "undefined") return createLibrary(async () => memoryRecordStore());
  const db = await openBrowserDatabase(indexedDB);
  const records = idbRecordStore(db);
  await migrateLocalLists(records, legacyStorage());
  return createLibrary(async () => records);
}

let opening: Promise<BrowserLibrary> | null = null;

function ready(): Promise<BrowserLibrary> {
  opening ??= openDefault().catch((error) => {
    console.error(error);
    return createLibrary(async () => memoryRecordStore());
  });
  return opening;
}

export const browserLibrary: BrowserLibrary = {
  songs: () => ready().then((library) => library.songs()),
  saveSong: (song) => ready().then((library) => library.saveSong(song)),
  deleteSong: (id) => ready().then((library) => library.deleteSong(id)),
  services: () => ready().then((library) => library.services()),
  getService: (id) => ready().then((library) => library.getService(id)),
  saveService: (service) => ready().then((library) => library.saveService(service)),
  themes: () => ready().then((library) => library.themes()),
  saveTheme: (theme) => ready().then((library) => library.saveTheme(theme)),
  sermons: () => ready().then((library) => library.sermons()),
  saveSermon: (sermon) => ready().then((library) => library.saveSermon(sermon)),
  deleteSermon: (id) => ready().then((library) => library.deleteSermon(id)),
  importSnapshot: (snapshot) => ready().then((library) => library.importSnapshot(snapshot)),
};
