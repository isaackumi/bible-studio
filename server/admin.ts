// The admin console's server side: who may look, what they may change, and limits that hold even
// for someone who got in with stolen admin access.
//
//   Who: Cloudflare Access stands in front of /admin (every admin page and API is under it) and
//   signs each request; the server checks that signature itself and takes the email from it. Roles
//   come from ADMIN_USERS, a server setting nobody can change from the admin page.
//
//   Limits: changes are capped by role and per license or computer in a year; nobody may change
//   anything of their own; the big ones (long extensions, generous codes, undoing a suspension)
//   wait for an owner to approve them from an email link. Everything is suspended or ended, never
//   deleted; every change and every refused attempt goes in a log the API cannot erase, and is
//   emailed to the alert address.
//
//   GET  /admin, /admin/approve/:id                       (the page)
//   GET  /admin/api/me | stats | details | audit | approvals
//   GET  /admin/api/account?id=… | /admin/api/license?id=…
//   POST /admin/api/action   {action, …}                 → {ok, …} | 202 {pending, approval}
//   POST /admin/api/approve  {id, token, decline?}

import { setCloudLimits } from "./cloud-config";
import { ownershipOf } from "./ownership.ts";
import { audience, readAnyLicense, details, listPromos, noteDevice, revoke, SEATS, stats, type AccountTrial, type ApiConfig, type Device, type DeviceMeta, type LicenseRecord, type Subscription, type Trial, markMoved, cloudDetails } from "./api.ts";
import type { Account, LinkedLicense } from "./accounts.ts";
import { licenseKeyEmail } from "./email.ts";
import { adminPage } from "./admin-page.ts";
import { makePromo, type Promo } from "./pricing.ts";
import { getJson, putJson } from "./store.ts";

export type AdminRole = "viewer" | "support" | "owner";

export type AdminSettings = {
  /** Cloudflare Access in front of /admin: the team domain (heitech.cloudflareaccess.com) and the application's audience tag. */
  access?: { team: string; aud: string };
  /** Who may use the admin page, and as what (ADMIN_USERS: "a@x.com:owner,b@y.com:support"). */
  users: Record<string, AdminRole>;
  /** Where every change is reported and approvals are sent. */
  alertEmail?: string;
  /** Local development only (dev.ts): act as this person without Access. Never set on the Worker. */
  devEmail?: string;
};

export type Admin = { email: string; role: AdminRole; via: "access" | "token" | "dev" };

const DAY = 86_400_000;
const RANK: Record<AdminRole, number> = { viewer: 0, support: 1, owner: 2 };

/** What one person may do without asking, what a year may add up to, and the most anyone may do. */
export const LIMITS = {
  /** Days a license may be extended in one go, by role, before an owner must approve. */
  licenseDays: { support: 14, owner: 31 },
  /** Days a trial may be extended in one go, by role, before an owner must approve. */
  trialDays: { support: 7, owner: 14 },
  /** Days added by hand to one license or trial in 365 days before every extension needs approval. */
  yearly: { license: 60, trial: 14 },
  /** The most added by hand in 365 days, approved or not. */
  ceiling: { license: 365, trial: 60 },
  /** Changes one person may make in an hour. */
  perHour: 40,
  /** Promo codes past these need approval: percent off, cents off, extra trial days, uses. */
  promo: { percentOff: 50, amountOff: 1500, trialDays: 30, maxUses: 100, longestDays: 366, mostUses: 1000 },
  /** An approval link works this long. */
  approvalMinutes: 60,
};

/** Each action and the least role that may ask for it. */
const ACTIONS = {
  "release-device": "support",
  "reset-seats": "support",
  "resend-key": "support",
  "extend-license": "support",
  "extend-trial": "support",
  "mark-team": "support",
  suspend: "owner",
  resume: "owner",
  refund: "owner",
  "create-promo": "owner",
  "set-cloud-limits": "owner",
  "set-cloud-cap": "owner",
  "end-promo": "owner",
} as const satisfies Record<string, AdminRole>;
export type AdminAction = keyof typeof ACTIONS;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const html = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    },
  });
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const random = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const licenseId = (value: unknown) => {
  const id = text(value, 16).toLowerCase();
  return /^[0-9a-f]{8}$/.test(id) ? id : null;
};

/** "a@x.com:owner, b@y.com:support" → { "a@x.com": "owner", … }; anything else is left out. */
export function parseAdminUsers(value: string | undefined): Record<string, AdminRole> {
  const users: Record<string, AdminRole> = {};
  for (const pair of (value ?? "").split(",")) {
    const [email, role] = pair.trim().split(":").map((part) => part?.trim().toLowerCase());
    if (email && /^[^\s@]+@[^\s@]+$/.test(email) && (role === "owner" || role === "support" || role === "viewer")) users[email] = role;
  }
  return users;
}

// --- Who is asking ------------------------------------------------------------------------------

type Jwk = JsonWebKey & { kid?: string };
let certs: { team: string; at: number; keys: Jwk[] } | null = null;

const fromBase64Url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
const jsonPart = (value: string) => {
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as Record<string, unknown>;
  } catch {
    return null;
  }
};

