import { describe, expect, it } from "vitest";
import { licenseKeyPair } from "../src/lib/domain/license";
import { handleApi, type ApiConfig } from "./api";
import { mockProvider } from "./billing";
import { memoryStore } from "./store";

const pair = licenseKeyPair();

function setup() {
  let clock = Date.UTC(2026, 9, 25, 18);
  const config: ApiConfig = { store: memoryStore(), signingKey: pair.secretKey, publicKey: pair.publicKey, provider: mockProvider, leaseDays: 30, trialDays: 14, graceDays: 7, now: () => clock };
  const request = (path: string, init: RequestInit = {}) => handleApi(new Request(`https://church-studio.test${path}`, init), config);
  const call = async (body: unknown) => {
    const response = await request("/v1/tv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, data: (await response.json()) as Record<string, string> };
  };
  return { request, call, advance: (ms: number) => (clock += ms) };
}

describe("a TV's own address that never changes", () => {
  it("sends the TV to wherever the church computer is on the Wi-Fi today", async () => {
    const { request, call } = setup();
    const made = await call({ url: "http://192.168.1.20:17891/?lan=1" });
    expect(made.status).toBe(200);
    expect(made.data.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const first = await request(`/tv/${made.data.code}`, { redirect: "manual" });
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe(`http://192.168.1.20:17891/?lan=1&via=${made.data.code}`);

    // Tomorrow the router gives the computer another address: the same link follows it.
    expect((await call({ code: made.data.code, secret: made.data.secret, url: "http://192.168.1.37:17891/?lan=1" })).status).toBe(200);
    expect((await request(`/tv/${made.data.code.toLowerCase()}`, { redirect: "manual" })).headers.get("location")).toBe(`http://192.168.1.37:17891/?lan=1&via=${made.data.code}`);
    // One of the church's screens: the TV lands on that screen's page.
    expect((await request(`/tv/${made.data.code}?screen=abcd1234`, { redirect: "manual" })).headers.get("location")).toBe(`http://192.168.1.37:17891/?lan=1&screen=abcd1234&via=${made.data.code}`);
  });

  it("only the computer that made the link can move it, and only to an address on a local network", async () => {
    const { call } = setup();
    const made = await call({ url: "http://10.0.0.5:17891/?lan=1" });
    expect((await call({ code: made.data.code, secret: "wrong", url: "http://10.0.0.6:17891/?lan=1" })).status).toBe(403);
    for (const url of ["https://evil.example/", "http://8.8.8.8:17891/?lan=1", "http://192.168.1.2:17891/elsewhere", "javascript:alert(1)"]) {
      expect((await call({ url })).status).toBe(400);
    }
    expect((await call({ url: "http://172.20.1.9:17891/?lan=1&screen=abcd1234" })).status).toBe(200);
  });

  it("says plainly when the church computer is not showing on Wi-Fi yet", async () => {
    const { request } = setup();
    const waiting = await request("/tv/ABCDEF");
    expect(waiting.status).toBe(200);
    expect(await waiting.text()).toContain("Waiting for the church computer");
  });
});
