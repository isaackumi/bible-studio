import type { CommandId } from "../commands/registry";

export const REMOTE_COMMANDS = ["take", "next", "previous", "clear", "black", "logo"] as const;
export type RemoteCommandId = (typeof REMOTE_COMMANDS)[number];

export const REMOTE_PROTOCOL = 1;
export const REMOTE_PAIR_MS = 10 * 60 * 1000;

export type RemotePairing = {
  code: string;
  expiresAt: number;
};

export type RemoteEnvelope = {
  v: number;
  type: string;
  payload: Record<string, string>;
};

export function createPairing(now = Date.now(), digits = () => String(100000 + Math.floor(Math.random() * 900000))): RemotePairing {
  return { code: digits(), expiresAt: now + REMOTE_PAIR_MS };
}

export function pairRemote(
  pairing: RemotePairing | null,
  code: string,
  now = Date.now(),
  token = () => crypto.randomUUID(),
): { ok: true; token: string } | { ok: false; reason: string } {
  if (!pairing) return { ok: false, reason: "Pairing is not open." };
  if (now > pairing.expiresAt) return { ok: false, reason: "That code expired." };
  if (code.trim() !== pairing.code) return { ok: false, reason: "That code does not match." };
  return { ok: true, token: token() };
}

export function isRemoteCommand(id: string): id is RemoteCommandId {
  return (REMOTE_COMMANDS as readonly string[]).includes(id);
}

export function authorizeRemoteCommand(tokens: Iterable<string>, token: string, command: string): CommandId | null {
  const allowed = new Set(tokens);
  if (!token || !allowed.has(token)) return null;
  if (!isRemoteCommand(command)) return null;
  return command;
}

/** Versioned envelope so a later cloud hop (CS-P2-006) can carry the same payload. */
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
