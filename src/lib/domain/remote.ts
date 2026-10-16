import type { CommandId } from "../commands/registry";
import type { PresentationModel } from "./types";

export const REMOTE_COMMANDS = ["take", "next", "previous", "clear", "black", "logo"] as const;
export type RemoteCommandId = (typeof REMOTE_COMMANDS)[number];

export const REMOTE_PROTOCOL = 1;
export const REMOTE_PAIR_MS = 10 * 60 * 1000;
export const REMOTE_LAN_PORT = 17891;

export type RemoteGate = {
  pairing: RemotePairing | null;
  tokens: string[];
};

export type RemoteRoute = {
  session: RemoteGate;
  reply: RemoteEnvelope;
  command: CommandId | null;
};

export function lanRemoteUrl(host: string, port = REMOTE_LAN_PORT) {
  return `http://${host}:${port}/`;
}

export function isLanRemoteOrigin(href: string, port = REMOTE_LAN_PORT) {
  try {
    return new URL(href).port === String(port);
  } catch {
    return false;
  }
}

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
  token: () => string = () => crypto.randomUUID(),
): { ok: true; token: string } | { ok: false; reason: string } {
  if (!pairing) return { ok: false, reason: "Pairing is not open." };
  if (now > pairing.expiresAt) return { ok: false, reason: "That code expired." };
  if (code.trim() !== pairing.code) return { ok: false, reason: "That code does not match." };
  return { ok: true, token: token() };
}

export function isRemoteCommand(id: string): id is RemoteCommandId {
  return (REMOTE_COMMANDS as readonly string[]).includes(id);
}

/** Phone next/previous are clicker keys: they advance, then Take. Desk arrows stay on Preview. */
export function isRemoteClicker(id: string): boolean {
  return id === "next" || id === "previous";
}

export function programCue(model: Pick<PresentationModel, "layout" | "reference" | "lines">): string {
  if (model.layout === "black") return "Black";
  if (model.layout === "empty") return "Clear";
  if (model.layout === "logo") return model.lines[0]?.text.trim() || "Logo";
  return (model.reference ?? model.lines[0]?.text ?? "").trim();
}

export function programPadPayload(
  model: Pick<PresentationModel, "layout" | "reference" | "attribution" | "lines">,
): Record<string, string> {
  return {
    cue: programCue(model),
    layout: model.layout,
    body: model.lines
      .map((line) => (line.marker ? `${line.marker} ${line.text}` : line.text).trim())
      .filter(Boolean)
      .join("\n"),
    attribution: model.attribution?.trim() ?? "",
  };
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

export function routeRemote(
  session: RemoteGate,
  envelope: RemoteEnvelope,
  now = Date.now(),
  token: () => string = () => crypto.randomUUID(),
): RemoteRoute {
  if (envelope.type === "pair") {
    const result = pairRemote(session.pairing, envelope.payload.code ?? "", now, token);
    if (!result.ok) return { session, reply: remoteEnvelope("denied", { reason: result.reason }), command: null };
    return {
      session: { ...session, tokens: [result.token, ...session.tokens.filter((entry) => entry !== result.token)] },
      reply: remoteEnvelope("welcome", { token: result.token }),
      command: null,
    };
  }
  if (envelope.type !== "command") {
    return { session, reply: remoteEnvelope("denied", { reason: "Unknown remote message." }), command: null };
  }
  const command = authorizeRemoteCommand(session.tokens, envelope.payload.token ?? "", envelope.payload.id ?? "");
  if (!command) {
    return { session, reply: remoteEnvelope("denied", { reason: "That remote is not paired." }), command: null };
  }
  return { session, reply: remoteEnvelope("ack", { id: command }), command };
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
