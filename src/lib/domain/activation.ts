// Device activations, the app's side: this computer checks in with the license server so a key
// runs on as many computers as its plan allows (Premium 1, Church 3). Offline is fine: a computer
// keeps its plan for 30 days from its last good check. See server/activations.ts.

/** The license server's address (the Worker in server/); null turns the activation check off. */
export const ACTIVATION_URL: string | null = "https://church-studio-keys.heitech-inc.workers.dev";

/** Days a computer keeps its plan without reaching the server. */
export const OFFLINE_GRACE_DAYS = 30;
/** How often a computer checks in while it can. */
export const RECHECK_DAYS = 7;

export type ActivatedDevice = { device: string; name: string; seenAt: string };

export type ActivationState = {
  status: "off" | "checking" | "ok" | "full" | "offline" | "error";
  seats: number;
  devices: ActivatedDevice[];
  message: string;
};

export function idleActivation(): ActivationState {
  return { status: "off", seats: 0, devices: [], message: "" };
}

const DEVICE_KEY = "church-studio.device";

/** This computer's id: made once and kept in this app's own storage (not in the workspace file, so a backup restored elsewhere does not take this computer's place). */
export function deviceId(storage: Pick<Storage, "getItem" | "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage): string {
  try {
    const saved = storage?.getItem(DEVICE_KEY);
    if (saved) return saved;
    const made = crypto.randomUUID();
    storage?.setItem(DEVICE_KEY, made);
    return made;
  } catch {
    return "unknown-device";
  }
}

/** Whether a computer that cannot reach the server still keeps its plan. */
export function withinGrace(lastOkAt: string | null | undefined, now = Date.now()): boolean {
  const at = lastOkAt ? Date.parse(lastOkAt) : NaN;
  return Number.isFinite(at) && now - at < OFFLINE_GRACE_DAYS * 86_400_000;
}

export function dueForCheck(lastOkAt: string | null | undefined, now = Date.now()): boolean {
  const at = lastOkAt ? Date.parse(lastOkAt) : NaN;
  return !Number.isFinite(at) || now - at > RECHECK_DAYS * 86_400_000;
}

type Answer = { ok?: boolean; full?: boolean; seats?: number; devices?: ActivatedDevice[]; error?: string };

/** Ask the license server; network trouble comes back as "offline", never as an exception. */
export async function askServer(
  path: "activate" | "release" | "devices",
  body: { key: string; device?: string; name?: string },
  base = ACTIVATION_URL,
  http: typeof fetch = fetch,
): Promise<ActivationState> {
  if (!base) return idleActivation();
  let response: Response;
  try {
    response = await http(`${base.replace(/\/+$/, "")}/v1/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { status: "offline", seats: 0, devices: [], message: "The license server could not be reached." };
  }
  let answer: Answer = {};
  try {
    answer = (await response.json()) as Answer;
  } catch {
    answer = {};
  }
  const seats = Number(answer.seats) || 0;
  const devices = Array.isArray(answer.devices) ? answer.devices : [];
  // A fault on the server's side is not a refusal: treat it like no network, so the offline grace applies.
  if (response.status >= 500) return { status: "offline", seats, devices, message: "The license server is having trouble; try again later." };
  if (response.status === 409 || answer.full) return { status: "full", seats, devices, message: "" };
  if (!response.ok) return { status: "error", seats, devices, message: answer.error ?? `The license server said ${response.status}.` };
  return { status: "ok", seats, devices, message: "" };
}
