import { describe, expect, it } from "vitest";
import { licenseKeyPair, readLicense } from "../src/lib/domain/license";
import { handle, licenseFor, verifySignature, type Env } from "./paddle";

const pair = licenseKeyPair();
const NOW = Date.parse("2026-10-17T12:00:00Z");
const env: Env = {
  PADDLE_WEBHOOK_SECRET: "pdl_ntfset_test",
  PADDLE_API_KEY: "pdl_test_key",
  PADDLE_ENV: "sandbox",
  PADDLE_PRICES: "pri_premium_year:premium, pri_church_year:church",
  CHURCH_STUDIO_SIGNING_KEY: pair.secretKey,
  RESEND_API_KEY: "re_test",
  MAIL_FROM: "Church Studio <keys@example.org>",
};

async function sign(body: string, secret = env.PADDLE_WEBHOOK_SECRET, ts = Math.floor(NOW / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${body}`)));
  return `ts=${ts};h1=${Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function completed(priceId = "pri_premium_year", period: { starts_at: string; ends_at: string } | null = { starts_at: "2026-10-17T12:00:00Z", ends_at: "2027-10-17T12:00:00Z" }) {
  return JSON.stringify({ event_type: "transaction.completed", data: { id: "txn_01", customer_id: "ctm_01", origin: "web", items: [{ price: { id: priceId } }], billing_period: period } });
}

/** A fake network: Paddle's customer lookup and Resend's send. */
function network(emailStatus = 200) {
  const sent: { to: string[]; subject: string; text: string }[] = [];
  const http = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://sandbox-api.paddle.com/customers/ctm_01") return Response.json({ data: { email: "pastor@grace.org", name: "Grace Chapel" } });
    if (url === "https://api.resend.com/emails") {
      sent.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: emailStatus });
    }
    return new Response("missing", { status: 404 });
  }) as typeof fetch;
  return { http, sent };
}

const post = async (body: string, signature?: string) =>
  new Request("https://keys.example.org/paddle/webhook", { method: "POST", body, headers: { "paddle-signature": signature ?? (await sign(body)) } });

describe("Paddle license server", () => {
  it("checks Paddle's signature and its age", async () => {
    const body = completed();
    expect(await verifySignature(body, await sign(body), env.PADDLE_WEBHOOK_SECRET, NOW)).toBe(true);
    expect(await verifySignature(body + " ", await sign(body), env.PADDLE_WEBHOOK_SECRET, NOW)).toBe(false);
    expect(await verifySignature(body, await sign(body, "wrong"), env.PADDLE_WEBHOOK_SECRET, NOW)).toBe(false);
    expect(await verifySignature(body, await sign(body), env.PADDLE_WEBHOOK_SECRET, NOW + 10 * 60_000)).toBe(false);
    expect(await verifySignature(body, null, env.PADDLE_WEBHOOK_SECRET, NOW)).toBe(false);
  });

  it("maps prices to plans and adds grace to a paid period", () => {
    const data = JSON.parse(completed()).data;
    expect(licenseFor(data, env)).toEqual({ plan: "premium", until: "2027-10-24" });
    expect(licenseFor(JSON.parse(completed("pri_church_year", null)).data, env)).toEqual({ plan: "church", until: null });
    expect(licenseFor(JSON.parse(completed("pri_other")).data, env)).toBeNull();
  });

  it("emails a key the app accepts, and the same key on a retried webhook", async () => {
    const net = network();
    const body = completed();
    expect((await handle(await post(body), env, net.http, NOW)).status).toBe(200);
    expect((await handle(await post(body), env, net.http, NOW)).status).toBe(200);
    expect(net.sent).toHaveLength(2);
    expect(net.sent[0]!.to).toEqual(["pastor@grace.org"]);
    const key = net.sent[0]!.text.split("\n").find((line) => line.startsWith("CS1-"))!;
    expect(readLicense(key, pair.publicKey)).toMatchObject({ plan: "premium", until: "2027-10-24T23:59:59.999Z", holder: "Grace Chapel" });
    expect(net.sent[1]!.text).toContain(key);
  });

  it("refuses forgeries, ignores other events, and asks for a retry when email fails", async () => {
    const net = network();
    expect((await handle(await post(completed(), "ts=1;h1=00"), env, net.http, NOW)).status).toBe(401);
    const other = JSON.stringify({ event_type: "subscription.updated", data: {} });
    expect((await handle(await post(other), env, net.http, NOW)).status).toBe(200);
    expect(net.sent).toHaveLength(0);
    expect((await handle(await post(completed()), env, network(503).http, NOW)).status).toBe(500);
    expect((await handle(new Request("https://keys.example.org/"), env, net.http, NOW)).status).toBe(404);
  });
});
