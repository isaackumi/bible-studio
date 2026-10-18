// Device activations: how many computers one license key runs on at once (Premium 1, Church 3).
// The app asks here when a key is added and now and then after; this keeps the list per key.
// A computer not seen for 60 days drops off by itself, so a replaced laptop frees its place.
//
//   POST /v1/activate {key, device, name}  → {ok, seats, devices} or 409 {full, seats, devices}
//   POST /v1/release  {key, device}        → {ok, seats, devices}
//   POST /v1/devices  {key}                → {ok, seats, devices}
//
// Storage is any small key-value store (Cloudflare KV in production, a Map in tests).

import { readLicense, type LicensePlan } from "../src/lib/domain/license.ts";

export type Store = { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> };

export type Device = { device: string; name: string; seenAt: string };

/** Computers per plan at the same time. Keep in step with `computers` in src/lib/domain/plans.ts. */
export const SEATS: Record<LicensePlan, number> = { premium: 1, church: 3 };

const STALE_DAYS = 60;
const DAY = 86_400_000;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
}

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function handleActivation(request: Request, store: Store, now = Date.now(), publicKey?: string): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const path = new URL(request.url).pathname;
  if (request.method !== "POST" || !["/v1/activate", "/v1/release", "/v1/devices"].includes(path)) return reply(404, { error: "Not found" });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return reply(400, { error: "Send JSON." });
  }
  const license = readLicense(clean(body.key, 300), publicKey);
  if (!license) return reply(401, { error: "That license key is not valid." });
  const seats = SEATS[license.plan];
  const slot = `act:${license.id}`;
  const fresh = (entry: Device) => now - Date.parse(entry.seenAt) < STALE_DAYS * DAY;
  const saved = JSON.parse((await store.get(slot)) ?? "[]") as Device[];
  let devices = saved.filter(fresh);
  const device = clean(body.device, 80);

  if (path === "/v1/activate") {
    if (!device) return reply(400, { error: "Which computer?" });
    const name = clean(body.name, 60) || "Computer";
    const at = new Date(now).toISOString();
    const known = devices.find((entry) => entry.device === device);
    if (known) devices = devices.map((entry) => (entry.device === device ? { device, name, seenAt: at } : entry));
    else if (devices.length >= seats) return reply(409, { full: true, seats, devices });
    else devices = [...devices, { device, name, seenAt: at }];
  } else if (path === "/v1/release") {
    devices = devices.filter((entry) => entry.device !== device);
  }
  if (path !== "/v1/devices" || devices.length !== saved.length) await store.put(slot, JSON.stringify(devices));
  return reply(200, { ok: true, seats, devices });
}
