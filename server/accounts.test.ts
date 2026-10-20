import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";
import { describe, expect, it } from "vitest";
import { licenseKeyPair, TEST_LICENSE_PUBLIC_KEY } from "../src/lib/domain/license";
import { readLease } from "../src/lib/domain/lease";
import type { Identity, Person } from "./accounts";
import { completeCheckout, handleApi, type ApiConfig } from "./api";
import { authOptions, betterAuthIdentity, type AuthSettings } from "./auth";
import { mockProvider } from "./billing";
import { memoryStore } from "./store";

const pair = licenseKeyPair();
const ORIGIN = "https://keys.test";

/** An identity that says whoever the test chooses is signed in. */
function fakeIdentity() {
  let person: Person | null = null;
  const identity: Identity = { methods: ["google", "email"], handler: async () => new Response("auth"), current: async () => person };
  return { identity, signInAs: (who: Person | null) => void (person = who) };
}

function setup(identity?: Identity) {
  let clock = Date.UTC(2026, 9, 19, 12);
  const mails: Array<{ to: string; subject: string; text: string }> = [];
  const config: ApiConfig = {
    store: memoryStore(),
    signingKey: pair.secretKey,
    publicKey: pair.publicKey,
    provider: mockProvider,
    identity,
    leaseDays: 30,
    trialDays: 14,
    graceDays: 7,
    mail: async (to, subject, text) => void mails.push({ to, subject, text }),
    now: () => clock,
  };
  const request = (path: string, init: RequestInit = {}) => handleApi(new Request(`${ORIGIN}${path}`, init), config);
  const call = async (path: string, body: unknown) => {
    const response = await request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, data: (await response.json()) as Record<string, any> };
  };
  const page = async (path: string, form?: Record<string, string>, headers: Record<string, string> = {}) => {
    const response = await request(path, form ? { method: "POST", body: new URLSearchParams(form), headers: { "content-type": "application/x-www-form-urlencoded", ...headers } } : { headers });
    return { status: response.status, html: await response.text() };
  };
  /** Buy a plan with an email, as the mock checkout does. */
  const buy = async (email: string, extra: Record<string, unknown> = {}) => {
    const started = await call("/v1/checkout", { plan: "church", interval: "yearly", email, name: "Grace Chapel", ...extra });
    return (await completeCheckout(config, started.data.session))!;
  };
  return { config, call, page, buy, mails, advance: (ms: number) => (clock += ms) };
}

const alice: Person = { id: "user-alice", email: "Alice@Grace.org", name: "Alice", emailVerified: true };