async function accessKeys(team: string, http: typeof fetch, now: number, fresh = false): Promise<Jwk[]> {
  if (!fresh && certs && certs.team === team && now - certs.at < 3_600_000) return certs.keys;
  const response = await http(`https://${team}/cdn-cgi/access/certs`);
  if (!response.ok) return certs?.team === team ? certs.keys : [];
  const keys = ((await response.json()) as { keys?: Jwk[] }).keys ?? [];
  certs = { team, at: now, keys };
  return keys;
}

/** The email Cloudflare Access signed for this request, or null (no token, a bad signature, another application, expired). */
export async function accessEmail(request: Request, access: NonNullable<AdminSettings["access"]>, http: typeof fetch, now: number): Promise<string | null> {
  const cookie = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1];
  const token = request.headers.get("cf-access-jwt-assertion") ?? cookie ?? "";
  const [head, body, signature] = token.split(".");
  if (!head || !body || !signature) return null;
  const header = jsonPart(head);
  const claims = jsonPart(body);
  if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string") return null;
  let key = (await accessKeys(access.team, http, now)).find((entry) => entry.kid === header.kid);
  // Access rotates its keys: a key not seen yet means reading them again, once.
  key ??= (await accessKeys(access.team, http, now, true)).find((entry) => entry.kid === header.kid);
  if (!key) return null;
  try {
    const verifier = await crypto.subtle.importKey("jwk", { kty: key.kty, n: key.n, e: key.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signed = new TextEncoder().encode(`${head}.${body}`);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", verifier, fromBase64Url(signature), signed))) return null;
  } catch {
    return null;
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(access.aud)) return null;
  if (claims.iss !== `https://${access.team}`) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;
  if (typeof claims.nbf === "number" && claims.nbf * 1000 > now + 60_000) return null;
  return typeof claims.email === "string" ? claims.email.toLowerCase() : null;
}

/** Constant-time text comparison (the old admin token). */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Who is asking, and as what. With Access set up, only its signed email counts (the old token is
 * ignored). Without it, the old ADMIN_TOKEN still opens the page, but only to look.
 */
export async function whoIs(request: Request, config: ApiConfig): Promise<Admin | { error: string; status: number; token?: boolean }> {
  const settings = config.admin;
  const users = settings?.users ?? {};
  if (settings?.access) {
    const email = await accessEmail(request, settings.access, config.fetcher ?? fetch, config.now());
    if (!email) return { status: 401, error: "Sign in through Cloudflare Access to use the admin page." };
    const role = users[email];
    return role ? { email, role, via: "access" } : { status: 403, error: `${email} is not on the admin list.` };
  }
  if (settings?.devEmail && users[settings.devEmail]) return { email: settings.devEmail, role: users[settings.devEmail]!, via: "dev" };
  if (!config.adminToken) return { status: 503, error: "The admin page is not set up yet: put Cloudflare Access in front of /admin (see server/README.md)." };
  if (!sameText(request.headers.get("authorization") ?? "", `Bearer ${config.adminToken}`)) return { status: 401, error: "Wrong admin token.", token: true };
  return { email: "admin token", role: "viewer", via: "token" };
}

// --- Rules --------------------------------------------------------------------------------------

export type Decision = { ok: true; approval: boolean } | { ok: false; error: string; kind: "role" | "limit" | "input" | "self" };

const wholeDays = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 365 ? value : null);

/**
 * Whether this person may do this now: refused, allowed, or allowed once an owner approves.
 * `added` is what this license or trial has already been given by hand in the last 365 days.
 */
export function decide(admin: Admin, action: AdminAction, input: Record<string, unknown>, context: { added: number; approved: boolean; now: number }): Decision {
  const needed = ACTIONS[action];
  if (admin.via === "token") return { ok: false, kind: "role", error: "The admin token only opens the page to look. Sign in through Cloudflare Access to make changes." };
  if (RANK[admin.role] < RANK[needed]) return { ok: false, kind: "role", error: `Only ${needed === "owner" ? "an owner" : "support or an owner"} can do that.` };
  const ask = (reason: string): Decision =>
    context.approved ? { ok: true, approval: false } : admin.role === "owner" ? { ok: true, approval: true } : { ok: false, kind: "limit", error: `${reason} Ask an owner.` };
  if (action === "extend-license" || action === "extend-trial") {
    const days = wholeDays(input.days);
    if (!days) return { ok: false, kind: "input", error: "How many days (1–365)?" };
    const kind = action === "extend-license" ? "license" : "trial";
    const most = LIMITS.ceiling[kind];
    if (context.added + days > most) return { ok: false, kind: "limit", error: `That would add more than ${most} days by hand in a year (${context.added} added already).` };
    const once = (kind === "license" ? LIMITS.licenseDays : LIMITS.trialDays)[admin.role === "owner" ? "owner" : "support"];
    if (days > once) return ask(`More than ${once} days at once needs approval.`);
    if (context.added + days > LIMITS.yearly[kind]) return ask(`Past ${LIMITS.yearly[kind]} days by hand in a year, every extension needs approval.`);
    return { ok: true, approval: false };
  }
  if (action === "resume") return ask("Undoing a suspension or refund needs approval.");
  if (action === "suspend" && !text(input.reason, 120)) return { ok: false, kind: "input", error: "Say why (the customer may ask)." };
  if (action === "create-promo") {
    const rules = LIMITS.promo;
    const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
    const uses = number(input.maxUses);
    if (!Number.isInteger(uses) || uses < 1 || uses > rules.mostUses) return { ok: false, kind: "input", error: `Every code needs a number of uses (1–${rules.mostUses}).` };
    const ends = typeof input.expiresAt === "string" ? Date.parse(input.expiresAt) : number(input.expiresAt);
    if (!ends || ends <= context.now) return { ok: false, kind: "input", error: "Every code needs an end date in the future." };
    if (ends > context.now + rules.longestDays * DAY) return { ok: false, kind: "input", error: `A code can run at most ${rules.longestDays} days.` };
    if (number(input.percentOff) > rules.percentOff || number(input.amountOff) > rules.amountOff || number(input.trialDays) > rules.trialDays || uses > rules.maxUses) {
      return ask(`Codes over ${rules.percentOff}% or $${rules.amountOff / 100} off, over ${rules.trialDays} trial days or over ${rules.maxUses} uses need approval.`);
    }
  }
  return { ok: true, approval: false };
}

