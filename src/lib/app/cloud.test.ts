import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "../domain/theme";
import type { Song, Theme, Workspace } from "../domain/types";
import { CloudSync, type CloudCommands, type CloudLibrary } from "./cloud.svelte";
import { type Change, type LibraryInput } from "../sync/records";
import type { CloudClaim, CloudMediaItem, CloudProtocol, CloudStatus } from "../sync/protocol";
import type { ServerAnswer } from "../domain/billing";

const T0 = Date.UTC(2026, 9, 24, 10);
const PIC = "0b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
const VID = "1b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
const song = (id: string, title: string) => ({ id, title, author: "", sections: [], updatedAt: "x" }) as unknown as Song;
const ok = <T>(data: T): ServerAnswer<T> => ({ ok: true, status: 200, data });
const no = (status: number, data: Record<string, unknown>, error = "no"): ServerAnswer<never> => ({ ok: false, status, data, offline: false, error });

/** A cloud in memory: records with sequence numbers, media by hash, and a log of every call. */
function fakeCloud(over: Partial<{ status: Partial<CloudStatus>; refuse: ServerAnswer<never> | null; claim: (input: { kind: string }) => Partial<CloudClaim> }> = {}) {
  const records: Change[] = [];
  const media: CloudMediaItem[] = [];
  const log: string[] = [];
  let seq = 0;
  const status: CloudStatus = { licence: "L", plan: "church", usedBytes: 0, limitBytes: 15e9, over: false, binBytes: 0, readOnly: false, wipeAt: null, endsAt: null, syncVideos: true, seq: 0, devices: [], ...over.status };
  const protocol: CloudProtocol = {
    push: async (changes) => {
      log.push(`push ${changes.length}`);
      if (over.refuse) return over.refuse;
      for (const change of changes) records.push({ ...change });
      seq += changes.length;
      return ok({ seq, applied: changes.length, conflicts: [] });
    },
    pull: async (since) => {
      log.push(`pull ${since}`);
      if (over.refuse) return over.refuse;
      const changes = records.slice(since);
      return ok({ seq: records.length, changes, more: false });
    },
    status: async () => ok({ ...status, seq }),
    settings: async (syncVideos) => ok({ syncVideos }),
    claim: async (input) => {
      log.push(`claim ${input.mediaId}`);
      const stored = media.find((item) => item.hash === input.hash);
      const extra = over.claim?.(input) ?? {};
      if (stored) return ok({ upload: false, stored: true, usedBytes: 0, limitBytes: 15e9, ...extra });
      return ok({ upload: true, stored: false, usedBytes: 0, limitBytes: 15e9, ...extra });
    },
    mediaList: async () => ok({ items: media, usedBytes: 0, binBytes: 0 }),
    removeMedia: async () => ok({ usedBytes: 0 }),
    history: async () => ok({ versions: [] }),
    bin: async () => ok({ items: [] }),
    restore: async () => ok({ seq }),
    emptyBin: async () => ok({ removed: 0 }),
    mediaUrl: (hash) => `cloud://${hash}`,
  };
  const seed = (change: Change) => void (records.push(change), (seq += 1));
  const seedMedia = (item: CloudMediaItem) => void media.push(item);
  return { protocol, log, records, media, seed, seedMedia };
}

/** This computer: its library, what it has in Media, and what the Rust side did. */
function fakeComputer(start: { songs?: Song[]; workspace?: Workspace; media?: Array<{ id: string; kind: string }> } = {}) {
  let songs = start.songs ?? [];
  let themes: Theme[] = [];
  let workspace = start.workspace ?? defaultWorkspace();
  const media = new Map((start.media ?? []).map((item) => [item.id, item]));
  const did: string[] = [];
  let state = "";
  const library: CloudLibrary = {
    collect: async (): Promise<LibraryInput> => ({ songs, services: [], sermons: [], themes, workspace }),
    apply: {
      song: async (doc, id) => {
        songs = doc ? [...songs.filter((entry) => entry.id !== id), doc] : songs.filter((entry) => entry.id !== id);
        did.push(`song ${id} ${doc ? "saved" : "deleted"}`);
      },
      service: async () => {},
      sermon: async () => {},
      theme: async (doc, id) => void (themes = doc ? [...themes.filter((entry) => entry.id !== id), doc] : themes.filter((entry) => entry.id !== id)),
      workspace: (patch) => void (workspace = patch(workspace)),
    },
    mediaIds: async () => new Set(media.keys()),
  };
  const commands: CloudCommands = {
    hash: async (id) => {
      const item = media.get(id);
      if (!item) throw new Error("not here");
      return { hash: `hash-${id}`, bytes: 100, name: `${id}.${item.kind === "video" ? "mp4" : "png"}`, kind: item.kind, ext: item.kind === "video" ? "mp4" : "png" };
    },
    upload: async (id, url) => void did.push(`upload ${id} ${url}`),
    download: async (url, row) => {
      media.set(row.id, { id: row.id, kind: row.kind });
      did.push(`download ${row.id} ${url}`);
    },
    readState: async () => state,
    writeState: async (text) => void (state = text),
  };
  return { library, commands, did, songs: () => songs, workspace: () => workspace, media };
}

