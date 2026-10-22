import { describe, expect, it } from "vitest";
import { licenseKeyPair, readLicense } from "../src/lib/domain/license";
import { handle, inCidrs, licenseFor, paddleWebhookIps, verifySignature, type Env } from "./paddle";
import { mockProvider } from "./billing";
import { memoryStore, putJson } from "./store";
import type { ApiConfig } from "./api";

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
    if (url === "https://sandbox-api.paddle.com/ips") return Response.json({ data: { ipv4_cidrs: [PADDLE_IP + "/32", "34.194.127.46/32"] } });
    if (url === "https://sandbox-api.paddle.com/customers/ctm_01") return Response.json({ data: { email: "pastor@grace.org", name: "Grace Chapel" } });
    if (url === "https://api.resend.com/emails") {
      sent.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: emailStatus });
    }
    return new Response("missing", { status: 404 });
  }) as typeof fetch;
  return { http, sent };
}

const PADDLE_IP = "34.232.58.13";
const post = async (body: string, signature?: string, ip = PADDLE_IP) =>
  new Request("https://keys.example.org/paddle/webhook", { method: "POST", body, headers: { "paddle-signature": signature ?? (await sign(body)), "cf-connecting-ip": ip } });

describe("Paddle license server", () => {
  it("checks Paddle's signature and its age", async () => {
    const body = completed();
    expect(await verifySignature(body, await sign(body), env.PADDLE_WEBHOOK_SECRET, NOW)).toBe(true);
    expect(await verifySignature(body + " ", await sign(body), env.PADDLE_WEBHOOK_SECRET, NOW)).toBe(false);
    expect(await verifySignature(body, await sign(body, "wrong"), env.PADDLE_WEBHOOK_SECRET, NOW)).toBe(false);
    expect(await verifySignature(body, await sign(body), env.PADDLE_WEBHOOK_SECRET, NOW + 10 * 60_000)).toBe(false);
    expect(await verifySignature(body, null, env.PADDLE_WEBHOOK_SECRET, NOW)).toBe(false);
  });

  it("takes webhooks only from Paddle's addresses, as Paddle lists them", async () => {
    expect(inCidrs("34.232.58.13", ["34.232.58.13/32"])).toBe(true);
    expect(inCidrs("34.232.58.14", ["34.232.58.13/32"])).toBe(false);
    expect(inCidrs("10.0.3.7", ["10.0.0.0/16"])).toBe(true);
    expect(inCidrs("not-an-ip", ["0.0.0.0/0"])).toBe(false);
    const net = network();
    expect(await paddleWebhookIps(env, net.http, NOW)).toContain("34.232.58.13/32");
    // A correctly signed webhook from anywhere else is refused before it is read.
    expect((await handle(await post(completed(), undefined, "203.0.113.9"), env, net.http, NOW)).status).toBe(403);
    expect(net.sent).toHaveLength(0);
    const noAddress = new Request("https://keys.example.org/paddle/webhook", { method: "POST", body: completed(), headers: { "paddle-signature": await sign(completed()) } });
    expect((await handle(noAddress, env, net.http, NOW)).status).toBe(403);
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

  it("stops a key bought through a Paddle link when it is refunded or charged back, and restores a reversed charge-back", async () => {
    const store = memoryStore();
    const api: ApiConfig = { store, signingKey: pair.secretKey, publicKey: pair.publicKey, provider: { ...mockProvider, name: "paddle", test: false }, leaseDays: 30, trialDays: 14, graceDays: 7, now: () => NOW };
    const net = network();
    expect((await handle(await post(completed()), env, net.http, NOW, api)).status).toBe(200);
    const key = net.sent[0]!.text.split("\n").find((line) => line.startsWith("CS1-"))!;
    const id = readLicense(key, pair.publicKey)!.id;
    expect(await store.get("txn:txn_01")).toBe(id);
    const adjustment = (action: string, status = "approved") => JSON.stringify({ event_type: "adjustment.created", data: { id: "adj_1", customer_id: "ctm_01", action, status, transaction_id: "txn_01" } });
    // A warning alone changes nothing.
    expect(await (await handle(await post(adjustment("chargeback_warning")), env, net.http, NOW, api)).text()).toBe("Ignored");
    expect(await store.get(`revoked:${id}`)).toBeNull();
    expect(await (await handle(await post(adjustment("chargeback")), env, net.http, NOW, api)).text()).toBe("Charge-back noted");
    expect(JSON.parse((await store.get(`revoked:${id}`))!).reason).toBe("chargeback");
    await handle(await post(adjustment("chargeback_reverse")), env, net.http, NOW, api);
    expect(await store.get(`revoked:${id}`)).toBeNull();
    // A refund still pending does nothing; an approved one stops the key, and a reversal never undoes a refund.
    await handle(await post(adjustment("refund", "pending_approval")), env, net.http, NOW, api);
    expect(await store.get(`revoked:${id}`)).toBeNull();
    expect(await (await handle(await post(adjustment("refund")), env, net.http, NOW, api)).text()).toBe("Refund noted");
    await handle(await post(adjustment("chargeback_reverse")), env, net.http, NOW, api);
    expect(JSON.parse((await store.get(`revoked:${id}`))!).reason).toBe("refund");
  });

  it("completes an app checkout only with the transaction and price made for it", async () => {
    const store = memoryStore();
    const api: ApiConfig = { store, signingKey: pair.secretKey, publicKey: pair.publicKey, provider: { ...mockProvider, name: "paddle", test: false }, leaseDays: 30, trialDays: 14, graceDays: 7, now: () => NOW };
    const order = { id: "cs_1", plan: "premium", interval: "yearly", email: "a@b.co", name: "", promo: null, list: 12000, due: 12000, currency: "USD", device: null, status: "pending", createdAt: NOW, reference: "txn_01" };
    await putJson(store, "checkout:cs_1", order);
    const withSession = (txn: string, price: string) =>
      JSON.stringify({ event_type: "transaction.completed", data: { id: txn, customer_id: "ctm_01", items: [{ price: { id: price } }], custom_data: { session: "cs_1" }, subscription_id: "sub_9" } });
    const net = network();
    // Another transaction carrying this checkout's session (a cheaper price paid): refused.
    expect((await handle(await post(withSession("txn_other", "pri_premium_year")), env, net.http, NOW, api)).status).toBe(400);
    expect((await handle(await post(withSession("txn_01", "pri_cheap")), env, net.http, NOW, api)).status).toBe(400);
    expect((await handle(await post(withSession("txn_01", "pri_premium_year")), env, net.http, NOW, api)).status).toBe(200);
    expect(JSON.parse((await store.get("checkout:cs_1"))!).status).toBe("paid");
    // A later renewal of that subscription keeps the license paid.
    const renewal = JSON.stringify({ event_type: "transaction.completed", data: { id: "txn_02", customer_id: "ctm_01", items: [{ price: { id: "pri_premium_year" } }], subscription_id: "sub_9", billing_period: { starts_at: "2027-10-17T12:00:00Z", ends_at: "2028-10-17T12:00:00Z" } } });
    expect(await (await handle(await post(renewal), env, net.http, NOW, api)).text()).toBe("Renewed");
  });
});