// --- What belongs to whom -----------------------------------------------------------------------

/** The licenses and computers that belong to this email: bought with it, linked to its account, or signed in to it. */
async function ownedBy(config: ApiConfig, email: string): Promise<{ licenses: Set<string>; devices: Set<string> }> {
  const licenses = new Set(((await getJson<LinkedLicense[]>(config.store, `email:${email}`)) ?? []).map((entry) => entry.id));
  const accounts = (await config.store.list("acct:")).filter((entry) => String(entry.meta?.email ?? "").toLowerCase() === email).map((entry) => entry.key.slice("acct:".length));
  for (const id of accounts) for (const entry of (await getJson<Account>(config.store, `acct:${id}`))?.licenses ?? []) licenses.add(entry.id);
  const devices = new Set((await config.store.list("device:")).filter((entry) => accounts.includes(String(entry.meta?.account ?? ""))).map((entry) => entry.key.slice("device:".length)));
  for (const id of licenses) for (const seat of (await getJson<Device[]>(config.store, `act:${id}`)) ?? []) devices.add(seat.device);
  return { licenses, devices };
}

/** Whether the target is the person's own, so they cannot give themselves anything. */
async function isOwn(config: ApiConfig, admin: Admin, action: AdminAction, input: Record<string, unknown>): Promise<boolean> {
  if (admin.via !== "access" && admin.via !== "dev") return false;
  if (!["extend-license", "extend-trial", "resume", "reset-seats", "release-device"].includes(action)) return false;
  const own = await ownedBy(config, admin.email);
  if (action === "extend-trial") return own.devices.has(text(input.device, 80));
  const id = licenseId(input.license);
  if (!id) return false;
  if (own.licenses.has(id)) return true;
  const record = await getJson<LicenseRecord>(config.store, `license:${id}`);
  return !!record && record.email.trim().toLowerCase() === admin.email;
}

// --- Log, alerts and limits ---------------------------------------------------------------------

type AuditEntry = {
  at: number;
  by: string;
  role: AdminRole;
  via: Admin["via"];
  action: string;
  target: string;
  input: Record<string, unknown>;
  outcome: "done" | "refused" | "pending" | "approved" | "declined";
  detail: string;
  address: string | null;
  approvedBy?: string;
};

/** Newest first when listed: the key counts down with time. */
const auditKey = (at: number) => `audit:${String(9_999_999_999_999 - at).padStart(13, "0")}:${random(3)}`;

const targetOf = (action: string, input: Record<string, unknown>) =>
  action.endsWith("promo") ? `code ${text(input.code, 40).toUpperCase()}` : action === "extend-trial" || action === "mark-team" ? `computer ${text(input.device, 80).slice(0, 8)}` : `license ${text(input.license, 16)}`;

async function record(config: ApiConfig, entry: AuditEntry): Promise<void> {
  await putJson(config.store, auditKey(entry.at), entry, { at: entry.at, by: entry.by, action: entry.action, target: entry.target, outcome: entry.outcome });
  // Also in the Worker's own logs, which nothing in this API can reach.
  console.log(JSON.stringify({ admin: entry }));
}

async function alert(config: ApiConfig, subject: string, lines: string[]): Promise<void> {
  const to = config.admin?.alertEmail;
  if (!to || !config.mail) return;
  await config.mail(to, `[Church Studio admin] ${subject}`, lines.join("\n")).catch(() => {});
}

