// The server's storage: any small key-value store. Cloudflare KV in production, a Map in tests.
// A record can carry a small summary ("meta") that listing returns, so the admin stats read
// thousands of computers in one list instead of one request each.

export type Listed = { key: string; meta: Record<string, unknown> | null };

export type Store = {
  get(key: string): Promise<string | null>;
  /** `ttl`: seconds until the record goes by itself (at least 60, Cloudflare's floor). */
  put(key: string, value: string, meta?: Record<string, unknown>, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<Listed[]>;
};

/** Cloudflare KV as a Store (metadata carries the summary; list pages through every key). */
export type KvNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { metadata?: unknown; expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{ keys: Array<{ name: string; metadata?: unknown }>; list_complete: boolean; cursor?: string }>;
};

export function kvStore(kv: KvNamespace): Store {
  return {
    get: (key) => kv.get(key),
    put: (key, value, meta, ttl) => kv.put(key, value, meta || ttl ? { ...(meta ? { metadata: meta } : {}), ...(ttl ? { expirationTtl: Math.max(60, Math.round(ttl)) } : {}) } : undefined),
    delete: (key) => kv.delete(key),
    async list(prefix) {
      const out: Listed[] = [];
      let cursor: string | undefined;
      do {
        const page = await kv.list({ prefix, cursor });
        for (const entry of page.keys) out.push({ key: entry.name, meta: (entry.metadata as Record<string, unknown> | undefined) ?? null });
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return out;
    },
  };
}

/** An in-memory Store (tests, local runs). */
export function memoryStore(): Store & { dump(): Map<string, { value: string; meta: Record<string, unknown> | null; ttl?: number }> } {
  const data = new Map<string, { value: string; meta: Record<string, unknown> | null; ttl?: number }>();
  return {
    get: async (key) => data.get(key)?.value ?? null,
    put: async (key, value, meta, ttl) => void data.set(key, { value, meta: meta ?? null, ...(ttl ? { ttl } : {}) }),
    delete: async (key) => void data.delete(key),
    list: async (prefix) => [...data.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, entry]) => ({ key, meta: entry.meta })),
    dump: () => data,
  };
}

export async function getJson<T>(store: Store, key: string): Promise<T | null> {
  const raw = await store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** `ttl`: seconds until the record goes by itself (records that only matter for a while). */
export const putJson = (store: Store, key: string, value: unknown, meta?: Record<string, unknown>, ttl?: number) => store.put(key, JSON.stringify(value), meta, ttl);
