// Church Studio license server: Paddle says a payment went through, this makes a signed CS1 key
// and emails it. Plain Web-standard fetch handler, so it runs on Cloudflare Workers as is (and on
// Deno, Bun or Vercel Edge). See server/README.md for setup.
//
// Stateless on purpose: the key id comes from the Paddle transaction id, so a retried webhook
// makes the very same key instead of a second one.

import { signLicense, type LicensePlan } from "../src/lib/domain/license.ts";
import { licenseKeyEmail } from "./email.ts";
import type { Identity } from "./accounts.ts";
import { betterAuthIdentity } from "./auth.ts";
import { completeCheckout, handleApi, licenseOfSubscription, renewLicense, revoke, type ApiConfig } from "./api.ts";
import { mockProvider, paddlePriceMap, paddleProvider } from "./billing.ts";
import { getJson, kvStore, type KvNamespace } from "./store.ts";

export type Env = {
  /** Paddle › Developer tools › Notifications › the endpoint's secret key. */
  PADDLE_WEBHOOK_SECRET: string;
  /** Paddle API key, to look up the buyer's email. */
  PADDLE_API_KEY: string;
  /** "sandbox" while testing, otherwise live. */
  PADDLE_ENV?: string;
  /** Which Paddle price grants which plan: "pri_01abc:premium,pri_01def:church". */
  PADDLE_PRICES: string;
  /** The Ed25519 signing key from ~/.church-studio/license-signing.key (hex). */
  CHURCH_STUDIO_SIGNING_KEY: string;
  /** Resend API key and sender, for the key email. */
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  /** Days a subscription key keeps working past the paid period, to cover a late renewal. */
  GRACE_DAYS?: string;
  /** The KV namespace for everything the server keeps (activations, trials, checkouts, promos, stats). */
  ACTIVATIONS?: KvNamespace;
  /** "mock" (built-in test checkout, the default) or "paddle". */
  BILLING_PROVIDER?: string;
  /** Promo codes charged through Paddle discounts: "EASTER25:dsc_01abc,…". */
  PADDLE_DISCOUNTS?: string;
  /** Bearer token for /admin and /v1/admin/*. */
  ADMIN_TOKEN?: string;
  /** Days a computer may stay offline before it must check in (default 30). */
  LEASE_DAYS?: string;
  /** Free trial length (default 14). */
  TRIAL_DAYS?: string;
  /** Paddle client-side token (test_… in sandbox, live_… in live) for the checkout page. */
  PADDLE_CLIENT_TOKEN?: string;
  /** The public pages: the selling business's legal name and a contact inbox someone reads. */
  COMPANY_NAME?: string;
  CONTACT_EMAIL?: string;
  /** Accounts (optional): the D1 database for Better Auth's users and sessions, and its secret. */
  AUTH_DB?: unknown;
  BETTER_AUTH_SECRET?: string;
  /** This server's own address, for sign-in callbacks. */
  PUBLIC_URL?: string;
  /** Sign-in methods: each is offered only when both its values are set. Email links need RESEND_API_KEY. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
};

type Mail = (to: string, subject: string, text: string, html?: string) => Promise<void>;

/**
 * Better Auth, made for each request: Workers do not let one request wait on a promise begun in
 * another, and Better Auth sets itself up lazily, so an instance kept between requests hangs them.
 */
function identityOf(env: Env, mail: Mail | undefined): Identity | undefined {
  if (!env.AUTH_DB || !env.BETTER_AUTH_SECRET || !env.PUBLIC_URL) return undefined;
  return betterAuthIdentity({
    database: env.AUTH_DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.PUBLIC_URL,
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    microsoft: { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET },
    apple: { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET },
    mail,
  });
}

/** Everything the API needs, from the Worker's settings. */
export function apiConfig(env: Env, http: Fetch = fetch): ApiConfig | null {
  if (!env.ACTIVATIONS || !env.CHURCH_STUDIO_SIGNING_KEY) return null;
  const provider =
    env.BILLING_PROVIDER === "paddle"
      ? paddleProvider({ apiKey: env.PADDLE_API_KEY, sandbox: env.PADDLE_ENV === "sandbox", prices: paddlePriceMap(env.PADDLE_PRICES ?? ""), discounts: codeMap(env.PADDLE_DISCOUNTS ?? "") }, http)
      : mockProvider;
  const mail: Mail | undefined = env.RESEND_API_KEY
    ? async (to, subject, text, html) => {
        const response = await http("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, ...(html ? { html } : {}) }),
        });
        if (!response.ok) throw new Error(`Email failed: ${response.status}`);
      }
    : undefined;
  return {
    store: kvStore(env.ACTIVATIONS),
    signingKey: env.CHURCH_STUDIO_SIGNING_KEY,
    provider,
    adminToken: env.ADMIN_TOKEN,
    leaseDays: Number(env.LEASE_DAYS ?? 30) || 30,
    trialDays: Number(env.TRIAL_DAYS ?? 14) || 14,
    graceDays: Number(env.GRACE_DAYS ?? 7) || 7,
    identity: identityOf(env, mail),
    site: env.COMPANY_NAME && env.CONTACT_EMAIL ? { company: env.COMPANY_NAME, contact: env.CONTACT_EMAIL } : undefined,
    paddleClient: env.PADDLE_CLIENT_TOKEN ? { token: env.PADDLE_CLIENT_TOKEN, sandbox: env.PADDLE_ENV === "sandbox" } : undefined,
    mail,
    publicUrl: env.PUBLIC_URL,
    now: () => Date.now(),
  };
}

