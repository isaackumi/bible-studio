// The Church Studio server API: everything the app asks about plans and payment, and the admin
// numbers. The app decides its plan only from leases this server signs (src/lib/domain/lease.ts).
//
//   POST /v1/hello      {device, version, os, plan}            → {now, provider, test}   (anonymous check-in)
//   POST /v1/trial      {device, name, promo?}                 → {lease} | 403 {used}    (one trial per computer)
//   POST /v1/promo      {code, plan?, interval?}               → {ok, label, …} | {ok:false, reason}
//   POST /v1/checkout   {plan, interval, email, name, promo?, device?} → {session, url, due, list, test}
//   POST /v1/checkout/status {session, device?, name?}         → {status, key?, lease?}
//   POST /v1/activate   {key, device, name}                    → {ok, seats, devices, lease} | 409 full | 403 revoked | 410 ended
//   POST /v1/release    {key, device}                          → {ok, seats, devices}
//   POST /v1/devices    {key, device?}                         → {ok, seats, devices}
//   GET  /pay/:session  POST /pay/:session[/cancel]            (the mock provider's checkout page)
//   Accounts (optional; see accounts.ts): /v1/signin/*, /v1/account*, /signin/:id, /auth/*
//   GET  /admin                                                (the admin page; asks for the admin token)
//   GET  /v1/admin/stats, GET|POST /v1/admin/promos, POST /v1/admin/refund   (Authorization: Bearer ADMIN_TOKEN)

import { LICENSE_PUBLIC_KEY, publicKeyOf, readLicense, signLicense, TEST_LICENSE_SECRET, type License, type LicensePlan } from "../src/lib/domain/license.ts";
import { signLease, type LeaseKind } from "../src/lib/domain/lease.ts";
import { accountApi, accountOf, linkLicense, noteLicenseEmail, signinRoute, type Identity } from "./accounts.ts";
import { type Platform, type Release } from "./downloads.ts";
import { landingPage } from "./landing.ts";
import { EMAIL_LOGO_PNG } from "./brand-logo.ts";
import { licenseKeyEmail } from "./email.ts";
import type { Provider } from "./billing.ts";
import { adminPage, checkoutPage, payPage } from "./pages.ts";
import { privacyPage, refundsPage, termsPage, type Site } from "./site.ts";
import { checkPromo, CURRENCY, makePromo, normalizeCode, PERIOD_DAYS, priceAfter, type Interval, type Promo } from "./pricing.ts";
import { getJson, putJson, type Store } from "./store.ts";

/** Where the server lives when no address is set (links and the logo in emails). */
const DEFAULT_PUBLIC_URL = "https://church-studio.heitechinc.com";

export type ApiConfig = {
  store: Store;
  /** Ed25519 secret key (hex) for license keys and leases. */
  signingKey: string;
  /** Only tests pass a public key; the app embeds the real one. */
  publicKey?: string;
  /**
   * Test-mode purchases (mock, sandbox) are signed with this key instead, which release builds of
   * the app refuse, so a test checkout can never unlock a real copy. Default: the published test key.
   */
  testSigningKey?: string;
  provider: Provider;
  /** The public pages' business name and contact address. */
  site?: Site;
  /** Paddle.js for the checkout page (/checkout, Paddle's default payment link): a client-side token. */
  paddleClient?: { token: string; sandbox: boolean };
  /** Who is signed in (accounts.ts); missing: accounts are off and everything else still works. */
  identity?: Identity;
  adminToken?: string;
  /** Days a computer may stay offline before it must check in (a lease's reach). */
  leaseDays: number;
  trialDays: number;
  /** Days a subscription key keeps working past the paid period, to cover a late renewal. */
  graceDays: number;
  /** Sends the key email, if mail is set up. */
  mail?: (to: string, subject: string, text: string, html?: string) => Promise<void>;
  /** The server's public address, for links and the logo in emails. */
  publicUrl?: string;
  /** The newest release on GitHub, for the home page and /download/… (none: the release page). */
  releases?: () => Promise<Release | null>;
  /** How the server fetches a release file to hand on (tests pass their own). */
  fetcher?: typeof fetch;
  now: () => number;
};

/** Computers per plan at the same time. Keep in step with `computers` in src/lib/domain/plans.ts. */
export const SEATS: Record<LicensePlan, number> = { premium: 1, church: 3 };