const CHANGE_WORDS: Record<AdminAction, (input: Record<string, unknown>) => string> = {
  "release-device": (input) => `free computer ${text(input.device, 80).slice(0, 8)} on license ${text(input.license, 16)}`,
  "reset-seats": (input) => `free every seat on license ${text(input.license, 16)}`,
  "resend-key": (input) => `resend the key for license ${text(input.license, 16)}`,
  "extend-license": (input) => `extend license ${text(input.license, 16)} by ${input.days} days`,
  "extend-trial": (input) => `extend the trial on computer ${text(input.device, 80).slice(0, 8)} by ${input.days} days`,
  "mark-team": (input) => `${input.team === false ? "count computer" : "mark computer"} ${text(input.device, 80).slice(0, 8)} ${input.team === false ? "again" : "as the team's own"}`,
  suspend: (input) => `suspend license ${text(input.license, 16)} (${text(input.reason, 120)})`,
  resume: (input) => `restore license ${text(input.license, 16)}`,
  refund: (input) => `revoke license ${text(input.license, 16)} for a refund`,
  "create-promo": (input) => `create promo code ${text(input.code, 40).toUpperCase()}`,
  "set-cloud-limits": (input) => `set cloud space limits ${["premiumGb", "churchGb", "maxFileGb", "totalCapGb"].filter((key) => typeof input[key] === "number").map((key) => `${key}=${input[key]}`).join(" ") || "(nothing)"}`,
  "set-cloud-cap": (input) => `${typeof input.gb === "number" ? `cap cloud space for license ${text(input.license, 16)} at ${input.gb} GB` : `clear the cloud space cap on license ${text(input.license, 16)}`}`,
  "end-promo": (input) => `end promo code ${text(input.code, 40).toUpperCase()}`,
};

/** Changes this person made in the current hour; past the limit, no more until the next. */
async function overHourly(config: ApiConfig, admin: Admin): Promise<boolean> {
  const key = `adminrate:${admin.email}:${new Date(config.now()).toISOString().slice(0, 13)}`;
  const made = Number(await config.store.get(key)) || 0;
  if (made >= LIMITS.perHour) return true;
  await config.store.put(key, String(made + 1), undefined, 2 * 3600);
  return false;
}

type Extension = { at: number; days: number; by: string };
const extensionKey = (action: AdminAction, input: Record<string, unknown>) => (action === "extend-license" ? `adminext:license:${licenseId(input.license)}` : `adminext:trial:${text(input.device, 80)}`);

async function addedThisYear(config: ApiConfig, action: AdminAction, input: Record<string, unknown>): Promise<number> {
  if (action !== "extend-license" && action !== "extend-trial") return 0;
  const now = config.now();
  return ((await getJson<Extension[]>(config.store, extensionKey(action, input))) ?? []).filter((entry) => now - entry.at < 365 * DAY).reduce((sum, entry) => sum + entry.days, 0);
}

// --- Doing it -----------------------------------------------------------------------------------

type Outcome = { ok: true; detail: string; data?: Record<string, unknown> } | { ok: false; error: string };

