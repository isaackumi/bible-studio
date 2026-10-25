// The app's side of plans and payment: every question goes to the license server (server/api.ts),
// and what grants a plan comes back as a signed lease, kept and checked by the native core
// (src-tauri/src/entitlement.rs). Network trouble comes back as `offline`, never as an exception.

import type { LicensePlan } from "./license";

/** The license server's address (the Worker in server/); VITE_LICENSE_SERVER points development at `npm run server:dev`. */
/** The public website: plans, downloads and the policies (terms, privacy, licenses). */
export const SITE_URL = "https://church-studio.heitechinc.com";
export const SERVER_URL: string = (import.meta.env?.VITE_LICENSE_SERVER as string | undefined) || "https://license.heitechinc.com";

export type Interval = "monthly" | "yearly";

/** What the native core says about this computer's plan (entitlement_status). */
export type EntitlementStatus = {
  plan: "free" | LicensePlan;
  /** Why it is Free: no lease, another computer's lease, the plan ended, a check-in is due, or the clock was set back. */
  reason: "none" | "device" | "ended" | "renew" | "clock" | null;
  device: string;
  kind: "license" | "trial" | null;
  leasePlan: LicensePlan | null;
  license: string | null;
  holder: string;
  endsAt: number | null;
  renewBy: number | null;
  issuedAt: number | null;
};

export function freeStatus(device = ""): EntitlementStatus {
  return { plan: "free", reason: "none", device, kind: null, leasePlan: null, license: null, holder: "", endsAt: null, renewBy: null, issuedAt: null };
}

export type ServerAnswer<T> = { ok: true; status: number; data: T } | { ok: false; status: number; data: Record<string, unknown>; offline: boolean; error: string };

/** POST to the license server. */
export async function serverCall<T = Record<string, unknown>>(path: string, body: unknown, base = SERVER_URL, http: typeof fetch = fetch): Promise<ServerAnswer<T>> {
  let response: Response;
  try {
    response = await http(`${base.replace(/\/+$/, "")}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, data: {}, offline: true, error: "The Church Studio server could not be reached. Check the internet connection." };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (response.ok) return { ok: true, status: response.status, data: data as T };
  const offline = response.status >= 500;
  return { ok: false, status: response.status, data, offline, error: typeof data.error === "string" ? data.error : offline ? "The Church Studio server is having trouble; try again soon." : `The server said ${response.status}.` };
}

export type PromoResult = { ok: true; code: string; label: string; percentOff: number; amountOff: number; trialDays: number } | { ok: false; reason: "unknown" | "expired" | "used-up" | "not-for-plan" };

export const PROMO_REASONS: Record<Exclude<PromoResult, { ok: true }>["reason"], string> = {
  unknown: "That code is not known.",
  expired: "That code has ended.",
  "used-up": "That code has been used up.",
  "not-for-plan": "That code is not for this plan.",
};

/** Price after a promo, in cents (the server charges the same). */
export function discounted(cents: number, promo: PromoResult | null): number {
  if (!promo || !promo.ok) return cents;
  return Math.max(0, Math.round(cents * (1 - promo.percentOff / 100)) - promo.amountOff);
}

export type CheckoutStart = { session: string; url: string; list: number; due: number; currency: string; test: boolean };
export type CheckoutPoll = { status: "pending" | "paid" | "cancelled"; key?: string; lease?: string; activation?: Record<string, unknown> };

/** How long the app waits for a checkout opened in the browser. */
export const CHECKOUT_WAIT_MS = 45 * 60_000;

// Signing in to an account (server/accounts.ts): the app opens a page in the browser. On this
// computer the browser comes back to the app with a one-time code (loopback); from another device
// the person types the code the app shows there.
export type SigninStart = { id: string; secret: string; number?: number; code?: string; url: string; expiresAt: number; methods: string[] };
export type SigninToken = { token: string; account: { email: string; name: string } };
export type SigninPoll = { status: "pending" | "done" | "cancelled" | "expired" | "collected"; token?: string; account?: { email: string; name: string } };
/** A person an owner added to their license. */
export type LicenseMember = { email: string; invitedAt?: number; joinedAt?: number };
export type AccountStatus = {
  account: { email: string; name: string };
  /**
   * owner: this account owns it (members: who it added; people: each with when they were invited and
   * joined); by: the owner's name, on a license someone added this account to; removed: the owner
   * took this account off it.
   */
  licenses: Array<{ license: string; plan: LicensePlan; revoked: boolean; owner?: boolean; members?: string[]; people?: LicenseMember[]; by?: string; removed?: boolean }>;
  lease?: string;
  activation?: { key?: string; seats?: number; devices?: unknown[]; status?: number; error?: string };
};
/** An account token, as the server makes them. */
export const ACCOUNT_TOKEN = /^cst_[0-9a-f]{64}$/;

/** Where an account is signed in (POST /v1/account/devices). */
export type SignedInComputer = {
  id: string;
  name: string;
  createdAt: number;
  you: boolean;
  /** From its check-ins: "macos", "windows", "linux", or "web-macos" for the browser version (empty when unknown). */
  os?: string;
  /** The browser version's browser ("Edge 129"). */
  browser?: string;
  version?: string;
  lastSeen?: number;
};

/** A PKCE verifier and its challenge (base64url SHA-256), for the loopback sign-in. */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}
