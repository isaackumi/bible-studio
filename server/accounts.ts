// Accounts: optional, and never needed to use the app. Signing in ties licenses to a person, so a
// second computer activates by signing in instead of copying a key.
//
// Who someone is comes from an Identity (Better Auth in auth.ts: Google, Microsoft, Apple, email
// link). The desktop app never sees a password or a provider's token. It signs in one of three ways
// (`mode` on start):
//
//   loopback (this computer): the app listens on 127.0.0.1 and opens /signin/<id> in the browser;
//     after signing in and confirming, the browser is sent back to that address with a one-time
//     code, which the app trades with its PKCE verifier for a token. Only the computer that started
//     the sign-in can finish it, so a sign-in link sent by someone else gets them nothing.
//   code (another device): the person types the short code the app shows.
//   number (apps before 0.3): the person taps which of three numbers the app shows.
//
//   POST /v1/signin/start   {device, name, mode?, redirect?, challenge?} → {id, secret, number|code, url, expiresAt}
//   POST /v1/signin/poll    {id, secret}              → {status, token?, account?}   (code and number)
//   POST /v1/signin/token   {id, code, verifier}      → {token, account}             (loopback)
//   POST /v1/signin/browser {device, name}            → {token, account} | {signedIn: false}
//     The browser version, on this server's own address: whoever is signed in to this browser
//     (its session cookie) is who the app signs in as. No code to type.
//   POST /v1/account        {token, device, name}     → {account, licenses, lease?, activation?}
//   POST /v1/account/link   {token, key}              → {ok}   (a key bought before signing in)
//   POST /v1/account/devices {token}                  → {devices}  (where this account is signed in)
//   POST /v1/account/signout {token, device?|everywhere?} → {ok}
//   POST /v1/license/members {token, license, add?, remove?} → {members}  (the owner's team)
//   GET  /signin/:id   POST /signin/:id/confirm|cancel   (the browser pages)
//
// Tokens last 180 days from their last use, so a computer nobody opens any more signs itself out.

import { readLicense, type LicensePlan } from "../src/lib/domain/license.ts";
import { activateDevice, noteAccountTrial, noteDevice, readAnyLicense, type ApiConfig } from "./api.ts";
import { changeMembers, claimLicense, mayUse, ownershipOf } from "./ownership.ts";
import { signinPage } from "./pages.ts";
import { getJson, putJson } from "./store.ts";

/** A sign-in record is only needed for its few minutes; KV removes it a day later. */
const SIGNIN_TTL = 86_400;

/** A person signed in to the browser, as the identity provider says. */
export type Person = { id: string; email: string; name: string; emailVerified: boolean };

export type SigninMethod = "google" | "microsoft" | "apple" | "email";

export type Identity = {
  /** Sign-in methods this server offers (only those with credentials set). */
  methods: SigninMethod[];
  /** The identity provider's own routes (OAuth callbacks, email links), under /auth/. */
  handler(request: Request): Promise<Response>;
  /** Who is signed in to this browser, from its session cookie. */
  current(request: Request): Promise<Person | null>;
};

export type SigninMode = "loopback" | "code" | "number";

type Signin = {
  id: string;
  /** SHA-256 of the app's secret: the poll must show the secret itself. */
  secret: string;
  device: string;
  name: string;
  /** Missing on sign-ins started by apps before 0.3: "number". */
  mode?: SigninMode;
  number: number;
  /** The numbers offered in the browser; one is the app's. */
  choices: number[];
  /** code: what the person types (letters and digits that cannot be mistaken for each other). */
  code?: string;
  tries?: number;
  /** loopback: where the browser goes back to, and the PKCE challenge (base64url SHA-256 of the verifier). */
  redirect?: string;
  challenge?: string;
  /** loopback: SHA-256 of the one-time code handed to the browser. */
  grant?: string;
  /** Where the app asked from (city, country), shown in the browser so a stranger's request stands out. */
  place?: string;
  status: "pending" | "done" | "cancelled";
  createdAt: number;
  person?: Person;
  token?: string;
};
type AccountToken = { user: string; device: string; name?: string; createdAt: number; usedAt?: number };
/** Where an account is signed in: one entry per token, by the token's hash. */
type TokenEntry = { hash: string; device: string; name: string; createdAt: number };
export type LinkedLicense = { id: string; key: string };
export type Account = { id: string; email: string; name: string; licenses: LinkedLicense[]; createdAt: number };

