import { describe, expect, it } from "vitest";
import { licenseKeyPair } from "./license";
import { readLease, signLease, standing } from "./lease";

const pair = licenseKeyPair();
const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 19);
const base = { kind: "license" as const, plan: "premium" as const, device: "dev-1", license: "abcd1234", holder: "Grace Chapel", issuedAt: now, renewBy: now + 30 * DAY, endsAt: now + 365 * DAY };

describe("leases", () => {
  it("round-trips and refuses anything not signed by the server", () => {
    const token = signLease(base, pair.secretKey);
    expect(readLease(token, pair.publicKey)).toEqual({ v: 1, ...base });
    // Editing the payload breaks the signature.
    const [prefix, body, signature] = token.split(".");
    const edited = JSON.parse(atob(body!.replace(/-/g, "+").replace(/_/g, "/")));
    edited.plan = "church";
    const forged = `${prefix}.${btoa(JSON.stringify(edited)).replace(/=+$/, "")}.${signature}`;
    expect(readLease(forged, pair.publicKey)).toBeNull();
    // Another key's signature is refused.
    expect(readLease(signLease(base, licenseKeyPair().secretKey), pair.publicKey)).toBeNull();
    expect(readLease("nonsense", pair.publicKey)).toBeNull();
  });

  it("gives the plan only on its computer, in time, and with the clock not turned back", () => {
    const lease = readLease(signLease(base, pair.secretKey), pair.publicKey)!;
    expect(standing(lease, "dev-1", now + DAY)).toMatchObject({ ok: true, plan: "premium" });
    expect(standing(lease, "dev-2", now + DAY)).toEqual({ ok: false, reason: "device" });
    expect(standing(lease, "dev-1", now + 31 * DAY)).toEqual({ ok: false, reason: "renew" });
    expect(standing(lease, "dev-1", now + 366 * DAY)).toEqual({ ok: false, reason: "ended" });
    // The computer has been seen on day 20; setting the clock back to day 2 is refused.
    expect(standing(lease, "dev-1", now + 2 * DAY, now + 20 * DAY)).toEqual({ ok: false, reason: "clock" });
    expect(standing(null, "dev-1", now)).toEqual({ ok: false, reason: "none" });
  });
});
