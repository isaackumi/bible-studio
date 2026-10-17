// Church Studio license server: Paddle says a payment went through, this makes a signed CS1 key
// and emails it. Plain Web-standard fetch handler, so it runs on Cloudflare Workers as is (and on
// Deno, Bun or Vercel Edge). See server/README.md for setup.
//
// Stateless on purpose: the key id comes from the Paddle transaction id, so a retried webhook
// makes the very same key instead of a second one.

import { signLicense, type LicensePlan } from "../src/lib/domain/license.ts";

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
};

type Fetch = typeof fetch;

/** How old a signed webhook may be before it is refused (replay protection). */
const MAX_AGE_SECONDS = 300;

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
};

export async function handle(request: Request, env: Env, http: Fetch = fetch, now = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/paddle/webhook") return new Response("Not found", { status: 404 });
  const body = await request.text();
  if (!(await verifySignature(body, request.headers.get("paddle-signature"), env.PADDLE_WEBHOOK_SECRET, now))) {
    return new Response("Bad signature", { status: 401 });
  }
  const event = JSON.parse(body) as PaddleEvent;
  if (event.event_type !== "transaction.completed") return new Response("Ignored", { status: 200 });

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
    items: { price: { id: string } }[];
    billing_period?: { starts_at: string; ends_at: string } | null;
  };
};

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
      .filter((pair) => pair.length === 2) as [string, string][],
  );
  const plans = data.items.map((item) => prices[item.price.id]).filter((plan): plan is LicensePlan => plan === "premium" || plan === "church");
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

export function keyEmail(key: string, issued: Issued): { subject: string; text: string } {
  const plan = issued.plan === "church" ? "Church" : "Premium";
  const until = issued.until ? `It runs until ${issued.until}. When your plan renews, a new key arrives by email.` : "It does not expire.";
  return {
    subject: `Your Church Studio ${plan} license key`,
    text: [
      `Thank you for choosing Church Studio ${plan}.`,
      "",
      "Your license key:",
      "",
      key,
      "",
      "To use it: open Church Studio, go to Settings › Plan & account, paste the key under License key, and choose Add key. No internet connection is needed.",
      "",
      until,
      "",
      "Keep this email. You can add the same key again on a new computer.",
    ].join("\n"),
  };
}

async function sendKey(to: string, key: string, issued: Issued, env: Env, http: Fetch): Promise<void> {
  const { subject, text } = keyEmail(key, issued);
  const response = await http("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
  });
  if (!response.ok) throw new Error(`Email failed: ${response.status}`);
}
