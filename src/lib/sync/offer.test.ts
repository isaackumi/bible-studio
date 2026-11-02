import { describe, expect, it, vi } from "vitest";
import { acceptOffer, arrival, changedSince, markPushed, parseOffer, type Offer } from "./offer";
import type { Apply, SyncRecord } from "./records";

const PIC = "0b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
const NOW = Date.UTC(2026, 10, 2);
const DAY = 86_400_000;
const song = (id: string, title: string, at = NOW): SyncRecord => ({ col: "song", id, doc: { id, title, updatedAt: new Date(at).toISOString() } });

function fakes() {
  const written: string[] = [];
  const apply = {
    song: async (doc: { id: string; title: string } | null) => void written.push(`song ${doc?.title}`),
    service: async () => {},
    sermon: async () => {},
    theme: async () => {},
    workspace: () => {},
    copy: async (col: string, doc: { title: string }, suffix: string) => void written.push(`copy ${doc.title} ${suffix}`),
  } as unknown as Apply;
  return { written, apply };
}
const offer = (items: SyncRecord[], over: Partial<Offer> = {}): Offer => ({ id: "o1", from: "Laptop", at: NOW, items: items.map((item) => ({ ...item, name: "n" })), files: [], ...over });
const all = (made: Offer) => new Set([...made.items.map((item) => `${item.col}/${item.id}`), ...made.files.map((file) => `file/${file.id}`)]);

describe("choosing what to push", () => {
  it("offers only what changed since the last push", () => {
    const a = song("a", "Amazing Grace");
    const pushed = markPushed(null, [a, song("b", "Be Thou My Vision")]);
    expect(changedSince([a, song("b", "Be Thou My Vision, edited"), song("c", "New")], pushed, 0).map((item) => item.id).sort()).toEqual(["b", "c"]);
  });

  it("on a first push offers recent work, not the whole library", () => {
    const items = changedSince([song("old", "Old", NOW - 90 * DAY), song("new", "New", NOW - DAY)], null, NOW - 7 * DAY);
    expect(items.map((item) => item.name)).toEqual(["New"]);
  });

  it("never offers the church's settings", () => {
    expect(changedSince([{ col: "settings", id: "church", doc: { id: "church" } }], {}, 0)).toEqual([]);
  });
});

describe("what comes off the network", () => {
  const text = (value: unknown) => JSON.stringify(value);
  it("reads a proper offer", () => {
    expect(parseOffer(text({ id: "o", from: "Laptop", at: 5, items: [{ ...song("a", "A"), name: "A" }], files: [] }))?.items[0]?.name).toBe("A");
  });

  it("refuses what is not an offer", () => {
    expect(parseOffer("not json")).toBeNull();
    expect(parseOffer(text({ id: "o", items: [] }))).toBeNull();
    expect(parseOffer(text({ items: [song("a", "A")] }))).toBeNull();
  });

  it("drops records it may not take: settings, unknown kinds, a doc under another id", () => {
    const parsed = parseOffer(text({ id: "o", items: [{ col: "settings", id: "church", doc: { id: "church" } }, { col: "license", id: "x", doc: { id: "x" } }, { col: "song", id: "a", doc: { id: "b" } }, song("c", "C")] }));
    expect(parsed?.items.map((item) => item.id)).toEqual(["c"]);
  });
});

describe("accepting an offer", () => {
  it("adds a new record as it is", async () => {
    const { written, apply } = fakes();
    const made = offer([song("a", "New Song")]);
    const result = await acceptOffer(made, all(made), new Map(), { apply, have: () => true, fetch: async () => true });
    expect(written).toEqual(["song New Song"]);
    expect(result.added).toBe(1);
  });

  it("keeps both when this computer's copy differs, and never overwrites it", async () => {
    const { written, apply } = fakes();
    const made = offer([song("a", "Theirs")]);
    const local = new Map<string, unknown>([["song/a", song("a", "Mine").doc]]);
    const result = await acceptOffer(made, all(made), local, { apply, have: () => true, fetch: async () => true });
    expect(written).toEqual(["copy Theirs (from Laptop)"]);
    expect(result).toMatchObject({ added: 0, kept: 1 });
  });

  it("leaves a record that is already the same", async () => {
    const { written, apply } = fakes();
    const same = song("a", "Same");
    const made = offer([same]);
    const result = await acceptOffer(made, all(made), new Map([["song/a", same.doc]]), { apply, have: () => true, fetch: async () => true });
    expect(written).toEqual([]);
    expect(result.same).toBe(1);
    expect(arrival(same, new Map([["song/a", same.doc]]))).toBe("same");
  });

  it("takes only what was ticked", async () => {
    const { written, apply } = fakes();
    const made = offer([song("a", "Wanted"), song("b", "Not wanted")]);
    await acceptOffer(made, new Set(["song/a"]), new Map(), { apply, have: () => true, fetch: async () => true });
    expect(written).toEqual(["song Wanted"]);
  });

  it("fetches chosen files and those the records use, and says what would not come", async () => {
    const { apply } = fakes();
    const fetch = vi.fn(async (id: string) => id === PIC);
    const made = offer([], { files: [{ id: PIC, name: "p", kind: "image" }, { id: "gone", name: "g", kind: "image" }] });
    const result = await acceptOffer(made, all(made), new Map(), { apply, have: () => false, fetch });
    expect(result).toMatchObject({ files: 1, missing: 1 });
  });

  it("does not fetch a file this computer has", async () => {
    const { apply } = fakes();
    const fetch = vi.fn(async () => true);
    const made = offer([], { files: [{ id: PIC, name: "p", kind: "image" }] });
    await acceptOffer(made, all(made), new Map(), { apply, have: () => true, fetch });
    expect(fetch).not.toHaveBeenCalled();
  });
});