function make(cloud: ReturnType<typeof fakeCloud>, computer: ReturnType<typeof fakeComputer>, gate: () => "ok" | "free" | "signedOut" | "off" = () => "ok", now = () => T0) {
  return new CloudSync({ protocol: cloud.protocol, commands: computer.commands, library: computer.library, gate, now, name: () => "Test PC" });
}

describe("cloud sync on this computer", () => {
  it("pushes before it pulls, and brings the other computer's records in", async () => {
    const cloud = fakeCloud();
    cloud.seed({ col: "song", id: "theirs", at: T0 - 1000, doc: song("theirs", "From the office") });
    const computer = fakeComputer({ songs: [song("mine", "From here")] });
    const sync = make(cloud, computer);
    await sync.syncNow();
    const moves = cloud.log.filter((line) => line.startsWith("push") || line.startsWith("pull"));
    // Everything here (the song, the samples every install has, the settings) goes up first; then
    // the pull starts from the beginning, so the office's earlier record is not skipped.
    expect(moves).toHaveLength(2);
    expect(moves[0]).toMatch(/^push \d+$/);
    expect(moves[1]).toBe("pull 0");
    expect(cloud.records.map((change) => change.id)).toContain("mine");
    expect(computer.songs().map((entry) => entry.title).sort()).toEqual(["From here", "From the office"]);
    // Nothing comes back as our own edit, and a second run has nothing to push.
    expect(computer.did.filter((line) => line.startsWith("song mine"))).toEqual([]);
    await sync.syncNow();
    expect(cloud.log.filter((line) => line.startsWith("push")).length).toBe(1);
    expect(sync.status).toBe("idle");
    expect(sync.lastSyncAt).toBe(T0);
  });

  it("downloads media the pulled records need, and uploads what this computer's records use", async () => {
    const cloud = fakeCloud();
    cloud.seed({ col: "theme", id: "t", at: T0 - 1000, doc: { id: "t", background: { type: "image", assetId: PIC } } });
    cloud.seedMedia({ hash: "hash-pic", mediaId: PIC, name: "welcome.png", kind: "image", bytes: 100, usedIn: 1, lastUsedAt: null, storedAt: T0 - 1000 });
    const workspace = { ...defaultWorkspace(), logoAssetId: VID.replace("1b", "2b") };
    const logo = VID.replace("1b", "2b");
    const computer = fakeComputer({ workspace, media: [{ id: logo, kind: "image" }] });
    const sync = make(cloud, computer);
    await sync.syncNow();
    expect(computer.did).toContain(`download ${PIC} cloud://hash-pic`);
    expect(computer.did).toContain(`upload ${logo} cloud://hash-${logo}`);
    expect(computer.media.has(PIC)).toBe(true);
    // Next time: the picture is here and the logo is in the cloud, so neither moves again.
    computer.did.length = 0;
    cloud.seedMedia({ hash: `hash-${logo}`, mediaId: logo, name: "logo.png", kind: "image", bytes: 100, usedIn: 1, lastUsedAt: null, storedAt: T0 });
    await sync.syncNow();
    expect(computer.did.filter((line) => line.startsWith("upload") || line.startsWith("download"))).toEqual([]);
  });

  it("keeps syncing records when media is refused, and says which files stayed here", async () => {
    const cloud = fakeCloud({ claim: () => ({ upload: false, full: true }) });
    const workspace = { ...defaultWorkspace(), logoAssetId: PIC };
    const computer = fakeComputer({ songs: [song("s", "Song")], workspace, media: [{ id: PIC, kind: "image" }] });
    const sync = make(cloud, computer);
    await sync.syncNow();
    expect(cloud.records.map((change) => change.id)).toContain("s");
    expect(computer.did.filter((line) => line.startsWith("upload"))).toEqual([]);
    expect([...sync.onlyHere]).toEqual([PIC]);
    expect(sync.full).toBe(true);
    expect(sync.status).toBe("idle");
  });

  it("stops on noSeat and readOnly answers, and does not try again on the next tick", async () => {
    const cloud = fakeCloud({ refuse: no(403, { noSeat: true }, "This computer is not on the licence.") });
    const computer = fakeComputer({ songs: [song("s", "Song")] });
    const sync = make(cloud, computer);
    await sync.syncNow();
    expect(sync.status).toBe("noSeat");
    expect(sync.message).toBe("This computer is not on the licence.");
    await sync.tick();
    expect(cloud.log.filter((line) => line.startsWith("push"))).toHaveLength(1);
    const ended = fakeCloud({ refuse: no(403, { readOnly: true }, "Premium has ended.") });
    const other = make(ended, fakeComputer({ songs: [song("s", "Song")] }));
    await other.syncNow();
    expect(other.status).toBe("readOnly");
  });

  it("skips videos when the switch is off", async () => {
    const cloud = fakeCloud({ status: { syncVideos: false } });
    const workspace = { ...defaultWorkspace(), decks: [{ id: "d", name: "Deck", updatedAt: "x", pages: [{ background: { assetId: VID } }, { background: { assetId: PIC } }] } as never] };
    const computer = fakeComputer({ workspace, media: [{ id: VID, kind: "video" }, { id: PIC, kind: "image" }] });
    const sync = make(cloud, computer);
    await sync.syncNow();
    expect(computer.did.filter((line) => line.startsWith("upload")).map((line) => line.split(" ")[1])).toEqual([PIC]);
  });

  it("does nothing on Free or signed out, and says so", async () => {
    const cloud = fakeCloud();
    const free = make(cloud, fakeComputer({ songs: [song("s", "Song")] }), () => "free");
    await free.syncNow();
    expect(free.status).toBe("free");
    const out = make(cloud, fakeComputer({ songs: [song("s", "Song")] }), () => "signedOut");
    await out.syncNow();
    expect(out.status).toBe("signedOut");
    expect(cloud.log).toEqual([]);
  });

  it("says when an empty computer got its library back, once", async () => {
    const cloud = fakeCloud();
    cloud.seed({ col: "song", id: "s1", at: T0 - 1000, doc: song("s1", "Back") });
    cloud.seed({ col: "song", id: "s2", at: T0 - 900, doc: song("s2", "Again") });
    const computer = fakeComputer();
    const said: number[] = [];
    const sync = new CloudSync({ protocol: cloud.protocol, commands: computer.commands, library: computer.library, gate: () => "ok", now: () => T0, name: () => "New PC", onRestored: (count) => void said.push(count) });
    await sync.syncNow();
    expect(said).toEqual([2]);
    cloud.seed({ col: "song", id: "s3", at: T0, doc: song("s3", "Later") });
    await sync.syncNow();
    expect(said).toEqual([2]);
    // A computer with songs of its own is not "restored", it is joined.
    const other = fakeComputer({ songs: [song("mine", "Mine")] });
    const told: number[] = [];
    await new CloudSync({ protocol: fakeCloud().protocol, commands: other.commands, library: other.library, gate: () => "ok", now: () => T0, name: () => "PC", onRestored: (count) => void told.push(count) }).syncNow();
    expect(told).toEqual([]);
  });

  it("remembers where it got to between runs", async () => {
    const cloud = fakeCloud();
    const computer = fakeComputer({ songs: [song("s", "Song")] });
    await make(cloud, computer).syncNow();
    // A fresh engine on the same computer reads the saved record: nothing to push, nothing new to pull.
    const again = make(cloud, computer);
    await again.syncNow();
    expect(cloud.log.filter((line) => line.startsWith("push"))).toHaveLength(1);
    expect(cloud.log.at(-1)).toMatch(/^pull [1-9]/);
  });
});
