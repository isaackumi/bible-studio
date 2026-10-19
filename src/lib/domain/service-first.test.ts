import { describe, expect, it } from "vitest";
import { buildSongIndex, chooseSung } from "../voice/song-detect";
import { inPassages, preferService, serviceFirst, servicePassages, serviceSongIds } from "./service-first";
import type { Service, Song } from "./types";

const john = { translationId: "kjv", bookOrd: 43, chapter: 3, startVerse: 16, endVerse: 17, reference: "John 3:16-17" };

const service: Service = {
  id: "s",
  name: "Sunday",
  updatedAt: "",
  sections: [
    {
      id: "a",
      name: "Worship",
      items: [
        { id: "1", kind: "lyric", title: "Grace", lyric: { songId: "grace", sectionId: "v1" } },
        { id: "2", kind: "bible", title: "John 3:16-17", bible: john },
      ],
    },
  ],
};

function song(id: string, title: string, lines: string[]): Song {
  return { id, title, author: "", sections: [{ id: "v1", label: "Verse 1", lines }] } as unknown as Song;
}

describe("service first", () => {
  it("collects the service's songs and passages", () => {
    expect([...serviceSongIds(service)]).toEqual(["grace"]);
    expect(servicePassages(service)).toEqual([john]);
    expect(serviceSongIds(null).size).toBe(0);
  });

  it("knows which verses are in the service", () => {
    const passages = servicePassages(service);
    expect(inPassages(passages, 43, 3, 16)).toBe(true);
    expect(inPassages(passages, 43, 3, 17)).toBe(true);
    expect(inPassages(passages, 43, 3, 18)).toBe(false);
    expect(inPassages(passages, 43, 4, 16)).toBe(false);
  });

  it("puts the service's results first and keeps the order", () => {
    expect(serviceFirst([1, 2, 3, 4], (n) => n % 2 === 0)).toEqual([2, 4, 1, 3]);
    expect(serviceFirst([1, 3], (n) => n % 2 === 0)).toEqual([1, 3]);
  });

  it("prefers the service's match unless the library's is clearly stronger", () => {
    expect(preferService({ hits: 4, id: "own" }, { hits: 5, id: "all" })?.id).toBe("own");
    expect(preferService({ hits: 4, id: "own" }, { hits: 12, id: "all" })?.id).toBe("all");
    expect(preferService(null, { hits: 3, id: "all" })?.id).toBe("all");
    expect(preferService({ hits: 3, id: "own" }, null)?.id).toBe("own");
  });

  it("follows the service's song when two songs share the sung line", () => {
    const grace = song("grace", "Grace", ["you are my strength and my song forever"]);
    const other = song("other", "Other", ["you are my strength and my song forever more"]);
    const sung = ["you are my strength and my song"];
    const all = chooseSung(sung, buildSongIndex([grace, other]));
    const own = chooseSung(sung, buildSongIndex([grace]));
    expect(all).toBeNull();
    expect(preferService(own, all)?.songId).toBe("grace");
  });
});