type Fetch = typeof fetch;

/** How old a signed webhook may be before it is refused (replay protection). */
const MAX_AGE_SECONDS = 300;

export default {
  fetch: (request: Request, env: Env) => {
    const path = new URL(request.url).pathname;
    if (path === "/paddle/webhook") return handle(request, env, fetch, Date.now(), apiConfig(env));
    const config = apiConfig(env);
    if (!config) return new Response("The server is not set up yet (KV binding and signing key).", { status: 503 });
    return handleApi(request, config);
  },
};

export async function handle(request: Request, env: Env, http: Fetch = fetch, now = Date.now(), api: ApiConfig | null = null): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/paddle/webhook") return new Response("Not found", { status: 404 });
  // Only Paddle's own servers may call: their addresses come from Paddle (GET /ips), not a list kept here.
  if (!(await fromPaddle(request, env, http, now))) return new Response("Not from Paddle", { status: 403 });
  const body = await request.text();
  if (!(await verifySignature(body, request.headers.get("paddle-signature"), env.PADDLE_WEBHOOK_SECRET, now))) {
    return new Response("Bad signature", { status: 401 });
  }
  const event = JSON.parse(body) as PaddleEvent;
  // A refund: the license stops getting leases, so its computers drop to Free at their next check-in.
  if (api && event.event_type.startsWith("adjustment.") && event.data.action === "refund" && event.data.status === "approved" && event.data.transaction_id) {
    const license = await api.store.get(`txn:${event.data.transaction_id}`);
    if (license) await revoke(api, license, "refund");
    return new Response("Refund noted", { status: 200 });
  }
  if (event.event_type !== "transaction.completed") return new Response("Ignored", { status: 200 });
  // Bought from the app: finish that checkout, so the app collects its key and activates by itself.
  // Only the transaction made for that order, with that order's price, completes it (custom data
  // can be set by a buyer, so it alone proves nothing).
  const session = event.data.custom_data?.session;
  if (api && session) {
    const order = await getJson<{ reference?: string | null; plan: string; interval: string; status: string }>(api.store, `checkout:${session}`);
    if (!order) return new Response("Unknown checkout", { status: 200 });
    const expected = paddlePriceMap(env.PADDLE_PRICES ?? "")[`${order.plan}:${order.interval}`];
    const prices = (event.data.items ?? []).map((item) => item.price.id);
    if (order.reference !== event.data.id || !expected || !prices.includes(expected)) return new Response("Transaction does not match the checkout", { status: 400 });
    const paid = await completeCheckout(api, session, event.data.subscription_id ?? undefined);
    if (paid?.license) await api.store.put(`txn:${event.data.id}`, paid.license);
    return new Response(paid ? "Checkout complete" : "Unknown checkout", { status: 200 });
  }
  // A renewal of a subscription bought from the app: the same key, paid through the new period.
  if (api && event.data.subscription_id) {
    const license = await licenseOfSubscription(api, event.data.subscription_id);
    if (license) {
      const ends = event.data.billing_period?.ends_at ? Date.parse(event.data.billing_period.ends_at) : null;
      await renewLicense(api, license, ends && Number.isFinite(ends) ? ends : null);
      await api.store.put(`txn:${event.data.id}`, license);
      return new Response("Renewed", { status: 200 });
    }
  }

  const issued = licenseFor(event.data, env);
  if (!issued) return new Response("No Church Studio plan in this transaction", { status: 200 });
  const customer = await lookupCustomer(event.data.customer_id, env, http);
  if (!customer?.email) return new Response("Customer email not found", { status: 500 });
  const key = signLicense({ ...issued, holder: customer.name ?? "", id: await keyId(event.data.id) }, env.CHURCH_STUDIO_SIGNING_KEY);
  try {
    await sendKey(customer.email, key, issued, env, http);
  } catch (error) {
    // 500 makes Paddle retry later; the retry makes the same key.
    return new Response(error instanceof Error ? error.message : "Email failed", { status: 500 });
  }
  return new Response("Key sent", { status: 200 });
}

