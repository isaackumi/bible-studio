import { beforeEach, describe, expect, it } from "vitest";
import { countUse, usageCounts, usageSent } from "./usage-counts";

describe("usage counts", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), clear: () => data.clear(), key: () => null, length: 0 } as Storage;
  });

  it("counts, and keeps what was counted while a check-in was on its way", () => {
    countUse("services");
    countUse("songs");
    countUse("songs");
    const sent = usageCounts();
    expect(sent).toEqual({ services: 1, scripture: 0, songs: 2 });
    countUse("scripture");
    usageSent(sent);
    expect(usageCounts()).toEqual({ services: 0, scripture: 1, songs: 0 });
  });

  it("reads damaged storage as nothing counted", () => {
    localStorage.setItem("church-studio.usage-counts", "{not json");
    expect(usageCounts()).toEqual({ services: 0, scripture: 0, songs: 0 });
    localStorage.setItem("church-studio.usage-counts", JSON.stringify({ services: -4, songs: "x" }));
    expect(usageCounts()).toEqual({ services: 0, scripture: 0, songs: 0 });
  });
});
