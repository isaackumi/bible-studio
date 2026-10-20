// Accounts: optional, and never needed to use the app. Signing in ties licenses to a person, so a
// second computer activates by signing in instead of copying a key.
//
// Who someone is comes from an Identity (Better Auth in auth.ts: Google, Microsoft, Apple, email
// link). The desktop app never sees a password or a provider's token. It signs in like a TV app:
//
//   1. The app asks POST /v1/signin/start and opens /signin/<id> in the browser.
//   2. The person signs in there, then taps the number the app shows (so a sign-in link sent by
//      someone else cannot sign *their* app in to this person's account).
//   3. The app, asking POST /v1/signin/poll with a secret only it holds, gets an account token.
//
//   POST /v1/signin/start   {device, name}            → {id, secret, number, url, expiresAt}
//   POST /v1/signin/poll    {id, secret}              → {status, token?, account?}
//   POST /v1/account        {token, device, name}     → {account, licenses, lease?, activation?}
//   POST /v1/account/link   {token, key}              → {ok}   (a key bought before signing in)
//   POST /v1/account/signout {token}                  → {ok}
//   GET  /signin/:id   POST /signin/:id/confirm|cancel   (the browser pages)

import { readLicense, type LicensePlan } from "../src/lib/domain/license.ts";
import { activateDevice, noteAccountTrial, readAnyLicense, type ApiConfig } from "./api.ts";
import { signinPage } from "./pages.ts";
import { getJson, putJson } from "./store.ts";

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

type Signin = {
  id: string;
  /** SHA-256 of the app's secret: the poll must show the secret itself. */
  secret: string;
  device: string;
  name: string;
  number: number;
  /** The numbers offered in the browser; one is the app's. */
  choices: number[];
  status: "pending" | "done" | "cancelled";
  createdAt: number;
  person?: Person;
  token?: string;
};
type AccountToken = { user: string; device: string; createdAt: number };
type LinkedLicense = { id: string; key: string };
type Account = { id: string; email: string; name: string; licenses: LinkedLicense[]; createdAt: number };

const SIGNIN_MINUTES = 10;
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

/** Licenses bought with an email: found again when someone signs in with that (verified) email. */
export async function noteLicenseEmail(config: ApiConfig, email: string, license: LinkedLicense): Promise<void> {
  const key = `email:${normalEmail(email)}`;
  const saved = (await getJson<LinkedLicense[]>(config.store, key)) ?? [];
  if (!saved.some((entry) => entry.id === license.id)) await putJson(config.store, key, [...saved, license]);
}

/** Add a license to an account (a purchase while signed in, or a key linked by hand). */
export async function linkLicense(config: ApiConfig, user: string, license: LinkedLicense): Promise<void> {
  const account = await getJson<Account>(config.store, `acct:${user}`);
  if (!account || account.licenses.some((entry) => entry.id === license.id)) return;
  await putJson(config.store, `acct:${user}`, { ...account, licenses: [...account.licenses, license] });
}

/** The account a token belongs to, or null (unknown or signed out). */
export async function accountOf(config: ApiConfig, token: string): Promise<Account | null> {
  if (!/^cst_[0-9a-f]{64}$/.test(token)) return null;
  const record = await getJson<AccountToken>(config.store, `atok:${await sha256(token)}`);
  return record ? getJson<Account>(config.store, `acct:${record.user}`) : null;
}

/** Make or update the account for a person who signed in, with licenses bought under their email. */
async function upsertAccount(config: ApiConfig, person: Person): Promise<Account> {
  const saved = await getJson<Account>(config.store, `acct:${person.id}`);
  const account: Account = saved ?? { id: person.id, email: person.email, name: person.name, licenses: [], createdAt: config.now() };
  account.email = person.email;
  account.name = person.name || account.name;
  // Only a verified email claims what was bought with it.
  if (person.emailVerified) {
    for (const license of (await getJson<LinkedLicense[]>(config.store, `email:${normalEmail(person.email)}`)) ?? []) {
      if (!account.licenses.some((entry) => entry.id === license.id)) account.licenses.push(license);
    }
  }
  await putJson(config.store, `acct:${person.id}`, account, { email: account.email, createdAt: account.createdAt });
  return account;
}