// --- Paddle ---------------------------------------------------------------------------------

export type PaddleEvent = {
  event_type: string;
  data: {
    id: string;
    customer_id: string | null;
    origin?: string;
    items?: { price: { id: string } }[];
    billing_period?: { starts_at: string; ends_at: string } | null;
    custom_data?: { session?: string } | null;
    subscription_id?: string | null;
    /** Adjustments (refunds). */
    action?: string;
    status?: string;
    transaction_id?: string;
  };
};

// Paddle's webhook addresses, read from Paddle and kept for an hour. Only the finished list is
// kept between requests (never a pending fetch: Workers do not share promises across requests).
const IPS_TTL_MS = 60 * 60_000;
let paddleIps: { base: string; at: number; cidrs: string[] } | null = null;

/** Paddle's current webhook addresses (data.ipv4_cidrs), or null when Paddle cannot be reached. */
export async function paddleWebhookIps(env: Env, http: Fetch, now = Date.now()): Promise<string[] | null> {
  const base = env.PADDLE_ENV === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  if (paddleIps && paddleIps.base === base && now - paddleIps.at < IPS_TTL_MS) return paddleIps.cidrs;
  try {
    const response = await http(`${base}/ips`);
    if (!response.ok) return paddleIps?.base === base ? paddleIps.cidrs : null;
    const { data } = (await response.json()) as { data?: { ipv4_cidrs?: unknown } };
    const cidrs = Array.isArray(data?.ipv4_cidrs) ? data.ipv4_cidrs.filter((cidr): cidr is string => typeof cidr === "string") : [];
    if (cidrs.length === 0) return paddleIps?.base === base ? paddleIps.cidrs : null;
    paddleIps = { base, at: now, cidrs };
    return cidrs;
  } catch {
    // Paddle unreachable: the last list if there is one; otherwise refuse, and Paddle retries later.
    return paddleIps?.base === base ? paddleIps.cidrs : null;
  }
}

/** True when an IPv4 address is inside one of the CIDR ranges ("34.232.58.13/32"). */
export function inCidrs(ip: string, cidrs: string[]): boolean {
  const number = (text: string): number | null => {
    const parts = text.split(".");
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
      value = value * 256 + Number(part);
    }
    return value;
  };
  const address = number(ip.trim());
  if (address === null) return false;
  return cidrs.some((cidr) => {
    const [range, bitsText = "32"] = cidr.split("/");
    const start = number(range ?? "");
    const bits = Number(bitsText);
    if (start === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const size = 2 ** (32 - bits);
    return Math.floor(address / size) === Math.floor(start / size);
  });
}

