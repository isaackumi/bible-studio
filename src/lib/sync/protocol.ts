// The cloud's routes as the app calls them (server/cloud.ts), typed, over serverCall. Every call
// names the account (token) and this computer (device); the server picks the licence.

import { SERVER_URL, serverCall, type ServerAnswer } from "../domain/billing";
import type { Change } from "./records";

export type CloudStatus = { licence: string; plan: "premium" | "church"; usedBytes: number; limitBytes: number; over: boolean; binBytes: number; readOnly: boolean; wipeAt: number | null; endsAt: number | null; syncVideos: boolean; seq: number; devices: Array<{ device: string; name: string; lastSyncAt: number }> };
export type CloudClaim = { upload: boolean; stored: boolean; full?: boolean; tooLarge?: boolean; paused?: boolean; usedBytes: number; limitBytes: number };
export type CloudMediaItem = { hash: string; mediaId: string; aliases?: string[]; name: string; kind: string; bytes: number; usedIn: number; lastUsedAt: number | null; storedAt: number };
export type CloudBinItem = { col: string; id: string; deletedAt: number; name: string };
export type CloudVersion = { at: number; device: string; doc: unknown };

export type CloudProtocol = {
  push(changes: Change[]): Promise<ServerAnswer<{ seq: number; applied: number; conflicts: Array<{ col: string; id: string; keptAt: number }> }>>;
  pull(since: number): Promise<ServerAnswer<{ seq: number; changes: Change[]; more: boolean }>>;
  status(): Promise<ServerAnswer<CloudStatus>>;
  settings(syncVideos: boolean): Promise<ServerAnswer<{ syncVideos: boolean }>>;
  claim(input: { hash: string; bytes: number; name: string; kind: string; mediaId: string }): Promise<ServerAnswer<CloudClaim>>;
  mediaList(): Promise<ServerAnswer<{ items: CloudMediaItem[]; usedBytes: number; binBytes: number }>>;
  removeMedia(hash: string, everywhere: boolean): Promise<ServerAnswer<{ usedBytes: number }>>;
  history(col: string, id: string): Promise<ServerAnswer<{ versions: CloudVersion[] }>>;
  bin(): Promise<ServerAnswer<{ items: CloudBinItem[] }>>;
  restore(col: string, id: string): Promise<ServerAnswer<{ seq: number }>>;
  emptyBin(): Promise<ServerAnswer<{ removed: number }>>;
  /** The address a file is sent to and fetched from (the Rust commands carry the token in a header). */
  mediaUrl(hash: string): string;
};

export type Identity = { token: string; device: string; name: string };

export function cloudProtocol(identity: () => Identity, base = SERVER_URL, call: typeof serverCall = serverCall): CloudProtocol {
  const post = <T>(route: string, body: Record<string, unknown> = {}) => call<T>(`/v1/cloud/${route}`, { ...identity(), ...body }, base);
  return {
    push: (changes) => post("push", { changes }),
    pull: (since) => post("pull", { since }),
    status: () => post("status"),
    settings: (syncVideos) => post("settings", { syncVideos }),
    claim: (input) => post("media/claim", input),
    mediaList: () => post("media/list"),
    removeMedia: (hash, everywhere) => post("media/remove", { hash, everywhere }),
    history: (col, id) => post("history", { col, id }),
    bin: () => post("bin"),
    restore: (col, id) => post("bin/restore", { col, id }),
    emptyBin: () => post("bin/empty"),
    mediaUrl: (hash) => `${base}/v1/cloud/media/${hash}`,
  };
}