const SIGNIN_MINUTES = 10;
/** A token nobody uses for this long goes by itself. */
const TOKEN_DAYS = 180;
const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MOST_CODE_TRIES = 3;
const PLAN_RANK: Record<LicensePlan, number> = { premium: 1, church: 2 };

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, authorization" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
const html = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const random = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const normalEmail = (email: string) => email.trim().toLowerCase();

/** Three different two-digit numbers, and which one the app shows. */
function numbers(): { number: number; choices: number[] } {
  const picked = new Set<number>();
  while (picked.size < 3) picked.add(10 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 90));
  const choices = [...picked];
  return { number: choices[crypto.getRandomValues(new Uint32Array(1))[0]! % 3]!, choices };
}

/** A short code to type: six letters and digits with no 0/O or 1/I/L to mix up. */
function typedCode(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(6)), (n) => CODE_LETTERS[n % CODE_LETTERS.length]).join("");
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const challengeOf = async (verifier: string) => base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));

/** Only this computer's own loopback address may receive a sign-in. */
const LOOPBACK = /^http:\/\/127\.0\.0\.1:\d{2,5}\/[A-Za-z0-9/_-]*$/;

/** A new token for an account on a computer, listed under the account so it can be signed out from elsewhere. */
async function issueToken(config: ApiConfig, user: string, device: string, name: string): Promise<string> {
  const token = `cst_${random(32)}`;
  const hash = await sha256(token);
  const now = config.now();
  await putJson(config.store, `atok:${hash}`, { user, device, name, createdAt: now, usedAt: now } satisfies AccountToken, undefined, TOKEN_DAYS * 86_400);
  const listed = await liveTokens(config, user);
  await putJson(config.store, `atoks:${user}`, [...listed, { hash, device, name, createdAt: now }]);
  return token;
}

/** The account's tokens still alive (expired and signed-out ones are dropped from the list). */
async function liveTokens(config: ApiConfig, user: string): Promise<TokenEntry[]> {
  const listed = (await getJson<TokenEntry[]>(config.store, `atoks:${user}`)) ?? [];
  const alive = [];
  for (const entry of listed) if (await config.store.get(`atok:${entry.hash}`)) alive.push(entry);
  return alive;
}

/** Licenses bought with an email: found again when someone signs in with that (verified) email. */
export async function noteLicenseEmail(config: ApiConfig, email: string, license: LinkedLicense): Promise<void> {
  const key = `email:${normalEmail(email)}`;
  const saved = (await getJson<LinkedLicense[]>(config.store, key)) ?? [];
  if (!saved.some((entry) => entry.id === license.id)) await putJson(config.store, key, [...saved, license]);
}

/** The account a token belongs to, or null (unknown, expired or signed out). Using it keeps it alive. */
export async function accountOf(config: ApiConfig, token: string): Promise<Account | null> {
  if (!/^cst_[0-9a-f]{64}$/.test(token)) return null;
  const key = `atok:${await sha256(token)}`;
  const record = await getJson<AccountToken>(config.store, key);
  if (!record) return null;
  // At most one write a day per token (KV writes are the scarce part).
  const now = config.now();
  if (now - (record.usedAt ?? record.createdAt) > 86_400_000) await putJson(config.store, key, { ...record, usedAt: now }, undefined, TOKEN_DAYS * 86_400);
  return getJson<Account>(config.store, `acct:${record.user}`);
}

/** Make or update the account for a person who signed in, with licenses bought under their email. */
async function upsertAccount(config: ApiConfig, person: Person): Promise<Account> {
  const saved = await getJson<Account>(config.store, `acct:${person.id}`);
  const account: Account = saved ?? { id: person.id, email: person.email, name: person.name, licenses: [], createdAt: config.now() };
  account.email = person.email;
  account.name = person.name || account.name;
  await putJson(config.store, `acct:${person.id}`, account, { email: account.email, createdAt: account.createdAt });
  // Only a verified email claims what was bought with it, or what an owner added it to. A license
  // someone else owns already is left alone.
  if (person.emailVerified) {
    const email = normalEmail(person.email);
    const found = [...((await getJson<LinkedLicense[]>(config.store, `email:${email}`)) ?? []), ...((await getJson<LinkedLicense[]>(config.store, `member:${email}`)) ?? [])];
    for (const license of found) await claimLicense(config, account, license);
  }
  return (await getJson<Account>(config.store, `acct:${person.id}`)) ?? account;
}

