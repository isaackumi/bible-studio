import { describe, expect, it } from "vitest";
import { relinkMedia } from "./relink";

const ID = "0b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
const urlFor = (id: string) => (id === ID ? "NEW" : null);

describe("media addresses after a move", () => {
  it("rewrites a Mac asset address", () => {
    expect(relinkMedia(`http://asset.localhost/%2FUsers%2Fold%2FLibrary%2FApplication%20Support%2Fcom.church.studio%2Fmedia%2F${ID}.mp4`, urlFor)).toBe("NEW");
  });

  it("rewrites a Windows asset address", () => {
    expect(relinkMedia(`http://asset.localhost/C%3A%5CUsers%5Cold%5CAppData%5CRoaming%5Ccom.church.studio%5Cmedia%5C${ID}.png`, urlFor)).toBe("NEW");
  });

  it("sets imageUrl from assetId", () => {
    expect(relinkMedia({ assetId: ID, imageUrl: "stale" }, urlFor)).toEqual({ assetId: ID, imageUrl: "NEW" });
    expect(relinkMedia({ assetId: ID, videoUrl: "stale", name: "Intro" }, urlFor)).toEqual({ assetId: ID, videoUrl: "NEW", name: "Intro" });
  });

  it("leaves unknown ids and ordinary text alone", () => {
    const other = "http://asset.localhost/media/9b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b.png";
    expect(relinkMedia(other, urlFor)).toBe(other);
    expect(relinkMedia("Psalm 23", urlFor)).toBe("Psalm 23");
    expect(relinkMedia({ assetId: "gone", imageUrl: "kept" }, urlFor)).toEqual({ assetId: "gone", imageUrl: "kept" });
  });

  it("walks arrays and nested objects without changing the input", () => {
    const input = { pages: [{ background: { assetId: ID, imageUrl: "old" } }, { text: `/media/${ID}.jpg` }], n: 3, on: true, none: null };
    const copy = structuredClone(input);
    expect(relinkMedia(input, urlFor)).toEqual({ pages: [{ background: { assetId: ID, imageUrl: "NEW" } }, { text: "NEW" }], n: 3, on: true, none: null });
    expect(input).toEqual(copy);
  });
});
