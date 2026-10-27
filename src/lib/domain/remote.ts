import type { PresentationModel } from "./types";

/**
 * Phone remote protocol. Pairing is two steps: the phone presents a short-lived pairing
 * credential (one-time QR token, or the typed 6-digit code), the desk operator approves the
 * named device, and only then does the phone receive a session token. The desk stores only
 * the token's SHA-256 hash; every later message must carry the token.
 */
export const REMOTE_PROTOCOL = 2;
/** The QR token and code stay valid this long after the desk shows them. */
export const REMOTE_PAIR_MS = 2 * 60 * 1000;
/** Wrong typed codes allowed before pairing closes. */
export const REMOTE_CODE_ATTEMPTS = 5;
/** A request waiting for the operator expires after this long. */
export const REMOTE_PENDING_MS = 2 * 60 * 1000;
/** A paired phone stays signed in this long after its last message (one service day). */
export const REMOTE_SESSION_MS = 12 * 60 * 60 * 1000;
export const REMOTE_LAN_PORT = 17891;

export const REMOTE_COMMANDS = ["take", "cut", "next", "previous", "live-next", "live-previous", "undo", "next-item", "previous-item", "clear", "clear-words", "black", "logo", "open-output", "close-output", "timer-pause", "timer-resume", "timer-reset", "music-toggle", "music-next", "music-fade"] as const;
/** Music commands: they change what is heard on this computer, never the screen. */
export const REMOTE_MUSIC_COMMANDS: readonly RemoteCommandId[] = ["music-toggle", "music-next", "music-fade"];
export type RemoteCommandId = (typeof REMOTE_COMMANDS)[number];
/** These change Program (or the audience screen itself). Next/Previous only move Preview; live-next/live-previous step and go live at once. */
export const REMOTE_LIVE_COMMANDS: readonly RemoteCommandId[] = ["take", "cut", "live-next", "live-previous", "undo", "clear", "clear-words", "black", "logo", "open-output", "close-output", "timer-pause", "timer-resume", "timer-reset"];

/**
 * What a paired phone may do. Full control is every command (as before levels existed). Preview
 * only moves Preview and picks what is next; it never changes what the audience sees or hears.
 */
export type RemoteAccess = "full" | "preview";
/** The commands a Preview-only phone may send: they move Preview, never Program. */
export const REMOTE_PREVIEW_COMMANDS: readonly RemoteCommandId[] = ["next", "previous", "next-item", "previous-item"];

/** A controller key can last for ever or a set number of days (0: never expires). */
export const CONTROLLER_EXPIRY_DAYS = [0, 1, 7, 30] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How fast one phone or key may press: a burst of this many, refilled at this many a second.
 * Generous for a person (or a Stream Deck page of buttons), far short of a stuck script.
 */
export const REMOTE_BURST = 20;
export const REMOTE_PER_SECOND = 5;

export type RemotePairing = { code: string; token: string; expiresAt: number; attempts: number };

export type RemoteDevice = {
  id: string;
  name: string;
  tokenHash: string;
  pairedAt: number;
  lastSeen: number;
  expiresAt: number;
  /** A controller key (Stream Deck, Companion, scripts): made in Settings, never expires. */
  controller?: boolean;
  /** A stage link (a phone or tablet on the platform): shows the stage only, presses nothing, never expires. */
  viewer?: boolean;
  /** A captions link (congregants' phones): reads the captions only, never expires. */
  captions?: boolean;
  /** "preview": may move Preview only. Absent is full control, so phones paired before levels keep it. */
  access?: "preview";
};

export type RemotePending = {
  id: string;
  name: string;
  secret: string;
  at: number;
  status: "waiting" | "approved" | "declined";
  /** Issued at approval and handed to the phone once. */
  token?: string;
};

export type RemoteGate = {
  pairing: RemotePairing | null;
  devices: RemoteDevice[];
  pending: RemotePending[];
};

export type RemoteAction =
  | { kind: "state" }
  | { kind: "command"; id: RemoteCommandId }
  | { kind: "preview-item"; itemId: string }
  | { kind: "preview-scene"; sceneId: string }
  | { kind: "stage" }
  | { kind: "captions" };

export type RemoteEnvelope = {
  v: number;
  type: string;
  payload: Record<string, string>;
};

export type RemoteRoute = {
  gate: RemoteGate;
  reply: RemoteEnvelope;
  action: RemoteAction | null;
  device: RemoteDevice | null;
};

export type RemoteContext = {
  now: number;
  /** SHA-256 hex of `payload.token`, computed by the caller; null when there is no token. */
  tokenHash: string | null;
  newId: () => string;
  newSecret: () => string;
};

