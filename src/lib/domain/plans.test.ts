import { describe, expect, it } from "vitest";
import { licenseKeyPair, signLicense } from "./license";
import { checkoutUrl, dropToFree, effectivePlan, freeEntitlement, redeemCode, yearlyDeal, planFor, planIncludes, sanitizeEntitlement, startTrial, trialActive, trialDaysLeft } from "./plans";

const DAY = 86_400_000;
const now = Date.parse("2026-10-17T12:00:00Z");

describe("plans", () => {
  it("includes each tier's features and everything below it", () => {
    expect(planIncludes("free", "scripture")).toBe(true);
    expect(planIncludes("free", "production")).toBe(false);
    expect(planIncludes("premium", "production")).toBe(true);
    expect(planIncludes("premium", "scripture")).toBe(true);
    expect(planIncludes("church", "song-detection")).toBe(true);
    expect(planFor("phone-remote").id).toBe("premium");
    expect(planFor("cloud-sync").id).toBe("church");
    expect(planFor("songs").id).toBe("free");
  });

  it("runs one 14-day Premium trial, then falls back to Free", () => {
    const trial = startTrial(freeEntitlement(), now);
    expect(effectivePlan(trial, now)).toBe("premium");
    expect(trialDaysLeft(trial, now)).toBe(14);
    expect(trialDaysLeft(trial, now + 13.5 * DAY)).toBe(1);
    expect(effectivePlan(trial, now + 15 * DAY)).toBe("free");
    expect(trialActive(trial, now + 15 * DAY)).toBe(false);
    expect(startTrial({ ...trial, trialEndsAt: null }, now)).toEqual({ ...trial, trialEndsAt: null });
  });

  it("repairs stored entitlements", () => {
    expect(sanitizeEntitlement(undefined)).toEqual(freeEntitlement());
    expect(sanitizeEntitlement({ plan: "gold", trialEndsAt: "nope" })).toEqual(freeEntitlement());
    // A plan in the saved file counts only with a valid license (or a test code in development).
    expect(sanitizeEntitlement({ plan: "church" }).plan).toBe("free");
    expect(sanitizeEntitlement({ plan: "church", source: "promo", code: "CHURCH-TEST" }, { allowTest: true }).plan).toBe("church");
    expect(sanitizeEntitlement({ plan: "church", source: "promo", code: "CHURCH-TEST" }, { allowTest: false }).plan).toBe("free");
    expect(sanitizeEntitlement({ trialEndsAt: "2026-11-01T00:00:00Z" }).trialUsed).toBe(true);
  });
});

