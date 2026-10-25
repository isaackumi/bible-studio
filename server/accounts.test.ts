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
    // The buyer's verified email claims it: they own it, with nobody added yet.
    expect(status.licenses).toEqual([{ license: paid.license, plan: "church", revoked: false, owner: true, members: [], people: [] }]);
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
    expect((await call("/v1/account/link", { token, key: older.key })).data).toEqual({ ok: true, owner: true });
    const licenses = (await call("/v1/account", { token })).data.licenses.map((entry: { license: string }) => entry.license);
    expect(licenses.sort()).toEqual([bought.license, older.license].sort());
  });
});

describe("signing in safely, and who a license belongs to", () => {
  const bob: Person = { id: "user-bob", email: "bob@grace.org", name: "Bob", emailVerified: true };

  /** Sign a computer in as someone (the older number flow, which every mode ends like). */
  async function signedIn(call: ReturnType<typeof setup>["call"], page: ReturnType<typeof setup>["page"], signInAs: (who: Person | null) => void, who: Person, device: string) {
    const start = (await call("/v1/signin/start", { device, name: device })).data;
    signInAs(who);
    await page(`/signin/${start.id}/confirm`, { number: String(start.number) });
    return (await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data.token as string;
  }

  it("loopback: only the app that started it, with its verifier, gets the token", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, config } = setup(identity);
    const verifier = "v".repeat(50);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    // Anywhere but this computer's loopback address is refused.
    expect((await call("/v1/signin/start", { device: "mac-1", mode: "loopback", redirect: "https://evil.example/cb", challenge })).status).toBe(400);
    const start = (await call("/v1/signin/start", { device: "mac-1", name: "Sanctuary Mac", mode: "loopback", redirect: "http://127.0.0.1:53682/signin", challenge })).data;
    expect(start.number).toBeUndefined();
    signInAs(alice);
    expect((await page(`/signin/${start.id}`)).html).toContain("Sign in Church Studio on this computer?");
    const response = await handleApi(new Request(`${ORIGIN}/signin/${start.id}/confirm`, { method: "POST", body: new URLSearchParams({}), headers: { "content-type": "application/x-www-form-urlencoded" } }), config);
    expect(response.status).toBe(303);
    const back = new URL(response.headers.get("location")!);
    expect(back.origin + back.pathname).toBe("http://127.0.0.1:53682/signin");
    const code = back.searchParams.get("code")!;
    // The browser's code alone (a phisher who saw it) is not enough: the verifier stays in the app.
    expect((await call("/v1/signin/token", { id: start.id, code, verifier: "w".repeat(50) })).status).toBe(400);
    const done = (await call("/v1/signin/token", { id: start.id, code, verifier })).data;
    expect(done.token).toMatch(/^cst_[0-9a-f]{64}$/);
    expect((await call("/v1/signin/token", { id: start.id, code, verifier })).status).toBe(400);
    // The code mode never hands its token by polling.
    expect((await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data.status).toBe("collected");
  });

  it("code: the person types the app's code, with a few tries for slips", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page } = setup(identity);
    const start = (await call("/v1/signin/start", { device: "mac-1", name: "Office PC", mode: "code" })).data;
    expect(start.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    signInAs(alice);
    expect((await page(`/signin/${start.id}`)).html).toContain("Type the code on your screen");
    expect((await page(`/signin/${start.id}/confirm`, { code: "ZZZZZZ" })).html).toContain("didn't match. Check it");
    expect((await page(`/signin/${start.id}/confirm`, { code: ` ${start.code.toLowerCase()} ` })).html).toContain("You're signed in");
    expect((await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data.token).toMatch(/^cst_/);
    const again = (await call("/v1/signin/start", { device: "mac-2", mode: "code" })).data;
    for (let i = 0; i < 2; i++) await page(`/signin/${again.id}/confirm`, { code: "ZZZZZZ" });
    expect((await page(`/signin/${again.id}/confirm`, { code: "ZZZZZZ" })).html).toContain("That code didn't match");
    expect((await page(`/signin/${again.id}/confirm`, { code: again.code })).html).toContain("This sign-in has ended");
  });

  it("a key belongs to its first account; others use it once the owner adds them", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, buy } = setup(identity);
    const aliceToken = await signedIn(call, page, signInAs, alice, "mac-1");
    const bobToken = await signedIn(call, page, signInAs, bob, "pc-2");
    const key = (await buy("someone-else@example.com")).key!;
    expect((await call("/v1/activate", { key, device: "mac-1", token: aliceToken })).status).toBe(200);
    // Bob has the key too (it was forwarded): not his to use.
    expect((await call("/v1/account/link", { token: bobToken, key })).status).toBe(409);
    expect((await call("/v1/activate", { key, device: "pc-2", token: bobToken })).data).toMatchObject({ owned: true });
    const license = (await call("/v1/account", { token: aliceToken })).data.licenses[0].license;
    expect((await call("/v1/license/members", { token: bobToken, license, add: "x@y.z" })).status).toBe(404);
    expect((await call("/v1/license/members", { token: aliceToken, license, add: "Bob@Grace.org" })).data).toMatchObject({ members: ["bob@grace.org"] });
    expect((await call("/v1/activate", { key, device: "pc-2", token: bobToken })).status).toBe(200);
    // Removed again: still listed on Bob's account, never used.
    await call("/v1/license/members", { token: aliceToken, license, remove: "bob@grace.org" });
    const bobs = (await call("/v1/account", { token: bobToken, device: "pc-2" })).data;
    expect(bobs.licenses[0]).toMatchObject({ owner: false, removed: true });
    expect(bobs.lease).toBeUndefined();
  });

  it("an owner's added person gets the license when they first sign in", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, buy } = setup(identity);
    const aliceToken = await signedIn(call, page, signInAs, alice, "mac-1");
    const bought = await buy("", { token: aliceToken });
    await call("/v1/license/members", { token: aliceToken, license: bought.license, add: bob.email });
    const bobToken = await signedIn(call, page, signInAs, bob, "pc-2");
    expect((await call("/v1/account", { token: bobToken, device: "pc-2", name: "PC" })).data).toMatchObject({ licenses: [{ license: bought.license, owner: false }], lease: expect.any(String) });
  });

  it("an added person is emailed an invitation naming who and which church; the owner sees invited, then joined", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, buy, mails } = setup(identity);
    const aliceToken = await signedIn(call, page, signInAs, alice, "mac-1");
    const { license } = await buy("", { token: aliceToken });
    const invites = () => mails.filter((mail) => mail.to === "bob@grace.org");

    const added = (await call("/v1/license/members", { token: aliceToken, license, add: "Bob@Grace.org", church: " Grace\nChapel " })).data;
    expect(added.members).toEqual(["bob@grace.org"]);
    expect(added.people).toEqual([{ email: "bob@grace.org", invitedAt: expect.any(Number) }]);
    expect(invites()).toHaveLength(1);
    expect(invites()[0]!.subject).toBe("Alice invited you to Grace Chapel on Church Studio");
    expect(invites()[0]!.text).toContain("Sign in with this email address: bob@grace.org");
    expect(invites()[0]!.text).toContain("/download/windows");

    // Adding the same person again sends nothing; Resend does.
    await call("/v1/license/members", { token: aliceToken, license, add: "bob@grace.org" });
    expect(invites()).toHaveLength(1);
    await call("/v1/license/members", { token: aliceToken, license, resend: "bob@grace.org" });
    expect(invites()).toHaveLength(2);
    // Only people already on the license can be sent one again.
    expect((await call("/v1/license/members", { token: aliceToken, license, resend: "eve@x.org" })).status).toBe(404);

    const bobToken = await signedIn(call, page, signInAs, bob, "pc-2");
    const bobs = (await call("/v1/account", { token: bobToken, device: "pc-2", name: "PC" })).data;
    expect(bobs.licenses[0]).toMatchObject({ owner: false, by: "Alice" });
    const alices = (await call("/v1/account", { token: aliceToken })).data;
    expect(alices.licenses[0].people).toEqual([{ email: "bob@grace.org", invitedAt: expect.any(Number), joinedAt: expect.any(Number) }]);

    const removed = (await call("/v1/license/members", { token: aliceToken, license, remove: "bob@grace.org" })).data;
    expect(removed).toEqual({ members: [], people: [] });
  });

  it("tells the owner, once a day, when someone they added cannot join because every computer is in use", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, buy, mails, advance } = setup(identity);
    const aliceToken = await signedIn(call, page, signInAs, alice, "mac-1");
    const { license } = await buy("", { token: aliceToken });
    await call("/v1/license/members", { token: aliceToken, license, add: bob.email });
    // Church covers three computers: all three in use.
    for (const device of ["mac-1", "pc-2", "pc-3"]) await call("/v1/account", { token: aliceToken, device, name: device });
    const bobToken = await signedIn(call, page, signInAs, bob, "bobs-laptop");
    const toAlice = () => mails.filter((mail) => mail.to === alice.email && /all \d computers/.test(mail.subject));
    expect((await call("/v1/account", { token: bobToken, device: "bobs-laptop", name: "Bob's laptop" })).data.activation).toMatchObject({ status: 409 });
    expect(toAlice()).toHaveLength(1);
    expect(toAlice()[0]!.subject).toBe("Bob could not join: all 3 computers are in use");
    expect(toAlice()[0]!.text).toContain("Bob's laptop");
    await call("/v1/account", { token: bobToken, device: "bobs-laptop", name: "Bob's laptop" });
    expect(toAlice()).toHaveLength(1);
    advance(86_400_000);
    await call("/v1/account", { token: bobToken, device: "bobs-laptop", name: "Bob's laptop" });
    expect(toAlice()).toHaveLength(2);
  });

  it("an invitation without a church name says the inviter's church, and one inbox gets only a few a day", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, buy, mails } = setup(identity);
    const aliceToken = await signedIn(call, page, signInAs, alice, "mac-1");
    const { license } = await buy("", { token: aliceToken });
    await call("/v1/license/members", { token: aliceToken, license, add: "carol@grace.org" });
    expect(mails.find((mail) => mail.to === "carol@grace.org")!.subject).toBe("Alice invited you to their church on Church Studio");
    let refused = 0;
    for (let i = 0; i < 6; i++) if ((await call("/v1/license/members", { token: aliceToken, license, resend: "carol@grace.org" })).status === 429) refused++;
    expect(refused).toBeGreaterThan(0);
    expect(mails.filter((mail) => mail.to === "carol@grace.org").length).toBeLessThanOrEqual(5);
  });

  it("the browser version signs in as whoever is signed in to the browser, with no code", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call } = setup(identity);
    expect((await call("/v1/signin/browser", { device: "web-1" })).data).toEqual({ signedIn: false });
    signInAs(alice);
    const done = (await call("/v1/signin/browser", { device: "web-1", name: "Edge" })).data;
    expect(done).toMatchObject({ token: expect.stringMatching(/^cst_/), account: { email: alice.email } });
    expect((await call("/v1/account", { token: done.token })).status).toBe(200);
  });

  it("with sign-in required, a new trial or key needs an account; renewals never do", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, buy, config } = setup(identity);
    const key = (await buy("a@b.co")).key!;
    expect((await call("/v1/activate", { key, device: "old-mac" })).status).toBe(200);
    config.requireAccount = true;
    expect((await call("/v1/trial", { device: "new-mac" })).data).toMatchObject({ signin: true });
    expect((await call("/v1/activate", { key, device: "new-mac" })).data).toMatchObject({ signin: true });
    expect((await call("/v1/lease", { key, device: "old-mac" })).status).toBe(200);
    const token = await signedIn(call, page, signInAs, alice, "new-mac");
    expect((await call("/v1/trial", { device: "new-mac", token })).status).toBe(200);
  });

  it("with sign-in required, apps too old to send a sign-in (before 0.3) still start trials and add keys", async () => {
    const { identity } = fakeIdentity();
    const { call, buy, config } = setup(identity);
    const key = (await buy("a@b.co")).key!;
    config.requireAccount = true;
    await call("/v1/hello", { device: "old-mac", version: "0.2.4", os: "macos", plan: "free" });
    await call("/v1/hello", { device: "new-mac", version: "0.6.3", os: "macos", plan: "free" });
    expect((await call("/v1/trial", { device: "old-mac" })).status).toBe(200);
    expect((await call("/v1/activate", { key, device: "old-mac" })).status).toBe(200);
    expect((await call("/v1/trial", { device: "new-mac" })).data).toMatchObject({ signin: true });
    expect((await call("/v1/activate", { key, device: "new-mac" })).data).toMatchObject({ signin: true });
    // A computer that never checked in is asked to sign in.
    expect((await call("/v1/trial", { device: "quiet-mac" })).data).toMatchObject({ signin: true });
  });

  it("lists where an account is signed in, signs out another computer, and lets unused tokens lapse", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, config } = setup(identity);
    const one = await signedIn(call, page, signInAs, alice, "mac-1");
    const two = await signedIn(call, page, signInAs, alice, "pc-2");
    const listed = (await call("/v1/account/devices", { token: one })).data.devices;
    expect(listed.map((entry: { name: string; you: boolean }) => [entry.name, entry.you])).toEqual([["mac-1", true], ["pc-2", false]]);
    await call("/v1/account/signout", { token: one, device: listed[1].id });
    expect((await call("/v1/account", { token: two })).status).toBe(401);
    expect((await call("/v1/account", { token: one })).status).toBe(200);
    const store = config.store as ReturnType<typeof memoryStore>;
    expect([...store.dump().entries()].find(([key]) => key.startsWith("atok:"))![1].ttl).toBe(180 * 86_400);
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

