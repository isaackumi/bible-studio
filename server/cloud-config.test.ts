import { describe, expect, it } from "vitest";
import { CLOUD_DEFAULTS, cloudLimits, licenceLimitBytes, memoryR2, setCloudLimits } from "./cloud-config";
import { memoryStore, putJson } from "./store";

describe("cloud space limits", () => {
  it("defaults when nothing is set", async () => {
    expect(await cloudLimits(memoryStore())).toEqual({ premiumGb: 5, churchGb: 15, maxFileGb: 2, totalCapGb: 500 });
    expect(CLOUD_DEFAULTS.premiumGb).toBe(5);
  });

  it("merges a saved patch field by field and ignores junk", async () => {
    const store = memoryStore();
    await putJson(store, "cfg:cloud", { premiumGb: "x", churchGb: 20, totalCapGb: -4 });
    expect(await cloudLimits(store)).toEqual({ premiumGb: 5, churchGb: 20, maxFileGb: 2, totalCapGb: 500 });
    expect(await setCloudLimits(store, { premiumGb: 8, maxFileGb: 999999 })).toEqual({ premiumGb: 8, churchGb: 20, maxFileGb: 2, totalCapGb: 500 });
    expect(await cloudLimits(store)).toMatchObject({ premiumGb: 8 });
  });

  it("a licence override wins over the plan's limit", async () => {
    const store = memoryStore();
    expect(await licenceLimitBytes(store, "abc", "premium")).toBe(5e9);
    expect(await licenceLimitBytes(store, "abc", "church")).toBe(15e9);
    await putJson(store, "cloudcap:abc", { gb: 40 });
    expect(await licenceLimitBytes(store, "abc", "premium")).toBe(40e9);
  });

  it("memoryR2 round-trips a body and reports its size", async () => {
    const r2 = memoryR2();
    await r2.put("lib/x/h1", "hello", { httpMetadata: { contentType: "text/plain" } });
    expect(await r2.head("lib/x/h1")).toEqual({ size: 5 });
    const got = await r2.get("lib/x/h1");
    expect(got?.size).toBe(5);
    expect(await new Response(got!.body).text()).toBe("hello");
    await r2.delete("lib/x/h1");
    expect(await r2.get("lib/x/h1")).toBeNull();
  });
});
