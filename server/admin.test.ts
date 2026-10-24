import { describe, expect, it } from "vitest";
import { licenseKeyPair, signLicense } from "../src/lib/domain/license";
import { decide, parseAdminUsers, setupOf, type Admin } from "./admin";
import { handleApi, type ApiConfig } from "./api";
import { mockProvider } from "./billing";
import { getJson, memoryStore, putJson } from "./store";

const pair = licenseKeyPair();
const DAY = 86_400_000;
const TEAM = "heitech.cloudflareaccess.com";
const AUD = "aud-church-studio-admin";

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64json = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

/** A stand-in for Cloudflare Access: its signing key, its published certs, and tokens for anyone. */
async function fakeAccess() {
  const kid = `kid-${Math.random().toString(16).slice(2)}`;
  const keys = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid };
  const sign = async (claims: Record<string, unknown>, signer: CryptoKey = keys.privateKey) => {
    const unsigned = `${b64json({ alg: "RS256", kid, typ: "JWT" })}.${b64json(claims)}`;
    const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signer, new TextEncoder().encode(unsigned)));
    return `${unsigned}.${b64url(signature)}`;
  };
  return { jwk, sign, keys };
}

async function setup(users = "owner@heitech.test:owner,help@heitech.test:support,eyes@heitech.test:viewer") {
  let clock = Date.UTC(2026, 9, 21, 12);
  const access = await fakeAccess();
  const mails: Array<{ to: string; subject: string; text: string }> = [];
  const config: ApiConfig = {
    store: memoryStore(),
    signingKey: pair.secretKey,
    publicKey: pair.publicKey,
    provider: mockProvider,
    adminToken: "old-token",
    admin: { access: { team: TEAM, aud: AUD }, users: parseAdminUsers(users), alertEmail: "alerts@heitech.test" },
    leaseDays: 30,
    trialDays: 14,
    graceDays: 7,
    mail: async (to, subject, text) => void mails.push({ to, subject, text }),
    fetcher: (async (url: string) => (String(url) === `https://${TEAM}/cdn-cgi/access/certs` ? new Response(JSON.stringify({ keys: [access.jwk] })) : new Response("", { status: 404 }))) as typeof fetch,
    now: () => clock,
  };
  const tokenFor = (email: string, extra: Record<string, unknown> = {}) => access.sign({ aud: [AUD], iss: `https://${TEAM}`, email, exp: Math.floor(clock / 1000) + 3600, ...extra });
  const as = async (email: string | null, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const jwt: Record<string, string> = email ? { "cf-access-jwt-assertion": await tokenFor(email) } : {};
    const response = await handleApi(new Request(`https://admin.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...jwt, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), config);
    return { status: response.status, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  };
  /** A paid license, as checkout leaves it. */
  const license = async (id: string, email: string) => {
    const key = signLicense({ plan: "church", until: null, id: Uint8Array.from(id.match(/../g)!.map((pairOf) => parseInt(pairOf, 16))) }, pair.secretKey);
    await putJson(config.store, `license:${id}`, { sub: null, email, paidUntil: clock + 30 * DAY, test: false });
    await putJson(config.store, `email:${email}`, [{ id, key }]);
    return key;
  };
  return { config, as, mails, access, tokenFor, license, advance: (ms: number) => (clock += ms), now: () => clock };
}

describe("admin: seats and moves", () => {
  it("release-device blocks that computer until the license is moved back", async () => {
    const { as, license } = await setup();
    const key = await license("0a0b0c0d", "pastor@grace.org");
    expect((await as(null, "/v1/activate", { key, device: "one", name: "Old" })).status).toBe(200);
    expect((await as("help@heitech.test", "/admin/api/action", { action: "release-device", license: "0a0b0c0d", device: "one" })).status).toBe(200);
    expect(await as(null, "/v1/activate", { key, device: "one", name: "Old" })).toMatchObject({ status: 403, data: { moved: true } });
  });

  it("reset-seats clears the moved list and the move log, so everyone starts again", async () => {
    const { as, config, license } = await setup();
    const key = await license("0a0b0c0d", "pastor@grace.org");
    expect((await as(null, "/v1/activate", { key, device: "one", name: "Old" })).status).toBe(200);
    expect((await as(null, "/v1/release", { key, device: "one" })).status).toBe(200);
    expect((await as(null, "/v1/activate", { key, device: "two", name: "New" })).status).toBe(200);
    expect(((await getJson<unknown[]>(config.store, "moved:0a0b0c0d")) ?? []).length).toBe(1);
    expect(((await getJson<unknown[]>(config.store, "rel:0a0b0c0d")) ?? []).length).toBe(1);
    expect((await as("help@heitech.test", "/admin/api/action", { action: "reset-seats", license: "0a0b0c0d", reason: "new laptops" })).status).toBe(200);
    expect((await getJson<unknown[]>(config.store, "moved:0a0b0c0d")) ?? []).toEqual([]);
    expect((await getJson<unknown[]>(config.store, "rel:0a0b0c0d")) ?? []).toEqual([]);
    expect((await as(null, "/v1/activate", { key, device: "one", name: "Old" })).status).toBe(200);
  });
});

describe("admin: who gets in", () => {
  it("takes the email only from a valid Cloudflare Access token, and the role only from ADMIN_USERS", async () => {
    const { as, config, access, tokenFor, now } = await setup();
    expect((await as("owner@heitech.test", "/admin/api/me")).data).toMatchObject({ email: "owner@heitech.test", role: "owner", via: "access" });
    expect((await as(null, "/admin/api/me")).status).toBe(401);
    expect((await as("stranger@gmail.com", "/admin/api/me")).status).toBe(403);
    const call = async (jwt: string) => (await handleApi(new Request("https://admin.test/admin/api/me", { headers: { "cf-access-jwt-assertion": jwt } }), config)).status;
    // Another Access application, an expired token, a forged signature: all refused.
    expect(await call(await tokenFor("owner@heitech.test", { aud: ["someone-else"] }))).toBe(401);
    expect(await call(await tokenFor("owner@heitech.test", { exp: Math.floor(now() / 1000) - 10 }))).toBe(401);
    const forger = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    expect(await call(await access.sign({ aud: [AUD], iss: `https://${TEAM}`, email: "owner@heitech.test", exp: Math.floor(now() / 1000) + 600 }, forger.privateKey))).toBe(401);
    // With Access set up, the old shared token opens nothing.
    expect((await as(null, "/admin/api/me", undefined, { authorization: "Bearer old-token" })).status).toBe(401);
  });

  it("lets the old token only look while Access is not set up", async () => {
    const { as, config, license } = await setup();
    config.admin = { users: {} };
    await license("0a0b0c0d", "pastor@grace.org");
    expect((await as(null, "/admin/api/me", undefined, { authorization: "Bearer old-token" })).data).toMatchObject({ role: "viewer", via: "token" });
    const change = await as(null, "/admin/api/action", { action: "extend-license", license: "0a0b0c0d", days: 5 }, { authorization: "Bearer old-token" });
    expect(change.status).toBe(403);
    expect((await getJson<{ paidUntil: number }>(config.store, "license:0a0b0c0d"))!.paidUntil).toBe(Date.UTC(2026, 9, 21, 12) + 30 * DAY);
  });

  it("refuses calls from other sites carrying someone's Access cookie", async () => {
    const { as } = await setup();
    expect((await as("owner@heitech.test", "/admin/api/action", { action: "end-promo", code: "X" }, { origin: "https://evil.example" })).status).toBe(403);
  });

  it("serves the console page under /admin, where one Access rule covers everything", async () => {
    const { config } = await setup();
    const page = await handleApi(new Request("https://admin.test/admin"), config);
    expect(page.status).toBe(200);
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(await page.text()).toContain("/admin/api/me");
    expect((await handleApi(new Request("https://admin.test/v1/admin/stats"), config)).status).toBe(404);
  });
});

