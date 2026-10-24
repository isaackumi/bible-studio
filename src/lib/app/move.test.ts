import { describe, expect, it } from "vitest";
import { buildMoveLibrary, formatBytes, movedAt, moveFileName, restoreMoveLibrary } from "./move";

const ID = "0b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
const day = new Date(2026, 9, 24, 12);

describe("moving to a new computer", () => {
  it("moveFileName strips characters Windows refuses", () => {
    expect(moveFileName('Grace / "Chapel": Accra', day)).toBe("Grace Chapel Accra 2026-10-24.churchstudio");
  });

  it("moveFileName without a church name", () => {
    expect(moveFileName("  ", day)).toBe("Church Studio 2026-10-24.churchstudio");
  });

  it("movedAt reads the file's time in seconds, and an ISO date too", () => {
    expect(movedAt("1792800000").toISOString()).toBe("2026-10-24T00:00:00.000Z");
    expect(movedAt("2026-10-24T10:00:00Z").toISOString()).toBe("2026-10-24T10:00:00.000Z");
    expect(Number.isNaN(movedAt("garbage").getTime())).toBe(true);
  });

  it("formatBytes reads like a file size", () => {
    expect(formatBytes(512_000)).toBe("1 MB");
    expect(formatBytes(48_400_000)).toBe("48 MB");
    expect(formatBytes(3_240_000_000)).toBe("3.2 GB");
    expect(formatBytes(23_000_000_000)).toBe("23 GB");
  });

  it("buildMoveLibrary includes extras and the snapshot", () => {
    const snapshot = { schemaVersion: 1 as const, exportedAt: "x", songs: [], services: [], themes: [] };
    const built = JSON.parse(buildMoveLibrary(snapshot, { churchName: "Grace" }));
    expect(built).toEqual({ ...snapshot, extras: { churchName: "Grace" } });
  });

  it("restoreMoveLibrary relinks before importing", async () => {
    const old = `http://asset.localhost/C%3A%5CUsers%5Cold%5Cmedia%5C${ID}.png`;
    const json = JSON.stringify({ schemaVersion: 1, songs: [], services: [], themes: [{ id: "t", background: { assetId: ID, imageUrl: old } }], extras: { decks: [{ pages: [{ url: old }] }] } });
    let seen: unknown = null;
    const extras = await restoreMoveLibrary(json, (id) => (id === ID ? "NEW" : null), async (payload) => void (seen = payload));
    expect(JSON.stringify(seen)).toContain('"imageUrl":"NEW"');
    expect(JSON.stringify(seen)).not.toContain("Users");
    expect(extras).toEqual({ decks: [{ pages: [{ url: "NEW" }] }] });
  });
});
