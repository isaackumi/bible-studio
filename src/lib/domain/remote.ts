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

export const REMOTE_COMMANDS = ["take", "cut", "next", "previous", "clear", "black", "logo", "timer-pause", "timer-resume", "timer-reset"] as const;
export type RemoteCommandId = (typeof REMOTE_COMMANDS)[number];
/** These change Program. Next/Previous only move Preview. */
export const REMOTE_LIVE_COMMANDS: readonly RemoteCommandId[] = ["take", "cut", "clear", "black", "logo", "timer-pause", "timer-resume", "timer-reset"];

export type RemotePairing = { code: string; token: string; expiresAt: number; attempts: number };

export type RemoteDevice = {
  id: string;
  name: string;
  tokenHash: string;
  pairedAt: number;
  lastSeen: number;
  expiresAt: number;
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
  | { kind: "preview-scene"; sceneId: string };

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
    devices: gate.devices.filter((device) => device.expiresAt > now),
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
  const seen: RemoteDevice = { ...device, lastSeen: ctx.now, expiresAt: ctx.now + REMOTE_SESSION_MS };
  const next = { ...gate, devices: gate.devices.map((entry) => (entry.id === device.id ? seen : entry)) };
  const ok = (action: RemoteAction, type = "state"): RemoteRoute => ({
    gate: next,
    reply: remoteEnvelope(type, {}),
    action,
    device: seen,
  });

  switch (envelope.type) {
    case "state":
      return ok({ kind: "state" });
    case "command":
      if (!payload.id || !isRemoteCommand(payload.id)) return deny(next, "denied", "Unknown command.");
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

/** Operator approval: the device is stored by token hash; the token itself is handed out once. */
export function approvePending(gate: RemoteGate, requestId: string, token: string, tokenHash: string, now: number): RemoteGate {
  const request = gate.pending.find((entry) => entry.id === requestId && entry.status === "waiting");
  if (!request) return gate;
  const device: RemoteDevice = { id: request.id, name: request.name, tokenHash, pairedAt: now, lastSeen: now, expiresAt: now + REMOTE_SESSION_MS };
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
