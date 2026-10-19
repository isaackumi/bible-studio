// Device seats, the app's side: a license key runs on as many computers as its plan allows
// (Premium 1, Church 3). The server counts them and answers with a signed lease
// (src/lib/domain/lease.ts); the app keeps its plan offline until that lease asks for a check-in.

/** Renew a license's lease this many days before it asks for a check-in, when online. */
export const RENEW_EARLY_DAYS = 7;

export type ActivatedDevice = { device: string; name: string; seenAt: string; you?: boolean };

export type ActivationState = {
  status: "off" | "checking" | "ok" | "full" | "offline" | "error";
  seats: number;
  devices: ActivatedDevice[];
  message: string;
};

export function idleActivation(): ActivationState {
  return { status: "off", seats: 0, devices: [], message: "" };
}
