import { describe, expect, it } from "vitest";
import { discounted, serverCall } from "./billing";

const answer = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe("talking to the license server", () => {
  it("returns data, refusals and offline without throwing", async () => {
    expect(await serverCall("/v1/hello", {}, "https://x", answer(200, { now: 5 }) as typeof fetch)).toEqual({ ok: true, status: 200, data: { now: 5 } });
    expect(await serverCall("/v1/trial", {}, "https://x", answer(403, { used: true, error: "Used." }) as typeof fetch)).toMatchObject({ ok: false, status: 403, offline: false, error: "Used." });
    // A server fault is treated like no network: nothing is taken away for it.
    expect(await serverCall("/v1/hello", {}, "https://x", answer(502, {}) as typeof fetch)).toMatchObject({ ok: false, offline: true });
    const down = (async () => {
      throw new TypeError("network");
    }) as typeof fetch;
    expect(await serverCall("/v1/hello", {}, "https://x", down)).toMatchObject({ ok: false, status: 0, offline: true });
  });

  it("works out a promo price the same way the server charges it", () => {
    expect(discounted(12000, { ok: true, code: "A", label: "", percentOff: 25, amountOff: 0, trialDays: 0 })).toBe(9000);
    expect(discounted(1200, { ok: true, code: "A", label: "", percentOff: 0, amountOff: 2000, trialDays: 0 })).toBe(0);
    expect(discounted(1200, { ok: false, reason: "unknown" })).toBe(1200);
  });
});