async function perform(config: ApiConfig, admin: Admin, action: AdminAction, input: Record<string, unknown>): Promise<Outcome> {
  const store = config.store;
  const now = config.now();
  if (action === "create-promo" || action === "end-promo") {
    if (action === "create-promo") {
      const promo = makePromo(input, now);
      if (!promo) return { ok: false, error: "A code needs at least 3 letters and a discount or trial days." };
      if (await store.get(`promo:${promo.code}`)) return { ok: false, error: "That code exists already." };
      promo.note = `${promo.note ? `${promo.note} · ` : ""}by ${admin.email}`.slice(0, 120);
      await putJson(store, `promo:${promo.code}`, promo, { used: 0 });
      return { ok: true, detail: `${promo.code}: ${promo.percentOff ? `${promo.percentOff}% off ` : ""}${promo.amountOff ? `$${promo.amountOff / 100} off ` : ""}${promo.trialDays ? `+${promo.trialDays} trial days ` : ""}· ${promo.maxUses} uses`, data: { promo } };
    }
    const code = text(input.code, 40).toUpperCase();
    const promo = await getJson<Promo>(store, `promo:${code}`);
    if (!promo) return { ok: false, error: "No such code." };
    // Ended, not deleted: the record of who used it stays.
    await putJson(store, `promo:${code}`, { ...promo, expiresAt: Math.min(promo.expiresAt ?? now, now) }, { used: promo.used });
    return { ok: true, detail: `${code} ended after ${promo.used} uses` };
  }
  if (action === "set-cloud-limits") {
    const patch: Record<string, number> = {};
    for (const key of ["premiumGb", "churchGb", "maxFileGb", "totalCapGb"]) if (typeof input[key] === "number") patch[key] = input[key] as number;
    if (!Object.keys(patch).length) return { ok: false, error: "Give at least one limit, in GB." };
    const limits = await setCloudLimits(store, patch);
    return { ok: true, detail: `Premium ${limits.premiumGb} GB · Church ${limits.churchGb} GB · largest file ${limits.maxFileGb} GB · everyone together ${limits.totalCapGb} GB`, data: { limits } };
  }
  if (action === "set-cloud-cap") {
    const id = licenseId(input.license);
    if (!id) return { ok: false, error: "Which license (8 characters)?" };
    if (typeof input.gb === "number") {
      if (!Number.isFinite(input.gb) || input.gb <= 0 || input.gb > 100_000) return { ok: false, error: "A cap is a number of GB." };
      await putJson(store, `cloudcap:${id}`, { gb: input.gb, by: admin.email, at: now });
      return { ok: true, detail: `License ${id} may keep ${input.gb} GB in the cloud` };
    }
    await store.delete(`cloudcap:${id}`);
    return { ok: true, detail: `License ${id} is back on its plan's cloud space` };
  }
  if (action === "mark-team") {
    const device = text(input.device, 80);
    if (!device || !(await store.get(`device:${device}`))) return { ok: false, error: "No such computer." };
    await noteDevice(config, device, { internal: input.team !== false });
    return { ok: true, detail: input.team === false ? "counted in the numbers again" : "left out of the numbers" };
  }
  if (action === "extend-trial") {
    const device = text(input.device, 80);
    const trial = await getJson<Trial & { converted?: boolean }>(store, `trial:${device}`);
    if (!device || !trial) return { ok: false, error: "That computer has no trial." };
    const days = input.days as number;
    const endsAt = Math.max(trial.endsAt, now) + days * DAY;
    await putJson(store, `trial:${device}`, { ...trial, endsAt }, { startedAt: trial.startedAt, endsAt });
    // A signed-in person's trial is kept on the account too; it follows.
    const account = (await getJson<DeviceMeta>(store, `device:${device}`))?.account;
    const accountTrial = account ? await getJson<AccountTrial>(store, `trialacct:${account}`) : null;
    if (account && accountTrial?.device === device) await putJson(store, `trialacct:${account}`, { ...accountTrial, endsAt }, { endsAt });
    await noteDevice(config, device, { plan: "trial" });
    return { ok: true, detail: `trial now ends ${new Date(endsAt).toISOString().slice(0, 10)}`, data: { endsAt } };
  }
  const id = licenseId(input.license);
  if (!id) return { ok: false, error: "Which license (8 characters)?" };
  const license = await getJson<LicenseRecord>(store, `license:${id}`);
  const revoked = await getJson<{ reason: string; at: number; kind?: string }>(store, `revoked:${id}`);
  switch (action) {
    case "release-device":
    case "reset-seats": {
      const seats = (await getJson<Device[]>(store, `act:${id}`)) ?? [];
      const device = text(input.device, 80);
      const left = action === "reset-seats" ? [] : seats.filter((entry) => entry.device !== device && !(device.length === 8 && entry.device.startsWith(device)));
      if (left.length === seats.length) return { ok: false, error: action === "reset-seats" ? "No computers are using this license." : "That computer is not on this license." };
      await putJson(store, `act:${id}`, left);
      if (action === "reset-seats") {
        // A fresh start: every computer may activate again, and moves count from zero.
        await store.delete(`moved:${id}`);
        await store.delete(`rel:${id}`);
        return { ok: true, detail: `${seats.length} seat(s) freed; every computer may activate again, first come first served` };
      }
      // A freed computer drops to Free at its next check-in, until the licence is moved back to it.
      for (const entry of seats.filter((candidate) => !left.includes(candidate))) await markMoved(config, id, entry.device, entry.name, "");
      return { ok: true, detail: `${seats.length - left.length} seat(s) freed; that computer goes back to Free at its next check-in` };
    }
    case "resend-key": {
      if (!license) return { ok: false, error: "This license has no email on file." };
      const key = ((await getJson<LinkedLicense[]>(store, `email:${license.email.trim().toLowerCase()}`)) ?? []).find((entry) => entry.id === id)?.key;
      const read = key ? readAnyLicense(config, key) : null;
      if (!key || !read || !config.mail) return { ok: false, error: "The key or mail is not available on this server." };
      // Only ever to the address that bought it.
      const email = licenseKeyEmail({ key, plan: read.license.plan }, config.publicUrl ?? "https://church-studio.heitechinc.com");
      await config.mail(license.email, email.subject, email.text, email.html);
      return { ok: true, detail: `sent to ${license.email}` };
    }
    case "extend-license": {
      if (!license) return { ok: false, error: "This license has no paid period to move (only subscriptions do)." };
      const days = input.days as number;
      const paidUntil = Math.max(license.paidUntil, now) + days * DAY;
      await putJson(store, `license:${id}`, { ...license, paidUntil } satisfies LicenseRecord);
      return { ok: true, detail: `paid through ${new Date(paidUntil).toISOString().slice(0, 10)}`, data: { paidUntil } };
    }
    case "suspend": {
      if (revoked) return { ok: false, error: "This license is already stopped." };
      await putJson(store, `revoked:${id}`, { reason: `suspended: ${text(input.reason, 120)}`, at: now, kind: "suspended", by: admin.email });
      return { ok: true, detail: "its computers drop to Free at their next check-in" };
    }
    case "resume": {
      if (!revoked) return { ok: false, error: "This license is not stopped." };
      await store.delete(`revoked:${id}`);
      // A suspension undone; a refund undone also brings the subscription back.
      if (license?.sub) {
        const sub = await getJson<Subscription>(store, `sub:${license.sub}`);
        if (sub && sub.status === "refunded") await putJson(store, `sub:${sub.id}`, { ...sub, status: "active" }, { status: "active", plan: sub.plan, interval: sub.interval });
      }
      return { ok: true, detail: `restored (it was stopped: ${revoked.reason})` };
    }
    case "refund": {
      if (revoked) return { ok: false, error: "This license is already stopped." };
      await revoke(config, id, text(input.reason, 80) || "refund");
      return { ok: true, detail: "revoked; its computers drop to Free at their next check-in" };
    }
  }
  return { ok: false, error: "Unknown action." };
}

