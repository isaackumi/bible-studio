import type { ProgramPacket } from "../domain/types";

const KEY = "church-studio.program";
const OWNER_KEY = "church-studio.output-owner";
const NAME = "church-studio.program";

export type PacketStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type OutputOwner = {
  sessionId: string;
  generation: number;
};

export function readOwner(store: PacketStore): OutputOwner | null {
  try {
    const raw = store.getItem(OWNER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OutputOwner>;
    if (typeof parsed.sessionId !== "string" || !parsed.sessionId) return null;
    if (typeof parsed.generation !== "number" || !Number.isFinite(parsed.generation)) return null;
    return { sessionId: parsed.sessionId, generation: parsed.generation };
  } catch {
    return null;
  }
}

/** The same session keeps its generation. A different session only advances it through this call. */
export function claimOwner(store: PacketStore, sessionId: string): OutputOwner {
  const current = readOwner(store);
  if (current?.sessionId === sessionId) return current;
  const next = { sessionId, generation: (current?.generation ?? 0) + 1 };
  store.setItem(OWNER_KEY, JSON.stringify(next));
  return next;
}

export function controlsOutput(owner: OutputOwner | null, sessionId: string): boolean {
  return owner?.sessionId === sessionId;
}

/**
 * The current owner may publish. Revision 0 from that owner is a startup clear.
 * Another session's packet is ignored until claimOwner advances the generation.
 */
export function acceptProgramPacket(current: ProgramPacket | null, next: ProgramPacket | null, owner: OutputOwner | null): boolean {
  if (!next?.frame?.model || !owner) return false;
  if (next.sessionId !== owner.sessionId || next.generation !== owner.generation) return false;
  if (!current?.frame?.model) return true;
  if (current.sessionId !== owner.sessionId || current.generation !== owner.generation) return true;
  if (next.revision === 0) return true;
  return next.revision >= current.revision;
}

export function readPacket(store: PacketStore): ProgramPacket | null {
  try {
    const raw = store.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProgramPacket) : null;
  } catch {
    return null;
  }
}

/** Returns false when the packet is older than the one already stored. */
export function publishTo(store: PacketStore, packet: ProgramPacket): boolean {
  const current = readPacket(store);
  if (!acceptProgramPacket(current, packet, readOwner(store))) return false;
  store.setItem(KEY, JSON.stringify(packet));
  return true;
}

export function publishLocal(packet: ProgramPacket): boolean {
  if (!publishTo(localStorage, packet)) return false;
  const channel = new BroadcastChannel(NAME);
  channel.postMessage(packet);
  channel.close();
  return true;
}

export function readLocal(): ProgramPacket | null {
  return readPacket(localStorage);
}

export function subscribeLocal(onFrame: (packet: ProgramPacket) => void) {
  const channel = new BroadcastChannel(NAME);
  channel.onmessage = (event) => {
    if (event.data?.frame) onFrame(event.data as ProgramPacket);
  };
  return () => channel.close();
}
