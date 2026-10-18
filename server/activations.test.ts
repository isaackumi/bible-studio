import { describe, expect, it } from "vitest";
import { licenseKeyPair, signLicense } from "../src/lib/domain/license";
import { PLANS } from "../src/lib/domain/plans";
import { handleActivation, SEATS, type Store } from "./activations";

const pair = licenseKeyPair();
const NOW = Date.parse("2026-10-18T12:00:00Z");
const church = signLicense({ plan: "church", until: null, holder: "Grace Chapel" }, pair.secretKey);
const premium = signLicense({ plan: "premium", until: null, holder: "Hope" }, pair.secretKey);

function memory(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: async (key) => data.get(key) ?? null, put: async (key, value) => void data.set(key, value) };
}

const call = (store: Store, path: string, body: unknown, now = NOW) =>
  handleActivation(new Request(`https://keys.example.org${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), store, now, pair.publicKey);

describe("device activations", () => {
  it("lets a Church key run on three computers, and says when a fourth asks", async () => {
    const store = memory();
    for (const device of ["a", "b", "c"]) expect((await call(store, "/v1/activate", { key: church, device, name: `Mac ${device}` })).status).toBe(200);
    const full = await call(store, "/v1/activate", { key: church, device: "d", name: "Mac d" });
    expect(full.status).toBe(409);
    const body = (await full.json()) as { full: boolean; seats: number; devices: Array<{ device: string }> };
    expect(body.full).toBe(true);
    expect(body.devices.map((entry) => entry.device)).toEqual(["a", "b", "c"]);
  });

  it("frees a place when a computer is released, or not seen for 60 days", async () => {
    const store = memory();
    await call(store, "/v1/activate", { key: premium, device: "old", name: "Old Mac" });
    expect((await call(store, "/v1/activate", { key: premium, device: "new", name: "New Mac" })).status).toBe(409);
    await call(store, "/v1/release", { key: premium, device: "old" });
    expect((await call(store, "/v1/activate", { key: premium, device: "new", name: "New Mac" })).status).toBe(200);
    const later = NOW + 61 * 86_400_000;
    expect((await call(store, "/v1/activate", { key: premium, device: "third", name: "Third" }, later)).status).toBe(200);
  });

  it("refuses keys that are not signed, and lets the same computer check in again", async () => {
    const store = memory();
    expect((await call(store, "/v1/activate", { key: "CS1-NOT-A-KEY", device: "a" })).status).toBe(401);
    await call(store, "/v1/activate", { key: premium, device: "a", name: "Mac" });
    const again = await call(store, "/v1/activate", { key: premium, device: "a", name: "Sanctuary Mac" });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { devices: Array<{ name: string }> }).devices[0]!.name).toBe("Sanctuary Mac");
  });

  it("matches the computers each plan promises", () => {
    for (const plan of ["premium", "church"] as const) expect(SEATS[plan]).toBe(PLANS.find((entry) => entry.id === plan)!.computers);
  });
});