type Approval = { id: string; token: string; action: AdminAction; input: Record<string, unknown>; by: string; role: AdminRole; at: number; expiresAt: number; status: "pending" | "approved" | "declined"; reason: string };

/** Run an action for this person: checked, logged, alerted, and done, refused or sent for approval. */
async function act(config: ApiConfig, admin: Admin, input: Record<string, unknown>, address: string | null, origin: string, approvedBy?: string): Promise<Response> {
  const action = text(input.action, 30) as AdminAction;
  if (!(action in ACTIONS)) return json(400, { error: "Unknown action." });
  const now = config.now();
  const clean: Record<string, unknown> = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "action").map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 200) : value]));
  const target = targetOf(action, clean);
  const entry = (outcome: AuditEntry["outcome"], detail: string): AuditEntry => ({ at: now, by: admin.email, role: admin.role, via: admin.via, action, target, input: clean, outcome, detail, address, ...(approvedBy ? { approvedBy } : {}) });
  const refuse = async (status: number, error: string, kind: string) => {
    await record(config, entry("refused", error));
    if (kind === "self" || kind === "limit" || kind === "role" || kind === "rate") await alert(config, `Refused: ${admin.email} tried to ${action} (${target})`, [`${admin.email} (${admin.role}) asked to: ${CHANGE_WORDS[action](clean)}.`, `Refused: ${error}`, `From: ${address ?? "unknown address"}`, "", "If this was not you or your team, change who is on the Access list and ADMIN_USERS now."]);
    return json(status, { error });
  };
  if (!approvedBy && (await overHourly(config, admin))) return refuse(429, `At most ${LIMITS.perHour} changes an hour. Try again later.`, "rate");
  if (await isOwn(config, admin, action, clean)) return refuse(403, "You cannot change your own license or computer. Ask another admin.", "self");
  const decision = decide(admin, action, clean, { added: await addedThisYear(config, action, clean), approved: !!approvedBy, now });
  if (!decision.ok) return refuse(decision.kind === "input" ? 400 : 403, decision.error, decision.kind);
  if (decision.approval) {
    const alertTo = config.admin?.alertEmail;
    if (!alertTo || !config.mail) return refuse(403, "This needs approval, and no alert email is set up to send it to (ADMIN_ALERT_EMAIL).", "limit");
    const token = random(24);
    const approval: Approval = { id: random(10), token: await sha256(token), action, input: clean, by: admin.email, role: admin.role, at: now, expiresAt: now + LIMITS.approvalMinutes * 60_000, status: "pending", reason: text(clean.reason, 120) };
    await putJson(config.store, `approval:${approval.id}`, approval, { at: now, by: admin.email, action, target, status: "pending" });
    await record(config, entry("pending", `waiting for approval ${approval.id}`));
    await alert(config, `Approve? ${admin.email} wants to ${CHANGE_WORDS[action](clean)}`, [
      `${admin.email} (${admin.role}) asks to: ${CHANGE_WORDS[action](clean)}.`,
      approval.reason ? `Reason given: ${approval.reason}` : "",
      `From: ${address ?? "unknown address"}`,
      "",
      `Approve or decline (works for ${LIMITS.approvalMinutes} minutes, signed in as an owner):`,
      `${origin}/admin/approve/${approval.id}#${token}`,
      "",
      "If you did not expect this, decline it and check who has admin access.",
    ]);
    return json(202, { pending: true, approval: approval.id, message: `Sent for approval to ${alertTo}. It waits ${LIMITS.approvalMinutes} minutes.` });
  }
  const outcome = await perform(config, admin, action, clean);
  if (!outcome.ok) {
    await record(config, entry("refused", outcome.error));
    return json(400, { error: outcome.error });
  }
  if (action === "extend-license" || action === "extend-trial") {
    const key = extensionKey(action, clean);
    const past = ((await getJson<Extension[]>(config.store, key)) ?? []).filter((item) => now - item.at < 365 * DAY);
    await putJson(config.store, key, [...past, { at: now, days: clean.days as number, by: admin.email }]);
  }
  await record(config, entry(approvedBy ? "approved" : "done", outcome.detail));
  await alert(config, `Done: ${admin.email}: ${CHANGE_WORDS[action](clean)}`, [`${admin.email} (${admin.role}) did: ${CHANGE_WORDS[action](clean)}. Result: ${outcome.detail}.`, approvedBy ? `Approved by ${approvedBy}.` : "", `From: ${address ?? "unknown address"}`]);
  return json(200, { ok: true, detail: outcome.detail, ...outcome.data });
}

