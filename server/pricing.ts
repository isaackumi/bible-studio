// What the server charges, in cents, and how promo codes change it. The server is the source of
// truth for prices at checkout; src/lib/domain/plans.ts shows the same numbers (a test keeps them
// in step).

import type { LicensePlan } from "../src/lib/domain/license.ts";

export type Interval = "monthly" | "yearly";
export const CURRENCY = "USD";

export const PRICES: Record<LicensePlan, Record<Interval, number>> = {
  premium: { monthly: 1200, yearly: 12000 },
  church: { monthly: 2900, yearly: 29000 },
};

/** Days a paid period lasts. */
export const PERIOD_DAYS: Record<Interval, number> = { monthly: 31, yearly: 366 };

export type Promo = {
  code: string;
  /** Percent off the first payment (1–100). */
  percentOff?: number;
  /** Cents off the first payment. */
  amountOff?: number;
  /** Extra trial days when the code is used to start a trial. */
  trialDays?: number;
  /** Plans and intervals it works on; missing: all. */
  plans?: LicensePlan[];
  intervals?: Interval[];
  /** How many times it can be used; missing: no limit. */
  maxUses?: number;
  used: number;
  /** Last moment it works (epoch ms); missing: no end. */
  expiresAt?: number;
  /** For the admin page only. */
  note?: string;
  createdAt: number;
};

export type PromoCheck =
  | { ok: true; code: string; label: string; percentOff: number; amountOff: number; trialDays: number }
  | { ok: false; reason: "unknown" | "expired" | "used-up" | "not-for-plan" };

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
}

/** Whether a promo works now for a plan and interval, and what it gives. */
export function checkPromo(promo: Promo | null, plan: LicensePlan | null, interval: Interval | null, now: number): PromoCheck {
  if (!promo) return { ok: false, reason: "unknown" };
  if (promo.expiresAt && now > promo.expiresAt) return { ok: false, reason: "expired" };
  if (promo.maxUses !== undefined && promo.used >= promo.maxUses) return { ok: false, reason: "used-up" };
  if (plan && promo.plans?.length && !promo.plans.includes(plan)) return { ok: false, reason: "not-for-plan" };
  if (interval && promo.intervals?.length && !promo.intervals.includes(interval)) return { ok: false, reason: "not-for-plan" };
  const percentOff = Math.min(100, Math.max(0, Math.round(promo.percentOff ?? 0)));
  const amountOff = Math.max(0, Math.round(promo.amountOff ?? 0));
  const trialDays = Math.max(0, Math.round(promo.trialDays ?? 0));
  const parts = [percentOff ? `${percentOff}% off` : "", amountOff ? `$${(amountOff / 100).toFixed(amountOff % 100 ? 2 : 0)} off` : "", trialDays ? `${trialDays} extra trial days` : ""].filter(Boolean);
  return { ok: true, code: promo.code, label: parts.join(" · ") || "Code applied", percentOff, amountOff, trialDays };
}

/** The first payment after a promo (never below zero). */
export function priceAfter(plan: LicensePlan, interval: Interval, promo: PromoCheck | null): { list: number; due: number } {
  const list = PRICES[plan][interval];
  if (!promo || !promo.ok) return { list, due: list };
  const due = Math.max(0, Math.round(list * (1 - promo.percentOff / 100)) - promo.amountOff);
  return { list, due };
}

/** A promo from admin input, cleaned. */
export function makePromo(input: Record<string, unknown>, now: number): Promo | null {
  const code = normalizeCode(String(input.code ?? ""));
  if (code.length < 3) return null;
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);
  const plans = Array.isArray(input.plans) ? input.plans.filter((plan): plan is LicensePlan => plan === "premium" || plan === "church") : undefined;
  const intervals = Array.isArray(input.intervals) ? input.intervals.filter((value): value is Interval => value === "monthly" || value === "yearly") : undefined;
  const promo: Promo = { code, used: 0, createdAt: now };
  const percentOff = number(input.percentOff);
  if (percentOff) promo.percentOff = Math.min(100, Math.round(percentOff));
  const amountOff = number(input.amountOff);
  if (amountOff) promo.amountOff = Math.round(amountOff);
  const trialDays = number(input.trialDays);
  if (trialDays) promo.trialDays = Math.min(365, Math.round(trialDays));
  if (plans?.length) promo.plans = plans;
  if (intervals?.length) promo.intervals = intervals;
  const maxUses = number(input.maxUses);
  if (maxUses) promo.maxUses = Math.round(maxUses);
  const expiresAt = typeof input.expiresAt === "string" ? Date.parse(input.expiresAt) : number(input.expiresAt);
  if (expiresAt && Number.isFinite(expiresAt)) promo.expiresAt = expiresAt;
  if (typeof input.note === "string" && input.note.trim()) promo.note = input.note.trim().slice(0, 120);
  if (!promo.percentOff && !promo.amountOff && !promo.trialDays) return null;
  return promo;
}
