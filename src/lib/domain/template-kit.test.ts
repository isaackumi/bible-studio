import { describe, expect, it } from "vitest";
import { packEntries, templateCatalog } from "./template-catalog";
import { buildTemplate, FONT_PAIRS, PALETTES, sanitizeTemplateSpecs } from "./template-kit";
import { TEMPLATE_CATEGORIES } from "./page-templates";
import { presentComposition } from "./composition";
import { sanitizeDeck, type SlideDeck } from "./decks";
import { defaultTheme } from "./theme";

const SHAPES = { wide: 16 / 9, "4:3": 4 / 3, portrait: 9 / 16, ultrawide: 21 / 9, square: 1 };
const ctx = { theme: defaultTheme(), now: 0 };

describe("template catalog", () => {
  const catalog = templateCatalog();

  it("offers hundreds of templates, in every kind of page, each with its own id", () => {
    expect(catalog.length).toBeGreaterThan(300);
    expect(new Set(catalog.map((entry) => entry.id)).size).toBe(catalog.length);
    for (const category of TEMPLATE_CATEGORIES) expect(catalog.filter((entry) => entry.category === category).length, category).toBeGreaterThan(5);
  });

  it("builds every template inside the page on every screen shape, and it survives saving", () => {
    for (const entry of catalog) {
      for (const [shape, aspect] of Object.entries(SHAPES)) {
        const page = entry.build(aspect);
        expect(page.layers.length, `${entry.id} ${shape}`).toBeGreaterThan(0);
        for (const layer of page.layers) {
          const { x, y, w, h } = layer.bounds;
          expect(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 100.01 && y + h <= 100.01, `${entry.id} ${shape} ${layer.name} ${JSON.stringify(layer.bounds)}`).toBe(true);
        }
        expect(!!page.clear, entry.id).toBe(entry.clear);
        const deck: SlideDeck = { id: "deck:1", name: "D", updatedAt: "2026-10-24T00:00:00.000Z", pages: [page] };
        expect(sanitizeDeck(JSON.parse(JSON.stringify(deck)))?.pages[0]).toEqual(page);
        expect(presentComposition(page, ctx).layers?.length).toBe(page.layers.length);
      }
    }
  });

  it("shows a kit template in any palette and any fonts", () => {
    const entry = catalog.find((item) => item.spec && !item.clear)!;
    const colours = new Set(PALETTES.map((palette) => JSON.stringify(entry.build(16 / 9, { palette: palette.id }).background)));
    expect(colours.size).toBe(PALETTES.length);
    const fonts = new Set(FONT_PAIRS.map((pair) => entry.build(16 / 9, { fonts: pair.id }).layers.find((layer) => layer.name === "Title")!.source.payload.style));
    expect(fonts.size).toBe(FONT_PAIRS.length);
  });

  it("stacks a page on a portrait screen", () => {
    const spec = catalog.find((entry) => entry.id === "kit:welcome-split-1")!.spec!;
    const wide = buildTemplate(spec, 16 / 9);
    const tall = buildTemplate(spec, 9 / 16);
    const title = (page: typeof wide) => page.layers.find((layer) => layer.name === "Title")!.bounds;
    expect(title(wide).x).toBeGreaterThan(40);
    expect(title(tall).y).toBeGreaterThan(40);
  });
});

describe("template packs", () => {
  const good: Record<string, unknown> = {
    id: "advent-1",
    name: "Advent candle",
    category: "Christmas",
    layout: "frame",
    palette: { name: "Candle", bg: { kind: "solid", color: "#120a24" }, ink: "#ffffff", soft: "#dddddd", accent: "#e7c46b", onAccent: "#120a24", card: "#ffffff1a", deep: "#120a24" },
    fonts: "classic",
    copy: { title: "Hope", eyebrow: "First Sunday of Advent", icon: "flame", rows: [{ icon: "clock", text: "10 am" }, { icon: "nope", text: "x" }] },
  };

  it("keeps what the studio can draw and drops the rest", () => {
    const specs = sanitizeTemplateSpecs(
      [good, { ...good, id: "bad-layout", layout: "nope" }, { ...good, id: "bad-category", category: "Nope" }, { ...good, id: "bad-palette", palette: { ink: "red" } }, { ...good, id: "" }, "junk", good],
      "pack:seasons",
    );
    expect(specs.map((spec) => spec.id)).toEqual(["pack:seasons:advent-1"]);
    expect(specs[0]!.copy.rows).toEqual([{ icon: "clock", text: "10 am" }]);
    const [entry] = packEntries(specs, "seasons");
    expect(entry!.pack).toBe("seasons");
    expect(entry!.build(16 / 9).layers.length).toBeGreaterThan(2);
  });

  it("reads the packs shipped with the app", async () => {
    const { readFileSync } = await import("node:fs");
    const index = JSON.parse(readFileSync("static/template-packs/index.json", "utf8")) as Array<{ id: string; file: string; count: number }>;
    expect(index.length).toBeGreaterThan(0);
    for (const pack of index) {
      const raw = JSON.parse(readFileSync(`static/template-packs/${pack.file}`, "utf8")) as { templates: unknown[] };
      const specs = sanitizeTemplateSpecs(raw.templates, `pack:${pack.id}`);
      expect(specs.length, pack.id).toBe(raw.templates.length);
      expect(pack.count, pack.id).toBe(specs.length);
      for (const spec of specs) for (const aspect of Object.values(SHAPES)) expect(buildTemplate(spec, aspect).layers.length).toBeGreaterThan(0);
    }
  });
});