describe("trials and accounts", () => {
  async function signedIn(call: ReturnType<typeof setup>["call"], page: ReturnType<typeof setup>["page"], signInAs: (who: Person | null) => void, device: string) {
    const start = (await call("/v1/signin/start", { device })).data;
    signInAs(alice);
    await page(`/signin/${start.id}/confirm`, { number: String(start.number) });
    return (await call("/v1/signin/poll", { id: start.id, secret: start.secret })).data.token as string;
  }

  it("gives one trial per person: a second computer shares the days left, and none after it ends", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, advance } = setup(identity);
    const token = await signedIn(call, page, signInAs, "mac-1");
    const first = await call("/v1/trial", { device: "mac-1", token });
    advance(4 * 86_400_000);
    const second = await call("/v1/trial", { device: "pc-2", token });
    expect(second.status).toBe(200);
    expect(second.data.endsAt).toBe(first.data.endsAt);
    advance(11 * 86_400_000);
    expect(await call("/v1/trial", { device: "laptop-3", token })).toMatchObject({ status: 403, data: { used: true } });
  });

  it("counts a trial started before signing in as the account's", async () => {
    const { identity, signInAs } = fakeIdentity();
    const { call, page, advance } = setup(identity);
    const first = await call("/v1/trial", { device: "mac-1" });
    const token = await signedIn(call, page, signInAs, "mac-1");
    await call("/v1/account", { token, device: "mac-1" });
    advance(15 * 86_400_000);
    expect(first.status).toBe(200);
    expect((await call("/v1/trial", { device: "pc-2", token })).status).toBe(403);
  });
});
