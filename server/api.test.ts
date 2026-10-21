import { describe, expect, it } from "vitest";
import { licenseKeyPair, readLicense, signLicense, TEST_LICENSE_PUBLIC_KEY } from "../src/lib/domain/license";
import { readLease, standing } from "../src/lib/domain/lease";
import { PLANS } from "../src/lib/domain/plans";
import { completeCheckout, handleApi, renewLicense, SEATS, type ApiConfig } from "./api";
import { mockProvider } from "./billing";
import { PRICES } from "./pricing";
import { memoryStore } from "./store";

const pair = licenseKeyPair();
const DAY = 86_400_000;

function setup() {
  let clock = Date.UTC(2026, 9, 19, 12);
  const mails: Array<{ to: string; subject: string; text: string }> = [];
  const config: ApiConfig = {
    store: memoryStore(),
    signingKey: pair.secretKey,
    publicKey: pair.publicKey,
    provider: mockProvider,
    adminToken: "secret",
    leaseDays: 30,
    trialDays: 14,
    graceDays: 7,
    mail: async (to, subject, text) => void mails.push({ to, subject, text }),
    now: () => clock,
  };
  const call = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await handleApi(new Request(`https://keys.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), config);
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { html: text };
    }
    return { status: response.status, data };
  };
  return { config, call, mails, advance: (ms: number) => (clock += ms), now: () => clock };
}

describe("server API", () => {
  it("counts check-ins for the admin stats, behind the admin token", async () => {
    const { call } = setup();
    expect((await call("/v1/hello", { device: "a", version: "0.2.0", os: "macos", plan: "free" })).data).toMatchObject({ provider: "mock", test: true });
    await call("/v1/hello", { device: "b", version: "0.2.0", os: "windows", plan: "free" });
    expect((await call("/v1/admin/stats")).status).toBe(401);
    const stats = (await call("/v1/admin/stats", undefined, { authorization: "Bearer secret" })).data as { computers: { total: number; active1: number } };
    expect(stats.computers).toMatchObject({ total: 2, active1: 2 });
  });

  it("gives one trial per computer, signed, and never a second one", async () => {
    const { call, advance, now } = setup();
    const first = await call("/v1/trial", { device: "mac-1", name: "Grace Chapel" });
    const lease = readLease(first.data.lease as string, pair.publicKey)!;
    expect(lease).toMatchObject({ kind: "trial", plan: "premium", device: "mac-1" });
    expect(lease.endsAt! - now()).toBe(14 * DAY);
    // Asking again during the trial returns the same trial (a reinstall), not a longer one.
    advance(3 * DAY);
    const again = readLease((await call("/v1/trial", { device: "mac-1" })).data.lease as string, pair.publicKey)!;
    expect(again.endsAt).toBe(lease.endsAt);
    advance(12 * DAY);
    expect(await call("/v1/trial", { device: "mac-1" })).toMatchObject({ status: 403, data: { used: true } });
  });

  it("lists the records behind the numbers for the admin page, behind the admin token", async () => {
    const { call } = setup();
    await call("/v1/hello", { device: "computer-one-long-id", version: "0.2.4", os: "macos", plan: "free" });
    await call("/v1/trial", { device: "computer-one-long-id", os: "macos" });
    expect((await call("/v1/admin/details")).status).toBe(401);
    const details = (await call("/v1/admin/details", undefined, { authorization: "Bearer secret" })).data as { days: string[]; series: { computers: number[]; trials: number[] }; computers: Array<{ id: string; os: string }>; trials: Array<{ state: string }>; funnel: { computers: number; trials: number } };
    expect(details.days).toHaveLength(30);
    expect(details.series.computers.at(-1)).toBe(1);
    expect(details.series.trials.at(-1)).toBe(1);
    expect(details.computers[0]).toMatchObject({ id: "computer…", os: "macos" });
    expect(details.trials[0]!.state).toBe("running");
    expect(details.funnel).toMatchObject({ computers: 1, trials: 1 });
  });

  it("gives no trial to the browser demo", async () => {
    const { call } = setup();
    expect(await call("/v1/trial", { device: "browser-1", os: "web-macos" })).toMatchObject({ status: 403, data: { web: true } });
    expect((await call("/v1/trial", { device: "mac-1", os: "macos" })).status).toBe(200);
  });

  it("starts only a few new trials a day from one network address", async () => {
    const { call, advance } = setup();
    const from = { "cf-connecting-ip": "203.0.113.9" };
    for (let n = 0; n < 5; n++) expect((await call("/v1/trial", { device: `vm-${n}` }, from)).status).toBe(200);
    expect((await call("/v1/trial", { device: "vm-6" }, from)).status).toBe(429);
    // The same computer asking again is not a new trial; another address is not limited.
    expect((await call("/v1/trial", { device: "vm-0" }, from)).status).toBe(200);
    expect((await call("/v1/trial", { device: "vm-7" }, { "cf-connecting-ip": "198.51.100.4" })).status).toBe(200);
    advance(DAY);
    expect((await call("/v1/trial", { device: "vm-8" }, from)).status).toBe(200);
  });

  it("checks promo codes and charges the discounted price", async () => {
    const { call } = setup();
    await call("/v1/admin/promos", { code: "easter25", percentOff: 25, plans: ["premium"], maxUses: 2 }, { authorization: "Bearer secret" });
    expect((await call("/v1/promo", { code: "EASTER25", plan: "premium", interval: "yearly" })).data).toMatchObject({ ok: true, percentOff: 25 });
    expect((await call("/v1/promo", { code: "EASTER25", plan: "church", interval: "yearly" })).data).toMatchObject({ ok: false, reason: "not-for-plan" });
    expect((await call("/v1/promo", { code: "NOPE" })).data).toMatchObject({ ok: false, reason: "unknown" });
    const checkout = await call("/v1/checkout", { plan: "premium", interval: "yearly", email: "pastor@grace.org", name: "Grace Chapel", promo: "easter25" });
    expect(checkout.data).toMatchObject({ list: 12000, due: 9000, test: true });
    expect(checkout.data.url).toBe(`https://keys.test/pay/${checkout.data.session}`);
  });

  it("runs a whole purchase: checkout, pay, key and lease straight to the app", async () => {
    const { call, mails } = setup();
    const checkout = await call("/v1/checkout", { plan: "church", interval: "monthly", email: "office@grace.org", name: "Grace Chapel", device: "mac-1" });
    const session = checkout.data.session as string;
    expect((await call("/v1/checkout/status", { session })).data).toEqual({ status: "pending" });
    // The buyer opens the test checkout page and pays.
    expect((await call(`/pay/${session}`)).data.html).toContain("Pay $29");
    expect((await call(`/pay/${session}`, {})).data.html).toContain("Payment complete");
    const status = (await call("/v1/checkout/status", { session, device: "mac-1", name: "Office Mac" })).data;
    expect(status.status).toBe("paid");
    // A test-mode purchase is signed with the test key: release builds refuse it, so it can never
    // unlock a real copy; development builds accept it.
    expect(readLicense(status.key as string, pair.publicKey)).toBeNull();
    expect(readLicense(status.key as string, TEST_LICENSE_PUBLIC_KEY)).toMatchObject({ plan: "church", holder: "Grace Chapel" });
    expect(readLease(status.lease as string, pair.publicKey)).toBeNull();
    expect(standing(readLease(status.lease as string, TEST_LICENSE_PUBLIC_KEY), "mac-1", Date.UTC(2026, 9, 20))).toMatchObject({ ok: true, plan: "church" });
    expect(mails[0]).toMatchObject({ to: "office@grace.org" });
    expect(mails[0]!.text).toContain(status.key as string);
  });

  it("keeps seats per license, refuses a full one, and keeps one key id per subscription", async () => {
    const { call, config } = setup();
    const checkout = await call("/v1/checkout", { plan: "premium", interval: "monthly", email: "a@b.co" });
    const paid = await completeCheckout(config, checkout.data.session as string, "sub_abc");
    const again = await completeCheckout(config, checkout.data.session as string, "sub_abc");
    expect(again!.key).toBe(paid!.key);
    expect((await call("/v1/activate", { key: paid!.key, device: "one", name: "Laptop" })).status).toBe(200);
    expect(await call("/v1/activate", { key: paid!.key, device: "two", name: "Office" })).toMatchObject({ status: 409, data: { full: true, seats: 1 } });
    // The list shortens other computers' ids, and the shortened id still releases.
    const list = (await call("/v1/devices", { key: paid!.key, device: "zzz" })).data.devices as Array<{ device: string; you: boolean }>;
    expect(list[0]).toMatchObject({ device: "one", you: false });
    await call("/v1/release", { key: paid!.key, device: "one" });
    expect((await call("/v1/activate", { key: paid!.key, device: "two", name: "Office" })).status).toBe(200);
  });

  it("limits releases, so one key cannot hop between any number of computers", async () => {
    const { call } = setup();
    const key = signLicense({ plan: "premium", until: "2027-06-01" }, pair.secretKey);
    for (let n = 0; n < 3; n++) {
      expect((await call("/v1/activate", { key, device: `pc-${n}` })).status).toBe(200);
      expect((await call("/v1/release", { key, device: `pc-${n}` })).status).toBe(200);
    }
    expect((await call("/v1/activate", { key, device: "pc-3" })).status).toBe(200);
    expect((await call("/v1/release", { key, device: "pc-3" })).status).toBe(429);
  });

  it("keeps a subscriber's plan through renewals, with the same key", async () => {
    const { call, config, advance } = setup();
    const checkout = await call("/v1/checkout", { plan: "premium", interval: "monthly", email: "a@b.co" });
    const paid = await completeCheckout(config, checkout.data.session as string, "sub_renews");
    const first = readLease((await call("/v1/activate", { key: paid!.key, device: "pc" })).data.lease as string, TEST_LICENSE_PUBLIC_KEY)!;
    advance(35 * DAY);
    await renewLicense(config, paid!.license!, null);
    advance(10 * DAY);
    const renewed = await call("/v1/activate", { key: paid!.key, device: "pc" });
    expect(renewed.status).toBe(200);
    expect(readLease(renewed.data.lease as string, TEST_LICENSE_PUBLIC_KEY)!.endsAt!).toBeGreaterThan(first.endsAt!);
    // Without a renewal the plan ends after its period and grace.
    advance(60 * DAY);
    expect((await call("/v1/activate", { key: paid!.key, device: "pc" })).status).toBe(410);
  });

  it("refuses refunded and ended keys, and counts launch-offer days from first use on the server", async () => {
    const { call, advance } = setup();
    const refunded = signLicense({ plan: "premium", until: "2027-01-01", id: new Uint8Array([1, 2, 3, 4]) }, pair.secretKey);
    await call("/v1/admin/refund", { license: "01020304" }, { authorization: "Bearer secret" });
    expect(await call("/v1/activate", { key: refunded, device: "x" })).toMatchObject({ status: 403, data: { revoked: true } });
    const ended = signLicense({ plan: "premium", until: "2026-01-02" }, pair.secretKey);
    expect(await call("/v1/activate", { key: ended, device: "x" })).toMatchObject({ status: 410 });
    const offer = signLicense({ plan: "premium", days: 30 }, pair.secretKey);
    const first = readLease((await call("/v1/activate", { key: offer, device: "x" })).data.lease as string, pair.publicKey)!;
    advance(10 * DAY);
    const later = readLease((await call("/v1/activate", { key: offer, device: "x" })).data.lease as string, pair.publicKey)!;
    expect(later.endsAt).toBe(first.endsAt);
    advance(25 * DAY);
    expect((await call("/v1/activate", { key: offer, device: "x" })).status).toBe(410);
  });

  it("keeps prices and seats in step with the app's plan table", () => {
    for (const plan of ["premium", "church"] as const) {
      const shown = PLANS.find((entry) => entry.id === plan)!;
      expect(SEATS[plan]).toBe(shown.computers);
      expect(PRICES[plan].monthly).toBe(shown.price.monthly * 100);
      expect(PRICES[plan].yearly).toBe(shown.price.yearly * 100);
    }
  });

  it("serves the public pages, with the prices checkout charges and the policies Paddle reviews", async () => {
    const { call, config } = setup();
    config.site = { company: "Grace Software Ltd", contact: "help@grace.example" };
    const home = String((await call("/")).data.html);
    for (const plan of ["premium", "church"] as const) {
      expect(home).toContain(`>$${PRICES[plan].monthly / 100}</span><small>/ month</small>`);
      expect(home).toContain(`$${PRICES[plan].yearly / 100} billed yearly`);
    }
    expect(home).toContain("mailto:help@grace.example");
    expect(home).toContain('href="/terms"');
    expect(home).toContain("Merchant of Record");
    // Downloads go to the newest release's file, or the release page when GitHub is out of reach.
    config.releases = async () => ({ version: "9.9.9", date: "", assets: { mac: { name: "Church.Studio_9.9.9_universal.dmg", url: "https://example.test/mac.dmg", size: 30_000_000 } } });
    config.fetcher = (async (url: string) => (url === "https://example.test/mac.dmg" ? new Response("DMG-BYTES", { headers: { "content-length": "9" } }) : new Response(null, { status: 404 }))) as typeof fetch;
    // The file comes from this address, under its own name: nobody is sent to GitHub.
    const mac = await handleApi(new Request("https://keys.test/download/mac"), config);
    expect(mac.status).toBe(200);
    expect(mac.headers.get("content-disposition")).toBe('attachment; filename="Church.Studio_9.9.9_universal.dmg"');
    expect(await mac.text()).toBe("DMG-BYTES");
    // No file for that platform: back to the download section.
    expect((await handleApi(new Request("https://keys.test/download/windows"), config)).headers.get("location")).toBe("/#download");
    expect(String((await call("/")).data.html)).toContain("v9.9.9");
    for (const path of ["/terms", "/privacy", "/refunds"]) {
      const page = await call(path);
      expect(page.status).toBe(200);
      expect(String(page.data.html)).toContain("Grace Software Ltd");
    }
    expect(String((await call("/terms")).data.html)).toContain("Paddle.com is the Merchant of Record");
    // The checkout page exists only with a Paddle client token, and says which Paddle it talks to.
    expect((await call("/checkout")).status).toBe(404);
    config.paddleClient = { token: "test_abc", sandbox: true };
    const checkout = String((await call("/checkout")).data.html);
    expect(checkout).toContain('Paddle.Environment.set("sandbox")');
    expect(checkout).toContain('token: "test_abc"');
    config.paddleClient = { token: "live_abc", sandbox: false };
    expect(String((await call("/checkout")).data.html)).not.toContain("Environment.set");
  });
});

describe("email logo", () => {
  it("serves the app icon as a PNG for emails", async () => {
    const { config } = setup();
    const response = await handleApi(new Request("https://keys.test/email/logo.png"), config);
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
  });
});