describe("admin: limits that hold even with stolen access", () => {
  it("lets support extend a little, refuses more, and sends an owner's bigger extension for approval", async () => {
    const { as, config, mails, license } = await setup();
    await license("0a0b0c0d", "pastor@grace.org");
    const before = (await getJson<{ paidUntil: number }>(config.store, "license:0a0b0c0d"))!.paidUntil;
    expect((await as("help@heitech.test", "/admin/api/action", { action: "extend-license", license: "0a0b0c0d", days: 14 })).status).toBe(200);
    expect((await getJson<{ paidUntil: number }>(config.store, "license:0a0b0c0d"))!.paidUntil).toBe(before + 14 * DAY);
    expect((await as("help@heitech.test", "/admin/api/action", { action: "extend-license", license: "0a0b0c0d", days: 20 })).status).toBe(403);
    expect((await as("eyes@heitech.test", "/admin/api/action", { action: "extend-license", license: "0a0b0c0d", days: 1 })).status).toBe(403);
    // An owner's 60 days waits; nothing changes until the emailed link is used.
    const asked = await as("owner@heitech.test", "/admin/api/action", { action: "extend-license", license: "0a0b0c0d", days: 40, reason: "outage" });
    expect(asked.status).toBe(202);
    expect((await getJson<{ paidUntil: number }>(config.store, "license:0a0b0c0d"))!.paidUntil).toBe(before + 14 * DAY);
    const mail = mails.find((item) => item.subject.includes("Approve?"))!;
    expect(mail.to).toBe("alerts@heitech.test");
    const [, id, token] = /\/admin\/approve\/([0-9a-f]{20})#([0-9a-f]+)/.exec(mail.text)!;
    expect((await as("owner@heitech.test", "/admin/api/approve", { id, token: "wrong" })).status).toBe(404);
    expect((await as("help@heitech.test", "/admin/api/approve", { id, token })).status).toBe(403);
    expect((await as("owner@heitech.test", "/admin/api/approve", { id, token })).status).toBe(200);
    expect((await getJson<{ paidUntil: number }>(config.store, "license:0a0b0c0d"))!.paidUntil).toBe(before + 54 * DAY);
    // A link works once.
    expect((await as("owner@heitech.test", "/admin/api/approve", { id, token })).status).toBe(409);
  });

  it("with two owners, nobody approves their own request", async () => {
    const { as, mails, license } = await setup("owner@heitech.test:owner,second@heitech.test:owner");
    await license("0a0b0c0d", "pastor@grace.org");
    await as("owner@heitech.test", "/admin/api/action", { action: "resume", license: "0a0b0c0d" });
    await as("owner@heitech.test", "/admin/api/action", { action: "suspend", license: "0a0b0c0d", reason: "chargeback" });
    expect((await as("owner@heitech.test", "/admin/api/action", { action: "resume", license: "0a0b0c0d" })).status).toBe(202);
    const [, id, token] = /\/admin\/approve\/([0-9a-f]{20})#([0-9a-f]+)/.exec(mails.filter((item) => item.subject.includes("Approve?")).at(-1)!.text)!;
    expect((await as("owner@heitech.test", "/admin/api/approve", { id, token })).status).toBe(403);
    expect((await as("second@heitech.test", "/admin/api/approve", { id, token })).status).toBe(200);
  });

  it("never lets anyone change their own license or computer, and says so by email", async () => {
    const { as, config, mails, license } = await setup();
    await license("0a0b0c0d", "owner@heitech.test");
    expect((await as("owner@heitech.test", "/admin/api/action", { action: "extend-license", license: "0a0b0c0d", days: 3 })).status).toBe(403);
    expect(mails.some((item) => item.subject.startsWith("[Church Studio admin] Refused"))).toBe(true);
    // Their own computer's trial (they signed in on it) is off limits too.
    await putJson(config.store, "acct:u1", { id: "u1", email: "help@heitech.test", name: "", licenses: [], createdAt: 0 }, { email: "help@heitech.test", createdAt: 0 });
    await putJson(config.store, "device:mine", { first: 0, last: 0, plan: "trial", version: "", os: "macos", account: "u1" }, { first: 0, last: 0, plan: "trial", version: "", os: "macos", account: "u1" });
    await putJson(config.store, "trial:mine", { device: "mine", startedAt: 0, endsAt: Date.now(), promo: null });
    expect((await as("help@heitech.test", "/admin/api/action", { action: "extend-trial", device: "mine", days: 3 })).status).toBe(403);
  });

  it("caps what a year of extensions may add to one license", async () => {
    const { as, license, advance } = await setup();
    await license("0a0b0c0d", "pastor@grace.org");
    for (let i = 0; i < 4; i++) {
      expect((await as("help@heitech.test", "/admin/api/action", { action: "extend-license", license: "0a0b0c0d", days: 14 })).status).toBe(200);
      advance(DAY);
    }
    // 56 days given; 14 more passes the yearly 60, so even support's small step is refused.
    expect((await as("help@heitech.test", "/admin/api/action", { action: "extend-license", license: "0a0b0c0d", days: 14 })).status).toBe(403);
    expect((await as("owner@heitech.test", "/admin/api/action", { action: "extend-license", license: "0a0b0c0d", days: 14 })).status).toBe(202);
  });

  it("requires uses and an end date on every promo code, and approval for generous ones", async () => {
    const { as, config } = await setup();
    expect((await as("owner@heitech.test", "/admin/api/action", { action: "create-promo", code: "FREE", percentOff: 20 })).status).toBe(400);
    expect((await as("owner@heitech.test", "/admin/api/action", { action: "create-promo", code: "SPRING", percentOff: 20, maxUses: 50, expiresAt: "2026-12-01" })).status).toBe(200);
    expect((await as("owner@heitech.test", "/admin/api/action", { action: "create-promo", code: "ALLFREE", percentOff: 100, maxUses: 50, expiresAt: "2026-12-01" })).status).toBe(202);
    expect(await config.store.get("promo:ALLFREE")).toBeNull();
    expect((await as("help@heitech.test", "/admin/api/action", { action: "create-promo", code: "MINE", percentOff: 10, maxUses: 5, expiresAt: "2026-12-01" })).status).toBe(403);
    // Ending a code keeps it, with its uses.
    expect((await as("owner@heitech.test", "/admin/api/action", { action: "end-promo", code: "SPRING" })).status).toBe(200);
    expect(await getJson(config.store, "promo:SPRING")).toMatchObject({ code: "SPRING", expiresAt: Date.UTC(2026, 9, 21, 12) });
  });

  it("logs every change and refusal where the API cannot erase it, and limits changes an hour", async () => {
    const { as, license, advance } = await setup();
    await license("0a0b0c0d", "pastor@grace.org");
    await as("help@heitech.test", "/admin/api/action", { action: "extend-license", license: "0a0b0c0d", days: 2 });
    advance(1000);
    await as("help@heitech.test", "/admin/api/action", { action: "suspend", license: "0a0b0c0d", reason: "x" });
    const log = (await as("eyes@heitech.test", "/admin/api/audit")).data.entries as Array<{ by: string; action: string; outcome: string }>;
    expect(log.map((entry) => [entry.action, entry.outcome])).toEqual([["suspend", "refused"], ["extend-license", "done"]]);
    for (let i = 0; i < 40; i++) await as("owner@heitech.test", "/admin/api/action", { action: "end-promo", code: "NONE" });
    expect((await as("owner@heitech.test", "/admin/api/action", { action: "end-promo", code: "NONE" })).status).toBe(429);
  });
});

