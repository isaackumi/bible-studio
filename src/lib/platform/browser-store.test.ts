import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { defaultTheme } from "../domain/theme";
import type { Service, Song } from "../domain/types";
import {
  BROWSER_SCHEMA_VERSION,
  createLibrary,
  memoryRecordStore,
  migrateLocalLists,
  openBrowserDatabase,
  openLibrary,
  upgradeBrowserDatabase,
  type KeyValueStore,
  type RecordStore,
} from "./browser-store";
import { parseLibrarySnapshot } from "./library";

function keys(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

const song: Song = { id: "song-1", title: "Grace", author: "", sections: [] };
const service: Service = { id: "svc-1", name: "Sunday", sections: [], updatedAt: "2026-10-14T00:00:00.000Z" };

describe("browser library", () => {
  it("saves and reloads songs, services, and themes", async () => {
    const library = createLibrary(async () => memoryRecordStore());
    await library.saveSong(song);
    await library.saveService(service);
    await library.saveTheme(defaultTheme());
    expect(await library.songs()).toEqual([song]);
    expect(await library.getService("svc-1")).toEqual(service);
    expect((await library.themes())[0]?.name).toBe("Signal");
  });

  it("reloads song sections in the saved order", async () => {
    const library = createLibrary(async () => memoryRecordStore());
    const withSections: Song = {
      id: "song-sections",
      title: "Morning light",
      author: "Ada",
      sections: [
        { id: "v1", kind: "verse", label: "Verse 1", lines: ["First line"] },
        { id: "c1", kind: "chorus", label: "Chorus", lines: ["Sing again"] },
      ],
    };
    await library.saveSong(withSections);
    const snapshot = {
      schemaVersion: 1 as const,
      exportedAt: "2026-10-14T00:00:00.000Z",
      songs: [withSections],
      services: [],
      themes: [],
    };
    await library.importSnapshot(snapshot);
    expect((await library.songs())[0]?.sections.map((section) => section.id)).toEqual(["v1", "c1"]);
  });

  it("replaces the same id and keeps the other records", async () => {
    const library = createLibrary(async () => memoryRecordStore());
    await library.saveSong(song);
    await library.saveSong({ ...song, id: "song-2", title: "Other" });
    await library.saveSong({ ...song, title: "Grace updated" });
    expect((await library.songs()).map((entry) => entry.title)).toEqual(["Grace updated", "Other"]);
  });

  it("keeps the previous record when a write fails", async () => {
    const records = memoryRecordStore();
    const library = createLibrary(async () => records);
    await library.saveSong(song);
    const failing: RecordStore = {
      ...records,
      put: async () => {
        throw new Error("disk full");
      },
    };
    const blocked = createLibrary(async () => failing);
    await expect(blocked.saveSong({ ...song, title: "Lost" })).rejects.toThrow("disk full");
    expect(await library.songs()).toEqual([song]);
  });

  it("copies valid songs and keeps an unreadable service list", async () => {
    const records = memoryRecordStore();
    const legacy = keys();
    legacy.setItem("church-studio.songs", JSON.stringify([song, { ...song, id: "song-2", title: "Other" }]));
    legacy.setItem("church-studio.services", "{");
    await migrateLocalLists(records, legacy);
    const library = createLibrary(async () => records);
    expect((await library.songs()).map((entry) => entry.title)).toEqual(["Grace", "Other"]);
    expect(await library.services()).toEqual([]);
    expect(legacy.getItem("church-studio.songs")).toBeNull();
    expect(legacy.getItem("church-studio.services")).toBe("{");
    expect(await records.getMeta("local-lists-v1")).toBeNull();
    await migrateLocalLists(records, legacy);
    expect(await library.songs()).toHaveLength(2);
  });

  it("leaves the local lists in place when a migrated write fails", async () => {
    const records = memoryRecordStore();
    let fail = true;
    const flaky: RecordStore = {
      ...records,
      put: async (store, row) => {
        if (fail) throw new Error("disk full");
        await records.put(store, row);
      },
    };
    const legacy = keys();
    legacy.setItem("church-studio.songs", JSON.stringify([song, { ...song, id: "song-2", title: "Other" }]));
    await expect(migrateLocalLists(flaky, legacy)).rejects.toThrow("disk full");
    expect(legacy.getItem("church-studio.songs")).toContain("Grace");
    expect(await records.getMeta("local-lists-v1")).toBeNull();
    fail = false;
    await migrateLocalLists(flaky, legacy);
    await migrateLocalLists(flaky, legacy);
    const library = createLibrary(async () => records);
    expect((await library.songs()).map((entry) => entry.id)).toEqual(["song-1", "song-2"]);
    expect(legacy.getItem("church-studio.songs")).toBeNull();
    expect(await records.getMeta("local-lists-v1")).toBe("complete");
  });

  it("keeps a partially valid legacy list and does not duplicate the valid rows", async () => {
    const records = memoryRecordStore();
    const legacy = keys();
    legacy.setItem("church-studio.songs", JSON.stringify([song, { id: "broken" }]));
    await migrateLocalLists(records, legacy);
    await migrateLocalLists(records, legacy);
    const library = createLibrary(async () => records);
    expect(await library.songs()).toEqual([song]);
    expect(legacy.getItem("church-studio.songs")).toContain("broken");
    expect(await records.getMeta("local-lists-v1")).toBeNull();
  });

  it("does not migrate again after an older completion mark", async () => {
    const records = memoryRecordStore();
    await records.setMeta("local-lists-v1", "1");
    const legacy = keys();
    legacy.setItem("church-studio.songs", JSON.stringify([song]));
    await migrateLocalLists(records, legacy);
    expect(legacy.getItem("church-studio.songs")).toContain("Grace");
    expect(await createLibrary(async () => records).songs()).toEqual([]);
  });

  it("rolls an import back when a later record cannot be written", async () => {
    const records = memoryRecordStore();
    const library = createLibrary(async () => records);
    await library.saveSong(song);
    const flaky: RecordStore = {
      ...records,
      put: async (store, row) => {
        if (row.id === "song-2") throw new Error("disk full");
        await records.put(store, row);
      },
    };
    const importing = createLibrary(async () => flaky);
    await expect(
      importing.importSnapshot({
        schemaVersion: 1,
        exportedAt: "2026-10-14T00:00:00.000Z",
        songs: [{ ...song, title: "Changed" }, { ...song, id: "song-2", title: "Other" }],
        services: [],
        themes: [],
      }),
    ).rejects.toThrow("disk full");
    expect(await library.songs()).toEqual([song]);
  });

  it("imports a current backup and leaves themes alone when the file has none", async () => {
    const library = createLibrary(async () => memoryRecordStore());
    await library.saveTheme(defaultTheme());
    await library.importSnapshot(
      parseLibrarySnapshot({ schemaVersion: 1, songs: [song], services: [service] }),
    );
    expect((await library.themes())[0]?.name).toBe("Signal");
    await library.importSnapshot(
      parseLibrarySnapshot({
        schemaVersion: 1,
        songs: [],
        services: [],
        themes: [{ ...defaultTheme(), name: "Evening", transition: { type: "nope", ms: 9000 } }],
      }),
    );
    const theme = (await library.themes())[0];
    expect(theme?.name).toBe("Evening");
    expect(theme?.transition).toEqual({ type: "fade", ms: 2000 });
  });
});

describe("indexedDB schema", () => {
  it("opens version 1 with the library stores and reloads records", async () => {
    const factory = new IDBFactory();
    const opened = await openBrowserDatabase(factory);
    expect(opened.version).toBe(BROWSER_SCHEMA_VERSION);
    expect(Array.from(opened.objectStoreNames).sort()).toEqual(["meta", "services", "songs", "themes"]);
    opened.close();

    const legacy = keys();
    legacy.setItem("church-studio.songs", JSON.stringify([song]));
    legacy.setItem("church-studio.services", JSON.stringify([service]));
    const library = await openLibrary(factory, legacy);
    await library.saveTheme({ ...defaultTheme(), name: "Evening" });
    expect((await library.songs())[0]?.title).toBe("Grace");
    expect(await library.getService("svc-1")).toEqual(service);
    expect((await library.themes())[0]?.name).toBe("Evening");
    expect(legacy.getItem("church-studio.services")).toBeNull();

    const reloaded = await openLibrary(factory, legacy);
    expect((await reloaded.themes())[0]?.name).toBe("Evening");
    expect(await reloaded.songs()).toHaveLength(1);
  });

  it("leaves an existing version 1 database unchanged", async () => {
    const factory = new IDBFactory();
    const opened = await openBrowserDatabase(factory);
    expect(() => upgradeBrowserDatabase(opened, 1)).not.toThrow();
    expect(Array.from(opened.objectStoreNames).sort()).toEqual(["meta", "services", "songs", "themes"]);
    opened.close();
    const again = await openBrowserDatabase(factory);
    expect(again.version).toBe(1);
    again.close();
  });
});

describe("library snapshot", () => {
  it("rejects a file before it can replace records", () => {
    expect(() => parseLibrarySnapshot({ schemaVersion: 1, songs: [{ id: 1 }], services: [] })).toThrow(/song/i);
    expect(() => parseLibrarySnapshot({ schemaVersion: 2, songs: [], services: [] })).toThrow(/newer version/);
  });

  it("accepts a version 1 snapshot and keeps themes optional", () => {
    const snapshot = parseLibrarySnapshot({ schemaVersion: 1, exportedAt: "2026-10-14T00:00:00.000Z", songs: [song], services: [service] });
    expect(snapshot.songs).toHaveLength(1);
    expect(snapshot.themes).toEqual([]);
    const withTheme = parseLibrarySnapshot({
      schemaVersion: 1,
      songs: [],
      services: [],
      themes: [defaultTheme()],
    });
    expect(withTheme.themes[0]?.id).toBe("theme-manuscript");
  });

  it("repairs a missing or out-of-range transition instead of rejecting the file", () => {
    const repaired = parseLibrarySnapshot({
      schemaVersion: 1,
      songs: [],
      services: [],
      themes: [{ ...defaultTheme(), transition: undefined }, { ...defaultTheme(), id: "theme-2", name: "Wide", transition: { type: "cut", ms: -4 } }],
    });
    expect(repaired.themes[0]?.transition).toEqual({ type: "fade", ms: 450 });
    expect(repaired.themes[1]?.transition).toEqual({ type: "cut", ms: 0 });
  });
});