export async function accountApi(config: ApiConfig, path: string, input: Record<string, unknown>, origin: string, request?: Request): Promise<Response | null> {
  switch (path) {
    case "/v1/signin/start": {
      // No identity, or one with no way to sign in yet (no email and no provider credentials).
      if (!config.identity?.methods.length) return json(503, { error: "Accounts are not set up on this server yet." });
      const device = text(input.device, 80);
      if (!device) return json(400, { error: "Which computer?" });
      const mode: SigninMode = input.mode === "loopback" || input.mode === "code" ? input.mode : "number";
      const redirect = text(input.redirect, 120);
      const challenge = text(input.challenge, 64);
      if (mode === "loopback" && (!LOOPBACK.test(redirect) || !/^[A-Za-z0-9_-]{43}$/.test(challenge))) return json(400, { error: "A loopback sign-in needs this computer's address and a PKCE challenge." });
      const secret = random(32);
      const { number, choices } = numbers();
      const cf = (request as (Request & { cf?: { city?: string; country?: string } }) | undefined)?.cf;
      const place = [cf?.city, cf?.country].filter(Boolean).join(", ");
      const signin: Signin = {
        id: random(12),
        secret: await sha256(secret),
        device,
        name: text(input.name, 60) || "Computer",
        mode,
        number,
        choices,
        ...(mode === "code" ? { code: typedCode(), tries: 0 } : {}),
        ...(mode === "loopback" ? { redirect, challenge } : {}),
        ...(place ? { place } : {}),
        status: "pending",
        createdAt: config.now(),
      };
      await putJson(config.store, `signin:${signin.id}`, signin, undefined, SIGNIN_TTL);
      return json(200, { id: signin.id, secret, ...(mode === "number" ? { number } : {}), ...(signin.code ? { code: signin.code } : {}), url: `${origin}/signin/${signin.id}`, expiresAt: signin.createdAt + SIGNIN_MINUTES * 60_000, methods: config.identity.methods });
    }
    case "/v1/signin/poll": {
      const signin = await getJson<Signin>(config.store, `signin:${text(input.id, 40)}`);
      if (!signin || signin.secret !== (await sha256(text(input.secret, 80)))) return json(404, { error: "No such sign-in." });
      if (config.now() - signin.createdAt > SIGNIN_MINUTES * 60_000 && signin.status === "pending") return json(200, { status: "expired" });
      if (signin.status !== "done" || !signin.person) return json(200, { status: signin.status });
      // The token is handed over once; asking again after that finds nothing to hand.
      if (!signin.token) return json(200, { status: "collected" });
      const token = signin.token;
      await putJson(config.store, `signin:${signin.id}`, { ...signin, token: undefined }, undefined, SIGNIN_TTL);
      return json(200, { status: "done", token, account: { email: signin.person.email, name: signin.person.name } });
    }
    case "/v1/signin/token": {
      // Loopback: the one-time code the browser brought back, and the verifier only this app has.
      const signin = await getJson<Signin>(config.store, `signin:${text(input.id, 40)}`);
      const code = text(input.code, 80);
      if (!signin || signin.mode !== "loopback" || signin.status !== "done" || !signin.person || !signin.grant || !code || signin.grant !== (await sha256(code))) return json(400, { error: "This sign-in cannot be finished. Start again." });
      if (signin.challenge !== (await challengeOf(text(input.verifier, 128)))) return json(400, { error: "This sign-in cannot be finished. Start again." });
      if (config.now() - signin.createdAt > SIGNIN_MINUTES * 60_000) return json(400, { expired: true, error: "This sign-in has ended. Start again." });
      // Used once: the grant goes with it.
      await putJson(config.store, `signin:${signin.id}`, { ...signin, grant: undefined }, undefined, SIGNIN_TTL);
      const token = await issueToken(config, signin.person.id, signin.device, signin.name);
      return json(200, { token, account: { email: signin.person.email, name: signin.person.name } });
    }
    case "/v1/signin/browser": {
      // Same browser, same person: only a request carrying this site's own session cookie gets here
      // signed in (cookies are not sent to it from other sites' pages).
      if (!config.identity || !request) return json(503, { error: "Accounts are not set up on this server yet." });
      const device = text(input.device, 80);
      if (!device) return json(400, { error: "Which computer?" });
      const person = await config.identity.current(request);
      if (!person) return json(200, { signedIn: false });
      const account = await upsertAccount(config, person);
      const token = await issueToken(config, account.id, device, text(input.name, 60) || "Browser");
      return json(200, { token, account: { email: account.email, name: account.name } });
    }
    case "/v1/account":
      return accountStatus(config, input);
    case "/v1/account/link": {
      const account = await accountOf(config, text(input.token, 80));
      if (!account) return json(401, { signedOut: true, error: "Sign in again." });
      const read = readAnyLicense(config, text(input.key, 300));
      if (!read) return json(400, { error: "That license key is not valid." });
      const claimed = await claimLicense(config, account, { id: read.license.id, key: text(input.key, 300) });
      if (!claimed.ok) return json(409, { owned: true, error: claimed.error });
      return json(200, { ok: true, owner: claimed.owner });
    }
    case "/v1/account/devices": {
      const token = text(input.token, 80);
      const account = await accountOf(config, token);
      if (!account) return json(401, { signedOut: true, error: "Sign in again." });
      const mine = await sha256(token);
      // Each with what its check-ins say (system, browser, version, last seen), for its icon and line.
      const devices = await Promise.all(
        (await liveTokens(config, account.id)).map(async (entry) => {
          const meta = await getJson<{ os?: string; browser?: string; version?: string; last?: number }>(config.store, `device:${entry.device}`);
          return { id: entry.hash.slice(0, 12), name: entry.name, createdAt: entry.createdAt, you: entry.hash === mine, os: meta?.os ?? "", browser: meta?.browser ?? "", version: meta?.version ?? "", lastSeen: meta?.last ?? entry.createdAt };
        }),
      );
      return json(200, { devices });
    }
    case "/v1/account/signout": {
      const token = text(input.token, 80);
      if (!/^cst_[0-9a-f]{64}$/.test(token)) return json(200, { ok: true });
      const mine = await sha256(token);
      const record = await getJson<AccountToken>(config.store, `atok:${mine}`);
      // Another computer (by the id the list shows), or every computer, or this one.
      const which = text(input.device, 20);
      if (record && (which || input.everywhere === true)) {
        const listed = await liveTokens(config, record.user);
        const gone = listed.filter((entry) => input.everywhere === true || entry.hash.startsWith(which));
        for (const entry of gone) await config.store.delete(`atok:${entry.hash}`);
        await putJson(config.store, `atoks:${record.user}`, listed.filter((entry) => !gone.includes(entry)));
        return json(200, { ok: true, signedOut: gone.length });
      }
      await config.store.delete(`atok:${mine}`);
      return json(200, { ok: true });
    }
    case "/v1/license/members": {
      const account = await accountOf(config, text(input.token, 80));
      if (!account) return json(401, { signedOut: true, error: "Sign in again." });
      const linked = account.licenses.find((entry) => entry.id === text(input.license, 40));
      if (!linked) return json(404, { error: "That license is not on your account." });
      const result = await changeMembers(config, account, linked, { add: text(input.add, 120), remove: text(input.remove, 120) });
      return result.ok ? json(200, { members: result.members }) : json(result.status, { error: result.error });
    }
    default:
      return null;
  }
}