const DAY = 86_400_000;
const STALE_DAYS = 60;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
const html = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

type Device = { device: string; name: string; seenAt: string };
type Checkout = {
  id: string;
  plan: LicensePlan;
  interval: Interval;
  email: string;
  name: string;
  promo: string | null;
  list: number;
  due: number;
  currency: string;
  device: string | null;
  status: "pending" | "paid" | "cancelled";
  createdAt: number;
  paidAt?: number;
  key?: string;
  license?: string;
  reference?: string | null;
  /** The account that bought it, when the buyer was signed in. */
  account?: string | null;
};
type Trial = { device: string; startedAt: number; endsAt: number; promo: string | null };
/** A signed-in person's trial: one per account, whichever computers they use. */
type AccountTrial = { device: string; startedAt: number; endsAt: number };
/** New trials one network address may start in a day (a church office shares one address). */
export const TRIALS_PER_ADDRESS = 5;
type Subscription = { id: string; license: string; plan: LicensePlan; interval: Interval; email: string; renewsAt: number; status: "active" | "refunded" };
/** Per license: what it is paid through (moved on by each renewal), whatever date its key carries. */
type LicenseRecord = { sub: string | null; email: string; paidUntil: number; test: boolean };

/** Releases a key may make in 30 days (a released computer keeps its lease until it checks in). */
const RELEASES_PER_30_DAYS = 3;

type Signer = { secret: string; public: string; test: boolean };
const realSigner = (config: ApiConfig): Signer => ({ secret: config.signingKey, public: config.publicKey ?? LICENSE_PUBLIC_KEY, test: false });
const DEFAULT_SITE: Site = { company: "HeiTech", contact: "support@heitechinc.com" };

const testSigner = (config: ApiConfig): Signer => {
  const secret = config.testSigningKey ?? TEST_LICENSE_SECRET;
  return { secret, public: publicKeyOf(secret), test: true };
};

/** Read a key with the real key, else the test key; the signer that made it signs its leases too. */
export function readAnyLicense(config: ApiConfig, text: string): { license: License; signer: Signer } | null {
  for (const signer of [realSigner(config), testSigner(config)]) {
    const license = readLicense(text, signer.public);
    if (license) return { license, signer };
  }
  return null;
}

/** Constant-time text comparison (the admin token). */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Hex of the first 4 bytes of SHA-256(text): stable ids, so one subscription keeps one key id. */
async function shortId(seed: string): Promise<Uint8Array> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  return digest.slice(0, 4);
}
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const randomId = (prefix: string) => `${prefix}_${hex(crypto.getRandomValues(new Uint8Array(12)))}`;

/**
 * A download, from this address: the newest release's file for the platform, streamed through from
 * GitHub (kept in Cloudflare's cache near the visitor) under its own name, so nobody is sent to
 * GitHub. With no file to hand, back to the download section of the home page.
 */
