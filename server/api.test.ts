import { describe, expect, it } from "vitest";
import { licenseKeyPair, readLicense, signLicense, TEST_LICENSE_PUBLIC_KEY } from "../src/lib/domain/license";
import { readLease, standing } from "../src/lib/domain/lease";
import { PLANS } from "../src/lib/domain/plans";
import { completeCheckout, EMAILS_PER_INBOX, handleApi, MOVES_PER_30_DAYS, renewLicense, SEATS, type ApiConfig } from "./api";
import { mockProvider } from "./billing";
import { PRICES } from "./pricing";
import { memoryStore } from "./store";

const pair = licenseKeyPair();
const DAY = 86_400_000;

/** `asOwner`: the admin API acts as an owner (as dev.ts does); otherwise only the old look-only token opens it. */
function setup(asOwner = true) {
  let clock = Date.UTC(2026, 9, 19, 12);
  const mails: Array<{ to: string; subject: string; text: string }> = [];
  const config: ApiConfig = {
    store: memoryStore(),
    signingKey: pair.secretKey,
    publicKey: pair.publicKey,
    provider: mockProvider,
    adminToken: "secret",
    admin: { users: { "owner@heitech.test": "owner" }, ...(asOwner ? { devEmail: "owner@heitech.test" } : {}) },
    leaseDays: 14,
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
    const { call } = setup(false);
    expect((await call("/v1/hello", { device: "a", version: "0.2.0", os: "macos", plan: "free" })).data).toMatchObject({ provider: "mock", test: true });
    await call("/v1/hello", { device: "b", version: "0.2.0", os: "windows", plan: "free" });
    expect((await call("/admin/api/stats")).status).toBe(401);
    const stats = (await call("/admin/api/stats", undefined, { authorization: "Bearer secret" })).data as { computers: { total: number; active1: number } };
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
    const { call } = setup(false);
    await call("/v1/hello", { device: "computer-one-long-id", version: "0.2.4", os: "macos", plan: "free" });
    await call("/v1/trial", { device: "computer-one-long-id", os: "macos" });
    expect((await call("/admin/api/details")).status).toBe(401);
    const details = (await call("/admin/api/details", undefined, { authorization: "Bearer secret" })).data as { days: string[]; series: { computers: number[]; trials: number[] }; computers: Array<{ id: string; os: string }>; trials: Array<{ state: string }>; funnel: { computers: number; trials: number } };
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
    await call("/admin/api/action", { action: "create-promo", code: "easter25", percentOff: 25, plans: ["premium"], maxUses: 2, expiresAt: "2026-12-31T23:59:59Z" });
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

  it("limits moves per plan, so one key cannot hop between any number of computers", async () => {
    const { call } = setup();
    const premium = signLicense({ plan: "premium", until: "2027-06-01" }, pair.secretKey);
    for (let n = 0; n < MOVES_PER_30_DAYS.premium; n++) {
      expect((await call("/v1/activate", { key: premium, device: `pc-${n}` })).status).toBe(200);
      expect((await call("/v1/release", { key: premium, device: `pc-${n}` })).status).toBe(200);
    }
    expect((await call("/v1/activate", { key: premium, device: "pc-9" })).status).toBe(200);
    expect(await call("/v1/release", { key: premium, device: "pc-9" })).toMatchObject({ status: 429, data: { error: expect.stringContaining("2 times") } });
    const church = signLicense({ plan: "church", until: "2027-06-01" }, pair.secretKey);
    for (let n = 0; n < MOVES_PER_30_DAYS.church; n++) {
      expect((await call("/v1/activate", { key: church, device: `c-${n}` })).status).toBe(200);
      expect((await call("/v1/release", { key: church, device: `c-${n}` })).status).toBe(200);
    }
    expect((await call("/v1/activate", { key: church, device: "c-9" })).status).toBe(200);
    expect((await call("/v1/release", { key: church, device: "c-9" })).status).toBe(429);
  });

  it("moves a license to another computer and refuses the one it left", async () => {
    const { call } = setup();
    const key = signLicense({ plan: "premium", until: "2027-06-01", holder: "Grace" }, pair.secretKey);
    expect((await call("/v1/activate", { key, device: "one", name: "Pastor's Dell" })).status).toBe(200);
    expect((await call("/v1/activate", { key, device: "two", name: "New laptop" })).status).toBe(409);
    const moved = await call("/v1/move", { key, device: "two", name: "New laptop", from: "one" });
    expect(moved.status).toBe(200);
    expect(typeof moved.data.lease).toBe("string");
    expect((moved.data.devices as Array<{ device: string }>).map((entry) => entry.device)).toEqual(["two"]);
    // The old laptop, next time it is online: no lease, told where Premium went.
    expect(await call("/v1/activate", { key, device: "one", name: "Pastor's Dell" })).toMatchObject({ status: 403, data: { moved: true, to: "New laptop", error: expect.stringContaining("Premium was moved to New laptop") } });
    expect((await call("/v1/lease", { key, device: "one" })).status).toBe(403);
  });

  it("writes each store key once per move, as KV allows", async () => {
    const { call, config } = setup();
    const key = signLicense({ plan: "premium", until: "2027-06-01" }, pair.secretKey);
    expect((await call("/v1/activate", { key, device: "one", name: "Old" })).status).toBe(200);
    const writes = new Map<string, number>();
    const put = config.store.put.bind(config.store);
    config.store.put = async (name, value, meta) => {
      writes.set(name, (writes.get(name) ?? 0) + 1);
      return put(name, value, meta);
    };
    expect((await call("/v1/move", { key, device: "two", name: "New", from: "one" })).status).toBe(200);
    for (const [name, count] of writes) expect({ name, count }).toEqual({ name, count: 1 });
    // A move needs a computer to move to, and not this one.
    expect((await call("/v1/move", { key, name: "New", from: "two" })).status).toBe(400);
    expect((await call("/v1/move", { key, device: "two", name: "New", from: "two" })).status).toBe(400);
  });

  it("moves back the other way, and by the shortened id", async () => {
    const { call } = setup();
    const key = signLicense({ plan: "premium", until: "2027-06-01" }, pair.secretKey);
    expect((await call("/v1/activate", { key, device: "laptop-aaaaaaaa", name: "Old" })).status).toBe(200);
    // The list shows other computers by their first eight characters; that is what the app sends.
    expect((await call("/v1/move", { key, device: "laptop-bbbbbbbb", name: "New", from: "laptop-a" })).status).toBe(200);
    expect((await call("/v1/activate", { key, device: "laptop-aaaaaaaa", name: "Old" })).status).toBe(403);
    // The new one died: the old one takes Premium back, which counts as a move.
    expect((await call("/v1/move", { key, device: "laptop-aaaaaaaa", name: "Old", from: "laptop-bbbbbbbb" })).status).toBe(200);
    expect((await call("/v1/activate", { key, device: "laptop-bbbbbbbb", name: "New" })).status).toBe(403);
    expect((await call("/v1/activate", { key, device: "laptop-aaaaaaaa", name: "Old" })).status).toBe(200);
    expect(await call("/v1/move", { key, device: "laptop-cccccccc", name: "Third", from: "nobody12" })).toMatchObject({ status: 404 });
  });

  it("blocks a released computer until the license is moved back to it", async () => {
    const { call } = setup();
    const key = signLicense({ plan: "premium", until: "2027-06-01" }, pair.secretKey);
    expect((await call("/v1/activate", { key, device: "one", name: "Old" })).status).toBe(200);
    expect((await call("/v1/release", { key, device: "one" })).status).toBe(200);
    expect(await call("/v1/activate", { key, device: "one", name: "Old" })).toMatchObject({ status: 403, data: { moved: true } });
    expect((await call("/v1/activate", { key, device: "two", name: "New" })).status).toBe(200);
    expect((await call("/v1/move", { key, device: "one", name: "Old", from: "two" })).status).toBe(200);
  });

  it("leases last 14 days", async () => {
    const { call, config, now } = setup();
    const checkout = await call("/v1/checkout", { plan: "premium", interval: "monthly", email: "a@b.co" });
    const paid = await completeCheckout(config, checkout.data.session as string, "sub_lease");
    const answer = await call("/v1/activate", { key: paid!.key, device: "one", name: "Laptop" });
    const lease = readLease(answer.data.lease as string, TEST_LICENSE_PUBLIC_KEY)!;
    expect(lease.renewBy - now()).toBe(14 * DAY);
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
    await call("/admin/api/action", { action: "refund", license: "01020304" });
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
    config.site = { company: "Grace Software Ltd", contact: "help@grace.example", address: "1 Mission Road, Accra", country: "Ghana" };
    const home = String((await call("/")).data.html);
    // The launch pages: every policy names the company, its address and its contact.
    const privacy = String((await call("/privacy")).data.html);
    expect(privacy).toContain("Grace Software Ltd, 1 Mission Road, Accra");
    expect(privacy).toContain("Data Protection Commission");
    expect(String((await call("/terms")).data.html)).toContain("the laws of Ghana");
    const licenses = String((await call("/licenses")).data.html);
    expect(licenses).toContain("Open-source licenses");
    expect(licenses).toContain("CC BY-SA 4.0");
    expect(String((await call("/security")).data.html)).toContain("Reporting a problem");
    // The features page, the release notes, and what search engines read.
    const features = String((await call("/features")).data.html);
    expect(features).toContain("Everything your church does on a screen");
    expect(features).toContain("Grace Software Ltd");
    expect(String((await call("/whats-new")).data.html)).toContain("Version 0.4.1");
    // The story: a brief to present and print, linked from every footer.
    const story = String((await call("/story")).data.html);
    expect(story).toContain("Have you ever watched a congregation wait for a verse?");
    expect(story).toContain("@media print");
    expect(story).toContain("window.print()");
    expect(story).toContain("Grace Software Ltd");
    expect(home).toContain('href="/story"');
    expect(home).toContain('"@type":"SoftwareApplication"');
    expect(home).toContain('href="/features"');
    expect(await (await handleApi(new Request("https://keys.test/robots.txt"), config)).text()).toContain("Sitemap: https://keys.test/sitemap.xml");
    expect(await (await handleApi(new Request("https://keys.test/sitemap.xml"), config)).text()).toContain("<loc>https://keys.test/features</loc>");
    // Ready for search engines and link previews: one true address, a share picture, structured data, no outside fonts.
    expect(home).toContain('<link rel="canonical" href="https://keys.test/">');
    expect(home).toContain('<meta property="og:image" content="https://keys.test/share.jpg">');
    expect(home).toContain('"@type":"FAQPage"');
    expect(home).toContain('"@type":"Organization"');
    expect(home).not.toContain("fonts.googleapis.com");
    expect(features).toContain('"@type":"BreadcrumbList"');
    expect(features).toContain('<link rel="canonical" href="https://keys.test/features">');
    expect(String((await call("/privacy")).data.html)).toContain('<link rel="canonical" href="https://church-studio.heitechinc.com/privacy">');
    const share = await handleApi(new Request("https://keys.test/share.jpg"), config);
    expect(share.headers.get("content-type")).toBe("image/jpeg");
    expect((await share.arrayBuffer()).byteLength).toBeGreaterThan(20_000);
    expect((await handleApi(new Request("https://keys.test/fonts/inter.woff2"), config)).headers.get("cache-control")).toContain("immutable");
    const head = await handleApi(new Request("https://keys.test/features", { method: "HEAD" }), config);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toContain("text/html");
    expect(head.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await head.text()).toBe("");
    expect(await (await handleApi(new Request("https://keys.test/sitemap.xml"), config)).text()).toMatch(/<loc>https:\/\/keys\.test\/features<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    // AI assistants: their crawlers are welcome, and llms.txt tells them what Church Studio is.
    const robots = await (await handleApi(new Request("https://keys.test/robots.txt"), config)).text();
    for (const bot of ["OAI-SearchBot", "GPTBot", "ClaudeBot", "Claude-SearchBot", "PerplexityBot"]) expect(robots).toContain(`User-agent: ${bot}\nAllow: /\n`);
    expect(robots).toContain("Disallow: /admin");
    const llms = await (await handleApi(new Request("https://keys.test/llms.txt"), config)).text();
    expect(llms).toMatch(/^# Church Studio\n\n> Church Studio is church presentation software/);
    const full = await (await handleApi(new Request("https://keys.test/llms-full.txt"), config)).text();
    expect(full).toContain(`**Premium** ($${PRICES.premium.monthly / 100} a month`);
    expect(full).toContain("### Is it an alternative to ProPresenter or EasyWorship?");
    expect(home).toContain("Is it an alternative to ProPresenter or EasyWorship?");
    const { INDEXNOW_KEY } = await import("./api");
    expect(await (await handleApi(new Request(`https://keys.test/${INDEXNOW_KEY}.txt`), config)).text()).toBe(INDEXNOW_KEY);
    const bing = await handleApi(new Request("https://keys.test/BingSiteAuth.xml"), config);
    expect(bing.headers.get("content-type")).toContain("xml");
    expect(await bing.text()).toContain("<user>272107FAAAFFA1D285614330D422B926</user>");
    // An address that is not there: a page for people, JSON for the app.
    const lost = await handleApi(new Request("https://keys.test/no-such-page"), config);
    expect(lost.status).toBe(404);
    const lostPage = await lost.text();
    expect(lostPage).toContain("Not <span class=\"serif\">here.</span>");
    expect(lostPage).toContain('<meta name="robots" content="noindex">');
    expect((await handleApi(new Request("https://keys.test/v1/nothing"), config)).headers.get("content-type")).toContain("json");
    const txt = await handleApi(new Request("https://keys.test/.well-known/security.txt"), config);
    expect(await txt.text()).toMatch(/^Contact: mailto:help@grace\.example\nExpires: 2027-/);
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
    // No file for that platform: the release page with every file, never back to the same page.
    expect((await handleApi(new Request("https://keys.test/download/windows"), config)).headers.get("location")).toBe("https://github.com/isaackumi/bible-studio/releases/latest");
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
  it("emails each inbox only a few test keys a day, however many checkouts name it", async () => {
    const { call, mails, advance } = setup();
    const buy = async () => {
      const session = (await call("/v1/checkout", { plan: "premium", interval: "monthly", email: "Stranger@Example.org" })).data.session as string;
      return (await call(`/pay/${session}`, {})).status;
    };
    for (let i = 0; i < EMAILS_PER_INBOX; i++) expect(await buy()).toBe(200);
    expect(await buy()).toBe(429);
    expect(mails).toHaveLength(EMAILS_PER_INBOX);
    advance(DAY);
    expect(await buy()).toBe(200);
  });

  it("lets unpaid checkouts expire and keeps paid ones", async () => {
    const { config, call } = setup();
    const store = config.store as ReturnType<typeof memoryStore>;
    const session = (await call("/v1/checkout", { plan: "premium", interval: "monthly", email: "a@b.co" })).data.session as string;
    expect(store.dump().get(`checkout:${session}`)!.ttl).toBe(7 * 86_400);
    await call(`/pay/${session}`, {});
    expect(store.dump().get(`checkout:${session}`)!.ttl).toBeUndefined();
  });

  it("slows down one network address on the routes that send email or make records", async () => {
    const { config, call } = setup();
    const asked = new Map<string, number>();
    config.limit = async (key) => (asked.set(key, (asked.get(key) ?? 0) + 1), asked.get(key)! <= 2);
    const from = { "cf-connecting-ip": "203.0.113.7" };
    const checkout = () => call("/v1/checkout", { plan: "premium", interval: "monthly", email: "a@b.co" }, from);
    expect((await checkout()).status).toBe(200);
    expect((await checkout()).status).toBe(200);
    expect(await checkout()).toMatchObject({ status: 429, data: { error: expect.stringContaining("Wait a minute") } });
    // Each route counts on its own, and another address is not held up.
    expect((await call("/v1/promo", { code: "NONE" }, from)).status).toBe(200);
    expect((await call("/v1/checkout", { plan: "premium", interval: "monthly", email: "a@b.co" }, { "cf-connecting-ip": "198.51.100.2" })).status).toBe(200);
    expect([...asked.keys()]).toContain("checkout:203.0.113.7");
  });

  it("serves the app icon as a PNG for emails", async () => {
    const { config } = setup();
    const response = await handleApi(new Request("https://keys.test/email/logo.png"), config);
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
  });
});

describe("support reports", () => {
  it("keeps a report under a short code for two weeks, and never hands one back", async () => {
    const { call, config } = setup();
    const sent = await call("/v1/report", { report: "=== 4. Speech recognizers ===\n  NONE", kind: "listening-check", version: "0.6.5", platform: "Windows 11 24H2" });
    expect(sent.status).toBe(200);
    const code = String(sent.data.code);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(await config.store.get(`report:${code}`)).toContain("Speech recognizers");
    expect((await config.store.list("report:"))[0]!.meta).toMatchObject({ kind: "listening-check", version: "0.6.5", platform: "Windows 11 24H2" });
    // Write only: there is no way to read a report back over the internet.
    expect((await call(`/v1/report/${code}`)).status).toBe(404);
    expect((await call(`/v1/report`, { code })).status).toBe(400);
  });

  it("refuses an empty or oversized report", async () => {
    const { call } = setup();
    expect((await call("/v1/report", { report: "  " })).status).toBe(400);
    expect((await call("/v1/report", { report: "x".repeat(256 * 1024 + 1) })).status).toBe(413);
  });
});