describe("accounts", () => {
  it("is off, and says so, when the server has no identity provider", async () => {
    const { call } = setup();
    expect((await call("/v1/signin/start", { device: "mac-1" })).status).toBe(503);
  });

  it("is off while the identity provider has no way to sign in yet", async () => {
    const { identity } = fakeIdentity();
    const { call } = setup({ ...identity, methods: [] });
    expect((await call("/v1/signin/start", { device: "mac-1" })).status).toBe(503);
  });

  it("signs the app in: the browser signs in, taps the app's number, and the app collects its token once", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page } = setup(identity);
    const start = (await call("/v1/signin/start", { device: "mac-1", name: "Sanctuary Mac" })).data;
    expect(start.url).toBe(`${ORIGIN}/signin/${start.id}`);
    expect(start.methods).toEqual(["google", "email"]);
    expect((await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data.status).toBe("pending");

    // Not signed in to the browser yet: the page offers the methods.
    expect((await page(`/signin/${start.id}`)).html).toContain("Continue with Google");
    signInAs(alice);
    const confirm = (await page(`/signin/${start.id}`)).html;
    expect(confirm).toContain("Which number is on your screen?");
    expect(confirm).toContain("Sanctuary Mac");
    expect(confirm).toContain(`value="${start.number}"`);

    expect((await page(`/signin/${start.id}/confirm`, { number: String(start.number) })).html).toContain("You're signed in");
    // Only the app, holding the secret, can collect, and only once.
    expect((await call("/v1/signin/poll", { id: start.id, secret: "f".repeat(64) })).status).toBe(404);
    const done = (await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data;
    expect(done).toMatchObject({ status: "done", account: { email: alice.email, name: "Alice" } });
    expect(done.token).toMatch(/^cst_[0-9a-f]{64}$/);
    expect((await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data).toEqual({ status: "collected" });

    expect((await call("/v1/account", { token: done.token })).data).toMatchObject({ account: { email: alice.email }, licenses: [] });
    await call("/v1/account/signout", { token: done.token });
    expect((await call("/v1/account", { token: done.token })).status).toBe(401);
  });

  it("ends the sign-in on a wrong number, so the numbers cannot be tried in turn", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page } = setup(identity);
    const start = (await call("/v1/signin/start", { device: "mac-1" })).data;
    signInAs(alice);
    const html = (await page(`/signin/${start.id}`)).html;
    const wrong = [...html.matchAll(/name="number" value="(\d+)"/g)].map((match) => Number(match[1])).find((n) => n !== start.number)!;
    expect((await page(`/signin/${start.id}/confirm`, { number: String(wrong) })).html).toContain("didn't match");
    expect((await page(`/signin/${start.id}/confirm`, { number: String(start.number) })).html).toContain("has ended");
    expect((await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data.status).toBe("cancelled");
  });

  it("expires after ten minutes", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, advance } = setup(identity);
    const start = (await call("/v1/signin/start", { device: "mac-1" })).data;
    signInAs(alice);
    advance(11 * 60_000);
    expect((await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data.status).toBe("expired");
    expect((await page(`/signin/${start.id}`)).html).toContain("has ended");
  });

  it("finds a plan bought with the same verified email, and activates a second computer with no key", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, buy } = setup(identity);
    const paid = await buy("alice@grace.org");
    const start = (await call("/v1/signin/start", { device: "mac-2" })).data;
    signInAs(alice);
    await page(`/signin/${start.id}/confirm`, { number: String(start.number) });
    const { token } = (await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data;
    const status = (await call("/v1/account", { token, device: "mac-2", name: "Office PC" })).data;
    expect(status.licenses).toEqual([{ license: paid.license, plan: "church", revoked: false }]);
    // Mock checkouts are test sales, signed with the test key.
    expect(readLease(status.lease, TEST_LICENSE_PUBLIC_KEY)).toMatchObject({ plan: "church", device: "mac-2" });
    expect(status.activation.key).toBe(paid.key);
  });

  it("does not hand a plan to an unverified email", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, buy } = setup(identity);
    await buy("alice@grace.org");
    const start = (await call("/v1/signin/start", { device: "mac-2" })).data;
    signInAs({ ...alice, id: "someone-else", emailVerified: false });
    await page(`/signin/${start.id}/confirm`, { number: String(start.number) });
    const { token } = (await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data;
    const status = (await call("/v1/account", { token, device: "mac-2" })).data;
    expect(status.licenses).toEqual([]);
    expect(status.lease).toBeUndefined();
  });

  it("puts a purchase made while signed in on the account, and links a key bought before", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, buy } = setup(identity);
    const start = (await call("/v1/signin/start", { device: "mac-1" })).data;
    signInAs({ ...alice, emailVerified: false });
    await page(`/signin/${start.id}/confirm`, { number: String(start.number) });
    const { token } = (await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data;

    // Signed in: the email comes from the account, and the license lands on it.
    const bought = await buy("", { token });
    const older = await buy("old-address@example.com");
    expect((await call("/v1/account/link", { token, key: "CS1-not-a-key" })).status).toBe(400);
    expect((await call("/v1/account/link", { token, key: older.key })).data).toEqual({ ok: true });
    const licenses = (await call("/v1/account", { token })).data.licenses.map((entry: { license: string }) => entry.license);
    expect(licenses.sort()).toEqual([bought.license, older.license].sort());
  });
});

describe("accounts with Better Auth", () => {
  it("signs in with an emailed link, end to end", async () => {
    const links: string[] = [];
    const settings: AuthSettings = {
      database: new DatabaseSync(":memory:"),
      secret: "a-test-secret-that-is-long-enough-to-pass-0123456789",
      baseURL: ORIGIN,
      mail: async (_to, _subject, text) => void links.push(text.match(/https:\/\/\S+/)![0]),
    };
    await (await getMigrations(authOptions(settings))).runMigrations();
    const identity = betterAuthIdentity(settings);
    expect(identity.methods).toEqual(["email"]);
    const { call, page } = setup(identity);

    const start = (await call("/v1/signin/start", { device: "mac-1", name: "Sanctuary Mac" })).data;
    const signinUrl = `${ORIGIN}/signin/${start.id}`;
    expect((await page(`/signin/${start.id}`)).html).toContain("Email me a sign-in link");

    // The page's script asks Better Auth for the link; the link signs the browser in with a cookie.
    const ask = await handleApi(new Request(`${ORIGIN}/auth/sign-in/magic-link`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email: "pastor@grace.org", callbackURL: signinUrl }) }), { ...setup(identity).config });
    expect(ask.status).toBe(200);
    expect(links).toHaveLength(1);
    const opened = await handleApi(new Request(links[0]!, { redirect: "manual" }), setup(identity).config);
    expect(opened.status).toBe(302);
    expect(opened.headers.get("location")).toBe(signinUrl);
    const cookie = opened.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");

    const confirm = (await page(`/signin/${start.id}`, undefined, { cookie })).html;
    expect(confirm).toContain("pastor@grace.org");
    expect((await page(`/signin/${start.id}/confirm`, { number: String(start.number) }, { cookie })).html).toContain("You're signed in");
    const done = (await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data;
    expect(done).toMatchObject({ status: "done", account: { email: "pastor@grace.org" } });
  });
});