describe("admin: who uses what", () => {
  it("labels each computer's setup and shows every setup a person uses", async () => {
    expect(setupOf({ os: "web-windows", browser: "Edge 129" })).toBe("Browser · Windows · Edge");
    expect(setupOf({ os: "macos" })).toBe("Mac app");
    const { as, config } = await setup();
    await putJson(config.store, "acct:u1", { id: "u1", email: "pastor@grace.org", name: "Pastor", licenses: [], createdAt: 0 }, { email: "pastor@grace.org", createdAt: 0 });
    await handleApi(new Request("https://admin.test/v1/hello", { method: "POST", body: JSON.stringify({ device: "web-1", version: "0.2.5", os: "web-windows", browser: "Edge 129", plan: "free" }) }), config);
    await handleApi(new Request("https://admin.test/v1/hello", { method: "POST", body: JSON.stringify({ device: "mac-1", version: "0.2.5", os: "macos", plan: "free" }) }), config);
    for (const device of ["web-1", "mac-1"]) {
      const meta = (await getJson<Record<string, unknown>>(config.store, `device:${device}`))!;
      await putJson(config.store, `device:${device}`, { ...meta, account: "u1" }, { ...meta, account: "u1" });
    }
    const account = (await as("eyes@heitech.test", "/admin/api/account?id=u1")).data as { setups: string[] };
    expect(account.setups.sort()).toEqual(["Browser · Windows · Edge", "Mac app"]);
    const details = (await as("eyes@heitech.test", "/admin/api/details")).data as { accounts: Array<{ email: string; setups: string[] }>; computers: Array<{ device: string; browser?: string; account: string }> };
    expect(details.accounts[0]!.setups).toHaveLength(2);
    expect(details.computers.find((item) => item.device === "web-1")).toMatchObject({ browser: "Edge 129", account: "pastor@grace.org" });
  });

  it("counts real churches only: not the team's computers, dev builds or the deploy check; browsers apart; days seen", async () => {
    const { as, config, advance } = await setup();
    const hello = (body: Record<string, unknown>) => handleApi(new Request("https://admin.test/v1/hello", { method: "POST", body: JSON.stringify({ version: "0.2.5", plan: "free", ...body }) }), config);
    await hello({ device: "church-mac", os: "macos" });
    await hello({ device: "church-mac", os: "macos" });
    await hello({ device: "web-a", os: "web-windows", browser: "Edge 129" });
    await hello({ device: "deploy-check", os: "deploy" });
    await hello({ device: "my-dev", os: "macos", dev: true });
    // The owner signed in on their own Mac: the team's, so left out.
    await putJson(config.store, "acct:o1", { id: "o1", email: "owner@heitech.test", name: "", licenses: [], createdAt: 0 }, { email: "owner@heitech.test", createdAt: 0 });
    await hello({ device: "owner-mac", os: "macos" });
    const meta = (await getJson<Record<string, unknown>>(config.store, "device:owner-mac"))!;
    await putJson(config.store, "device:owner-mac", { ...meta, account: "o1" }, { ...meta, account: "o1" });
    advance(DAY);
    await hello({ device: "church-mac", os: "macos" });
    const stats = (await as("eyes@heitech.test", "/admin/api/stats")).data as { computers: { total: number; returning: number }; web: { total: number }; team: number };
    expect(await config.store.get("device:deploy-check")).toBeNull();
    expect(await config.store.get("device:my-dev")).toBeNull();
    expect(stats.computers).toMatchObject({ total: 1, returning: 1 });
    expect(stats.web.total).toBe(1);
    expect(stats.team).toBe(1);
    // Support marks a computer as the team's; it leaves the numbers, and can be counted again.
    expect((await as("help@heitech.test", "/admin/api/action", { action: "mark-team", device: "church-mac", team: true })).status).toBe(200);
    expect(((await as("eyes@heitech.test", "/admin/api/stats")).data as { computers: { total: number } }).computers.total).toBe(0);
    await as("help@heitech.test", "/admin/api/action", { action: "mark-team", device: "church-mac", team: false });
    expect(((await as("eyes@heitech.test", "/admin/api/stats")).data as { computers: { total: number } }).computers.total).toBe(1);
  });

  it("decides by role, never trusting the page", () => {
    const support: Admin = { email: "s@x", role: "support", via: "access" };
    const now = Date.now();
    expect(decide(support, "suspend", { reason: "x" }, { added: 0, approved: false, now })).toMatchObject({ ok: false, kind: "role" });
    expect(decide(support, "extend-trial", { days: 7 }, { added: 0, approved: false, now })).toEqual({ ok: true, approval: false });
    expect(decide({ ...support, role: "owner" }, "extend-trial", { days: 61 }, { added: 0, approved: true, now })).toMatchObject({ ok: false, kind: "limit" });
  });
});
