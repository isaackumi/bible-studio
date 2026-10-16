import { describe, expect, it } from "vitest";
import { dataUrlToBlob, exportThemePackage, readThemePackage, themePackageFileName } from "./theme-package";
import { defaultTheme } from "./theme";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("theme package", () => {
  it("round-trips a theme with a new id and its background picture", () => {
    const theme = { ...defaultTheme(), name: "Easter Morning", color: "#fff4d6", effects: { italic: true } };
    const pack = JSON.parse(JSON.stringify(exportThemePackage(theme, { name: "sunrise.png", dataUrl: PNG })));
    expect(pack.theme.id).toBeUndefined();
    const read = readThemePackage(pack, () => "theme:new");
    expect(read.theme).toMatchObject({ id: "theme:new", name: "Easter Morning", color: "#fff4d6", effects: { italic: true } });
    expect(read.background).toEqual({ name: "sunrise.png", dataUrl: PNG });
    expect(themePackageFileName(theme)).toBe("easter-morning.cstheme.json");
  });

  it("refuses other files, newer formats and non-image backgrounds", () => {
    expect(() => readThemePackage({ schemaVersion: 1, songs: [] })).toThrow(/not a Church Studio theme/);
    expect(() => readThemePackage({ format: "church-studio-theme", version: 99, theme: {} })).toThrow(/newer/);
    expect(() =>
      readThemePackage({ format: "church-studio-theme", version: 1, theme: {}, background: { name: "x", dataUrl: "data:text/html;base64,PHNjcmlwdD4=" } }),
    ).toThrow(/not a supported image/);
  });

  it("drops bad values and an image background that came without its picture", () => {
    const read = readThemePackage({
      format: "church-studio-theme",
      version: 1,
      theme: { name: "  ", color: "red", fontSize: 9000, background: { type: "image", assetId: "elsewhere" }, onload: "alert(1)" },
    });
    expect(read.theme.name).toBe("Imported theme");
    expect(read.theme.color).toBe(defaultTheme().color);
    expect(read.theme.fontSize).toBe(220);
    expect(read.theme.background).toEqual(defaultTheme().background);
    expect(read.theme).not.toHaveProperty("onload");
  });

  it("turns an embedded picture back into an image blob", () => {
    expect(dataUrlToBlob(PNG).type).toBe("image/png");
    expect(dataUrlToBlob(PNG).size).toBe(8);
  });
});
