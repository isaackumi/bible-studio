import { describe, expect, it } from "vitest";
import { listNdiSources, ndiShortName, ndiStreamUrl } from "./ndi";

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