export function emptyRemoteGate(): RemoteGate {
  return { pairing: null, devices: [], pending: [] };
}

export function lanRemoteUrl(host: string, port = REMOTE_LAN_PORT) {
  return `http://${host}:${port}/`;
}

/** The QR code payload: the LAN page plus the one-time pairing token. No session secret. */
export function pairingUrl(host: string, token: string, port = REMOTE_LAN_PORT) {
  return `${lanRemoteUrl(host, port)}?pair=${encodeURIComponent(token)}`;
}

export function isLanRemoteOrigin(href: string, port = REMOTE_LAN_PORT) {
  try {
    return new URL(href).port === String(port);
  } catch {
    return false;
  }
}

export function createPairing(now: number, code: string, token: string): RemotePairing {
  return { code, token, expiresAt: now + REMOTE_PAIR_MS, attempts: 0 };
}

export function isRemoteCommand(id: string): id is RemoteCommandId {
  return (REMOTE_COMMANDS as readonly string[]).includes(id);
}

export function remoteEnvelope(type: string, payload: Record<string, string>): RemoteEnvelope {
  return { v: REMOTE_PROTOCOL, type, payload };
}

export function readRemoteEnvelope(value: unknown): RemoteEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<RemoteEnvelope>;
  if (record.v !== REMOTE_PROTOCOL || typeof record.type !== "string") return null;
  if (!record.payload || typeof record.payload !== "object") return null;
  const payload: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record.payload)) {
    if (typeof entry === "string") payload[key] = entry;
  }
  return { v: REMOTE_PROTOCOL, type: record.type, payload };
}

/** Drop an expired pairing, stale pending requests, and expired devices. */
export function pruneRemoteGate(gate: RemoteGate, now: number): RemoteGate {
  return {
    pairing: gate.pairing && gate.pairing.expiresAt > now ? gate.pairing : null,
    pending: gate.pending.filter((entry) => now - entry.at < REMOTE_PENDING_MS),
    // An expired controller key stays listed (and refused) until the operator removes it.
    devices: gate.devices.filter((device) => device.controller || device.viewer || device.captions || device.expiresAt > now),
  };
}

function deviceName(raw: string | undefined): string {
  const name = (raw ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40);
  return name || "Phone";
}

const deny = (gate: RemoteGate, type: string, reason: string): RemoteRoute => ({
  gate,
  reply: remoteEnvelope(type, { reason }),
  action: null,
  device: null,
});

