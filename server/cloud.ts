// Cloud space: the routes a church's computers use to keep one library between them. Every call
// names the account (token) and the computer (device); the licence is the account's best plan it
// may use, and the computer must hold one of that licence's seats. Records go to the licence's
// library object (library.ts); media bodies go straight to R2 here, once per file by content hash,
// within the plan's limit (cloud-config.ts). A plan that has ended keeps its cloud copy readable
// for 90 days, then it is wiped (the object's alarm).
//
//   POST /v1/cloud/push          { token, device, name, changes }      → { seq, applied, conflicts }
//   POST /v1/cloud/pull          { token, device, name, since }        → { seq, changes, more }
//   POST /v1/cloud/status        { token, device }                     → { licence, plan, usedBytes, limitBytes, over, binBytes, readOnly, devices, syncVideos }
//   POST /v1/cloud/settings      { token, device, syncVideos }
//   POST /v1/cloud/media/claim   { token, device, hash, bytes, name, kind, mediaId } → { upload, stored, full?, tooLarge?, paused?, usedBytes, limitBytes }
//   PUT  /v1/cloud/media/<hash>?token=&device=   (the file)            → { usedBytes }
//   GET  /v1/cloud/media/<hash>?token=&device=                         → the file
//   POST /v1/cloud/media/list, media/remove { hash, everywhere }, history { col, id }, bin, bin/restore { col, id }, bin/empty

import { accountOf, type Account } from "./accounts";
import { keyEnds, readAnyLicense, STALE_DAYS, tooFast, type ApiConfig, type Device } from "./api";
import { cloudLimits, licenceLimitBytes } from "./cloud-config";
import type { LicensePlan } from "../src/lib/domain/license";
import { mayUse, ownershipOf } from "./ownership";
import { getJson, putJson, type Store } from "./store";

const DAY = 86_400_000;
const GB = 1e9;
/** Days a lapsed plan's cloud copy stays readable before it is wiped. */
export const LAPSE_DAYS = 90;

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "cache-control": "no-store" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
const text = (value: unknown, most: number) => (typeof value === "string" ? value.trim().slice(0, most) : "");
const planName = (plan: LicensePlan) => (plan === "church" ? "Church" : "Premium");

type Access = { account: Account; licence: string; plan: LicensePlan; endsAt: number | null; ended: boolean; device: string; name: string };

/** Who is calling, on which licence, from which seat; or the answer that says why not. */
async function access(config: ApiConfig, token: string, device: string, name: string): Promise<Access | Response> {
  const account = token ? await accountOf(config, token) : null;
  if (!account) return json(401, { signedOut: true, error: "Sign in to use cloud space." });
  if (!device) return json(400, { error: "Which computer?" });
  const now = config.now();
  let best: { licence: string; plan: LicensePlan; endsAt: number | null } | null = null;
  let removed = false;
  for (const entry of account.licenses) {
    const read = readAnyLicense(config, entry.key);
    if (!read) continue;
    if (await config.store.get(`revoked:${read.license.id}`)) continue;
    if (!mayUse(await ownershipOf(config, read.license.id), account)) {
      removed = true;
      continue;
    }
    const rank = read.license.plan === "church" ? 2 : 1;
    if (!best || rank > (best.plan === "church" ? 2 : 1)) best = { licence: read.license.id, plan: read.license.plan, endsAt: await keyEnds(config, read.license) };
  }
  if (!best) return removed ? json(403, { removed: true, error: "The owner of this licence took you off it. Ask them to add you again." }) : json(402, { plan: "free", error: "Cloud space comes with Premium and Church." });
  const seats = ((await getJson<Device[]>(config.store, `act:${best.licence}`)) ?? []).filter((seat) => now - Date.parse(seat.seenAt) < STALE_DAYS * DAY);
  if (!seats.some((seat) => seat.device === device)) return json(403, { noSeat: true, error: "This computer is not on the licence. Sign in and activate it, then sync." });
  return { account, licence: best.licence, plan: best.plan, endsAt: best.endsAt, ended: best.endsAt !== null && now >= best.endsAt, device, name: name || seats.find((seat) => seat.device === device)?.name || "Computer" };
}

