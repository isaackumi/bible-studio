import { describe, expect, it } from "vitest";
import { askServer, deviceId, dueForCheck, withinGrace } from "./activation";

const DAY = 86_400_000;

describe("activations on this computer", () => {
  it("keeps one id per computer", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
    const first = deviceId(storage);
    expect(deviceId(storage)).toBe(first);
  });

  it("keeps the plan offline for 30 days and checks in weekly", () => {
    const now = Date.parse("2026-10-18T12:00:00Z");
    expect(withinGrace(new Date(now - 10 * DAY).toISOString(), now)).toBe(true);
    expect(withinGrace(new Date(now - 31 * DAY).toISOString(), now)).toBe(false);
    expect(withinGrace(null, now)).toBe(false);
    expect(dueForCheck(new Date(now - 2 * DAY).toISOString(), now)).toBe(false);
    expect(dueForCheck(new Date(now - 8 * DAY).toISOString(), now)).toBe(true);
  });

  it("reads the server's answers, and treats no network as offline", async () => {
    const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect((await askServer("activate", { key: "k", device: "d" }, "https://keys.example", answer(200, { ok: true, seats: 3, devices: [] }))).status).toBe("ok");
    expect((await askServer("activate", { key: "k", device: "d" }, "https://keys.example", answer(409, { full: true, seats: 1, devices: [{ device: "x", name: "Other", seenAt: "" }] }))).status).toBe("full");
    expect((await askServer("activate", { key: "k" }, "https://keys.example", answer(401, { error: "That license key is not valid." }))).message).toMatch(/not valid/);
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect((await askServer("activate", { key: "k" }, "https://keys.example", down)).status).toBe("offline");
    expect((await askServer("activate", { key: "k" }, null)).status).toBe("off");
  });
});