/** The caller's address (Cloudflare sets cf-connecting-ip) is one of Paddle's. */
async function fromPaddle(request: Request, env: Env, http: Fetch, now: number): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return false;
  const cidrs = await paddleWebhookIps(env, http, now);
  return !!cidrs && inCidrs(ip, cidrs);
}

/** Paddle-Signature: "ts=1700000000;h1=<hex HMAC-SHA256 of `${ts}:${body}`>". */
export async function verifySignature(body: string, header: string | null, secret: string, now = Date.now()): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(";").map((part) => part.split("=") as [string, string]));
  const ts = Number(parts.ts);
  const sent = (header.match(/h1=([0-9a-f]+)/g) ?? []).map((match) => match.slice(3));
  if (!Number.isFinite(ts) || sent.length === 0) return false;
  if (Math.abs(now / 1000 - ts) > MAX_AGE_SECONDS) return false;
  const expected = await hmacHex(secret, `${parts.ts}:${body}`);
  return sent.some((candidate) => sameText(candidate, expected));
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compare without stopping at the first difference. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type Issued = { plan: LicensePlan; until: string | null };

/** The plan bought and how long the key runs: the paid period plus grace, or no end for one-off purchases. */
export function licenseFor(data: PaddleEvent["data"], env: Env): Issued | null {
  const prices = Object.fromEntries(
    env.PADDLE_PRICES.split(",")
      .map((pair) => pair.trim().split(":"))
      .filter((pair) => pair.length === 2 || pair.length === 3)
      .map((pair) => [pair[0], pair[1]]) as [string, string][],
  );
  const plans = (data.items ?? []).map((item) => prices[item.price.id]).filter((plan): plan is LicensePlan => plan === "premium" || plan === "church");
  if (plans.length === 0) return null;
  const plan: LicensePlan = plans.includes("church") ? "church" : "premium";
  const ends = data.billing_period?.ends_at;
  if (!ends) return { plan, until: null };
  const grace = Number(env.GRACE_DAYS ?? 7) * 86_400_000;
  return { plan, until: new Date(Date.parse(ends) + grace).toISOString().slice(0, 10) };
}

async function lookupCustomer(id: string | null, env: Env, http: Fetch): Promise<{ email: string; name: string | null } | null> {
  if (!id) return null;
  const base = env.PADDLE_ENV === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const response = await http(`${base}/customers/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${env.PADDLE_API_KEY}` } });
  if (!response.ok) return null;
  const { data } = (await response.json()) as { data?: { email?: string; name?: string | null } };
  return data?.email ? { email: data.email, name: data.name ?? null } : null;
}

/** Four bytes from the transaction id, so the same purchase always yields the same key. */
async function keyId(transactionId: string): Promise<Uint8Array> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(transactionId)));
  return digest.slice(0, 4);
}

// --- Email ----------------------------------------------------------------------------------

export function keyEmail(key: string, issued: Issued, base = "https://license.heitechinc.com"): { subject: string; text: string; html: string } {
  return licenseKeyEmail({ key, plan: issued.plan === "church" ? "church" : "premium", until: issued.until }, base);
}

async function sendKey(to: string, key: string, issued: Issued, env: Env, http: Fetch): Promise<void> {
  const { subject, text, html } = keyEmail(key, issued, env.PUBLIC_URL);
  const response = await http("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html }),
  });
  if (!response.ok) throw new Error(`Email failed: ${response.status}`);
}

/** "CODE:dsc_01abc,CODE2:dsc_02def" → { CODE: "dsc_01abc", … }. */
function codeMap(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split(",")
      .map((pair) => pair.trim().split(":"))
      .filter((pair): pair is [string, string] => pair.length === 2 && !!pair[0] && !!pair[1])
      .map(([code, id]) => [code.trim().toUpperCase(), id.trim()]),
  );
}
