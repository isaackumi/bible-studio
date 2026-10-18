import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  createMediaAdapter,
  idbMediaStore,
  imageTypeOf,
  memoryMediaStore,
  type MediaStore,
  type StoredMedia,
} from "./browser-media";
import { openBrowserDatabase } from "./browser-store";

function png(name = "logo.png", size = 16) {
  return new File([new Uint8Array(size)], name, { type: "image/png" });
}

describe("imageTypeOf", () => {
  it("accepts png jpeg webp and gif, including an empty type with a known extension", () => {
    expect(imageTypeOf({ name: "a.png", type: "image/png" })).toBe("image/png");
    expect(imageTypeOf({ name: "a.jpg", type: "image/jpeg" })).toBe("image/jpeg");
    expect(imageTypeOf({ name: "a.webp", type: "" })).toBe("image/webp");
    expect(imageTypeOf({ name: "a.gif", type: "image/gif" })).toBe("image/gif");
    expect(imageTypeOf({ name: "clip.mp4", type: "video/mp4" })).toBeNull();
  });
});

describe("browser media adapter", () => {
  it("imports a png, lists it with an empty path, and returns a blob url", async () => {
    const media = createMediaAdapter(async () => memoryMediaStore(), {
      id: () => "img-1",
      now: () => "2026-10-15T00:00:00.000Z",
    });
    const asset = await media.importFile(png());
    expect(asset).toEqual({
      id: "img-1",
      name: "logo.png",
      path: "",
      kind: "image",
      createdAt: "2026-10-15T00:00:00.000Z",
    });
    expect(await media.list()).toEqual([asset]);
    expect(media.url("img-1")).toMatch(/^blob:/);
    expect(media.url("missing")).toBeNull();
  });

  it("rejects a file that is not an image, video or audio", async () => {
    const media = createMediaAdapter(async () => memoryMediaStore());
    await expect(media.importFile(new File([new Uint8Array(8)], "notes.docx", { type: "application/msword" }))).rejects.toThrow(
      /PNG, JPEG, WebP or GIF image, an MP4.*or MP3/,
    );
    expect(await media.list()).toEqual([]);
  });

  it("imports music as kind audio", async () => {
    const media = createMediaAdapter(async () => memoryMediaStore(), { id: () => "song-1", now: () => "2026-10-18T00:00:00.000Z" });
    const asset = await media.importFile(new File([new Uint8Array(8)], "walk-in.mp3", { type: "" }));
    expect(asset).toMatchObject({ id: "song-1", kind: "audio", name: "walk-in.mp3" });
    expect((await media.list())[0]?.kind).toBe("audio");
  });

  it("imports a video as kind video and caps videos at 1 GB", async () => {
    const media = createMediaAdapter(async () => memoryMediaStore(), { id: () => "vid-1", now: () => "2026-10-16T00:00:00.000Z" });
    const asset = await media.importFile(new File([new Uint8Array(8)], "intro.mov", { type: "" }));
    expect(asset).toMatchObject({ id: "vid-1", kind: "video", name: "intro.mov" });
    const huge = new File([new Uint8Array(8)], "big.mp4", { type: "video/mp4" });
    Object.defineProperty(huge, "size", { value: MAX_VIDEO_BYTES + 1 });
    await expect(media.importFile(huge)).rejects.toThrow("That video is larger than 1 GB. It was not saved.");
  });

  it("rejects a file over 25 MB before writing", async () => {
    const media = createMediaAdapter(async () => memoryMediaStore());
    const huge = new File([new Uint8Array(8)], "big.png", { type: "image/png" });
    Object.defineProperty(huge, "size", { value: MAX_IMAGE_BYTES + 1 });
    await expect(media.importFile(huge)).rejects.toThrow("That image is larger than 25 MB. It was not saved.");
    expect(await media.list()).toEqual([]);
  });

  it("leaves the previous store unchanged when the origin quota is exceeded", async () => {
    const existing: StoredMedia = {
      id: "kept",
      name: "kept.png",
      path: "",
      kind: "image",
      createdAt: "2026-10-14T00:00:00.000Z",
      type: "image/png",
      blob: png("kept.png"),
    };
    const inner = memoryMediaStore([existing]);
    const store: MediaStore = {
      list: () => inner.list(),
      get: (id) => inner.get(id),
      put: async () => {
        throw new DOMException("The quota was exceeded.", "QuotaExceededError");
      },
    };
    const media = createMediaAdapter(async () => store, { id: () => "too-big" });
    await expect(media.importFile(png("new.png"))).rejects.toThrow("The image was not saved. This browser is out of space.");
    const listed = await media.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe("kept");
    expect(media.url("too-big")).toBeNull();
  });

  it("reloads a blob from IndexedDB after a version 2 open", async () => {
    const factory = new IDBFactory();
    const db = await openBrowserDatabase(factory);
    const media = createMediaAdapter(async () => idbMediaStore(db), {
      id: () => "img-2",
      now: () => "2026-10-15T12:00:00.000Z",
    });
    await media.importFile(png("stage.png", 32));
    db.close();

    const again = await openBrowserDatabase(factory);
    const reloaded = createMediaAdapter(async () => idbMediaStore(again));
    const listed = await reloaded.list();
    expect(listed).toEqual([
      {
        id: "img-2",
        name: "stage.png",
        path: "",
        kind: "image",
        createdAt: "2026-10-15T12:00:00.000Z",
      },
    ]);
    expect(reloaded.url("img-2")).toMatch(/^blob:/);
    again.close();
  });
});
