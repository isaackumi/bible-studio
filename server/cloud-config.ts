// Cloud space: how much each plan may keep in the cloud, set by the owner from the admin page
// (KV `cfg:cloud`, merged over the defaults field by field) with a per-licence override
// (`cloudcap:<licence>`), and the R2 bucket the media lives in.

import type { LicensePlan } from "../src/lib/domain/license";
import { getJson, putJson, type Store } from "./store";

export type CloudLimits = { premiumGb: number; churchGb: number; maxFileGb: number; totalCapGb: number };

export const CLOUD_DEFAULTS: CloudLimits = { premiumGb: 5, churchGb: 15, maxFileGb: 2, totalCapGb: 500 };

/** A limit in GB: a positive number up to 100,000, else the field is left as it was. */
const MOST_GB = 100_000;
const gb = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MOST_GB ? value : null);
const GB = 1e9;

export async function cloudLimits(store: Store): Promise<CloudLimits> {
  const saved = (await getJson<Partial<Record<keyof CloudLimits, unknown>>>(store, "cfg:cloud")) ?? {};
  const out = { ...CLOUD_DEFAULTS };
  for (const key of Object.keys(CLOUD_DEFAULTS) as Array<keyof CloudLimits>) {
    const value = gb(saved[key]);
    if (value !== null) out[key] = value;
  }
  return out;
}

export async function setCloudLimits(store: Store, patch: Partial<CloudLimits>): Promise<CloudLimits> {
  const current = await cloudLimits(store);
  for (const key of Object.keys(CLOUD_DEFAULTS) as Array<keyof CloudLimits>) {
    const value = gb(patch[key]);
    if (value !== null) current[key] = value;
  }
  await putJson(store, "cfg:cloud", current);
  return current;
}

/** This licence's cloud space in bytes: its own cap when the owner set one, else its plan's. */
export async function licenceLimitBytes(store: Store, licence: string, plan: LicensePlan): Promise<number> {
  const own = gb((await getJson<{ gb?: unknown }>(store, `cloudcap:${licence}`))?.gb);
  if (own !== null) return own * GB;
  const limits = await cloudLimits(store);
  return (plan === "church" ? limits.churchGb : limits.premiumGb) * GB;
}

/** The part of R2 the worker uses, so tests can run on a Map. */
export type R2Object = { body: ReadableStream; size: number; httpMetadata?: { contentType?: string } };
export type R2Like = {
  put(key: string, body: ReadableStream | ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  delete(key: string | string[]): Promise<void>;
  head(key: string): Promise<{ size: number } | null>;
};

export function memoryR2(): R2Like {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  return {
    async put(key, body, options) {
      const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, { bytes, contentType: options?.httpMetadata?.contentType });
    },
    async get(key) {
      const found = objects.get(key);
      if (!found) return null;
      return { body: new Blob([found.bytes]).stream(), size: found.bytes.length, httpMetadata: found.contentType ? { contentType: found.contentType } : undefined };
    },
    async delete(key) {
      for (const name of Array.isArray(key) ? key : [key]) objects.delete(name);
    },
    async head(key) {
      const found = objects.get(key);
      return found ? { size: found.bytes.length } : null;
    },
  };
}

/** The library objects (one per licence), as the worker reaches them: the Durable Object namespace. */
export type LibraryNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string | Request, init?: RequestInit): Promise<Response> };
};