export function routeRemote(input: RemoteGate, envelope: RemoteEnvelope, ctx: RemoteContext): RemoteRoute {
  const gate = pruneRemoteGate(input, ctx.now);
  const payload = envelope.payload;

  if (envelope.type === "pair") {
    const pairing = gate.pairing;
    if (!pairing) return deny(gate, "expired", "Pairing is closed or expired. Show a new QR code on the desk.");
    let valid = false;
    let nextPairing: RemotePairing | null = pairing;
    if (payload.pair) {
      valid = pairing.token !== "" && payload.pair === pairing.token;
      // The QR token is single-use; the typed code stays open until it expires.
      if (valid) nextPairing = { ...pairing, token: "" };
    } else if (payload.code) {
      valid = payload.code.trim() === pairing.code;
      if (!valid) {
        const attempts = pairing.attempts + 1;
        nextPairing = attempts >= REMOTE_CODE_ATTEMPTS ? null : { ...pairing, attempts };
      }
    }
    if (!valid) {
      const closed = nextPairing === null;
      return deny(
        { ...gate, pairing: nextPairing },
        closed ? "expired" : "denied",
        closed ? "Too many wrong codes. Show a new code on the desk." : "That pairing code does not match.",
      );
    }
    const request: RemotePending = {
      id: ctx.newId(),
      name: deviceName(payload.name),
      secret: ctx.newSecret(),
      at: ctx.now,
      status: "waiting",
    };
    return {
      gate: { ...gate, pairing: nextPairing, pending: [...gate.pending, request] },
      reply: remoteEnvelope("pending", { request: request.id, secret: request.secret }),
      action: null,
      device: null,
    };
  }

  if (envelope.type === "pair-status") {
    const request = gate.pending.find((entry) => entry.id === payload.request && entry.secret === payload.secret);
    if (!request) return deny(gate, "expired", "That pairing request expired. Scan the QR code again.");
    if (request.status === "waiting") {
      return { gate, reply: remoteEnvelope("pending", { request: request.id, secret: request.secret }), action: null, device: null };
    }
    const rest = gate.pending.filter((entry) => entry !== request);
    if (request.status === "declined" || !request.token) {
      return deny({ ...gate, pending: rest }, "unauthorized", "The desk declined this phone.");
    }
    return {
      gate: { ...gate, pending: rest },
      reply: remoteEnvelope("welcome", { token: request.token }),
      action: null,
      device: null,
    };
  }

  const device = ctx.tokenHash ? gate.devices.find((entry) => entry.tokenHash === ctx.tokenHash) : undefined;
  if (!device) return deny(gate, "unauthorized", "This phone is not paired, or the desk removed it. Pair again.");
  // A controller key that has run out: refused, with the reason, until a new key replaces it.
  if (device.controller && device.expiresAt <= ctx.now) return deny(gate, "expired", "This controller key has expired. Make a new key in Settings › Phone remote.");
  const seen: RemoteDevice = { ...device, lastSeen: ctx.now, expiresAt: device.controller || device.viewer || device.captions ? device.expiresAt : ctx.now + REMOTE_SESSION_MS };
  const next = { ...gate, devices: gate.devices.map((entry) => (entry.id === device.id ? seen : entry)) };
  const ok = (action: RemoteAction, type = "state"): RemoteRoute => ({
    gate: next,
    reply: remoteEnvelope(type, {}),
    action,
    device: seen,
  });

  // A stage link reads the stage and nothing else.
  if (device.viewer && envelope.type !== "stage") return deny(next, "denied", "This stage link only shows the stage.");
  if (device.captions && envelope.type !== "captions") return deny(next, "denied", "This link only shows captions.");
  if (envelope.type === "captions" && !device.captions) return deny(next, "denied", "Captions need a captions link.");

  switch (envelope.type) {
    case "stage":
      return ok({ kind: "stage" }, "stage");
    case "captions":
      return ok({ kind: "captions" }, "captions");
    case "state":
      return ok({ kind: "state" });
    case "command":
      if (!payload.id || !isRemoteCommand(payload.id)) return deny(next, "denied", "Unknown command.");
      // Checked here on the desk, whatever buttons the phone showed.
      if (!remoteAllows(device, payload.id)) return deny(next, "denied", "This phone can move Preview only. The desk decides what goes live.");
      return ok({ kind: "command", id: payload.id });
    case "preview-item":
      if (!payload.itemId) return deny(next, "denied", "No service item was chosen.");
      return ok({ kind: "preview-item", itemId: payload.itemId });
    case "preview-scene":
      if (!payload.sceneId) return deny(next, "denied", "No scene was chosen.");
      return ok({ kind: "preview-scene", sceneId: payload.sceneId });
    default:
      return deny(next, "denied", "Unknown remote message.");
  }
}

export function remoteAccess(device: Pick<RemoteDevice, "access">): RemoteAccess {
  return device.access === "preview" ? "preview" : "full";
}

/** Whether this device may send this command. Preview-only devices move Preview and nothing else. */
export function remoteAllows(device: Pick<RemoteDevice, "access">, command: RemoteCommandId): boolean {
  return remoteAccess(device) === "full" || REMOTE_PREVIEW_COMMANDS.includes(command);
}

/** The commands this device may send, so the phone shows only those buttons. */
export function allowedCommands(device: Pick<RemoteDevice, "access">): RemoteCommandId[] {
  return REMOTE_COMMANDS.filter((command) => remoteAllows(device, command));
}

/** Change what a paired device may do; the operator can do this at any time. */
export function setDeviceAccess(gate: RemoteGate, deviceId: string, access: RemoteAccess): RemoteGate {
  return {
    ...gate,
    devices: gate.devices.map((device) => {
      if (device.id !== deviceId) return device;
      const { access: _old, ...rest } = device;
      return access === "preview" ? { ...rest, access: "preview" } : rest;
    }),
  };
}

/** Operator approval: the device is stored by token hash; the token itself is handed out once. */
export function approvePending(gate: RemoteGate, requestId: string, token: string, tokenHash: string, now: number, access: RemoteAccess = "full"): RemoteGate {
  const request = gate.pending.find((entry) => entry.id === requestId && entry.status === "waiting");
  if (!request) return gate;
  const device: RemoteDevice = { id: request.id, name: request.name, tokenHash, pairedAt: now, lastSeen: now, expiresAt: now + REMOTE_SESSION_MS, ...(access === "preview" ? { access: "preview" as const } : {}) };
  return {
    ...gate,
    pending: gate.pending.map((entry) => (entry === request ? { ...entry, status: "approved", token } : entry)),
    devices: [...gate.devices, device],
  };
}

export function declinePending(gate: RemoteGate, requestId: string): RemoteGate {
  return {
    ...gate,
    pending: gate.pending.map((entry) => (entry.id === requestId && entry.status === "waiting" ? { ...entry, status: "declined" } : entry)),
  };
}

