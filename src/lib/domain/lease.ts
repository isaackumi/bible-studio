// Leases: the license server's signed word that one computer has a plan, for how long, and by when
// it must check in again. The app decides its plan from a lease alone (in the Rust core on the
// desktop), so editing anything saved on the computer cannot grant or extend a plan: a lease is
// signed with the same Ed25519 key as license keys, and only the server holds the secret half.
//
// Token: "CSL1." + base64url(JSON) + "." + base64url(signature of those JSON bytes).

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { trustedKeys, type LicensePlan } from "./license";

ed.hashes.sha512 = sha512;

export type LeaseKind = "license" | "trial";

export type Lease = {
  v: 1;
  kind: LeaseKind;
  plan: LicensePlan;
  /** The computer it was issued to (the hashed hardware id). */
  device: string;
  /** The license id (hex), or null for a trial. */
  license: string | null;
  holder: string;
  /** When the server issued it (epoch ms; also the latest time the computer is known to have seen). */
  issuedAt: number;
  /** Check in again before this, or the plan pauses until the computer is online (epoch ms). */
  renewBy: number;
  /** When the plan itself ends (epoch ms), or null for no end. */
  endsAt: number | null;
};

const PREFIX = "CSL1";

function toBase64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const plain = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
    return Uint8Array.from(plain, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

const fromHex = (text: string) => new Uint8Array((text.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));

/** Sign a lease (the license server only). */
export function signLease(lease: Omit<Lease, "v">, secretKeyHex: string): string {
  const body = new TextEncoder().encode(JSON.stringify({ v: 1, ...lease }));
  const signature = ed.sign(body, fromHex(secretKeyHex));
  return `${PREFIX}.${toBase64Url(body)}.${toBase64Url(signature)}`;
}

/** Read and check a lease token. Null unless it is well formed and signed by a trusted key. */
export function readLease(token: string, publicKeyHex?: string): Lease | null {
  if (publicKeyHex === undefined) {
    for (const key of trustedKeys()) {
      const found = readLease(token, key);
      if (found) return found;
    }
    return null;
  }
  const [prefix, bodyText, signatureText, extra] = token.trim().split(".");
  if (prefix !== PREFIX || !bodyText || !signatureText || extra !== undefined) return null;
  const body = fromBase64Url(bodyText);
  const signature = fromBase64Url(signatureText);
  if (!body || !signature || signature.length !== 64) return null;
  try {
    if (!ed.verify(signature, body, fromHex(publicKeyHex))) return null;
  } catch {
    return null;
  }
  try {
    const lease = JSON.parse(new TextDecoder().decode(body)) as Lease;
    const valid =
      lease.v === 1 &&
      (lease.kind === "license" || lease.kind === "trial") &&
      (lease.plan === "premium" || lease.plan === "church") &&
      typeof lease.device === "string" &&
      typeof lease.issuedAt === "number" &&
      typeof lease.renewBy === "number" &&
      (lease.endsAt === null || typeof lease.endsAt === "number");
    return valid ? lease : null;
  } catch {
    return null;
  }
}

export type Standing =
  | { ok: true; plan: LicensePlan; kind: LeaseKind; endsAt: number | null; renewBy: number }
  | { ok: false; reason: "none" | "device" | "ended" | "renew" | "clock" };

/**
 * What a lease gives this computer at `now`. `seen` is the latest time this computer is known to
 * have reached (from earlier leases and runs): a clock set back before it is refused, so turning
 * the date back cannot stretch a trial or the time between check-ins.
 */
export function standing(lease: Lease | null, device: string, now: number, seen = 0): Standing {
  if (!lease) return { ok: false, reason: "none" };
  if (lease.device !== device) return { ok: false, reason: "device" };
  if (now + 60 * 60_000 < Math.max(seen, lease.issuedAt)) return { ok: false, reason: "clock" };
  if (lease.endsAt !== null && now >= lease.endsAt) return { ok: false, reason: "ended" };
  if (now >= lease.renewBy) return { ok: false, reason: "renew" };
  return { ok: true, plan: lease.plan, kind: lease.kind, endsAt: lease.endsAt, renewBy: lease.renewBy };
}
