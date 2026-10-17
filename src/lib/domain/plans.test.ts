import { describe, expect, it } from "vitest";
import { dropToFree, effectivePlan, freeEntitlement, redeemCode, yearlyDeal, planFor, planIncludes, sanitizeEntitlement, startTrial, trialActive, trialDaysLeft } from "./plans";

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
    expect(sanitizeEntitlement({ plan: "church" }).plan).toBe("church");
    expect(sanitizeEntitlement({ trialEndsAt: "2026-11-01T00:00:00Z" }).trialUsed).toBe(true);
  });
});

describe("promo codes and prices", () => {
  it("redeems test codes, ignoring case and spaces, and rejects others", () => {
    const premium = redeemCode(freeEntitlement(), " premium-test ", now);
    expect(premium.ok && premium.entitlement).toMatchObject({ plan: "premium", source: "promo", code: "PREMIUM-TEST", expiresAt: null });
    expect(premium.ok && effectivePlan(premium.entitlement, now + 400 * DAY)).toBe("premium");
    const church = redeemCode(freeEntitlement(), "Church-Test", now);
    expect(church.ok && effectivePlan(church.entitlement, now)).toBe("church");
    expect(redeemCode(freeEntitlement(), "nope", now)).toEqual({ ok: false, error: "That code is not valid." });
    expect(redeemCode(freeEntitlement(), "  ", now).ok).toBe(false);
  });

  it("ends a timed code and drops back to Free", () => {
    const launch = redeemCode(freeEntitlement(), "LAUNCH30", now);
    expect(launch.ok && effectivePlan(launch.entitlement, now + 29 * DAY)).toBe("premium");
    expect(launch.ok && effectivePlan(launch.entitlement, now + 31 * DAY)).toBe("free");
    expect(launch.ok && dropToFree(launch.entitlement)).toMatchObject({ plan: "free", source: "free", code: null });
  });

  it("shows the yearly saving", () => {
    expect(yearlyDeal({ monthly: 12, yearly: 120 })).toEqual({ perMonth: 10, savePercent: 17 });
    expect(yearlyDeal({ monthly: 0, yearly: 0 })).toEqual({ perMonth: 0, savePercent: 0 });
  });
});