export function revokeDevice(gate: RemoteGate, deviceId: string): RemoteGate {
  return { ...gate, devices: gate.devices.filter((device) => device.id !== deviceId) };
}

export function sanitizeRemoteDevices(value: unknown): RemoteDevice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Partial<RemoteDevice>;
    if (typeof record.id !== "string" || typeof record.tokenHash !== "string" || !/^[0-9a-f]{64}$/.test(record.tokenHash)) return [];
    const number = (input: unknown) => (typeof input === "number" && Number.isFinite(input) ? input : 0);
    return [
      {
        id: record.id,
        name: deviceName(record.name),
        tokenHash: record.tokenHash,
        pairedAt: number(record.pairedAt),
        lastSeen: number(record.lastSeen),
        expiresAt: number(record.expiresAt),
        ...(record.controller === true ? { controller: true } : {}),
        ...(record.viewer === true ? { viewer: true } : {}),
        ...(record.captions === true ? { captions: true } : {}),
        ...(record.access === "preview" ? { access: "preview" as const } : {}),
      },
    ];
  });
}

export function programCue(model: Pick<PresentationModel, "layout" | "reference" | "lines">): string {
  if (model.layout === "black") return "Black";
  if (model.layout === "empty") return "Clear";
  if (model.layout === "logo") return model.lines[0]?.text.trim() || "Logo";
  return (model.reference ?? model.lines[0]?.text ?? "").trim();
}

export function framePayload(
  prefix: "program" | "preview",
  model: Pick<PresentationModel, "layout" | "reference" | "attribution" | "lines">,
): Record<string, string> {
  return {
    [`${prefix}Cue`]: programCue(model),
    [`${prefix}Layout`]: model.layout,
    [`${prefix}Body`]: model.lines
      .map((line) => (line.marker ? `${line.marker} ${line.text}` : line.text).trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, 600),
  };
}

/** A controller key: stored by hash like a phone; it lasts `days` (0: never expires). The token is shown once. */
export function controllerDevice(id: string, name: string, tokenHash: string, now: number, days = 0): RemoteDevice {
  return { id, name: deviceName(name) || "Controller", tokenHash, pairedAt: now, lastSeen: 0, expiresAt: controllerExpiry(now, days), controller: true };
}

/** When a key made now for `days` stops working: never, for 0 or a choice not on the list. */
export function controllerExpiry(now: number, days: number): number {
  return days > 0 && (CONTROLLER_EXPIRY_DAYS as readonly number[]).includes(days) ? now + days * DAY_MS : Number.MAX_SAFE_INTEGER;
}

/** Whether a key ever expires (keys made before expiry existed never do). */
export function controllerExpires(device: Pick<RemoteDevice, "expiresAt">): boolean {
  return device.expiresAt < Number.MAX_SAFE_INTEGER;
}

/** One phone's or key's allowance of presses: tokens left, and when it was last topped up. */
export type RemoteBudget = { tokens: number; at: number };

/**
 * Spend one press from a budget (a token bucket); `ok` false means drop the press. A budget starts
 * full, so a burst of REMOTE_BURST goes through at once, then REMOTE_PER_SECOND keep coming.
 */
export function spendRemoteBudget(budget: RemoteBudget | undefined, now: number, burst = REMOTE_BURST, perSecond = REMOTE_PER_SECOND): { budget: RemoteBudget; ok: boolean } {
  const start = budget ?? { tokens: burst, at: now };
  const tokens = Math.min(burst, start.tokens + (Math.max(0, now - start.at) / 1000) * perSecond);
  if (tokens < 1) return { budget: { tokens, at: now }, ok: false };
  return { budget: { tokens: tokens - 1, at: now }, ok: true };
}

/** A stage link for a phone or tablet: read-only, stored by hash, never expires. The token is shown once. */
export function stageDevice(id: string, name: string, tokenHash: string, now: number): RemoteDevice {
  return { id, name: deviceName(name) || "Stage", tokenHash, pairedAt: now, lastSeen: 0, expiresAt: Number.MAX_SAFE_INTEGER, viewer: true };
}

/** The captions link for congregants' phones: read-only, stored by hash, never expires. */
export function captionsDevice(id: string, tokenHash: string, now: number): RemoteDevice {
  return { id, name: "Captions", tokenHash, pairedAt: now, lastSeen: 0, expiresAt: Number.MAX_SAFE_INTEGER, captions: true };
}

/** A one-click link for a controller button: GET /v1/command/<id>?token=… */
export function commandUrl(base: string, command: RemoteCommandId, token: string): string {
  const url = new URL(`/v1/command/${command}`, base);
  url.searchParams.set("token", token);
  return url.toString();
}
