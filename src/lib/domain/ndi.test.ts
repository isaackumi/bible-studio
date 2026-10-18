import { describe, expect, it } from "vitest";
import { keyWords, listNdiSources, ndiShortName, ndiStreamUrl } from "./ndi";

describe("NDI sources", () => {
  it("builds the hub stream address and a short label", () => {
    expect(ndiStreamUrl("CHURCH-MAC.LOCAL (Camera 1)")).toBe("http://127.0.0.1:47129/ndi/CHURCH-MAC.LOCAL%20(Camera%201).mjpg");
    expect(ndiShortName("CHURCH-MAC.LOCAL (Camera 1)")).toBe("Camera 1");
    expect(ndiShortName("Plain")).toBe("Plain");
  });

  it("lists sources from the hub, and says null when it is not running", async () => {
    const ok = (async () => new Response(JSON.stringify(["A (Cam)"]))) as unknown as typeof fetch;
    const down = (async () => {
      throw new TypeError("refused");
    }) as unknown as typeof fetch;
    expect(await listNdiSources(ok)).toEqual(["A (Cam)"]);
    expect(await listNdiSources(down)).toBeNull();
  });
});

describe("key output words", () => {
  const model = (layout: string, lines: string[], reference: string | null = null) =>
    ({ layout, reference, lines: lines.map((text) => ({ text })) }) as never;

  it("takes scripture and lyrics, and nothing from black or pictures", () => {
    expect(keyWords(model("scripture", ["For God so loved the world"], "John 3:16"))).toEqual({ cue: "John 3:16", body: "For God so loved the world" });
    expect(keyWords(model("lyrics", ["Line one", "Line two"]))).toEqual({ cue: "", body: "Line one\nLine two" });
    expect(keyWords(model("black", []))).toBeNull();
    expect(keyWords(model("image", ["caption"]))).toBeNull();
  });

  it("takes the words region of a look", () => {
    const look = {
      layout: "composition",
      reference: null,
      lines: [],
      layers: [
        { zIndex: 0, opacity: 1, model: { layout: "image", reference: null, lines: [] } },
        { zIndex: 1, opacity: 1, model: { layout: "scripture", reference: "Psalm 23:1", lines: [{ text: "The Lord is my shepherd" }] } },
      ],
    } as never;
    expect(keyWords(look)).toEqual({ cue: "Psalm 23:1", body: "The Lord is my shepherd" });
  });
});
