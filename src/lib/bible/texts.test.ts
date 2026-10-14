import { describe, expect, it } from "vitest";
import { BUNDLED_TRANSLATIONS, bundledPassage } from "./texts";

describe("bundled translations", () => {
  it("lists four public-domain English texts", () => {
    expect(BUNDLED_TRANSLATIONS.map((entry) => entry.id)).toEqual(["kjv", "asv", "web", "bbe"]);
  });

  it("reads John 3:16 from ASV, WEB, and BBE", async () => {
    const asv = await bundledPassage("asv", 43, 3, 16, 16);
    const web = await bundledPassage("web", 43, 3, 16, 16);
    const bbe = await bundledPassage("bbe", 43, 3, 16, 16);
    expect(asv[0]?.text.toLowerCase()).toContain("god so loved");
    expect(web[0]?.text.toLowerCase()).toContain("god so loved");
    expect(bbe[0]?.text.toLowerCase()).toContain("love for the world");
  });
});