async function approve(config: ApiConfig, admin: Admin, input: Record<string, unknown>, address: string | null, origin: string): Promise<Response> {
  if (admin.role !== "owner" || admin.via === "token") return json(403, { error: "Only an owner can approve." });
  const approval = await getJson<Approval>(config.store, `approval:${text(input.id, 40)}`);
  if (!approval || approval.token !== (await sha256(text(input.token, 80)))) return json(404, { error: "No such approval, or the link is incomplete. Open it from the email." });
  if (approval.status !== "pending") return json(409, { error: `Already ${approval.status}.` });
  if (config.now() > approval.expiresAt) return json(410, { error: "This approval has run out. Ask again from the admin page." });
  const owners = Object.values(config.admin?.users ?? {}).filter((role) => role === "owner").length;
  // With two owners or more, nobody approves their own request.
  if (owners > 1 && approval.by === admin.email) return json(403, { error: "Another owner must approve your own request." });
  const declined = input.decline === true;
  await putJson(config.store, `approval:${approval.id}`, { ...approval, status: declined ? "declined" : "approved" }, { at: approval.at, by: approval.by, action: approval.action, target: targetOf(approval.action, approval.input), status: declined ? "declined" : "approved" });
  if (declined) {
    await record(config, { at: config.now(), by: admin.email, role: admin.role, via: admin.via, action: approval.action, target: targetOf(approval.action, approval.input), input: approval.input, outcome: "declined", detail: `declined ${approval.by}'s request`, address });
    return json(200, { ok: true, declined: true });
  }
  const requester: Admin = { email: approval.by, role: approval.role, via: "access" };
  return act(config, requester, { ...approval.input, action: approval.action }, address, origin, admin.email);
}

// --- Views --------------------------------------------------------------------------------------

/** A computer's platform and browser, as the admin page labels it ("Browser · Windows · Edge 129", "Mac app"). */
export function setupOf(meta: Pick<DeviceMeta, "os" | "browser"> | null): string {
  const os = meta?.os ?? "";
  const system = ({ macos: "Mac", windows: "Windows", linux: "Linux" } as Record<string, string>)[os.replace(/^web-/, "")] ?? "Other";
  return os.startsWith("web") ? `Browser · ${system}${meta?.browser ? ` · ${meta.browser.replace(/\s+\d.*$/, "")}` : ""}` : os ? `${system} app` : "Unknown";
}

async function computer(config: ApiConfig, device: string, emails: Map<string, string>) {
  const meta = await getJson<DeviceMeta>(config.store, `device:${device}`);
  return { device, ...(meta ?? {}), setup: setupOf(meta), account: meta?.account ? (emails.get(meta.account) ?? meta.account) : null };
}

const accountEmails = async (config: ApiConfig) => new Map((await config.store.list("acct:")).map((entry) => [entry.key.slice("acct:".length), String(entry.meta?.email ?? "")]));

async function licenseView(config: ApiConfig, id: string) {
  const emails = await accountEmails(config);
  const record = await getJson<LicenseRecord>(config.store, `license:${id}`);
  const sub = record?.sub ? await getJson<Subscription>(config.store, `sub:${record.sub}`) : null;
  const revoked = await getJson<{ reason: string; at: number; kind?: string; by?: string }>(config.store, `revoked:${id}`);
  const seats = (await getJson<Device[]>(config.store, `act:${id}`)) ?? [];
  const key = record ? ((await getJson<LinkedLicense[]>(config.store, `email:${record.email.trim().toLowerCase()}`)) ?? []).find((entry) => entry.id === id)?.key : undefined;
  const plan = key ? readAnyLicense(config, key)?.license.plan : sub?.plan;
  const ownership = await ownershipOf(config, id);
  const owners = [];
  for (const entry of await config.store.list("acct:")) {
    const account = await getJson<Account>(config.store, entry.key);
    if (account?.licenses.some((item) => item.id === id)) owners.push({ id: account.id, email: account.email });
  }
  return {
    license: id,
    plan: plan ?? null,
    seats: plan ? SEATS[plan] : null,
    email: record?.email ?? null,
    paidUntil: record?.paidUntil ?? null,
    test: record?.test ?? false,
    subscription: sub ? { id: sub.id, interval: sub.interval, status: sub.status, renewsAt: sub.renewsAt } : null,
    stopped: revoked,
    accounts: owners,
    // Who it belongs to (ownership.ts) and the people its owner added, by email.
    owner: ownership ? (owners.find((account) => account.id === ownership.owner) ?? { id: ownership.owner, email: "" }) : null,
    members: ownership?.members ?? [],
    computers: await Promise.all(seats.map(async (seat) => ({ ...(await computer(config, seat.device, emails)), name: seat.name, seenAt: seat.seenAt }))),
    extensions: (await getJson<Extension[]>(config.store, `adminext:license:${id}`)) ?? [],
  };
}

async function accountView(config: ApiConfig, id: string) {
  const account = await getJson<Account>(config.store, `acct:${id}`);
  if (!account) return null;
  const emails = await accountEmails(config);
  const signedIn = (await config.store.list("device:")).filter((entry) => entry.meta?.account === id).map((entry) => entry.key.slice("device:".length));
  const licenses = await Promise.all(account.licenses.map((entry) => licenseView(config, entry.id)));
  const seen = new Set(signedIn);
  for (const license of licenses) for (const item of license.computers) seen.add(item.device);
  const computers = await Promise.all([...seen].map((device) => computer(config, device, emails)));
  const trial = await getJson<AccountTrial>(config.store, `trialacct:${id}`);
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    createdAt: account.createdAt,
    trial,
    licenses,
    computers,
    setups: [...new Set(computers.map((item) => item.setup))],
  };
}

