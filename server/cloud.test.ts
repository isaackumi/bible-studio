import { describe, expect, it } from "vitest";
import { licenseKeyPair, signLicense } from "../src/lib/domain/license";
import { type ApiConfig } from "./api";
import { mockProvider } from "./billing";
import { handleCloud, runCloudCron } from "./cloud";
import { memoryR2 } from "./cloud-config";
import { memoryLibraries } from "./library";
import { memoryStore, putJson } from "./store";

const pair = licenseKeyPair();
const DAY = 86_400_000;
const HASH = "a".repeat(64);
const HASH2 = "b".repeat(64);

async function sha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setup() {
  let clock = Date.UTC(2026, 9, 24, 12);
  const mails: Array<{ to: string; subject: string; text: string }> = [];
  const libraries = memoryLibraries(() => clock);
  const config: ApiConfig = {
    store: memoryStore(),
    cloud: memoryR2(),
    libraries,
    signingKey: pair.secretKey,
    publicKey: pair.publicKey,
    provider: mockProvider,
    admin: { users: {}, alertEmail: "alerts@heitech.test" },
    leaseDays: 14,
    trialDays: 14,
    graceDays: 7,
    mail: async (to, subject, text) => void mails.push({ to, subject, text }),
    now: () => clock,
  };
  configs.set(libraries, config);
  const call = async (path: string, body: unknown, method = "POST") => {
    const response = (await handleCloud(new Request(`https://keys.test${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), config))!;
    return { status: response.status, data: ((await response.json().catch(() => ({}))) ?? {}) as Record<string, any> };
  };
  const upload = async (hash: string, token: string, device: string, bytes: string, length = bytes.length) => {
    const response = (await handleCloud(new Request(`https://keys.test/v1/cloud/media/${hash}`, { method: "PUT", headers: { "content-type": "image/png", "content-length": String(length), authorization: `Bearer ${token}`, "x-device": device }, body: bytes }), config))!;
    return { status: response.status, data: ((await response.json().catch(() => ({}))) ?? {}) as Record<string, any> };
  };
  const download = async (hash: string, token: string, device: string) => handleCloud(new Request(`https://keys.test/v1/cloud/media/${hash}`, { headers: { authorization: `Bearer ${token}`, "x-device": device } }), config);
  /** A signed-in person on a licence, with computers on its seats. */
  const person = async (id: string, email: string, licence: { id: string; plan: "premium" | "church"; until?: string | null }, devices: string[], role: "owner" | "member" | "removed" = "owner") => {
    const key = signLicense({ plan: licence.plan, until: licence.until === undefined ? "2027-06-01" : licence.until, id: Uint8Array.from(licence.id.match(/../g)!.map((pairOf) => parseInt(pairOf, 16))) }, pair.secretKey);
    await putJson(config.store, `acct:${id}`, { id, email, name: id, licenses: [{ id: licence.id, key }], createdAt: clock });
    const token = `cst_${(await sha256(`token-${id}`)).slice(0, 64)}`;
    await putJson(config.store, `atok:${await sha256(token)}`, { user: id, device: devices[0] ?? "", name: id, createdAt: clock });
    const owner = (await config.store.get(`owner:${licence.id}`)) ? JSON.parse((await config.store.get(`owner:${licence.id}`))!) : { owner: role === "owner" ? id : "someone-else", members: [], at: clock };
    if (role === "member") owner.members = [...owner.members, email];
    await putJson(config.store, `owner:${licence.id}`, owner);
    const seats = JSON.parse((await config.store.get(`act:${licence.id}`)) ?? "[]") as Array<{ device: string; name: string; seenAt: string }>;
    await putJson(config.store, `act:${licence.id}`, [...seats, ...devices.map((device) => ({ device, name: `PC ${device}`, seenAt: new Date(clock).toISOString() }))]);
    return { token, key };
  };
  return { config, call, upload, download, person, mails, libraries, advance: (ms: number) => (clock += ms), now: () => clock };
}

/** The test's config is the one its libraries were made for (one per setup()). */
const configs = new WeakMap<object, ApiConfig>();
const config_of = (libraries: object) => configs.get(libraries)!;

describe("cloud space", () => {
  it("pushes and pulls between two computers of one licence", async () => {
    const { call, person, now } = setup();
    const { token } = await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "church" }, ["media-pc", "office-pc"]);
    const pushed = await call("/v1/cloud/push", { token, device: "media-pc", name: "Media PC", changes: [{ col: "song", id: "s1", at: now(), doc: { id: "s1", title: "Amazing Grace" } }] });
    expect(pushed).toMatchObject({ status: 200, data: { seq: 1, applied: 1 } });
    const pulled = await call("/v1/cloud/pull", { token, device: "office-pc", name: "Office", since: 0 });
    expect(pulled.data.changes).toMatchObject([{ col: "song", id: "s1", doc: { title: "Amazing Grace" } }]);
    const status = await call("/v1/cloud/status", { token, device: "office-pc" });
    expect(status.data).toMatchObject({ plan: "church", limitBytes: 15e9, usedBytes: 0, over: false, readOnly: false, syncVideos: true });
    expect(status.data.devices.map((entry: { name: string }) => entry.name).sort()).toEqual(["Media PC", "Office"]);
  });

  it("refuses a computer without a seat, and a signed-out call", async () => {
    const { call, person } = setup();
    const { token } = await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "premium" }, ["laptop"]);
    expect(await call("/v1/cloud/push", { token, device: "ghost", changes: [] })).toMatchObject({ status: 403, data: { noSeat: true } });
    expect(await call("/v1/cloud/pull", { token: "cst_nope", device: "laptop", since: 0 })).toMatchObject({ status: 401, data: { signedOut: true } });
    expect((await call("/v1/cloud/pull", { token, device: "laptop", since: 0 })).status).toBe(200);
  });

  it("refuses a member the owner removed, and an account with no plan", async () => {
    const { call, person } = setup();
    await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "church" }, ["media-pc"]);
    const kofi = await person("kofi", "kofi@grace.org", { id: "0a0b0c0d", plan: "church" }, ["kofi-pc"], "removed");
    expect(await call("/v1/cloud/pull", { token: kofi.token, device: "kofi-pc", since: 0 })).toMatchObject({ status: 403, data: { removed: true } });
    const yaw = await person("yaw", "yaw@grace.org", { id: "0a0b0c0d", plan: "church" }, ["yaw-pc"], "member");
    expect((await call("/v1/cloud/pull", { token: yaw.token, device: "yaw-pc", since: 0 })).status).toBe(200);
    const { config } = setup();
    await putJson(config.store, "acct:free", { id: "free", email: "f@x.org", name: "f", licenses: [], createdAt: 0 });
    const token = `cst_${"f".repeat(64)}`;
    await putJson(config.store, `atok:${await sha256(token)}`, { user: "free", device: "pc", name: "f", createdAt: 0 });
    const response = (await handleCloud(new Request("https://keys.test/v1/cloud/pull", { method: "POST", body: JSON.stringify({ token, device: "pc", since: 0 }) }), config))!;
    expect(response.status).toBe(402);
  });

  it("uploads only after a claim, serves the file back, and counts it once", async () => {
    const { call, upload, download, person, config } = setup();
    const { token } = await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "premium" }, ["laptop", "other"]);
    expect((await upload(HASH, token, "laptop", "picture")).status).toBe(409);
    const claim = await call("/v1/cloud/media/claim", { token, device: "laptop", hash: HASH, bytes: 7, name: "welcome.png", kind: "image", mediaId: "m1" });
    expect(claim.data).toMatchObject({ upload: true, stored: false, limitBytes: 5e9 });
    expect(await call("/v1/cloud/media/claim", { token, device: "laptop", hash: "zz", bytes: 7, name: "x", kind: "image", mediaId: "m2" })).toMatchObject({ status: 400 });
    expect(await upload(HASH, token, "laptop", "picture")).toMatchObject({ status: 200, data: { usedBytes: 7 } });
    const got = (await download(HASH, token, "other"))!;
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(await got.text()).toBe("picture");
    // The other computer claims the same file: already there, nothing to send, counted once.
    expect((await call("/v1/cloud/media/claim", { token, device: "other", hash: HASH, bytes: 7, name: "welcome.png", kind: "image", mediaId: "m1" })).data).toMatchObject({ upload: false, stored: true, usedBytes: 7 });
    expect((await call("/v1/cloud/status", { token, device: "other" })).data.usedBytes).toBe(7);
    expect(JSON.parse((await config.store.get("cloudused:0a0b0c0d"))!)).toMatchObject({ usedBytes: 7, plan: "premium" });
    const list = await call("/v1/cloud/media/list", { token, device: "other" });
    expect(list.data.items).toMatchObject([{ hash: HASH, bytes: 7, name: "welcome.png" }]);
    expect(await call("/v1/cloud/media/remove", { token, device: "other", hash: HASH, everywhere: false })).toMatchObject({ status: 200, data: { usedBytes: 0 } });
    expect((await download(HASH, token, "other"))!.status).toBe(404);
  });

  it("pauses every church at the total cap and emails once per crossing", async () => {
    const { call, upload, person, mails, config } = setup();
    await putJson(config.store, "cfg:cloud", { totalCapGb: 0.00000001 });
    const a = await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "church" }, ["a-pc"]);
    const b = await person("ben", "ben@hope.org", { id: "1a1b1c1d", plan: "premium" }, ["b-pc"]);
    const up = async (token: string, device: string, hash: string, bytes: string) => {
      const claim = await call("/v1/cloud/media/claim", { token, device, hash, bytes: bytes.length, name: "f", kind: "image", mediaId: hash.slice(0, 4) });
      if (!claim.data.upload) return claim.data;
      await upload(hash, token, device, bytes);
      return claim.data;
    };
    expect(await up(a.token, "a-pc", HASH, "x".repeat(6))).toMatchObject({ upload: true });
    expect(mails).toHaveLength(0);
    expect(await up(b.token, "b-pc", HASH2, "y".repeat(3))).toMatchObject({ upload: true });
    expect(mails.map((mail) => mail.subject)).toEqual(["Cloud space is 80% full"]);
    expect(await up(a.token, "a-pc", "c".repeat(64), "z".repeat(2))).toMatchObject({ upload: true });
    expect(mails.map((mail) => mail.subject)).toEqual(["Cloud space is 80% full", "Cloud space is full"]);
    expect(await up(b.token, "b-pc", "d".repeat(64), "w")).toMatchObject({ upload: false, paused: true });
    // Records still sync when media is paused.
    expect((await call("/v1/cloud/push", { token: b.token, device: "b-pc", changes: [{ col: "song", id: "s", at: 1, doc: {} }] })).status).toBe(200);
  });

  it("lowering a limit deletes nothing: the church sees it is over, and new files wait", async () => {
    const { call, upload, person, config } = setup();
    const { token } = await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "premium" }, ["laptop"]);
    await call("/v1/cloud/media/claim", { token, device: "laptop", hash: HASH, bytes: 9, name: "f.png", kind: "image", mediaId: "m1" });
    await upload(HASH, token, "laptop", "123456789");
    await putJson(config.store, "cloudcap:0a0b0c0d", { gb: 0.000000005 });
    const status = await call("/v1/cloud/status", { token, device: "laptop" });
    expect(status.data).toMatchObject({ usedBytes: 9, limitBytes: 5, over: true });
    expect((await call("/v1/cloud/media/claim", { token, device: "laptop", hash: HASH2, bytes: 1, name: "g.png", kind: "image", mediaId: "m2" })).data).toMatchObject({ upload: false, full: true, usedBytes: 9 });
    expect((await call("/v1/cloud/media/list", { token, device: "laptop" })).data.items).toHaveLength(1);
  });

  it("emails the owner when a plan ends, at day 60 and at day 85, once each, then lets the copy go", async () => {
    const { call, person, mails, advance, libraries, now } = setup();
    const { token } = await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "premium", until: "2026-10-23" }, ["laptop"]);
    expect((await call("/v1/cloud/status", { token, device: "laptop" })).data.readOnly).toBe(true);
    expect((await call("/v1/cloud/status", { token, device: "laptop" })).data.readOnly).toBe(true);
    expect(mails.map((mail) => [mail.to, mail.subject])).toEqual([["ama@grace.org", "Your cloud copy stays for 90 days"]]);
    await runCloudCron(config_of(libraries));
    expect(mails).toHaveLength(1);
    advance(60 * DAY);
    await runCloudCron(config_of(libraries));
    await runCloudCron(config_of(libraries));
    expect(mails.map((mail) => mail.subject)).toEqual(["Your cloud copy stays for 90 days", "Your cloud copy goes in 30 days"]);
    advance(25 * DAY);
    await runCloudCron(config_of(libraries));
    expect(mails.map((mail) => mail.subject).at(-1)).toBe("Your cloud copy goes in 5 days");
    advance(6 * DAY);
    await libraries.core("0a0b0c0d").ageOut(now());
    await runCloudCron(config_of(libraries));
    expect(mails).toHaveLength(3);
    // The seat itself went stale over those 91 days; back on it, the copy is gone and the library starts empty.
    await putJson(config_of(libraries).store, "act:0a0b0c0d", [{ device: "laptop", name: "PC laptop", seenAt: new Date(now()).toISOString() }]);
    expect((await call("/v1/cloud/pull", { token, device: "laptop", since: 0 })).data).toMatchObject({ seq: 0, changes: [] });
  });

  it("an upload must be the size it claimed, and the token never travels in the address", async () => {
    const { call, upload, person, config } = setup();
    const { token } = await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "premium" }, ["laptop"]);
    await call("/v1/cloud/media/claim", { token, device: "laptop", hash: HASH, bytes: 3, name: "f.png", kind: "image", mediaId: "m1" });
    expect((await upload(HASH, token, "laptop", "much more than three")).status).toBe(400);
    expect((await upload(HASH, token, "laptop", "abc")).status).toBe(200);
    const byQuery = (await handleCloud(new Request(`https://keys.test/v1/cloud/media/${HASH}?token=${token}&device=laptop`), config))!;
    expect(byQuery.status).toBe(401);
  });

  it("prefers a plan still running over one that ended", async () => {
    const { call, person } = setup();
    await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "church", until: "2026-10-01" }, ["laptop"]);
    const { token } = await person("ama", "ama@grace.org", { id: "1a1b1c1d", plan: "premium" }, ["laptop"]);
    const status = await call("/v1/cloud/status", { token, device: "laptop" });
    expect(status.data).toMatchObject({ plan: "premium", licence: "1a1b1c1d", readOnly: false });
  });

  it("renewing lifts the lapse: writable again, the wipe is off", async () => {
    const { call, person, config, now, mails } = setup();
    const { token } = await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "premium", until: "2026-10-01" }, ["laptop"]);
    expect((await call("/v1/cloud/status", { token, device: "laptop" })).data.readOnly).toBe(true);
    expect(mails).toHaveLength(1);
    // Renewed: the account's key now runs on.
    await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "premium", until: "2027-10-01" }, []);
    const status = await call("/v1/cloud/status", { token, device: "laptop" });
    expect(status.data).toMatchObject({ readOnly: false, wipeAt: null });
    expect((await call("/v1/cloud/push", { token, device: "laptop", changes: [{ col: "song", id: "s1", at: now(), doc: {} }] })).status).toBe(200);
    expect(await config.store.get("cloud:lapse:0a0b0c0d")).toBeNull();
  });

  it("the wipe removes the files too, and the lapse is not announced again", async () => {
    const { call, upload, person, config, mails, advance, libraries, now } = setup();
    const { token } = await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "premium" }, ["laptop"]);
    await call("/v1/cloud/media/claim", { token, device: "laptop", hash: HASH, bytes: 3, name: "f.png", kind: "image", mediaId: "m1" });
    await upload(HASH, token, "laptop", "abc");
    expect((await config.cloud!.list({ prefix: "lib/0a0b0c0d/" })).objects).toHaveLength(1);
    await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "premium", until: "2026-10-01" }, []);
    expect((await call("/v1/cloud/status", { token, device: "laptop" })).data.readOnly).toBe(true);
    advance(91 * DAY);
    await libraries.core("0a0b0c0d").ageOut(now());
    await runCloudCron(config);
    expect((await config.cloud!.list({ prefix: "lib/0a0b0c0d/" })).objects).toHaveLength(0);
    await putJson(config.store, "act:0a0b0c0d", [{ device: "laptop", name: "PC", seenAt: new Date(now()).toISOString() }]);
    const sent = mails.length;
    await call("/v1/cloud/status", { token, device: "laptop" });
    await runCloudCron(config);
    expect(mails).toHaveLength(sent);
  });

  it("a lapsed licence is read-only, and still readable", async () => {
    const { call, person, now } = setup();
    const { token } = await person("ama", "ama@grace.org", { id: "0a0b0c0d", plan: "premium", until: "2026-10-01" }, ["laptop"]);
    expect(await call("/v1/cloud/push", { token, device: "laptop", changes: [{ col: "song", id: "s1", at: now(), doc: {} }] })).toMatchObject({ status: 403, data: { readOnly: true } });
    expect(await call("/v1/cloud/media/claim", { token, device: "laptop", hash: HASH, bytes: 1, name: "f", kind: "image", mediaId: "m" })).toMatchObject({ status: 403, data: { readOnly: true } });
    expect((await call("/v1/cloud/bin/empty", { token, device: "laptop" })).status).toBe(403);
    expect((await call("/v1/cloud/media/remove", { token, device: "laptop", hash: HASH, everywhere: true })).status).toBe(403);
    expect((await call("/v1/cloud/settings", { token, device: "laptop", syncVideos: false })).status).toBe(403);
    expect(await call("/v1/cloud/pull", { token, device: "laptop", since: 0 })).toMatchObject({ status: 200 });
    const status = await call("/v1/cloud/status", { token, device: "laptop" });
    expect(status.data.readOnly).toBe(true);
    // The key ends at the close of its last day; the cloud copy goes 90 days after that.
    expect(status.data.wipeAt).toBe(status.data.endsAt + 90 * DAY);
    expect(status.data.endsAt).toBeLessThan(now());
  });
});
