// The browser stand-in for the native entitlement core (src-tauri/src/entitlement.rs): the same
// lease check in JavaScript, kept in this browser's storage. The browser build is for trying the
// app and development; the desktop app is where plans are enforced.

import { freeStatus, type EntitlementStatus } from "../domain/billing";
import { readLease, standing } from "../domain/lease";

const KEY = "church-studio.entitlement";
const DEVICE = "church-studio.device";

type Saved = { lease: string | null; seen: number };

function load(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    return value && typeof value.seen === "number" ? value : { lease: null, seen: 0 };
  } catch {
    return { lease: null, seen: 0 };
  }
}

function save(saved: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage blocked: the plan lasts until the page closes.
  }
}

export function webDevice(): string {
  try {
    const saved = localStorage.getItem(DEVICE);
    if (saved) return saved;
    const made = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(DEVICE, made);
    return made;
  } catch {
    return "browser";
  }
}

function statusOf(saved: Saved): EntitlementStatus {
  const lease = saved.lease ? readLease(saved.lease) : null;
  const device = webDevice();
  const result = standing(lease, device, Date.now(), saved.seen);
  return {
    ...freeStatus(device),
    plan: result.ok ? result.plan : "free",
    reason: result.ok ? null : result.reason,
    kind: lease?.kind ?? null,
    leasePlan: lease?.plan ?? null,
    license: lease?.license ?? null,
    holder: lease?.holder ?? "",
    endsAt: lease?.endsAt ?? null,
    renewBy: lease?.renewBy ?? null,
    issuedAt: lease?.issuedAt ?? null,
  };
}

export const webEntitlement = {
  status: async (): Promise<EntitlementStatus> => {
    const saved = load();
    const status = statusOf(saved);
    if (status.reason !== "clock" && Date.now() > saved.seen) save({ ...saved, seen: Date.now() });
    return status;
  },
  set: async (token: string): Promise<EntitlementStatus> => {
    const lease = readLease(token);
    if (!lease) throw new Error("That is not a lease from Church Studio.");
    if (lease.device !== webDevice()) throw new Error("That lease is for another computer.");
    const saved = load();
    // As in the Rust core: only a newer lease (the server's time) resets the known time.
    const current = saved.lease ? readLease(saved.lease) : null;
    const newer = !current || lease.issuedAt > current.issuedAt || current.device !== lease.device;
    const next = newer ? { lease: token, seen: lease.issuedAt } : { ...saved, seen: Math.max(saved.seen, lease.issuedAt) };
    save(next);
    return statusOf(next);
  },
  noteTime: async (at: number): Promise<EntitlementStatus> => {
    const saved = load();
    const next = { ...saved, seen: Math.max(saved.seen, at) };
    save(next);
    return statusOf(next);
  },
  clear: async (): Promise<EntitlementStatus> => {
    const next = { ...load(), lease: null };
    save(next);
    return statusOf(next);
  },
};