/** One call into the licence's library object. */
async function library(config: ApiConfig, licence: string, method: string, body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  const stub = config.libraries!.get(config.libraries!.idFromName(licence));
  const response = await stub.fetch(`https://library/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, data: ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
}

const pass = (result: { status: number; data: Record<string, unknown> }) => json(result.status, result.data);

/** The email to write to about a licence's cloud copy: its owner's account, else the address it was bought with. */
async function ownerEmail(config: ApiConfig, licence: string): Promise<string> {
  const ownership = await ownershipOf(config, licence);
  const account = ownership ? await getJson<Account>(config.store, `acct:${ownership.owner}`) : null;
  if (account?.email) return account.email;
  return (await getJson<{ email?: string }>(config.store, `license:${licence}`))?.email ?? "";
}

type Lapse = { endsAt: number; email: string; sent: number[] };

/** A plan that ended: the cloud copy turns read-only now, the owner hears once, and it is wiped 90 days after the end. */
async function lapseIfEnded(config: ApiConfig, who: Access): Promise<void> {
  if (!who.ended || who.endsAt === null) return;
  await library(config, who.licence, "lapse", { readOnly: true, wipeAt: who.endsAt + LAPSE_DAYS * DAY });
  const key = `cloud:lapse:${who.licence}`;
  if (await config.store.get(key)) return;
  const email = await ownerEmail(config, who.licence);
  await putJson(config.store, key, { endsAt: who.endsAt, email, sent: [0] } satisfies Lapse, { endsAt: who.endsAt });
  if (email && config.mail) await config.mail(email, "Your cloud copy stays for 90 days", `${planName(who.plan)} has ended, so Church Studio has stopped syncing between your computers. Everything on each computer stays there. Your cloud copy can still be read for 90 days (until ${dayOf(who.endsAt + LAPSE_DAYS * DAY)}); after that it is removed. Renewing in Settings › Account at any time before then picks up where you left off.`);
}

const dayOf = (at: number) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * Once a day (the worker's cron): the reminders at day 60 and 85 after a plan ended, and the
 * records of lapses whose copy is gone (the library object wipes itself at day 90).
 */
export async function runCloudCron(config: ApiConfig): Promise<void> {
  const now = config.now();
  for (const entry of await config.store.list("cloud:lapse:")) {
    const licence = entry.key.slice("cloud:lapse:".length);
    const lapse = await getJson<Lapse>(config.store, entry.key);
    if (!lapse) continue;
    const days = Math.floor((now - lapse.endsAt) / DAY);
    if (days >= LAPSE_DAYS) {
      await config.store.delete(entry.key);
      await config.store.delete(`cloudused:${licence}`);
      continue;
    }
    const due = days >= 85 ? 85 : days >= 60 ? 60 : null;
    if (due === null || lapse.sent.includes(due)) continue;
    await putJson(config.store, entry.key, { ...lapse, sent: [...lapse.sent, due] }, { endsAt: lapse.endsAt });
    const left = LAPSE_DAYS - due;
    if (lapse.email && config.mail) await config.mail(lapse.email, `Your cloud copy goes in ${left} days`, `Your plan ended on ${dayOf(lapse.endsAt)}. The cloud copy of your songs, services and media is removed on ${dayOf(lapse.endsAt + LAPSE_DAYS * DAY)}. Everything on your own computers stays. To keep the cloud copy, renew in Settings › Account before then.`);
  }
}

/** Everyone's cloud use together, from the per-licence mirror (its summary rides on the key). */
export async function totalUsedBytes(store: Store): Promise<number> {
  return (await store.list("cloudused:")).reduce((sum, entry) => sum + (Number(entry.meta?.usedBytes) || 0), 0);
}

/** After anything that changes a licence's use: the mirror the admin page reads, and the total-cap warnings. */
async function noteUsage(config: ApiConfig, who: Access, usedBytes: number): Promise<void> {
  await putJson(config.store, `cloudused:${who.licence}`, { usedBytes, plan: who.plan, at: config.now() }, { usedBytes, plan: who.plan });
  const limits = await cloudLimits(config.store);
  const cap = limits.totalCapGb * GB;
  const total = await totalUsedBytes(config.store);
  const warned = (await getJson<{ eighty?: boolean; hundred?: boolean }>(config.store, "cloud:warned")) ?? {};
  const next = { eighty: total >= cap * 0.8, hundred: total >= cap };
  if (next.eighty === !!warned.eighty && next.hundred === !!warned.hundred) return;
  await putJson(config.store, "cloud:warned", next);
  const to = config.admin?.alertEmail;
  if (!to || !config.mail) return;
  const gb = (bytes: number) => (bytes / GB).toFixed(1);
  if (next.hundred && !warned.hundred) await config.mail(to, "Cloud space is full", `Every church's cloud space together has reached the cap of ${limits.totalCapGb} GB (${gb(total)} GB used). New pictures and videos are paused for everyone until the cap is raised in the admin page (Cloud space) or files are removed.`);
  else if (next.eighty && !warned.eighty) await config.mail(to, "Cloud space is 80% full", `Every church's cloud space together is at ${gb(total)} GB of the ${limits.totalCapGb} GB cap. At the cap, new pictures and videos pause for everyone.`);
}

/** Cloud routes; null when the path is not one. */
export async function handleCloud(request: Request, config: ApiConfig): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/cloud/")) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-methods": "GET, POST, PUT, OPTIONS" } });
  if (!config.libraries || !config.cloud) return json(503, { error: "Cloud space is not set up on this server yet." });
  const file = url.pathname.match(/^\/v1\/cloud\/media\/([0-9a-f]{64})$/);

  // The file itself, up or down, named in the address.
  if (file && (request.method === "PUT" || request.method === "GET")) {
    const who = await access(config, text(url.searchParams.get("token"), 80), text(url.searchParams.get("device"), 80), "");
    if (who instanceof Response) return who;
    const hash = file[1]!;
    const key = `lib/${who.licence}/${hash}`;
    if (request.method === "GET") {
      const object = await config.cloud.get(key);
      if (!object) return json(404, { error: "That file is not in the cloud." });
      return new Response(object.body, { status: 200, headers: { ...CORS, "content-type": object.httpMetadata?.contentType || "application/octet-stream", "content-length": String(object.size) } });
    }
    if (who.ended) return json(403, { readOnly: true, error: `${planName(who.plan)} has ended: the cloud copy can be read but not changed.` });
    const claim = await library(config, who.licence, "claim", { hash });
    if (claim.status !== 200) return json(409, { error: "Claim the file first." });
    if (claim.data.storedAt) return json(200, { usedBytes: Number((await library(config, who.licence, "status", {})).data.usedBytes) || 0, stored: true });
    if (!request.body) return json(400, { error: "The file is missing." });
    const contentType = text(request.headers.get("content-type"), 100) || "application/octet-stream";
    await config.cloud.put(key, request.body, { httpMetadata: { contentType } });
    const bytes = (await config.cloud.head(key))?.size ?? Number(claim.data.bytes) ?? 0;
    const done = await library(config, who.licence, "mediaDone", { hash, bytes });
    if (done.status !== 200) return pass(done);
    await noteUsage(config, who, Number(done.data.usedBytes) || 0);
    return json(200, { usedBytes: done.data.usedBytes });
  }

  if (request.method !== "POST") return json(405, { error: "POST, PUT or GET." });
  const body = ((await request.json().catch(() => null)) ?? null) as Record<string, unknown> | null;
  if (!body) return json(400, { error: "Bad request." });
  const route = url.pathname.slice("/v1/cloud/".length);
  if ((route === "push" || route === "media/claim") && (await tooFast(config, request, "cloud"))) return json(429, { error: "Too many requests from this network. Wait a minute and try again." });
  const who = await access(config, text(body.token, 80), text(body.device, 80), text(body.name, 60));
  if (who instanceof Response) return who;
  await lapseIfEnded(config, who);
  const readOnly = () => json(403, { readOnly: true, error: `${planName(who.plan)} has ended: the cloud copy can be read but not changed.` });

  switch (route) {
    case "push":
      if (who.ended) return readOnly();
      return pass(await library(config, who.licence, "push", { device: who.device, name: who.name, changes: Array.isArray(body.changes) ? body.changes.slice(0, 2000) : [] }));
    case "pull":
      return pass(await library(config, who.licence, "pull", { since: Number(body.since) || 0, device: who.device, name: who.name }));
    case "status": {
      const status = await library(config, who.licence, "status", {});
      if (status.status !== 200) return pass(status);
      const limitBytes = await licenceLimitBytes(config.store, who.licence, who.plan);
      const usedBytes = Number(status.data.usedBytes) || 0;
      return json(200, { ...status.data, licence: who.licence, plan: who.plan, limitBytes, usedBytes, over: usedBytes > limitBytes, endsAt: who.endsAt });
    }
    case "settings":
      return pass(await library(config, who.licence, "settings", { syncVideos: body.syncVideos }));
    case "media/claim": {
      if (who.ended) return readOnly();
      const hash = text(body.hash, 64);
      if (!/^[0-9a-f]{64}$/.test(hash)) return json(400, { error: "A file needs its SHA-256 hash." });
      const limits = await cloudLimits(config.store);
      const paused = (await totalUsedBytes(config.store)) >= limits.totalCapGb * GB;
      const limitBytes = await licenceLimitBytes(config.store, who.licence, who.plan);
      return pass(await library(config, who.licence, "claimMedia", { hash, bytes: Number(body.bytes) || 0, name: text(body.name, 200), kind: text(body.kind, 20), mediaId: text(body.mediaId, 80), device: who.device, limitBytes, maxFileBytes: limits.maxFileGb * GB, paused }));
    }
    case "media/list":
      return pass(await library(config, who.licence, "media", {}));
    case "media/remove": {
      const hash = text(body.hash, 64);
      const removed = await library(config, who.licence, "removeMedia", { hash, everywhere: body.everywhere === true });
      if (removed.status !== 200) return pass(removed);
      if (removed.data.deleteKey) await config.cloud.delete(`lib/${who.licence}/${hash}`);
      await noteUsage(config, who, Number(removed.data.usedBytes) || 0);
      return json(200, { usedBytes: removed.data.usedBytes });
    }
    case "history":
      return pass(await library(config, who.licence, "history", { col: text(body.col, 40), id: text(body.id, 200) }));
    case "bin":
      return pass(await library(config, who.licence, "bin", {}));
    case "bin/restore":
      if (who.ended) return readOnly();
      return pass(await library(config, who.licence, "restore", { col: text(body.col, 40), id: text(body.id, 200) }));
    case "bin/empty":
      return pass(await library(config, who.licence, "emptyBin", {}));
    default:
      return json(404, { error: "Unknown cloud call." });
  }
}
