import type { MediaAsset } from "../domain/types";
import { BROWSER_MEDIA_STORE, openBrowserDatabase } from "./browser-store";

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const EXT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export type StoredMedia = MediaAsset & {
  type: string;
  blob: Blob;
};

export type MediaStore = {
  list(): Promise<StoredMedia[]>;
  put(record: StoredMedia): Promise<void>;
  get(id: string): Promise<StoredMedia | null>;
};

export type BrowserMedia = {
  list(): Promise<MediaAsset[]>;
  importFile(file: File): Promise<MediaAsset>;
  url(id: string): string | null;
};

export function imageTypeOf(file: { name: string; type: string }): string | null {
  const type = file.type.trim().toLowerCase();
  if (ALLOWED_IMAGE_TYPES.has(type)) return type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? null;
}

export function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

function asAsset(row: StoredMedia): MediaAsset {
  return { id: row.id, name: row.name, path: "", kind: "image", createdAt: row.createdAt };
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

export function idbMediaStore(db: IDBDatabase): MediaStore {
  return {
    async list() {
      const transaction = db.transaction(BROWSER_MEDIA_STORE, "readonly");
      const rows = await requestResult(transaction.objectStore(BROWSER_MEDIA_STORE).getAll());
      await transactionDone(transaction);
      return rows as StoredMedia[];
    },
    async put(record) {
      const transaction = db.transaction(BROWSER_MEDIA_STORE, "readwrite");
      transaction.objectStore(BROWSER_MEDIA_STORE).put(record);
      await transactionDone(transaction);
    },
    async get(id) {
      const transaction = db.transaction(BROWSER_MEDIA_STORE, "readonly");
      const row = await requestResult(transaction.objectStore(BROWSER_MEDIA_STORE).get(id));
      await transactionDone(transaction);
      return (row as StoredMedia | undefined) ?? null;
    },
  };
}

export function memoryMediaStore(seed: StoredMedia[] = []): MediaStore {
  const rows = new Map<string, StoredMedia>(seed.map((row) => [row.id, row]));
  return {
    async list() {
      return [...rows.values()].map((row) => ({ ...row }));
    },
    async put(record) {
      rows.set(record.id, { ...record });
    },
    async get(id) {
      const row = rows.get(id);
      return row ? { ...row } : null;
    },
  };
}

export function createMediaAdapter(
  getStore: () => Promise<MediaStore>,
  options?: { now?: () => string; id?: () => string },
): BrowserMedia {
  let storePromise: Promise<MediaStore> | null = null;
  const store = () => {
    storePromise ??= getStore();
    return storePromise;
  };
  const urls = new Map<string, string>();
  const now = options?.now ?? (() => new Date().toISOString());
  const nextId = options?.id ?? (() => crypto.randomUUID());

  const remember = (id: string, blob: Blob) => {
    if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob));
  };

  return {
    async list() {
      const rows = await (await store()).list();
      for (const row of rows) {
        if (row.blob) remember(row.id, row.blob);
      }
      return rows
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        .map(asAsset);
    },
    async importFile(file) {
      const type = imageTypeOf(file);
      if (!type) throw new Error("Use a PNG, JPEG, WebP, or GIF image.");
      if (file.size > MAX_IMAGE_BYTES) throw new Error("That image is larger than 25 MB. It was not saved.");
      const record: StoredMedia = {
        id: nextId(),
        name: file.name || "image",
        path: "",
        kind: "image",
        createdAt: now(),
        type,
        blob: file,
      };
      try {
        await (await store()).put(record);
      } catch (error) {
        if (isQuotaExceeded(error)) throw new Error("The image was not saved. This browser is out of space.");
        throw error instanceof Error ? error : new Error("The image was not saved.");
      }
      remember(record.id, file);
      return asAsset(record);
    },
    url(id) {
      return urls.get(id) ?? null;
    },
  };
}

async function openDefault(): Promise<BrowserMedia> {
  if (typeof indexedDB === "undefined") return createMediaAdapter(async () => memoryMediaStore());
  const db = await openBrowserDatabase(indexedDB);
  return createMediaAdapter(async () => idbMediaStore(db));
}

let opening: Promise<BrowserMedia> | null = null;
let adapter: BrowserMedia | null = null;

function ready(): Promise<BrowserMedia> {
  opening ??= openDefault()
    .then((media) => {
      adapter = media;
      return media;
    })
    .catch((error) => {
      console.error(error);
      adapter = createMediaAdapter(async () => memoryMediaStore());
      return adapter;
    });
  return opening;
}

export const browserMedia: BrowserMedia = {
  list: () => ready().then((media) => media.list()),
  importFile: (file) => ready().then((media) => media.importFile(file)),
  url: (id) => adapter?.url(id) ?? null,
};
