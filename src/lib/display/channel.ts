import type { PresentationModel, ProgramPacket } from "../domain/types";

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

/**
 * BroadcastChannel can drop a message posted just before the sender closes it, so the
 * `storage` event on the same key is the reliable path. Duplicates are fine: revisions gate them.
 */
export function subscribeLocal(onFrame: (packet: ProgramPacket) => void) {
  const channel = new BroadcastChannel(NAME);
  channel.onmessage = (event) => {
    if (event.data?.frame) onFrame(event.data as ProgramPacket);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    const packet = readPacket(localStorage);
    if (packet) onFrame(packet);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    channel.close();
    window.removeEventListener("storage", onStorage);
  };
}

const STANDBY_KEY = "church-studio.camera-standby";

/** Camera source ids the audience may open ahead of TAKE. Never rendered until Program uses them. */
export function parseStandby(raw: string | null): string[] {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && id.startsWith("camera:")) : [];
  } catch {
    return [];
  }
}

export function publishStandbyLocal(ids: string[]) {
  localStorage.setItem(STANDBY_KEY, JSON.stringify(ids));
  const channel = new BroadcastChannel(STANDBY_KEY);
  channel.postMessage(ids);
  channel.close();
}

export function readStandbyLocal(): string[] {
  return parseStandby(localStorage.getItem(STANDBY_KEY));
}

export function subscribeStandbyLocal(onStandby: (ids: string[]) => void) {
  const channel = new BroadcastChannel(STANDBY_KEY);
  channel.onmessage = (event) => onStandby(parseStandby(JSON.stringify(event.data)));
  const onStorage = (event: StorageEvent) => {
    if (event.key === STANDBY_KEY) onStandby(parseStandby(event.newValue));
  };
  window.addEventListener("storage", onStorage);
  return () => {
    channel.close();
    window.removeEventListener("storage", onStorage);
  };
}

const STAGE_KEY = "church-studio.stage";

/** What the stage (confidence) display shows: Program now, Preview as next. Never sent to the audience. */
export type StageSnapshot = {
  program: PresentationModel;
  next: PresentationModel;
  live: boolean;
  desk: string;
  at: number;
};

export function parseStage(raw: string | null): StageSnapshot | null {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<StageSnapshot>) : null;
    if (!value?.program?.layout || !value.next?.layout || typeof value.at !== "number") return null;
    return { program: value.program, next: value.next, live: value.live === true, desk: String(value.desk ?? ""), at: value.at };
  } catch {
    return null;
  }
}

export function publishStageLocal(snapshot: StageSnapshot) {
  localStorage.setItem(STAGE_KEY, JSON.stringify(snapshot));
}

export function readStageLocal(): StageSnapshot | null {
  return parseStage(localStorage.getItem(STAGE_KEY));
}

export function subscribeStageLocal(onStage: (snapshot: StageSnapshot) => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STAGE_KEY) return;
    const snapshot = parseStage(event.newValue);
    if (snapshot) onStage(snapshot);
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
