import { describe, expect, it } from "vitest";
import { applyExtras, backupName, backupsToPrune, extrasFrom, isBackupName, latestBackup, mergeById } from "./backup";
import { defaultWorkspace } from "../domain/theme";
import type { Workspace } from "../domain/types";

const game = (id: string, title = id) => ({ id, title }) as unknown as Workspace["games"][number];
const word = (heard: string, means: string) => ({ heard, means, source: "yours" as const });

function filled(): Workspace {
  const base = defaultWorkspace();
  return {
    ...base,
    logoAssetId: "logo-1",
    logoText: "Grace",
    games: [game("g1")],
    hiddenGames: ["h1"],
    playlists: [{ id: "p1", name: "Before service", trackIds: [] } as unknown as Workspace["playlists"][number]],
    serviceTemplates: [{ id: "t1", name: "Sunday" } as unknown as Workspace["serviceTemplates"][number]],
    macros: [{ id: "m1", name: "Start", steps: [] }],
    overlays: [{ id: "o1" } as unknown as Workspace["overlays"][number]],
    favorites: { ...base.favorites, songs: ["s1"] },
    songUses: [{ songId: "s1", title: "Amazing Grace", author: "", ccli: "", date: "2026-10-19" }],
    voice: { ...base.voice, words: [word("some", "Psalm")] },
  };
}

describe("folder backups", () => {
  it("names backups so they sort in time order", () => {
    expect(backupName(new Date(2026, 9, 17, 18, 5))).toBe("Church Studio backup 2026-10-17 1805.json");
    expect(isBackupName("Church Studio backup 2026-10-17 1805.json")).toBe(true);
    expect(isBackupName("../Church Studio backup x.json")).toBe(false);
    expect(latestBackup(["notes.txt", "Church Studio backup 2026-10-17 1805.json", "Church Studio backup 2026-10-18 0900.json"])).toBe("Church Studio backup 2026-10-18 0900.json");
    expect(latestBackup(["notes.txt"])).toBeNull();
  });

  it("keeps the newest twenty", () => {
    const names = Array.from({ length: 23 }, (_, n) => backupName(new Date(2026, 0, n + 1, 9)));
    expect(backupsToPrune([...names, "other.json"])).toEqual(names.slice(0, 3));
  });

  it("merges by id: the backup's copy wins, nothing is deleted", () => {
    expect(mergeById([{ id: "a", v: 1 }, { id: "b", v: 1 }], [{ id: "b", v: 2 }, { id: "c", v: 2 }])).toEqual([
      { id: "a", v: 1 },
      { id: "b", v: 2 },
      { id: "c", v: 2 },
    ]);
  });
});

describe("what moves to another computer", () => {
  it("extrasFrom carries games, playlists, templates, macros, overlays, favorites, logo and learned words", () => {
    const extras = extrasFrom(filled(), []);
    expect(extras.games.map((entry) => entry.id)).toEqual(["g1"]);
    expect(extras.hiddenGames).toEqual(["h1"]);
    expect(extras.playlists.map((entry) => entry.id)).toEqual(["p1"]);
    expect(extras.serviceTemplates.map((entry) => entry.id)).toEqual(["t1"]);
    expect(extras.macros.map((entry) => entry.id)).toEqual(["m1"]);
    expect(extras.overlays.map((entry) => entry.id)).toEqual(["o1"]);
    expect(extras.favorites.songs).toEqual(["s1"]);
    expect(extras.songUses).toHaveLength(1);
    expect(extras.logoAssetId).toBe("logo-1");
    expect(extras.logoText).toBe("Grace");
    expect(extras.voiceWords).toEqual([word("some", "Psalm")]);
  });

  it("extrasFrom never carries secrets", () => {
    const workspace = filled();
    workspace.pco = { appId: "app", secret: "S1" };
    workspace.ai = { ...workspace.ai, key: "S2" };
    workspace.onlineBibles = { ...workspace.onlineBibles, key: "S3" };
    workspace.voice = { ...workspace.voice, speechKeys: { deepgram: "S4" } };
    workspace.broadcast = { ...workspace.broadcast, key: "S5" };
    const text = JSON.stringify(extrasFrom(workspace, []));
    for (const secret of ["S1", "S2", "S3", "S4", "S5"]) expect(text).not.toContain(secret);
  });

  it("applyExtras merges the new lists by id and keeps local-only items", () => {
    const here = { ...defaultWorkspace(), games: [game("local"), game("shared", "old")] };
    const merged = applyExtras(here, { games: [game("shared", "new"), game("file")] });
    expect(merged.games.map((entry) => [entry.id, entry.title])).toEqual([["local", "local"], ["shared", "new"], ["file", "file"]]);
  });

  it("applyExtras keeps this computer's logo when it has one", () => {
    const empty = { ...defaultWorkspace(), logoAssetId: null };
    expect(applyExtras(empty, { logoAssetId: "logo-1" }).logoAssetId).toBe("logo-1");
    const mine = { ...defaultWorkspace(), logoAssetId: "mine" };
    expect(applyExtras(mine, { logoAssetId: "logo-1" }).logoAssetId).toBe("mine");
  });

  it("applyExtras merges learned words by heard", () => {
    const here = { ...defaultWorkspace() };
    here.voice = { ...here.voice, words: [word("some", "old"), word("local", "kept")] };
    const merged = applyExtras(here, { voiceWords: [word("some", "Psalm"), word("new", "Isaiah")] });
    expect(merged.voice.words).toEqual([word("some", "Psalm"), word("local", "kept"), word("new", "Isaiah")]);
  });
});