export async function accountApi(config: ApiConfig, path: string, input: Record<string, unknown>, origin: string): Promise<Response | null> {
  switch (path) {
    case "/v1/signin/start": {
      // No identity, or one with no way to sign in yet (no email and no provider credentials).
      if (!config.identity?.methods.length) return json(503, { error: "Accounts are not set up on this server yet." });
      const device = text(input.device, 80);
      if (!device) return json(400, { error: "Which computer?" });
      const secret = random(32);
      const { number, choices } = numbers();
      const signin: Signin = { id: random(12), secret: await sha256(secret), device, name: text(input.name, 60) || "Computer", number, choices, status: "pending", createdAt: config.now() };
      await putJson(config.store, `signin:${signin.id}`, signin);
      return json(200, { id: signin.id, secret, number, url: `${origin}/signin/${signin.id}`, expiresAt: signin.createdAt + SIGNIN_MINUTES * 60_000, methods: config.identity.methods });
    }
    case "/v1/signin/poll": {
      const signin = await getJson<Signin>(config.store, `signin:${text(input.id, 40)}`);
      if (!signin || signin.secret !== (await sha256(text(input.secret, 80)))) return json(404, { error: "No such sign-in." });
      if (config.now() - signin.createdAt > SIGNIN_MINUTES * 60_000 && signin.status === "pending") return json(200, { status: "expired" });
      if (signin.status !== "done" || !signin.person) return json(200, { status: signin.status });
      // The token is handed over once; asking again after that finds nothing to hand.
      if (!signin.token) return json(200, { status: "collected" });
      const token = signin.token;
      await putJson(config.store, `signin:${signin.id}`, { ...signin, token: undefined });
      return json(200, { status: "done", token, account: { email: signin.person.email, name: signin.person.name } });
    }
    case "/v1/account":
      return accountStatus(config, input);
    case "/v1/account/link": {
      const account = await accountOf(config, text(input.token, 80));
      if (!account) return json(401, { signedOut: true, error: "Sign in again." });
      const read = readAnyLicense(config, text(input.key, 300));
      if (!read) return json(400, { error: "That license key is not valid." });
      await linkLicense(config, account.id, { id: read.license.id, key: text(input.key, 300) });
      return json(200, { ok: true });
    }
    case "/v1/account/signout": {
      const token = text(input.token, 80);
      if (/^cst_[0-9a-f]{64}$/.test(token)) await config.store.delete(`atok:${await sha256(token)}`);
      return json(200, { ok: true });
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
  const licenses = account.licenses
    .map((entry) => ({ entry, license: readAnyLicense(config, entry.key)?.license ?? readLicense(entry.key) }))
    .filter((item): item is { entry: LinkedLicense; license: NonNullable<typeof item.license> } => !!item.license)
    .sort((a, b) => PLAN_RANK[b.license.plan] - PLAN_RANK[a.license.plan]);
  const summary = [];
  let lease: string | undefined;
  let activation: Record<string, unknown> | undefined;
  for (const { entry, license } of licenses) {
    const revoked = !!(await config.store.get(`revoked:${license.id}`));
    summary.push({ license: license.id, plan: license.plan, revoked });
    if (!device || lease || revoked) continue;
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
    await putJson(config.store, `signin:${id}`, { ...signin, status: "cancelled" });
    return html(200, signinPage({ state: "expired", id }));
  }
  const person = await identity.current(request);
  if (!person) return html(200, signinPage({ state: "choose", id, device: signin.name, methods: identity.methods }));
  if (request.method === "POST" && action === "confirm") {
    const form = await request.formData().catch(() => null);
    const picked = Number(form?.get("number"));
    if (picked !== signin.number) {
      // One try: a wrong number ends this sign-in, so the numbers cannot be guessed in turn.
      await putJson(config.store, `signin:${id}`, { ...signin, status: "cancelled" });
      return html(200, signinPage({ state: "wrong", id }));
    }
    const account = await upsertAccount(config, person);
    const token = `cst_${random(32)}`;
    await putJson(config.store, `atok:${await sha256(token)}`, { user: account.id, device: signin.device, createdAt: config.now() } satisfies AccountToken);
    await putJson(config.store, `signin:${id}`, { ...signin, status: "done", person, token });
    return html(200, signinPage({ state: "done", id, email: person.email }));
  }
  return html(200, signinPage({ state: "confirm", id, device: signin.name, email: person.email, choices: signin.choices }));
}
