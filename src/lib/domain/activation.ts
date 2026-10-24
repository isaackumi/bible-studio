// Device seats, the app's side: a license key runs on as many computers as its plan allows
// (Premium 1, Church 3). The server counts them and answers with a signed lease
// (src/lib/domain/lease.ts); the app keeps its plan offline until that lease asks for a check-in.

/** Renew a license's lease this many days before it asks for a check-in, when online. */
export const RENEW_EARLY_DAYS = 7;

export type ActivatedDevice = { device: string; name: string; seenAt: string; you?: boolean };

export type ActivationState = {
  /** "moved": the licence left this computer for another (or was released); it is on Free until moved back. */
  status: "off" | "checking" | "ok" | "full" | "moved" | "offline" | "error";
  seats: number;
  devices: ActivatedDevice[];
  message: string;
  /** With "moved": the name of the computer that has the licence now ("" after a plain release). */
  movedTo?: string;
};

export function idleActivation(): ActivationState {
  return { status: "off", seats: 0, devices: [], message: "" };
}

/** What the server's refusal means: 409 is a full licence, 403 with `moved` is one that left this computer. */
export function activationFrom(status: number, data: unknown, offline: boolean): ActivationState["status"] {
  if (offline) return "offline";
  if (status === 409) return "full";
  if (status === 403 && !!data && typeof data === "object" && (data as { moved?: unknown }).moved === true) return "moved";
  return "error";
}