/** The lists for the admin page, with each computer's setup and account, and each account's setups. */
async function richDetails(config: ApiConfig) {
  const base = await details(config);
  const emails = await accountEmails(config);
  const devices = (await audience(config)).map((item) => ({ device: item.id, meta: item.meta, team: item.team }));
  const byAccount = new Map<string, Set<string>>();
  for (const { meta } of devices) if (meta.account) byAccount.set(meta.account, (byAccount.get(meta.account) ?? new Set()).add(setupOf(meta)));
  const accountIds = new Map([...emails.entries()].map(([id, email]) => [email, id]));
  return {
    ...base,
    computers: devices
      .sort((a, b) => b.meta.last - a.meta.last)
      .slice(0, 300)
      .map(({ device, meta, team }) => ({ ...meta, team, id: device.length > 10 ? `${device.slice(0, 8)}…` : device, device, setup: setupOf(meta), account: meta.account ? (emails.get(meta.account) ?? null) : null, accountId: meta.account ?? null })),
    accounts: await Promise.all(
      (base.accounts as Array<{ email: string; createdAt: number }>).map(async (account) => {
        const id = accountIds.get(account.email) ?? null;
        const record = id ? await getJson<Account>(config.store, `acct:${id}`) : null;
        const computers = id ? devices.filter((item) => item.meta.account === id) : [];
        return {
          ...account,
          id,
          name: record?.name ?? "",
          licenses: record?.licenses.length ?? 0,
          computers: computers.length,
          lastSeen: Math.max(0, ...computers.map((item) => item.meta.last)),
          setups: id ? [...(byAccount.get(id) ?? [])] : [],
        };
      }),
    ),
  };
}

// --- The route ----------------------------------------------------------------------------------

export async function adminRoute(request: Request, config: ApiConfig, path: string, origin: string): Promise<Response> {
  if (request.method === "GET" && (path === "/admin" || path === "/admin/" || /^\/admin\/approve\/[0-9a-f]{20}$/.test(path))) return html(200, adminPage());
  if (!path.startsWith("/admin/api/")) return json(404, { error: "Not found" });
  // The page only: no other site may call these with someone's Access cookie.
  const from = request.headers.get("origin");
  if (from && from !== new URL(request.url).origin && from !== origin) return json(403, { error: "Not from the admin page." });
  const who = await whoIs(request, config);
  if (!("role" in who)) return json(who.status, { error: who.error, ...(who.token ? { token: true } : {}) });
  const admin = who;
  const address = request.headers.get("cf-connecting-ip");
  const url = new URL(request.url);
  if (request.method === "GET") {
    switch (path) {
      case "/admin/api/me":
        return json(200, { email: admin.email, role: admin.role, via: admin.via, limits: LIMITS, alerts: !!config.admin?.alertEmail, owners: Object.values(config.admin?.users ?? {}).filter((role) => role === "owner").length });
      case "/admin/api/stats":
        return json(200, await stats(config));
      case "/admin/api/details":
        return json(200, { ...(await richDetails(config)), promos: await listPromos(config.store), cloud: await cloudDetails(config) });
      case "/admin/api/audit": {
        // Keys count down with time, so sorted they are newest first (as Cloudflare KV lists them).
        const entries = (await config.store.list("audit:")).sort((x, y) => (x.key < y.key ? -1 : 1)).slice(0, 300);
        return json(200, { entries: (await Promise.all(entries.map((entry) => getJson<AuditEntry>(config.store, entry.key)))).filter(Boolean) });
      }
      case "/admin/api/approvals": {
        const all = await Promise.all((await config.store.list("approval:")).map((entry) => getJson<Approval>(config.store, entry.key)));
        return json(200, { approvals: all.filter((item): item is Approval => !!item).sort((a, b) => b.at - a.at).slice(0, 100).map(({ token: _token, ...item }) => ({ ...item, target: targetOf(item.action, item.input), words: CHANGE_WORDS[item.action](item.input), expired: config.now() > item.expiresAt })) });
      }
      case "/admin/api/account": {
        const view = await accountView(config, text(url.searchParams.get("id"), 80));
        return view ? json(200, view) : json(404, { error: "No such account." });
      }
      case "/admin/api/license": {
        const id = licenseId(url.searchParams.get("id"));
        return id ? json(200, await licenseView(config, id)) : json(400, { error: "Which license (8 characters)?" });
      }
    }
    return json(404, { error: "Not found" });
  }
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  let input: Record<string, unknown> = {};
  try {
    const value = await request.json();
    if (value && typeof value === "object") input = value as Record<string, unknown>;
  } catch {
    return json(400, { error: "Send JSON." });
  }
  if (path === "/admin/api/action") return act(config, admin, input, address, origin);
  if (path === "/admin/api/approve") return approve(config, admin, input, address, origin);
  return json(404, { error: "Not found" });
}
