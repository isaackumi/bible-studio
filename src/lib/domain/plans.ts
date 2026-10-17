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

export type Plan = { id: PlanId; name: string; tagline: string; color: string; features: PlanFeature[] };

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
  { id: "free", name: "Free", tagline: "Everything to put scripture, songs and sermons on screen.", color: "#8e8e93", features: FREE },
  { id: "premium", name: "Premium", tagline: "Production, voice and remote control for a full service.", color: "#fa4f00", features: PREMIUM },
  { id: "church", name: "Church", tagline: "Several computers and broadcast for larger teams.", color: "#7c5cff", features: CHURCH },
];

export const TRIAL_DAYS = 14;

export type Entitlement = {
  plan: PlanId;
  /** ISO time a Premium trial on this computer ends; null when no trial was started. */
  trialEndsAt: string | null;
  /** The trial can be started once per workspace. */
  trialUsed: boolean;
};

export function freeEntitlement(): Entitlement {
  return { plan: "free", trialEndsAt: null, trialUsed: false };
}

export function sanitizeEntitlement(value: unknown): Entitlement {
  const record = value && typeof value === "object" ? (value as Partial<Entitlement>) : {};
  const plan: PlanId = record.plan === "premium" || record.plan === "church" ? record.plan : "free";
  const ends = typeof record.trialEndsAt === "string" && !Number.isNaN(Date.parse(record.trialEndsAt)) ? record.trialEndsAt : null;
  return { plan, trialEndsAt: ends, trialUsed: record.trialUsed === true || ends !== null };
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
  if (entitlement.plan === "free" && trialActive(entitlement, now)) return "premium";
  return entitlement.plan;
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