async function serveDownload(config: ApiConfig, platform: Platform): Promise<Response> {
  const release = config.releases ? await config.releases().catch(() => null) : null;
  const asset = release?.assets[platform];
  if (!asset) return new Response(null, { status: 302, headers: { location: "/#download" } });
  const http = config.fetcher ?? fetch;
  const upstream = await http(asset.url, { redirect: "follow", cf: { cacheEverything: true, cacheTtl: 86_400 } } as RequestInit).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response(null, { status: 302, headers: { location: asset.url } });
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${asset.name.replace(/"/g, "")}"`,
      ...(upstream.headers.get("content-length") ? { "content-length": upstream.headers.get("content-length")! } : {}),
      "cache-control": "public, max-age=3600",
    },
  });
}

export async function handleApi(request: Request, config: ApiConfig): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  const path = url.pathname;
  // Links people open (sign-in, checkout) use the public address, whichever address the app called.
  const origin = config.publicUrl?.replace(/\/+$/, "") || url.origin;

  // Pages.
  if (path === "/admin" && request.method === "GET") return html(200, adminPage());
  // The app icon for emails (mail apps cannot show SVG).
  if (path === "/email/logo.png" && request.method === "GET") {
    const bytes = Uint8Array.from(atob(EMAIL_LOGO_PNG), (char) => char.charCodeAt(0));
    return new Response(bytes, { status: 200, headers: { "content-type": "image/png", "cache-control": "public, max-age=604800" } });
  }
  if (request.method === "GET") {
    const site = config.site ?? DEFAULT_SITE;
    if (path === "/") return html(200, landingPage(site, config.releases ? await config.releases().catch(() => null) : null));
    const download = path.match(/^\/download\/([a-z-]+)$/);
    if (download) return serveDownload(config, download[1] as Platform);
    if (path === "/terms") return html(200, termsPage(site));
    if (path === "/privacy") return html(200, privacyPage(site));
    if (path === "/refunds") return html(200, refundsPage(site));
    if (path === "/checkout") return config.paddleClient ? html(200, checkoutPage(config.paddleClient)) : html(404, landingPage(site, null));
  }
  const pay = path.match(/^\/pay\/([A-Za-z0-9_]+)(\/cancel)?$/);
  if (pay) return payRoute(request, config, pay[1]!, !!pay[2]);
  const signin = path.match(/^\/signin\/([0-9a-f]{24})(?:\/(confirm|cancel))?$/);
  if (signin) return signinRoute(request, config, signin[1]!, signin[2]);
  if (path.startsWith("/auth/")) return config.identity ? config.identity.handler(request) : json(404, { error: "Accounts are not set up on this server yet." });

  // Admin.
  if (path.startsWith("/v1/admin/")) {
    if (!config.adminToken) return json(503, { error: "Set ADMIN_TOKEN on the server first." });
    if (!sameText(request.headers.get("authorization") ?? "", `Bearer ${config.adminToken}`)) return json(401, { error: "Wrong admin token." });
    if (path === "/v1/admin/stats" && request.method === "GET") return json(200, await stats(config));
    if (path === "/v1/admin/promos" && request.method === "GET") return json(200, { promos: await listPromos(config.store) });
    if (path === "/v1/admin/promos" && request.method === "POST") {
      const promo = makePromo((await body(request)) ?? {}, config.now());
      if (!promo) return json(400, { error: "A code needs at least 3 letters and a discount or trial days." });
      if (await config.store.get(`promo:${promo.code}`)) return json(409, { error: "That code exists already." });
      await putJson(config.store, `promo:${promo.code}`, promo, { used: 0 });
      return json(200, { promo });
    }
    if (path === "/v1/admin/renew" && request.method === "POST") {
      // A renewal by hand (the mock provider has no renewals of its own): one more paid period.
      const input = (await body(request)) ?? {};
      const until = await renewLicense(config, text(input.license, 16).toLowerCase(), null);
      return until ? json(200, { ok: true, paidUntil: until }) : json(404, { error: "No such license." });
    }
    if (path === "/v1/admin/refund" && request.method === "POST") {
      const input = (await body(request)) ?? {};
      const license = text(input.license, 16).toLowerCase();
      if (!/^[0-9a-f]{8}$/.test(license)) return json(400, { error: "Which license id (8 hex characters)?" });
      await revoke(config, license, text(input.reason, 80) || "refund");
      return json(200, { ok: true });
    }
    return json(404, { error: "Not found" });
  }

  if (request.method !== "POST" || !path.startsWith("/v1/")) return json(404, { error: "Not found" });
  const input = await body(request);
  if (!input) return json(400, { error: "Send JSON." });

  switch (path) {
    case "/v1/hello":
      return hello(config, input);
    case "/v1/trial":
      return trial(config, input, request.headers.get("cf-connecting-ip"));
    case "/v1/promo": {
      const plan = input.plan === "premium" || input.plan === "church" ? input.plan : null;
      const interval = input.interval === "monthly" || input.interval === "yearly" ? input.interval : null;
      const promo = await getJson<Promo>(config.store, `promo:${normalizeCode(text(input.code, 40))}`);
      return json(200, checkPromo(promo, plan, interval, config.now()));
    }
    case "/v1/checkout":
      return startCheckout(config, input, origin);
    case "/v1/checkout/status":
      return checkoutStatus(config, input);
    case "/v1/activate":
    case "/v1/lease":
    case "/v1/release":
    case "/v1/devices":
      return seats(config, path, input);
    default:
      return (await accountApi(config, path, input, origin)) ?? json(404, { error: "Not found" });
  }
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// --- Check-in and stats --------------------------------------------------------------------

type DeviceMeta = { first: number; last: number; plan: string; version: string; os: string; trial?: number; paid?: number };

async function hello(config: ApiConfig, input: Record<string, unknown>): Promise<Response> {
  const device = text(input.device, 80);
  if (device) await noteDevice(config, device, { plan: text(input.plan, 12) || "free", version: text(input.version, 20), os: text(input.os, 20) });
  return json(200, { now: config.now(), provider: config.provider.name, test: config.provider.test });
}

async function noteDevice(config: ApiConfig, device: string, change: Partial<DeviceMeta>): Promise<void> {
  const key = `device:${device}`;
  const now = config.now();
  const saved = await getJson<DeviceMeta>(config.store, key);
  // At most one write a day per computer unless something changed (KV writes are the scarce part).
  const same = saved && Object.entries(change).every(([name, value]) => value === "" || value === undefined || saved[name as keyof DeviceMeta] === value);
  if (same && now - saved.last < 20 * 3_600_000) return;
  const next: DeviceMeta = { first: saved?.first ?? now, last: now, plan: "free", version: "", os: "", ...saved, ...Object.fromEntries(Object.entries(change).filter(([, value]) => value !== "" && value !== undefined)) };
  next.last = now;
  await putJson(config.store, key, next, next as unknown as Record<string, unknown>);
}

async function stats(config: ApiConfig) {
  const now = config.now();
  const devices = (await config.store.list("device:")).map((entry) => entry.meta as DeviceMeta | null).filter((meta): meta is DeviceMeta => !!meta);
  const active = (days: number) => devices.filter((meta) => now - meta.last < days * DAY).length;
  const count = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((all, value) => ({ ...all, [value || "unknown"]: (all[value || "unknown"] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const trials = (await config.store.list("trial:")).map((entry) => entry.meta as { startedAt: number; endsAt: number; converted?: boolean } | null).filter(Boolean) as Array<{ startedAt: number; endsAt: number; converted?: boolean }>;
  const checkouts = (await config.store.list("checkout:")).map((entry) => entry.meta as { status: string; due: number; plan: string; interval: string; promo: string | null; paidAt?: number } | null).filter(Boolean) as Array<{ status: string; due: number; plan: string; interval: string; promo: string | null; paidAt?: number }>;
  const paid = checkouts.filter((entry) => entry.status === "paid");
  const subs = (await config.store.list("sub:")).map((entry) => entry.meta as { status: string; plan: string; interval: string } | null).filter(Boolean) as Array<{ status: string; plan: string; interval: string }>;
  const activeSubs = subs.filter((entry) => entry.status === "active");
  const mrr = activeSubs.reduce((sum, entry) => {
    const price = { premium: { monthly: 1200, yearly: 12000 }, church: { monthly: 2900, yearly: 29000 } }[entry.plan as LicensePlan]?.[entry.interval as Interval] ?? 0;
    return sum + (entry.interval === "yearly" ? price / 12 : price);
  }, 0);
  return {
    provider: config.provider.name,
    test: config.provider.test,
    computers: { total: devices.length, active1: active(1), active7: active(7), active30: active(30), newThisWeek: devices.filter((meta) => now - meta.first < 7 * DAY).length },
    plans: count(devices.filter((meta) => now - meta.last < 30 * DAY).map((meta) => meta.plan)),
    versions: count(devices.filter((meta) => now - meta.last < 30 * DAY).map((meta) => meta.version)).slice(0, 8),
    systems: count(devices.filter((meta) => now - meta.last < 30 * DAY).map((meta) => meta.os)),
    trials: { started: trials.length, running: trials.filter((entry) => entry.endsAt > now).length, converted: trials.filter((entry) => entry.converted).length },
    sales: {
      checkouts: checkouts.length,
      paid: paid.length,
      revenue: paid.reduce((sum, entry) => sum + entry.due, 0),
      revenue30: paid.filter((entry) => (entry.paidAt ?? 0) > now - 30 * DAY).reduce((sum, entry) => sum + entry.due, 0),
      currency: CURRENCY,
      byPlan: count(paid.map((entry) => `${entry.plan} ${entry.interval}`)),
      withPromo: paid.filter((entry) => entry.promo).length,
    },
    subscriptions: { active: activeSubs.length, refunded: subs.length - activeSubs.length, mrr: Math.round(mrr) },
    promos: (await listPromos(config.store)).map((promo) => ({ code: promo.code, used: promo.used, maxUses: promo.maxUses ?? null, expiresAt: promo.expiresAt ?? null })),
  };
}

async function listPromos(store: Store): Promise<Promo[]> {
  const entries = await store.list("promo:");
  const promos = await Promise.all(entries.map((entry) => getJson<Promo>(store, entry.key)));
  return promos.filter((promo): promo is Promo => !!promo).sort((a, b) => b.createdAt - a.createdAt);
}

async function usePromo(config: ApiConfig, code: string | null): Promise<void> {
  if (!code) return;
  const promo = await getJson<Promo>(config.store, `promo:${code}`);
  if (!promo) return;
  promo.used += 1;
  await putJson(config.store, `promo:${code}`, promo, { used: promo.used });
}

// --- Leases --------------------------------------------------------------------------------

function lease(config: ApiConfig, fields: { kind: LeaseKind; plan: LicensePlan; device: string; license: string | null; holder: string; endsAt: number | null }, signer: Signer = realSigner(config)): string {
  const now = config.now();
  const reach = now + config.leaseDays * DAY;
  return signLease({ ...fields, issuedAt: now, renewBy: fields.endsAt === null ? reach : Math.min(reach, fields.endsAt) }, signer.secret);
}

// --- Trials --------------------------------------------------------------------------------

async function trial(config: ApiConfig, input: Record<string, unknown>, address: string | null = null): Promise<Response> {
  const device = text(input.device, 80);
  if (!device) return json(400, { error: "Which computer?" });
  const now = config.now();
  const key = `trial:${device}`;
  const saved = await getJson<Trial>(config.store, key);
  const account = input.token ? await accountOf(config, text(input.token, 80)) : null;
  if (saved) {
    if (account) await noteAccountTrial(config, account.id, saved);
    // The same running trial again (a reinstall, a second request); never a second trial.
    if (saved.endsAt > now) return json(200, { lease: lease(config, { kind: "trial", plan: "premium", device, license: null, holder: "", endsAt: saved.endsAt }), endsAt: saved.endsAt });
    return json(403, { used: true, error: "The free trial has been used on this computer." });
  }
  // Signed in: one trial per person too. A second computer shares the days left of the first.
  const mine = account ? await getJson<AccountTrial>(config.store, `trialacct:${account.id}`) : null;
  if (mine) {
    if (mine.endsAt <= now) return json(403, { used: true, error: "The free trial has been used on this account." });
    await putJson(config.store, key, { device, startedAt: now, endsAt: mine.endsAt, promo: null } satisfies Trial, { startedAt: now, endsAt: mine.endsAt });
    await noteDevice(config, device, { plan: "trial", trial: now });
    return json(200, { lease: lease(config, { kind: "trial", plan: "premium", device, license: null, holder: "", endsAt: mine.endsAt }), endsAt: mine.endsAt });
  }
  // A new trial: a few a day from one network address, so new computer ids cannot farm them.
  if (address) {
    const counter = `trialip:${address}:${new Date(now).toISOString().slice(0, 10)}`;
    const started = Number(await config.store.get(counter)) || 0;
    if (started >= TRIALS_PER_ADDRESS) return json(429, { error: "Too many trials started from this network today. Try again tomorrow, or write to us." });
    await config.store.put(counter, String(started + 1), undefined, 2 * 86_400);
  }
  const code = input.promo ? normalizeCode(text(input.promo, 40)) : null;
  const promo = code ? checkPromo(await getJson<Promo>(config.store, `promo:${code}`), "premium", null, now) : null;
  const days = config.trialDays + (promo?.ok ? promo.trialDays : 0);
  const record: Trial = { device, startedAt: now, endsAt: now + days * DAY, promo: promo?.ok ? promo.code : null };
  await putJson(config.store, key, record, { startedAt: record.startedAt, endsAt: record.endsAt });
  if (promo?.ok && promo.trialDays) await usePromo(config, promo.code);
  await noteDevice(config, device, { plan: "trial", trial: now });
  if (account) await noteAccountTrial(config, account.id, record);
  return json(200, { lease: lease(config, { kind: "trial", plan: "premium", device, license: null, holder: "", endsAt: record.endsAt }), endsAt: record.endsAt, days });
}

/** Tie a computer's trial to the person signed in on it (the first one counts; it never grows). */
export async function noteAccountTrial(config: ApiConfig, user: string, trial: Pick<Trial, "device" | "startedAt" | "endsAt">): Promise<void> {
  if (await config.store.get(`trialacct:${user}`)) return;
  await putJson(config.store, `trialacct:${user}`, { device: trial.device, startedAt: trial.startedAt, endsAt: trial.endsAt } satisfies AccountTrial, { endsAt: trial.endsAt });
}

// --- Checkout ------------------------------------------------------------------------------

async function startCheckout(config: ApiConfig, input: Record<string, unknown>, origin: string): Promise<Response> {
  const plan = input.plan === "premium" || input.plan === "church" ? input.plan : null;
  const interval = input.interval === "monthly" || input.interval === "yearly" ? input.interval : null;
  const account = input.token ? await accountOf(config, text(input.token, 80)) : null;
  const email = text(input.email, 120) || account?.email || "";
  if (!plan || !interval) return json(400, { error: "Which plan and billing?" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "An email address is needed for the receipt and the key." });
  const code = input.promo ? normalizeCode(text(input.promo, 40)) : null;
  const promo = code ? checkPromo(await getJson<Promo>(config.store, `promo:${code}`), plan, interval, config.now()) : null;
  if (code && !promo?.ok) return json(400, { error: "That promo code does not work for this plan.", promo });
  if (promo?.ok && (promo.percentOff || promo.amountOff) && config.provider.supportsPromo && !config.provider.supportsPromo(promo.code)) {
    return json(400, { error: "That code cannot be used at checkout yet. Contact us and we will apply it." });
  }
  const { list, due } = priceAfter(plan, interval, promo);
  const order: Checkout = {
    id: randomId("cs"),
    plan,
    interval,
    email,
    name: text(input.name, 40),
    promo: promo?.ok ? promo.code : null,
    list,
    due,
    currency: CURRENCY,
    device: text(input.device, 80) || null,
    status: "pending",
    createdAt: config.now(),
    account: account?.id ?? null,
  };
  let link: { url: string; reference: string | null };
  try {
    link = await config.provider.createCheckout({ session: order.id, plan, interval, email, name: order.name, due, currency: CURRENCY, promo: order.promo }, origin);
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : "Checkout could not start." });
  }
  order.reference = link.reference;
  await saveCheckout(config, order);
  return json(200, { session: order.id, url: link.url, list, due, currency: CURRENCY, test: config.provider.test });
}

const saveCheckout = (config: ApiConfig, order: Checkout) =>
  putJson(config.store, `checkout:${order.id}`, order, { status: order.status, due: order.due, plan: order.plan, interval: order.interval, promo: order.promo, paidAt: order.paidAt ?? null });

async function checkoutStatus(config: ApiConfig, input: Record<string, unknown>): Promise<Response> {
  const order = await getJson<Checkout>(config.store, `checkout:${text(input.session, 60)}`);
  if (!order) return json(404, { error: "No such checkout." });
  if (order.status !== "paid" || !order.key) return json(200, { status: order.status });
  // Paid: hand the key back, and activate this computer straight away when it asks.
  const device = text(input.device, 80) || order.device;
  if (!device) return json(200, { status: "paid", key: order.key });
  const activation = await activateDevice(config, order.key, device, text(input.name, 60) || "Computer");
  return json(200, { status: "paid", key: order.key, ...(activation.lease ? { lease: activation.lease } : { activation: activation.body }) });
}

/**
 * A checkout is paid: one subscription, one license key (its id from the subscription, so renewals
 * keep the same seats), emailed when mail is set up, and kept on the checkout for the app to collect.
 */
export async function completeCheckout(config: ApiConfig, sessionId: string, subscriptionId?: string): Promise<Checkout | null> {
  const order = await getJson<Checkout>(config.store, `checkout:${sessionId}`);
  if (!order) return null;
  if (order.status === "paid") return order;
  const now = config.now();
  const subId = subscriptionId ?? `sub_${order.id.slice(3)}`;
  const id = await shortId(subId);
  const paidUntil = now + (PERIOD_DAYS[order.interval] + config.graceDays) * DAY;
  // The key carries no end date: its end is the license record's paidUntil, which renewals move.
  const signer = config.provider.test ? testSigner(config) : realSigner(config);
  const key = signLicense({ plan: order.plan, until: null, holder: order.name, id }, signer.secret);
  const license = hex(id);
  const paid: Checkout = { ...order, status: "paid", paidAt: now, key, license };
  await saveCheckout(config, paid);
  const sub: Subscription = { id: subId, license, plan: order.plan, interval: order.interval, email: order.email, renewsAt: now + PERIOD_DAYS[order.interval] * DAY, status: "active" };
  await putJson(config.store, `sub:${subId}`, sub, { status: sub.status, plan: sub.plan, interval: sub.interval });
  await putJson(config.store, `license:${license}`, { sub: subId, email: order.email, paidUntil, test: signer.test } satisfies LicenseRecord);
  await usePromo(config, order.promo);
  await noteLicenseEmail(config, order.email, { id: license, key });
  if (order.account) await linkLicense(config, order.account, { id: license, key });
  if (order.device) {
    const trialRecord = await getJson<Trial>(config.store, `trial:${order.device}`);
    if (trialRecord) await putJson(config.store, `trial:${order.device}`, trialRecord, { startedAt: trialRecord.startedAt, endsAt: trialRecord.endsAt, converted: true });
    await noteDevice(config, order.device, { plan: order.plan, paid: now });
  }
  if (config.mail) {
    const email = licenseKeyEmail({ key, plan: order.plan, added: true }, config.publicUrl ?? DEFAULT_PUBLIC_URL);
    await config.mail(order.email, email.subject, email.text, email.html).catch(() => {});
  }
  return paid;
}

async function payRoute(request: Request, config: ApiConfig, sessionId: string, cancel: boolean): Promise<Response> {
  if (config.provider.name !== "mock") return html(404, "<p>Not found</p>");
  const order = await getJson<Checkout>(config.store, `checkout:${sessionId}`);
  if (!order) return html(404, payPage({ state: "missing" }));
  if (request.method === "POST") {
    if (cancel) {
      if (order.status === "pending") await saveCheckout(config, { ...order, status: "cancelled" });
      return html(200, payPage({ state: "cancelled", order }));
    }
    const paid = await completeCheckout(config, sessionId);
    return html(200, payPage({ state: "paid", order: paid ?? order }));
  }
  return html(200, payPage({ state: order.status === "paid" ? "paid" : order.status === "cancelled" ? "cancelled" : "pending", order }));
}

// --- Renewals ------------------------------------------------------------------------------

/**
 * A subscription renewed: the license is paid through the new period's end (plus grace), with the
 * same key and the same seats. `periodEnd` comes from the provider; null adds one more period.
 */
export async function renewLicense(config: ApiConfig, license: string, periodEnd: number | null): Promise<number | null> {
  const record = await getJson<LicenseRecord>(config.store, `license:${license}`);
  if (!record) return null;
  const sub = record.sub ? await getJson<Subscription>(config.store, `sub:${record.sub}`) : null;
  const interval: Interval = sub?.interval ?? "monthly";
  const base = Math.max(record.paidUntil - config.graceDays * DAY, config.now());
  const paidUntil = periodEnd !== null ? periodEnd + config.graceDays * DAY : base + PERIOD_DAYS[interval] * DAY + config.graceDays * DAY;
  await putJson(config.store, `license:${license}`, { ...record, paidUntil: Math.max(paidUntil, record.paidUntil) } satisfies LicenseRecord);
  if (sub) await putJson(config.store, `sub:${sub.id}`, { ...sub, renewsAt: paidUntil - config.graceDays * DAY }, { status: sub.status, plan: sub.plan, interval: sub.interval });
  return Math.max(paidUntil, record.paidUntil);
}

/** The license a subscription belongs to, if this server made it. */
export async function licenseOfSubscription(config: ApiConfig, subscriptionId: string): Promise<string | null> {
  return (await getJson<Subscription>(config.store, `sub:${subscriptionId}`))?.license ?? null;
}

// --- Refunds -------------------------------------------------------------------------------

/** A refunded or charged-back license: no new leases, so its computers drop to Free at their next check-in. */
export async function revoke(config: ApiConfig, license: string, reason: string): Promise<void> {
  await config.store.put(`revoked:${license}`, JSON.stringify({ reason, at: config.now() }));
  const link = await getJson<{ sub: string }>(config.store, `license:${license}`);
  if (link) {
    const sub = await getJson<Subscription>(config.store, `sub:${link.sub}`);
    if (sub) await putJson(config.store, `sub:${sub.id}`, { ...sub, status: "refunded" }, { status: "refunded", plan: sub.plan, interval: sub.interval });
  }
}

// --- Seats and activation ------------------------------------------------------------------

/** When a key's plan ends: its fixed end date, or (launch offers) a number of days from first use, counted here. */
async function keyEnds(config: ApiConfig, license: License): Promise<number | null> {
  const record = await getJson<LicenseRecord>(config.store, `license:${license.id}`);
  if (record && typeof record.paidUntil === "number") return record.paidUntil;
  if (license.until) return Date.parse(license.until);
  if (!license.days) return null;
  const key = `days:${license.id}`;
  const started = Number(await config.store.get(key)) || 0;
  const start = started || config.now();
  if (!started) await config.store.put(key, String(start));
  return start + license.days * DAY;
}

export async function activateDevice(config: ApiConfig, keyText: string, device: string, name: string): Promise<{ status: number; body: Record<string, unknown>; lease?: string }> {
  const read = readAnyLicense(config, keyText);
  if (!read) return { status: 401, body: { error: "That license key is not valid." } };
  const { license, signer } = read;
  if (await config.store.get(`revoked:${license.id}`)) return { status: 403, body: { revoked: true, error: "This license was refunded or cancelled." } };
  const endsAt = await keyEnds(config, license);
  const now = config.now();
  if (endsAt !== null && now >= endsAt) return { status: 410, body: { ended: true, error: "This license has ended." } };
  const seats = SEATS[license.plan];
  const slot = `act:${license.id}`;
  const fresh = (entry: Device) => now - Date.parse(entry.seenAt) < STALE_DAYS * DAY;
  let devices = ((await getJson<Device[]>(config.store, slot)) ?? []).filter(fresh);
  const at = new Date(now).toISOString();
  if (devices.some((entry) => entry.device === device)) devices = devices.map((entry) => (entry.device === device ? { device, name, seenAt: at } : entry));
  else if (devices.length >= seats) return { status: 409, body: { full: true, seats, devices: masked(devices, device) } };
  else devices = [...devices, { device, name, seenAt: at }];
  await putJson(config.store, slot, devices);
  await noteDevice(config, device, { plan: license.plan });
  return {
    status: 200,
    body: { ok: true, seats, devices: masked(devices, device) },
    lease: lease(config, { kind: "license", plan: license.plan, device, license: license.id, holder: license.holder, endsAt }, signer),
  };
}

/** Other computers' ids are shortened, so a shared key does not hand out every computer's id. */
function masked(devices: Device[], self: string) {
  return devices.map((entry) => ({ device: entry.device === self ? entry.device : entry.device.slice(0, 8), name: entry.name, seenAt: entry.seenAt, you: entry.device === self }));
}

async function seats(config: ApiConfig, path: string, input: Record<string, unknown>): Promise<Response> {
  const keyText = text(input.key, 300);
  const device = text(input.device, 80);
  if (path === "/v1/activate" || path === "/v1/lease") {
    if (!device) return json(400, { error: "Which computer?" });
    const result = await activateDevice(config, keyText, device, text(input.name, 60) || "Computer");
    return json(result.status, result.lease ? { ...result.body, lease: result.lease } : result.body);
  }
  const read = readAnyLicense(config, keyText);
  if (!read) return json(401, { error: "That license key is not valid." });
  const license = read.license;
  const seatsFor = SEATS[license.plan];
  const slot = `act:${license.id}`;
  const now = config.now();
  const saved = ((await getJson<Device[]>(config.store, slot)) ?? []).filter((entry) => now - Date.parse(entry.seenAt) < STALE_DAYS * DAY);
  let devices = saved;
  if (path === "/v1/release") {
    // A released computer keeps its lease until it checks in, so releases are limited: otherwise
    // releasing and activating in turn would run one key on any number of computers.
    const logKey = `rel:${license.id}`;
    const recent = ((await getJson<number[]>(config.store, logKey)) ?? []).filter((at) => now - at < 30 * DAY);
    if (recent.length >= RELEASES_PER_30_DAYS) return json(429, { error: `A key can release ${RELEASES_PER_30_DAYS} computers in 30 days. Contact support if you need more.`, seats: seatsFor, devices: masked(saved, device) });
    // The full id, or the shortened one the list shows.
    devices = saved.filter((entry) => entry.device !== device && !(device.length === 8 && entry.device.startsWith(device)));
    if (devices.length !== saved.length) {
      await putJson(config.store, slot, devices);
      await putJson(config.store, logKey, [...recent, now]);
    }
  }
  return json(200, { ok: true, seats: seatsFor, devices: masked(devices, device) });
}
