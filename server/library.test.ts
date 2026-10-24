import { describe, expect, it } from "vitest";
import { DOC_BYTES, LibraryCore, memoryLibraryStore, PUSH_CHANGES, type Change } from "./library";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 24, 10);
const song = (id: string, title: string, at: number, doc: unknown = { id, title }): Change => ({ col: "song", id, at, doc });
const GB = 1e9;
const limits = { limitBytes: 5 * GB, maxFileBytes: 2 * GB, paused: false };
const data = <T>(result: { ok: boolean; data?: unknown; error?: string }) => {
  if (!result.ok) throw new Error(result.error);
  return result.data as T;
};

function library() {
  return new LibraryCore(memoryLibraryStore());
}

describe("the library object", () => {
  it("applies new records and hands them back by sequence", async () => {
    const lib = library();
    const pushed = data<{ seq: number; applied: number }>(await lib.push({ device: "a", now: T0, changes: [song("s1", "Amazing Grace", T0), song("s2", "How Great", T0)] }));
    expect(pushed).toMatchObject({ seq: 2, applied: 2 });
    const pulled = data<{ seq: number; changes: Change[]; more: boolean }>(await lib.pull({ since: 0 }));
    expect(pulled.seq).toBe(2);
    expect(pulled.changes.map((change) => change.id)).toEqual(["s1", "s2"]);
    expect(pulled.more).toBe(false);
    expect(data<{ changes: Change[] }>(await lib.pull({ since: 2 })).changes).toEqual([]);
    expect((await lib.push({ device: "a", now: T0, changes: [{ col: "secrets", id: "x", at: T0, doc: {} }] })).ok).toBe(false);
  });

  it("keeps the newest and files the other in history", async () => {
    const lib = library();
    data(await lib.push({ device: "a", now: T0, changes: [song("s1", "Older edit", T0 + 1000)] }));
    const second = data<{ applied: number; conflicts: Array<{ id: string; keptAt: number }> }>(await lib.push({ device: "b", now: T0 + 5000, changes: [song("s1", "Even older", T0)] }));
    expect(second).toMatchObject({ applied: 0, conflicts: [{ id: "s1", keptAt: T0 + 1000 }] });
    data(await lib.push({ device: "b", now: T0 + 6000, changes: [song("s1", "Newest", T0 + 2000)] }));
    const pulled = data<{ changes: Change[] }>(await lib.pull({ since: 0 }));
    expect(pulled.changes).toHaveLength(1);
    expect((pulled.changes[0]!.doc as { title: string }).title).toBe("Newest");
    const history = data<{ versions: Array<{ at: number; device: string; doc: { title: string } }> }>(await lib.history({ col: "song", id: "s1" }));
    // Both the replaced version and the edit that lost are there to get back, newest first.
    expect(history.versions.map((version) => version.doc.title)).toEqual(["Older edit", "Even older"]);
    expect(history.versions.map((version) => version.device)).toEqual(["a", "b"]);
    // History ages out after 30 days.
    await lib.ageOut(T0 + 31 * DAY);
    expect(data<{ versions: unknown[] }>(await lib.history({ col: "song", id: "s1" })).versions).toEqual([]);
  });

  it("a deletion goes to the bin and comes back with restore", async () => {
    const lib = library();
    data(await lib.push({ device: "a", now: T0, changes: [song("s1", "Gone soon", T0)] }));
    data(await lib.push({ device: "a", now: T0 + 1000, changes: [{ col: "song", id: "s1", at: T0 + 1000, doc: null }] }));
    expect(data<{ changes: Change[] }>(await lib.pull({ since: 1 })).changes).toEqual([{ col: "song", id: "s1", at: T0 + 1000, doc: null }]);
    expect(data<{ items: Array<{ id: string; name: string }> }>(await lib.bin({ now: T0 + 2000 })).items).toMatchObject([{ id: "s1", name: "Gone soon" }]);
    data(await lib.restore({ col: "song", id: "s1", now: T0 + 3000 }));
    const back = data<{ changes: Change[] }>(await lib.pull({ since: 2 })).changes;
    expect(back).toHaveLength(1);
    expect((back[0]!.doc as { title: string }).title).toBe("Gone soon");
    expect(data<{ items: unknown[] }>(await lib.bin({ now: T0 + 3000 })).items).toEqual([]);
    data(await lib.push({ device: "a", now: T0 + 4000, changes: [{ col: "song", id: "s1", at: T0 + 4000, doc: null }] }));
    data(await lib.emptyBin({ now: T0 + 5000 }));
    expect(data<{ items: unknown[] }>(await lib.bin({ now: T0 + 5000 })).items).toEqual([]);
  });

  it("pulls in pages of 500 with more", async () => {
    const lib = library();
    const changes = Array.from({ length: 620 }, (_, n) => song(`s${n}`, `Song ${n}`, T0 + n));
    data(await lib.push({ device: "a", now: T0, changes }));
    const first = data<{ changes: Change[]; more: boolean; seq: number }>(await lib.pull({ since: 0 }));
    expect(first.changes).toHaveLength(500);
    expect(first.more).toBe(true);
    // With more to come, `seq` is where to continue from, not the end of the library.
    expect(first.seq).toBe(500);
    const rest = data<{ changes: Change[]; more: boolean; seq: number }>(await lib.pull({ since: first.seq }));
    expect(rest.changes).toHaveLength(120);
    expect(rest).toMatchObject({ more: false, seq: 620 });
  });

  it("counts a file once however many claims", async () => {
    const lib = library();
    const claim = { hash: "h1", bytes: 1000, name: "welcome.png", kind: "image", mediaId: "m1", device: "a", now: T0, ...limits };
    expect(data(await lib.claimMedia(claim))).toMatchObject({ upload: true, stored: false, usedBytes: 0 });
    expect(data(await lib.claimMedia({ ...claim, device: "b" }))).toMatchObject({ upload: true, stored: false });
    data(await lib.mediaDone({ hash: "h1", bytes: 1000, now: T0 + 10 }));
    expect(data(await lib.claimMedia({ ...claim, now: T0 + 20 }))).toMatchObject({ upload: false, stored: true, usedBytes: 1000 });
    const list = data<{ items: Array<{ hash: string; bytes: number }>; usedBytes: number }>(await lib.media({ now: T0 + 30 }));
    expect(list.usedBytes).toBe(1000);
    expect(list.items).toHaveLength(1);
  });

  it("refuses a file over the limit or over the largest size, and when paused", async () => {
    const lib = library();
    data(await lib.claimMedia({ hash: "big", bytes: 4 * GB, name: "a.mp4", kind: "video", mediaId: "m1", device: "a", now: T0, ...limits, maxFileBytes: 5 * GB }));
    data(await lib.mediaDone({ hash: "big", bytes: 4 * GB, now: T0 }));
    expect(data(await lib.claimMedia({ hash: "h2", bytes: 1.5 * GB, name: "b.mp4", kind: "video", mediaId: "m2", device: "a", now: T0, ...limits }))).toMatchObject({ upload: false, full: true });
    expect(data(await lib.claimMedia({ hash: "h3", bytes: 2.5 * GB, name: "c.mp4", kind: "video", mediaId: "m3", device: "a", now: T0, ...limits, limitBytes: 50 * GB }))).toMatchObject({ upload: false, tooLarge: true });
    expect(data(await lib.claimMedia({ hash: "h4", bytes: 10, name: "d.png", kind: "image", mediaId: "m4", device: "a", now: T0, ...limits, paused: true }))).toMatchObject({ upload: false, paused: true });
  });

  it("drops a claim never finished", async () => {
    const lib = library();
    data(await lib.claimMedia({ hash: "h1", bytes: 1000, name: "x.png", kind: "image", mediaId: "m1", device: "a", now: T0, ...limits }));
    expect(data<{ usedBytes: number }>(await lib.media({ now: T0 })).usedBytes).toBe(0);
    await lib.ageOut(T0 + 25 * 3_600_000);
    expect(data<{ items: unknown[] }>(await lib.media({ now: T0 + 25 * 3_600_000 })).items).toEqual([]);
    expect(data(await lib.claimMedia({ hash: "h1", bytes: 1000, name: "x.png", kind: "image", mediaId: "m1", device: "a", now: T0 + 26 * 3_600_000, ...limits }))).toMatchObject({ upload: true });
  });

  it("refuses a push with a record too big, or too much at once, leaving nothing half-applied", async () => {
    const lib = library();
    const big = { id: "s9", title: "x".repeat(DOC_BYTES + 1) };
    const result = await lib.push({ device: "a", now: T0, changes: [song("s1", "Fine", T0), { col: "song", id: "s9", at: T0, doc: big }] });
    expect(result).toMatchObject({ ok: false, status: 413 });
    expect(data<{ changes: Change[]; seq: number }>(await lib.pull({ since: 0 }))).toMatchObject({ changes: [], seq: 0 });
    const many = Array.from({ length: PUSH_CHANGES + 1 }, (_, n) => song(`s${n}`, "t", T0));
    expect(await lib.push({ device: "a", now: T0, changes: many })).toMatchObject({ ok: false, status: 413 });
  });

  it("counts pending claims toward the limit, and a second id for the same file", async () => {
    const lib = library();
    const small = { ...limits, limitBytes: 1500 };
    expect(data(await lib.claimMedia({ hash: "h1", bytes: 1000, name: "a.png", kind: "image", mediaId: "m1", device: "a", now: T0, ...small }))).toMatchObject({ upload: true });
    expect(data(await lib.claimMedia({ hash: "h2", bytes: 1000, name: "b.png", kind: "image", mediaId: "m2", device: "b", now: T0, ...small }))).toMatchObject({ upload: false, full: true });
    data(await lib.mediaDone({ hash: "h1", bytes: 1000, now: T0 }));
    // Another computer knows the same file by another id: both ids count as uses.
    expect(data(await lib.claimMedia({ hash: "h1", bytes: 1000, name: "a.png", kind: "image", mediaId: "m1-other", device: "b", now: T0, ...small }))).toMatchObject({ stored: true });
    data(await lib.push({ device: "b", now: T0, changes: [{ col: "theme", id: "t", at: T0, doc: { background: { assetId: "m1-other" } } }, { col: "theme", id: "t2", at: T0, doc: { background: { assetId: "m10" } } }] }));
    const list = data<{ items: Array<{ usedIn: number }> }>(await lib.media({ now: T0 }));
    expect(list.items[0]!.usedIn).toBe(1);
  });

  it("remove everywhere writes deletions for the records that used it", async () => {
    const lib = library();
    data(await lib.claimMedia({ hash: "h1", bytes: 1000, name: "bg.png", kind: "image", mediaId: "m1", device: "a", now: T0, ...limits }));
    data(await lib.mediaDone({ hash: "h1", bytes: 1000, now: T0 }));
    data(await lib.push({ device: "a", now: T0, changes: [{ col: "theme", id: "t1", at: T0, doc: { id: "t1", background: { assetId: "m1" } } }, song("s1", "Plain", T0)] }));
    const list = data<{ items: Array<{ usedIn: number }> }>(await lib.media({ now: T0 }));
    expect(list.items[0]!.usedIn).toBe(1);
    const kept = data<{ usedBytes: number; deleteKey: boolean }>(await lib.removeMedia({ hash: "h1", everywhere: false, now: T0 + 1 }));
    expect(kept).toEqual({ usedBytes: 0, deleteKey: true });
    data(await lib.claimMedia({ hash: "h1", bytes: 1000, name: "bg.png", kind: "image", mediaId: "m1", device: "a", now: T0 + 2, ...limits }));
    data(await lib.mediaDone({ hash: "h1", bytes: 1000, now: T0 + 2 }));
    data(await lib.removeMedia({ hash: "h1", everywhere: true, now: T0 + 3 }));
    const changes = data<{ changes: Change[] }>(await lib.pull({ since: 2 })).changes;
    expect(changes).toEqual([{ col: "theme", id: "t1", at: T0 + 3, doc: null }]);
  });

  it("read-only refuses pushes and wipes at the lapse time", async () => {
    const lib = library();
    data(await lib.push({ device: "a", now: T0, changes: [song("s1", "Kept", T0)] }));
    data(await lib.lapse({ readOnly: true, wipeAt: T0 + 90 * DAY }));
    expect(await lib.push({ device: "a", now: T0 + 1, changes: [song("s2", "No", T0 + 1)] })).toMatchObject({ ok: false, status: 403 });
    expect(data<{ changes: Change[] }>(await lib.pull({ since: 0 })).changes).toHaveLength(1);
    await lib.ageOut(T0 + 89 * DAY);
    expect(data<{ changes: Change[] }>(await lib.pull({ since: 0 })).changes).toHaveLength(1);
    await lib.ageOut(T0 + 91 * DAY);
    expect(data<{ changes: Change[]; seq: number }>(await lib.pull({ since: 0 }))).toMatchObject({ changes: [], seq: 0 });
    expect(data<{ readOnly: boolean }>(await lib.status({ now: T0 + 91 * DAY })).readOnly).toBe(false);
    // Renewed in time: writable again, and the wipe is off.
    const again = library();
    data(await again.push({ device: "a", now: T0, changes: [song("s1", "Kept", T0)] }));
    data(await again.lapse({ readOnly: true, wipeAt: T0 + 90 * DAY }));
    data(await again.lapse({ readOnly: false, wipeAt: null }));
    expect((await again.push({ device: "a", now: T0 + 1, changes: [song("s2", "Yes", T0 + 1)] })).ok).toBe(true);
    await again.ageOut(T0 + 91 * DAY);
    expect(data<{ changes: Change[] }>(await again.pull({ since: 0 })).changes).toHaveLength(2);
  });

  it("remembers the computers that sync and the videos switch", async () => {
    const lib = library();
    data(await lib.push({ device: "a", name: "Media PC", now: T0, changes: [] }));
    data(await lib.pull({ since: 0, device: "b", name: "Office", now: T0 + 1 }));
    expect(data<Array<{ device: string; name: string; lastSyncAt: number }>>(await lib.devices({}))).toEqual([{ device: "a", name: "Media PC", lastSyncAt: T0 }, { device: "b", name: "Office", lastSyncAt: T0 + 1 }]);
    expect(data<{ syncVideos: boolean }>(await lib.status({ now: T0 })).syncVideos).toBe(true);
    data(await lib.settings({ syncVideos: false }));
    expect(data<{ syncVideos: boolean }>(await lib.status({ now: T0 })).syncVideos).toBe(false);
  });
});