/** The account, its licenses, and (with a device) a lease for the best plan it has a seat on. */
async function accountStatus(config: ApiConfig, input: Record<string, unknown>): Promise<Response> {
  const account = await accountOf(config, text(input.token, 80));
  if (!account) return json(401, { signedOut: true, error: "Sign in again." });
  const device = text(input.device, 80);
  // A trial started on this computer before signing in now belongs to the account too.
  const deviceTrial = device ? await getJson<{ device: string; startedAt: number; endsAt: number }>(config.store, `trial:${device}`) : null;
  if (deviceTrial) await noteAccountTrial(config, account.id, deviceTrial);
  // The admin page shows which computers each person uses.
  if (device) await noteDevice(config, device, { account: account.id });
  const licenses = account.licenses
    .map((entry) => ({ entry, license: readAnyLicense(config, entry.key)?.license ?? readLicense(entry.key) }))
    .filter((item): item is { entry: LinkedLicense; license: NonNullable<typeof item.license> } => !!item.license)
    .sort((a, b) => PLAN_RANK[b.license.plan] - PLAN_RANK[a.license.plan]);
  const summary = [];
  let lease: string | undefined;
  let activation: Record<string, unknown> | undefined;
  for (const { entry, license } of licenses) {
    const revoked = !!(await config.store.get(`revoked:${license.id}`));
    const ownership = await ownershipOf(config, license.id);
    const owner = !ownership || ownership.owner === account.id;
    // Removed from a license by its owner: still listed, but no longer used.
    const allowed = mayUse(ownership, account);
    summary.push({ license: license.id, plan: license.plan, revoked, owner, ...(owner && ownership ? { members: ownership.members } : {}), ...(allowed ? {} : { removed: true }) });
    if (!device || lease || revoked || !allowed) continue;
    const result = await activateDevice(config, entry.key, device, text(input.name, 60) || "Computer");
    if (result.lease) {
      lease = result.lease;
      activation = { ...result.body, key: entry.key };
    } else activation ??= { ...result.body, status: result.status };
  }
  return json(200, { account: { email: account.email, name: account.name }, licenses: summary, ...(lease ? { lease } : {}), ...(activation ? { activation } : {}) });
}

