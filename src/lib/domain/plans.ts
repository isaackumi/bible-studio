// Plans: what a church gets on Free, Premium and Church. One table drives the Account page, the
// upgrade prompts and every gate, so changing what a plan includes is a one-line edit here.
// A paid plan comes from a signed license key (domain/license.ts), checked again every time the
// workspace loads, so editing the saved file cannot grant a plan. Free and the 14-day trial are
// local to this computer.

import { msg } from "../i18n/core";
import { looksLikeLicense, normalizeLicense, readLicense } from "./license";

export type PlanId = "free" | "premium" | "church";

/** Features a plan can include. "soon" marks ones listed on the plan but not built yet. */
export type PlanFeature =
  | "presenter"
  | "scripture"
  | "songs"
  | "sermon"
  | "slides"
  | "media"
  | "audience-output"
  | "production"
  | "voice"
  | "song-detection"
  | "phone-remote"
  | "stage-display"
  | "song-packs"
  | "theme-library"
  | "cloud-sync"
  | "ndi"
  | "streaming"
  | "recording";

/** Prices in US dollars. PLACEHOLDERS until pricing is decided; the pricing page reads them from here. */
export type PlanPrice = { monthly: number; yearly: number };

export type Plan = { id: PlanId; name: string; tagline: string; color: string; features: PlanFeature[]; price: PlanPrice; popular?: boolean };

export const FEATURE_LABELS: Record<PlanFeature, { label: string; soon?: boolean }> = {
  presenter: { label: msg("Presenter Desk") },
  scripture: { label: msg("Scripture with every translation") },
  songs: { label: msg("Song library, folders and imports") },
  sermon: { label: msg("Sermon outlines and desk notes") },
  slides: { label: msg("Slides and announcements") },
  media: { label: msg("Images and backgrounds") },
  "audience-output": { label: msg("Audience output") },
  production: { label: msg("Production Desk: scenes, cameras, video") },
  voice: { label: msg("Voice: verse detection and commands") },
  "song-detection": { label: msg("Song detection that follows the singing") },
  "phone-remote": { label: msg("Phone remote") },
  "stage-display": { label: msg("Stage display") },
  "song-packs": { label: msg("Song packs") },
  "theme-library": { label: msg("Theme library: animated, photo and video backgrounds, full editing") },
  "cloud-sync": { label: msg("Cloud sync across computers"), soon: true },
  ndi: { label: msg("NDI in and out"), soon: true },
  streaming: { label: msg("Streaming"), soon: true },
  recording: { label: msg("Recording"), soon: true },
};

const FREE: PlanFeature[] = ["presenter", "scripture", "songs", "sermon", "slides", "media", "audience-output"];
const PREMIUM: PlanFeature[] = [...FREE, "production", "voice", "song-detection", "phone-remote", "stage-display", "song-packs", "theme-library"];
const CHURCH: PlanFeature[] = [...PREMIUM, "cloud-sync", "ndi", "streaming", "recording"];

export const PLANS: Plan[] = [
  { id: "free", name: msg("Free"), tagline: msg("Everything to put scripture, songs and sermons on screen."), color: "#8e8e93", features: FREE, price: { monthly: 0, yearly: 0 } },
  { id: "premium", name: msg("Premium"), tagline: msg("Production, voice and remote control for a full service."), color: "#fa4f00", features: PREMIUM, price: { monthly: 12, yearly: 120 }, popular: true },
  { id: "church", name: msg("Church"), tagline: msg("Several computers and broadcast for larger teams."), color: "#7c5cff", features: CHURCH, price: { monthly: 29, yearly: 290 } },
];

export const TRIAL_DAYS = 14;

export type Billing = "monthly" | "yearly";

/**
 * Paddle checkout links for each paid plan. Paste each hosted-checkout link from
 * Paddle › Checkout › Hosted checkouts here; a plan with no link shows "coming soon".
 * After payment the license server (server/paddle.ts) emails the buyer a key.
 */
export const CHECKOUT: Record<Exclude<PlanId, "free">, Record<Billing, string | null>> = {
  premium: { monthly: null, yearly: null },
  church: { monthly: null, yearly: null },
};

/** The checkout link for a plan, with the buyer's email filled in when known. */
export function checkoutUrl(plan: PlanId, billing: Billing, email?: string | null, links = CHECKOUT): string | null {
  if (plan === "free") return null;
  const link = links[plan][billing];
  if (!link) return null;
  const url = new URL(link);
  if (email) url.searchParams.set("user_email", email);
  return url.toString();
}

export type EntitlementSource = "free" | "trial" | "promo" | "license";

export type Entitlement = {
  plan: PlanId;
  /** How the plan was granted. */
  source: EntitlementSource;
  /** ISO time a promo or purchase ends; null for no end. */
  expiresAt: string | null;
  /** The test code that granted the plan (development builds only). */
  code: string | null;
  /** The license key that grants the plan; re-checked on every load. */
  license: string | null;
  /** Who the license was issued to. */
  holder: string | null;
  /** ISO time a Premium trial on this computer ends; null when no trial was started. */
  trialEndsAt: string | null;
  /** The trial can be started once per workspace. */
  trialUsed: boolean;
};

export function freeEntitlement(): Entitlement {
  return { plan: "free", source: "free", expiresAt: null, code: null, license: null, holder: null, trialEndsAt: null, trialUsed: false };
}

/** Test codes work in development builds only: shipped apps take signed license keys. */
const TEST_CODES: Record<string, { plan: Exclude<PlanId, "free">; note: string }> = {
  "PREMIUM-TEST": { plan: "premium", note: msg("Premium for testing") },
  "CHURCH-TEST": { plan: "church", note: msg("Church for testing") },
};

