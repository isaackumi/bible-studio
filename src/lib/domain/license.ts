// License keys: a plan, its end date and who it is for, signed with Ed25519. The app holds only
// the public key below, so it can check a key offline but cannot make one. Keys are issued with
// `node scripts/license.ts`, which reads the private key from outside the repository.
//
// Key layout (before the signature): version, plan, absolute end day, days-after-redeem,
// a random id and an optional holder name. Text form is Crockford base32 in groups of five,
// so a key survives being read aloud, retyped in any case, or pasted with stray spaces.

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

ed.hashes.sha512 = sha512;

/** Church Studio's license public key (Ed25519, hex). Replace only together with the signing key. */
export const LICENSE_PUBLIC_KEY = "8014f76328f5296fa6c0458aecdf5cfc17073eed8998b145b1abf73502536132";

export type LicensePlan = "premium" | "church";

export type License = {
  plan: LicensePlan;
  /** The fixed last day of the license (ISO, end of that UTC day), or null. */
  until: string | null;
  /** Days the plan runs from the moment it is redeemed (launch offers), or null. */
  days: number | null;
  /** Random id, to recognize a key without storing who bought it. */
  id: string;
  /** Who the key was issued to, shown on the account page. */
  holder: string;
};

const VERSION = 1;
const PREFIX = "CS1";
const EPOCH = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;
const HEADER = 10;
const SIGNATURE = 64;
const MAX_HOLDER = 40;
const PLAN_CODES: Record<LicensePlan, number> = { premium: 1, church: 2 };

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string): Uint8Array | null {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of text) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) return null;
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/** Uppercase, drop spaces and dashes, and read look-alike letters the way Crockford base32 does. */
export function normalizeLicense(text: string): string {
  return text.toUpperCase().replace(/[\s-]+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

/** Whether typed text is meant as a license key rather than a short code. */
export function looksLikeLicense(text: string): boolean {
  return normalizeLicense(text).startsWith(PREFIX) && normalizeLicense(text).length > 40;
}

function dayNumber(iso: string): number {
  return Math.floor((Date.parse(iso) - EPOCH) / DAY);
}

function payload(license: Omit<License, "id"> & { id: Uint8Array }): Uint8Array {
  const holder = new TextEncoder().encode(license.holder.trim()).slice(0, MAX_HOLDER);
  const bytes = new Uint8Array(HEADER + holder.length);
  const view = new DataView(bytes.buffer);
  bytes[0] = VERSION;
  bytes[1] = PLAN_CODES[license.plan];
  view.setUint16(2, license.until ? dayNumber(license.until) + 1 : 0);
  view.setUint16(4, license.days ?? 0);
  bytes.set(license.id.slice(0, 4), 6);
  bytes.set(holder, HEADER);
  return bytes;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  return new Uint8Array((text.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));
}

/** Make a key. Only the issuing script and tests call this; the app never holds a secret key. */
export function signLicense(
  fields: { plan: LicensePlan; until?: string | null; days?: number | null; holder?: string; id?: Uint8Array },
  secretKeyHex: string,
): string {
  if (fields.until && Number.isNaN(Date.parse(fields.until))) throw new Error("The end date is not a date.");
  if (fields.days != null && (!Number.isInteger(fields.days) || fields.days < 1 || fields.days > 65_535)) throw new Error("Days must be a whole number from 1.");
  const id = fields.id ?? crypto.getRandomValues(new Uint8Array(4));
  const body = payload({ plan: fields.plan, until: fields.until ?? null, days: fields.days ?? null, holder: fields.holder ?? "", id });
  const signature = ed.sign(body, fromHex(secretKeyHex));
  const text = PREFIX + toBase32(new Uint8Array([...body, ...signature]));
  return text.match(/.{1,5}/g)!.join("-");
}

/** Read and check a key. Null when it is malformed or not signed by Church Studio. */
export function readLicense(text: string, publicKeyHex?: string): License | null {
  const clean = normalizeLicense(text);
  if (!clean.startsWith(PREFIX)) return null;
  const bytes = fromBase32(clean.slice(PREFIX.length));
  if (!bytes || bytes.length < HEADER + SIGNATURE || bytes.length > HEADER + MAX_HOLDER + SIGNATURE) return null;
  const body = bytes.slice(0, bytes.length - SIGNATURE);
  const signature = bytes.slice(bytes.length - SIGNATURE);
  if (body[0] !== VERSION) return null;
  try {
    if (!ed.verify(signature, body, fromHex(publicKeyHex ?? LICENSE_PUBLIC_KEY))) return null;
  } catch {
    return null;
  }
  const plan = (Object.keys(PLAN_CODES) as LicensePlan[]).find((name) => PLAN_CODES[name] === body[1]);
  if (!plan) return null;
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const endDay = view.getUint16(2);
  const days = view.getUint16(4);
  return {
    plan,
    until: endDay ? new Date(EPOCH + endDay * DAY - 1).toISOString() : null,
    days: days || null,
    id: hex(body.slice(6, 10)),
    holder: new TextDecoder().decode(body.slice(HEADER)),
  };
}

/** A fresh signing pair, as hex. Used by `scripts/license.ts keygen`. */
export function licenseKeyPair(): { secretKey: string; publicKey: string } {
  const secret = ed.utils.randomSecretKey();
  return { secretKey: hex(secret), publicKey: hex(ed.getPublicKey(secret)) };
}