/** The browser side of signing in: choose a method, then tap the app's number. */
export async function signinRoute(request: Request, config: ApiConfig, id: string, action: string | undefined): Promise<Response> {
  const signin = await getJson<Signin>(config.store, `signin:${id}`);
  const identity = config.identity;
  if (!signin || !identity) return html(404, signinPage({ state: "missing", id }));
  const expired = config.now() - signin.createdAt > SIGNIN_MINUTES * 60_000;
  if (signin.status === "done") return html(200, signinPage({ state: "done", id, email: signin.person?.email }));
  if (signin.status === "cancelled" || expired) return html(200, signinPage({ state: "expired", id }));
  if (request.method === "POST" && action === "cancel") {
    await putJson(config.store, `signin:${id}`, { ...signin, status: "cancelled" }, undefined, SIGNIN_TTL);
    return html(200, signinPage({ state: "expired", id }));
  }
  const mode = signin.mode ?? "number";
  const person = await identity.current(request);
  if (!person) return html(200, signinPage({ state: "choose", id, device: signin.name, methods: identity.methods }));
  if (request.method === "POST" && action === "confirm") {
    const form = await request.formData().catch(() => null);
    if (mode === "number" && Number(form?.get("number")) !== signin.number) {
      // One try: a wrong number ends this sign-in, so the numbers cannot be guessed in turn.
      await putJson(config.store, `signin:${id}`, { ...signin, status: "cancelled" }, undefined, SIGNIN_TTL);
      return html(200, signinPage({ state: "wrong", id, mode }));
    }
    if (mode === "code" && String(form?.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") !== signin.code) {
      // A few tries for typing slips; then this sign-in ends.
      const tries = (signin.tries ?? 0) + 1;
      const over = tries >= MOST_CODE_TRIES;
      await putJson(config.store, `signin:${id}`, { ...signin, tries, ...(over ? { status: "cancelled" as const } : {}) }, undefined, SIGNIN_TTL);
      return html(200, over ? signinPage({ state: "wrong", id, mode }) : signinPage({ state: "confirm", id, mode, device: signin.name, place: signin.place, email: person.email, retry: true }));
    }
    const account = await upsertAccount(config, person);
    if (mode === "loopback") {
      // Back to the app on this computer with a one-time code it trades (with its verifier) for a token.
      const code = random(24);
      await putJson(config.store, `signin:${id}`, { ...signin, status: "done", person, grant: await sha256(code) }, undefined, SIGNIN_TTL);
      return new Response(null, { status: 303, headers: { location: `${signin.redirect}?id=${encodeURIComponent(id)}&code=${code}`, "cache-control": "no-store" } });
    }
    const token = await issueToken(config, account.id, signin.device, signin.name);
    await putJson(config.store, `signin:${id}`, { ...signin, status: "done", person, token }, undefined, SIGNIN_TTL);
    return html(200, signinPage({ state: "done", id, email: person.email }));
  }
  return html(200, signinPage({ state: "confirm", id, mode, device: signin.name, place: signin.place, email: person.email, choices: signin.choices }));
}
