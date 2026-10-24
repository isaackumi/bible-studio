import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "../domain/theme";
import type { Service, Sermon, Song, Theme, Workspace } from "../domain/types";
import { acceptChanges, applyChanges, collectRecords, diffRecords, emptyManifest, hashDoc, mediaIdsIn, type Apply, type LibraryInput } from "./records";

const T0 = Date.UTC(2026, 9, 24, 10);
const UUID = "0b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
const song = (id: string, title: string) => ({ id, title, author: "", sections: [], updatedAt: "x" }) as unknown as Song;

function input(over: Partial<LibraryInput> = {}): LibraryInput {
  return { songs: [song("s1", "Amazing Grace")], services: [] as Service[], sermons: [] as Sermon[], themes: [] as Theme[], workspace: defaultWorkspace(), ...over };
}

/** The manifest after the cloud accepted everything in `library`. */
function syncedFor(library: LibraryInput, at = T0) {
  const first = diffRecords(collectRecords(library), emptyManifest(), at);
  return acceptChanges(first.manifest, first.changes);
}

const quiet: Apply = { song: async () => {}, service: async () => {}, sermon: async () => {}, theme: async () => {}, workspace: () => {} };

describe("records in and out of the library", () => {
  it("collects every synced collection and the settings record, never a secret", () => {
    const workspace: Workspace = { ...defaultWorkspace(), churchName: "Grace", games: [{ id: "g1" } as never], decks: [{ id: "d1", name: "Deck", updatedAt: "x", pages: [] } as never], macros: [{ id: "m1", name: "Start", steps: [] }] };
    workspace.pco = { appId: "a", secret: "S1" };
    workspace.ai = { ...workspace.ai, key: "S2" };
    workspace.onlineBibles = { ...workspace.onlineBibles, key: "S3" };
    workspace.voice = { ...workspace.voice, speechKeys: { deepgram: "S4" }, words: [{ heard: "some", means: "Psalm", source: "yours" }] };
    workspace.broadcast = { ...workspace.broadcast, key: "S5" };
    const records = collectRecords(input({ workspace }));
    const keys = records.map((record) => `${record.col}/${record.id}`);
    expect(keys).toEqual(expect.arrayContaining(["song/s1", "game/g1", "deck/d1", "macro/m1", "settings/church"]));
    const settings = records.find((record) => record.col === "settings")!.doc as { churchName: string; voiceWords: unknown[] };
    expect(settings.churchName).toBe("Grace");
    expect(settings.voiceWords).toHaveLength(1);
    const text = JSON.stringify(records);
    for (const secret of ["S1", "S2", "S3", "S4", "S5"]) expect(text).not.toContain(secret);
    expect(text).not.toContain("displayProfiles");
  });

  it("hashes stably whatever the key order", () => {
    expect(hashDoc({ a: 1, b: [1, { c: 2 }] })).toBe(hashDoc({ b: [1, { c: 2 }], a: 1 }));
    expect(hashDoc({ a: 1 })).not.toBe(hashDoc({ a: 2 }));
    expect(hashDoc({ a: 1 })).toMatch(/^[0-9a-f]{16}$/);
  });

  it("diff finds new, changed, unchanged and deleted", () => {
    const first = diffRecords(collectRecords(input()), emptyManifest(), T0);
    expect(first.changes.map((change) => `${change.col}/${change.id}`)).toEqual(expect.arrayContaining(["song/s1", "settings/church"]));
    expect(first.changes.every((change) => change.at === T0)).toBe(true);
    // Accepted by the server: the manifest now holds them as synced.
    const synced = acceptChanges(first.manifest, first.changes);
    // Accepting a push never moves the pull cursor: only a pull does.
    expect(synced.seq).toBe(0);
    const same = diffRecords(collectRecords(input()), synced, T0 + 1);
    expect(same.changes).toEqual([]);
    const edited = diffRecords(collectRecords(input({ songs: [song("s1", "Amazing Grace (new)")] })), synced, T0 + 2);
    expect(edited.changes).toEqual([{ col: "song", id: "s1", at: T0 + 2, doc: expect.objectContaining({ title: "Amazing Grace (new)" }) }]);
    const gone = diffRecords(collectRecords(input({ songs: [] })), synced, T0 + 3);
    expect(gone.changes).toEqual([{ col: "song", id: "s1", at: T0 + 3, doc: null }]);
  });

  it("a pending change keeps its first time across pushes", () => {
    const synced = syncedFor(input());
    const edited = diffRecords(collectRecords(input({ songs: [song("s1", "v2")] })), synced, T0 + 2);
    // Not accepted yet (offline): asked again later, the same edit carries the same time.
    const again = diffRecords(collectRecords(input({ songs: [song("s1", "v2")] })), edited.manifest, T0 + 50);
    expect(again.changes).toEqual([{ col: "song", id: "s1", at: T0 + 2, doc: expect.objectContaining({ title: "v2" }) }]);
    // A further edit is a new change with a new time.
    const more = diffRecords(collectRecords(input({ songs: [song("s1", "v3")] })), edited.manifest, T0 + 60);
    expect(more.changes[0]!.at).toBe(T0 + 60);
  });

  it("apply writes pulled records and marks them synced", async () => {
    const written: string[] = [];
    let workspace = defaultWorkspace();
    const apply: Apply = {
      ...quiet,
      song: async (doc, id) => void written.push(`song ${id} ${doc ? "save" : "delete"}`),
      workspace: (patch) => void (workspace = patch(workspace)),
    };
    const manifest = await applyChanges(
      [
        { col: "song", id: "s2", at: T0, doc: song("s2", "New here") },
        { col: "song", id: "s3", at: T0, doc: null },
        { col: "game", id: "g9", at: T0, doc: { id: "g9", title: "Quiz" } },
        { col: "settings", id: "church", at: T0, doc: { churchName: "Hope", songFolders: ["Hymns"] } },
      ],
      apply,
      syncedFor(input({ songs: [], workspace })),
    );
    expect(written).toEqual(["song s2 save", "song s3 delete"]);
    expect(workspace.games.map((game) => game.id)).toEqual(["g9"]);
    expect(workspace.churchName).toBe("Hope");
    expect(workspace.songFolders).toEqual(["Hymns"]);
    expect(manifest.hashes["song/s2"]).toEqual({ hash: hashDoc(song("s2", "New here")), at: T0 });
    expect(manifest.hashes["song/s3"]).toBeUndefined();
    // Pushing again now finds nothing to send for what came down.
    const after = diffRecords(collectRecords(input({ songs: [song("s2", "New here")], workspace })), manifest, T0 + 1);
    expect(after.changes.filter((change) => change.col !== "settings")).toEqual([]);
  });

  it("apply skips what this computer already has, so its own pushes do not come back as writes", async () => {
    const written: string[] = [];
    const apply: Apply = { ...quiet, song: async (doc, id) => void written.push(id) };
    const synced = syncedFor(input());
    const own = { col: "song", id: "s1", at: synced.hashes["song/s1"]!.at, doc: song("s1", "Amazing Grace") };
    await applyChanges([own], apply, synced);
    expect(written).toEqual([]);
  });

  it("a conflict keeps local work until the pull replaces it", async () => {
    const synced = syncedFor(input());
    const local = diffRecords(collectRecords(input({ songs: [song("s1", "mine")] })), synced, T0 + 5).manifest;
    expect(local.hashes["song/s1"]!.pending).toBeTruthy();
    const after = await applyChanges([{ col: "song", id: "s1", at: T0 + 9, doc: song("s1", "theirs, newer") }], quiet, local);
    expect(after.hashes["song/s1"]).toEqual({ hash: hashDoc(song("s1", "theirs, newer")), at: T0 + 9 });
  });

  it("a deletion older than a local edit loses", async () => {
    const synced = syncedFor(input());
    const local = diffRecords(collectRecords(input({ songs: [song("s1", "mine")] })), synced, T0 + 5).manifest;
    const deleted: string[] = [];
    const apply: Apply = { ...quiet, song: async (doc, id) => void (doc === null && deleted.push(id)) };
    const after = await applyChanges([{ col: "song", id: "s1", at: T0 + 1, doc: null }], apply, local);
    expect(deleted).toEqual([]);
    expect(after.hashes["song/s1"]!.pending).toBeTruthy();
  });

  it("mediaIdsIn finds assetId, the logo and media paths", () => {
    const other = "0b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6c";
    const logo = "1b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
    const workspace = { ...defaultWorkspace(), logoAssetId: logo };
    const records = collectRecords(input({ workspace, themes: [{ id: "t", background: { type: "image", assetId: other } } as unknown as Theme] }));
    records.push({ col: "deck", id: "d", doc: { pages: [{ url: `http://asset.localhost/C%3A%5Cx%5Cmedia%5C${UUID}.png` }] } });
    expect([...mediaIdsIn(records)].sort()).toEqual([UUID, other, logo].sort());
  });
});