describe("license keys, test codes and prices", () => {
  const pair = licenseKeyPair();
  const opts = { now, publicKey: pair.publicKey, allowTest: false };

  it("redeems test codes only when allowed, ignoring case and spaces", () => {
    const premium = redeemCode(freeEntitlement(), " premium-test ", { now, allowTest: true });
    expect(premium.ok && premium.entitlement).toMatchObject({ plan: "premium", source: "promo", code: "PREMIUM-TEST", expiresAt: null });
    expect(premium.ok && effectivePlan(premium.entitlement, now + 400 * DAY)).toBe("premium");
    const church = redeemCode(freeEntitlement(), "Church-Test", { now, allowTest: true });
    expect(church.ok && effectivePlan(church.entitlement, now)).toBe("church");
    expect(redeemCode(freeEntitlement(), "PREMIUM-TEST", opts).ok).toBe(false);
    expect(redeemCode(freeEntitlement(), "nope", opts).ok).toBe(false);
    expect(redeemCode(freeEntitlement(), "  ", opts).ok).toBe(false);
  });

  it("redeems a signed key and re-checks it on load", () => {
    const key = signLicense({ plan: "church", holder: "Grace Chapel" }, pair.secretKey);
    const result = redeemCode(freeEntitlement(), key.toLowerCase(), opts);
    expect(result.ok && result.entitlement).toMatchObject({ plan: "church", source: "license", holder: "Grace Chapel", expiresAt: null });
    const saved = result.ok ? result.entitlement : freeEntitlement();
    expect(sanitizeEntitlement(saved, opts)).toEqual(saved);
    // Editing the saved plan does nothing: the key decides.
    expect(sanitizeEntitlement({ ...saved, plan: "premium" }, opts).plan).toBe("church");
    // A key from another signer is refused, at redeem and at load.
    const other = licenseKeyPair();
    expect(redeemCode(freeEntitlement(), key, { ...opts, publicKey: other.publicKey }).ok).toBe(false);
    expect(sanitizeEntitlement(saved, { ...opts, publicKey: other.publicKey }).plan).toBe("free");
  });

  it("ends dated and launch-offer keys, and drops back to Free", () => {
    const dated = signLicense({ plan: "premium", until: "2026-12-31" }, pair.secretKey);
    const kept = redeemCode(freeEntitlement(), dated, opts);
    expect(kept.ok && effectivePlan(kept.entitlement, Date.parse("2026-12-31T23:00:00Z"))).toBe("premium");
    expect(kept.ok && effectivePlan(kept.entitlement, Date.parse("2027-01-01T00:00:01Z"))).toBe("free");
    expect(redeemCode(freeEntitlement(), dated, { ...opts, now: Date.parse("2027-02-01") }).ok).toBe(false);

    const launch = redeemCode(freeEntitlement(), signLicense({ plan: "premium", days: 30 }, pair.secretKey), opts);
    expect(launch.ok && effectivePlan(launch.entitlement, now + 29 * DAY)).toBe("premium");
    expect(launch.ok && effectivePlan(launch.entitlement, now + 31 * DAY)).toBe("free");
    // Pushing the saved end date out is capped at the key's days from now.
    const stretched = launch.ok ? { ...launch.entitlement, expiresAt: new Date(now + 900 * DAY).toISOString() } : freeEntitlement();
    expect(Date.parse(sanitizeEntitlement(stretched, opts).expiresAt!)).toBeLessThanOrEqual(now + 30 * DAY);
    expect(launch.ok && dropToFree(launch.entitlement)).toMatchObject({ plan: "free", source: "free", code: null, license: null });
  });

  it("builds checkout links only for plans that have one", () => {
    const links = { premium: { monthly: null, yearly: "https://pay.paddle.io/hsc_01test" }, church: { monthly: null, yearly: null } };
    expect(checkoutUrl("premium", "yearly", "pastor@grace.org", links)).toBe("https://pay.paddle.io/hsc_01test?user_email=pastor%40grace.org");
    expect(checkoutUrl("premium", "monthly", null, links)).toBeNull();
    expect(checkoutUrl("free", "yearly", null, links)).toBeNull();
  });

  it("shows the yearly saving", () => {
    expect(yearlyDeal({ monthly: 12, yearly: 120 })).toEqual({ perMonth: 10, savePercent: 17 });
    expect(yearlyDeal({ monthly: 0, yearly: 0 })).toEqual({ perMonth: 0, savePercent: 0 });
  });
});

describe("free listening", () => {
  it("gives an hour a month and starts again each month", async () => {
    const { listenAllowance } = await import("./plans");
    const october = new Date(2026, 9, 18);
    expect(listenAllowance(undefined, october)).toEqual({ usage: { month: "2026-10", seconds: 0 }, leftSeconds: 3600 });
    expect(listenAllowance({ month: "2026-10", seconds: 3000 }, october).leftSeconds).toBe(600);
    expect(listenAllowance({ month: "2026-10", seconds: 4000 }, october).leftSeconds).toBe(0);
    expect(listenAllowance({ month: "2026-09", seconds: 4000 }, october).leftSeconds).toBe(3600);
  });
});

describe("a readable name from an email", () => {
  it("drops numbers and tags, splits on dots and dashes, capitalises, and stays short", async () => {
    const { nameFromEmail, sanitizeProfile } = await import("./plans");
    expect(nameFromEmail("isaac.k.kumi29@gmail.com")).toBe("Isaac K Kumi");
    expect(nameFromEmail("john_smith-1985+church@x.org")).toBe("John Smith");
    expect(nameFromEmail("averyveryverylongfirstname.anotherlongsurname@x.org").length).toBeLessThanOrEqual(24);
    expect(nameFromEmail("12345@x.org")).toBe("12345");
    // A name the sign-in gave is kept; the bare email part is made readable.
    expect(sanitizeProfile({ name: "Pastor Mensah", email: "p@x.org" })?.name).toBe("Pastor Mensah");
    expect(sanitizeProfile({ name: "isaac.k.kumi29", email: "isaac.k.kumi29@gmail.com" })?.name).toBe("Isaac K Kumi");
  });
});