/** `now`, test-code permission and the public key, overridable for tests. */
export type LicenseCheck = { now?: number; allowTest?: boolean; publicKey?: string };

function checks(options: LicenseCheck) {
  return { now: options.now ?? Date.now(), allowTest: options.allowTest ?? import.meta.env?.DEV === true, publicKey: options.publicKey };
}

export function sanitizeEntitlement(value: unknown, options: LicenseCheck = {}): Entitlement {
  const { now, allowTest, publicKey } = checks(options);
  const record = value && typeof value === "object" ? (value as Partial<Entitlement>) : {};
  const time = (value: unknown) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null);
  const ends = time(record.trialEndsAt);
  const trial = { trialEndsAt: ends, trialUsed: record.trialUsed === true || ends !== null };
  const license = typeof record.license === "string" ? readLicense(record.license, publicKey) : null;
  if (license) {
    // A launch-offer key runs a set number of days from redemption: never longer than that from now.
    const stored = time(record.expiresAt);
    const cap = license.days ? now + license.days * 86_400_000 : null;
    const expiresAt = license.until ?? (cap === null ? null : stored && Date.parse(stored) <= cap ? stored : new Date(cap).toISOString());
    return { plan: license.plan, source: "license", expiresAt, code: null, license: record.license!, holder: license.holder || null, ...trial };
  }
  const test = allowTest && typeof record.code === "string" ? TEST_CODES[record.code] : undefined;
  if (test && record.source === "promo") return { ...freeEntitlement(), plan: test.plan, source: "promo", code: record.code!, ...trial };
  return { ...freeEntitlement(), ...trial };
}

export function trialActive(entitlement: Entitlement, now = Date.now()): boolean {
  return entitlement.trialEndsAt !== null && Date.parse(entitlement.trialEndsAt) > now;
}

/** Whole days left in a running trial (rounded up), else 0. */
export function trialDaysLeft(entitlement: Entitlement, now = Date.now()): number {
  if (!trialActive(entitlement, now)) return 0;
  return Math.ceil((Date.parse(entitlement.trialEndsAt!) - now) / 86_400_000);
}

/** The plan in force now: a running trial lifts Free to Premium. */
export function effectivePlan(entitlement: Entitlement, now = Date.now()): PlanId {
  const granted = entitlement.plan !== "free" && (entitlement.expiresAt === null || Date.parse(entitlement.expiresAt) > now);
  if (granted) return entitlement.plan;
  if (trialActive(entitlement, now)) return "premium";
  return "free";
}

export function planById(id: PlanId): Plan {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0]!;
}

export function planIncludes(id: PlanId, feature: PlanFeature): boolean {
  return planById(id).features.includes(feature);
}

/** The cheapest plan that includes a feature (for "Available on Premium"). */
export function planFor(feature: PlanFeature): Plan {
  return PLANS.find((plan) => plan.features.includes(feature)) ?? PLANS[PLANS.length - 1]!;
}

export function startTrial(entitlement: Entitlement, now = Date.now()): Entitlement {
  if (entitlement.trialUsed || entitlement.plan !== "free") return entitlement;
  return { ...entitlement, trialEndsAt: new Date(now + TRIAL_DAYS * 86_400_000).toISOString(), trialUsed: true };
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export type RedeemResult = { ok: true; entitlement: Entitlement; note: string } | { ok: false; error: string };

/** Redeem a license key (or, in development, a test code). */
export function redeemCode(entitlement: Entitlement, code: string, options: LicenseCheck = {}): RedeemResult {
  const { now, allowTest, publicKey } = checks(options);
  const typed = normalizeCode(code);
  if (!typed) return { ok: false, error: "Paste your license key first." };
  const test = allowTest ? TEST_CODES[typed] : undefined;
  if (test) return { ok: true, note: test.note, entitlement: { ...entitlement, plan: test.plan, source: "promo", code: typed, license: null, holder: null, expiresAt: null } };
  if (!looksLikeLicense(code)) return { ok: false, error: "That is not a license key. Keys start with CS1; paste the whole key from your email." };
  const license = readLicense(code, publicKey);
  if (!license) return { ok: false, error: "That license key is not valid. Check it was copied in full." };
  if (license.until && Date.parse(license.until) <= now) return { ok: false, error: `That license key ended on ${new Date(license.until).toLocaleDateString()}.` };
  const expiresAt = license.until ?? (license.days ? new Date(now + license.days * 86_400_000).toISOString() : null);
  const name = planById(license.plan).name;
  return {
    ok: true,
    note: license.days ? `${name} for ${license.days} days` : license.until ? `${name} until ${new Date(license.until).toLocaleDateString()}` : name,
    entitlement: { ...entitlement, plan: license.plan, source: "license", code: null, license: normalizeLicense(code), holder: license.holder || null, expiresAt },
  };
}

/** Back to Free (keeps the record of a used trial). */
export function dropToFree(entitlement: Entitlement): Entitlement {
  return { ...entitlement, plan: "free", source: "free", expiresAt: null, code: null, license: null, holder: null };
}

/** Yearly price per month, and the saving against twelve monthly payments. */
export function yearlyDeal(price: PlanPrice): { perMonth: number; savePercent: number } {
  if (price.yearly <= 0 || price.monthly <= 0) return { perMonth: 0, savePercent: 0 };
  return { perMonth: Math.round((price.yearly / 12) * 100) / 100, savePercent: Math.round((1 - price.yearly / (price.monthly * 12)) * 100) };
}

export type Profile = { name: string; email: string };

export function sanitizeProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase().slice(0, 120) : "";
  if (!name && !email) return null;
  return { name: name || email.split("@")[0] || "Operator", email };
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Initials for an avatar: "Ama Mensah" → "AM". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "?";
}
