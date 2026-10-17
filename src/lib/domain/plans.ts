// Plans: what a church gets on Free, Premium and Church. One table drives the Account page, the
// upgrade prompts and every gate, so changing what a plan includes is a one-line edit here.
// Entitlement is local for now (Free, or a 14-day Premium trial on this computer). A billing
// service will later write the same Entitlement record after a purchase.

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
  | "cloud-sync"
  | "ndi"
  | "streaming"
  | "recording";

/** Prices in US dollars. PLACEHOLDERS until pricing is decided; the pricing page reads them from here. */
export type PlanPrice = { monthly: number; yearly: number };

export type Plan = { id: PlanId; name: string; tagline: string; color: string; features: PlanFeature[]; price: PlanPrice; popular?: boolean };

export const FEATURE_LABELS: Record<PlanFeature, { label: string; soon?: boolean }> = {
  presenter: { label: "Presenter Desk" },
  scripture: { label: "Scripture with every translation" },
  songs: { label: "Song library, folders and imports" },
  sermon: { label: "Sermon outlines and desk notes" },
  slides: { label: "Slides and announcements" },
  media: { label: "Images and backgrounds" },
  "audience-output": { label: "Audience output" },
  production: { label: "Production Desk: scenes, cameras, video" },
  voice: { label: "Voice: verse detection and commands" },
  "song-detection": { label: "Song detection that follows the singing" },
  "phone-remote": { label: "Phone remote" },
  "stage-display": { label: "Stage display" },
  "song-packs": { label: "Song packs" },
  "cloud-sync": { label: "Cloud sync across computers", soon: true },
  ndi: { label: "NDI in and out", soon: true },
  streaming: { label: "Streaming", soon: true },
  recording: { label: "Recording", soon: true },
};

const FREE: PlanFeature[] = ["presenter", "scripture", "songs", "sermon", "slides", "media", "audience-output"];
const PREMIUM: PlanFeature[] = [...FREE, "production", "voice", "song-detection", "phone-remote", "stage-display", "song-packs"];
const CHURCH: PlanFeature[] = [...PREMIUM, "cloud-sync", "ndi", "streaming", "recording"];

export const PLANS: Plan[] = [
  { id: "free", name: "Free", tagline: "Everything to put scripture, songs and sermons on screen.", color: "#8e8e93", features: FREE, price: { monthly: 0, yearly: 0 } },
  { id: "premium", name: "Premium", tagline: "Production, voice and remote control for a full service.", color: "#fa4f00", features: PREMIUM, price: { monthly: 12, yearly: 120 }, popular: true },
  { id: "church", name: "Church", tagline: "Several computers and broadcast for larger teams.", color: "#7c5cff", features: CHURCH, price: { monthly: 29, yearly: 290 } },
];

export const TRIAL_DAYS = 14;

export type EntitlementSource = "free" | "trial" | "promo" | "purchase";

export type Entitlement = {
  plan: PlanId;
  /** How the plan was granted. */
  source: EntitlementSource;
  /** ISO time a promo or purchase ends; null for no end. */
  expiresAt: string | null;
  /** The promo code that granted the plan, for display. */
  code: string | null;
  /** ISO time a Premium trial on this computer ends; null when no trial was started. */
  trialEndsAt: string | null;
  /** The trial can be started once per workspace. */
  trialUsed: boolean;
};

export function freeEntitlement(): Entitlement {
  return { plan: "free", source: "free", expiresAt: null, code: null, trialEndsAt: null, trialUsed: false };
}

export function sanitizeEntitlement(value: unknown): Entitlement {
  const record = value && typeof value === "object" ? (value as Partial<Entitlement>) : {};
  const plan: PlanId = record.plan === "premium" || record.plan === "church" ? record.plan : "free";
  const time = (value: unknown) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null);
  const ends = time(record.trialEndsAt);
  const source: EntitlementSource = plan === "free" ? "free" : record.source === "purchase" ? "purchase" : "promo";
  return {
    plan,
    source,
    expiresAt: plan === "free" ? null : time(record.expiresAt),
    code: plan !== "free" && typeof record.code === "string" ? record.code.slice(0, 40) : null,
    trialEndsAt: ends,
    trialUsed: record.trialUsed === true || ends !== null,
  };
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

// Promo codes. They ship inside the app, so treat them as test and launch codes, not secrets:
// a billing service should check codes once accounts exist. `days: null` never expires.
const PROMO_CODES: Record<string, { plan: Exclude<PlanId, "free">; days: number | null; note: string }> = {
  "PREMIUM-TEST": { plan: "premium", days: null, note: "Premium for testing" },
  "CHURCH-TEST": { plan: "church", days: null, note: "Church for testing" },
  LAUNCH30: { plan: "premium", days: 30, note: "Premium for 30 days" },
};

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export type RedeemResult = { ok: true; entitlement: Entitlement; note: string } | { ok: false; error: string };

export function redeemCode(entitlement: Entitlement, code: string, now = Date.now()): RedeemResult {
  const key = normalizeCode(code);
  if (!key) return { ok: false, error: "Type a code first." };
  const promo = PROMO_CODES[key];
  if (!promo) return { ok: false, error: "That code is not valid." };
  return {
    ok: true,
    note: promo.note,
    entitlement: {
      ...entitlement,
      plan: promo.plan,
      source: "promo",
      code: key,
      expiresAt: promo.days === null ? null : new Date(now + promo.days * 86_400_000).toISOString(),
    },
  };
}

/** Back to Free (keeps the record of a used trial). */
export function dropToFree(entitlement: Entitlement): Entitlement {
  return { ...entitlement, plan: "free", source: "free", expiresAt: null, code: null };
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
