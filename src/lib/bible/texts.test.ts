import { describe, expect, it } from "vitest";
import { BUNDLED_TRANSLATIONS, bundledPassage } from "./texts";

describe("bundled translations", () => {
  it("lists four public-domain English texts, the open Akuapem Twi Bible, and five open Bibles to download", () => {
    expect(BUNDLED_TRANSLATIONS.filter((entry) => entry.source === "bundled").map((entry) => entry.id)).toEqual(["kjv", "asv", "web", "bbe", "twi"]);
    expect(BUNDLED_TRANSLATIONS.filter((entry) => entry.source === "download").map((entry) => entry.id)).toEqual(["ewe", "yor", "ibo", "hausa", "twiasante"]);
    // Each downloaded Bible is CC BY-SA and always shown with Biblica's credit.
    for (const entry of BUNDLED_TRANSLATIONS.filter((item) => item.source === "download")) expect(entry.licenseNote).toMatch(/Biblica.*CC BY-SA 4\.0/);
    expect(BUNDLED_TRANSLATIONS.filter((entry) => entry.licenseNote === "Public domain").map((entry) => entry.id)).toEqual(["kjv", "asv", "web", "bbe"]);
    // Twi is shared under CC BY-SA and always shown with Biblica's credit.
    expect(BUNDLED_TRANSLATIONS.find((entry) => entry.id === "twi")?.licenseNote).toContain("Biblica");
  });

  it("reads the Twi Bible by book, chapter and verse", async () => {
    const [verse] = await bundledPassage("twi", 43, 3, 16, 16);
    expect(verse?.verse).toBe(16);
    expect(verse?.text.trim().length).toBeGreaterThan(10);
  });

  it("reads John 3:16 from ASV, WEB, and BBE", async () => {
    const asv = await bundledPassage("asv", 43, 3, 16, 16);
    const web = await bundledPassage("web", 43, 3, 16, 16);
    const bbe = await bundledPassage("bbe", 43, 3, 16, 16);
    expect(asv[0]?.text.toLowerCase()).toContain("god so loved");
    expect(web[0]?.text.toLowerCase()).toContain("god so loved");
    expect(bbe[0]?.text.toLowerCase()).toContain("love for the world");
  }, 20_000);
});
