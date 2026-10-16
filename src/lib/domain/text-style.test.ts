import { describe, expect, it } from "vitest";
import { effectsCss, encodeTextStyle, parseTextStyle, positionOf, sanitizeTextStyle, styleModel, withPosition } from "./text-style";
import { defaultTheme, emptyModel } from "./theme";

describe("text style", () => {
  it("keeps only valid fields and clamps size", () => {
    expect(sanitizeTextStyle({ size: 999, color: "#ABCDEF", bold: true, italic: "yes", align: "middle", vertical: "top", junk: 1 })).toEqual({
      size: 220,
      color: "#abcdef",
      bold: true,
      vertical: "top",
    });
    expect(sanitizeTextStyle(null)).toEqual({});
    expect(sanitizeTextStyle({ color: "red" })).toEqual({});
  });

  it("round-trips through a payload string and stays empty when unset", () => {
    expect(encodeTextStyle({})).toBe("");
    expect(parseTextStyle(encodeTextStyle({ italic: true, size: 64 }))).toEqual({ italic: true, size: 64 });
    expect(parseTextStyle("{broken")).toEqual({});
  });

  it("maps the nine positions to align and vertical, default center", () => {
    expect(positionOf({})).toBe("center");
    expect(positionOf(withPosition({}, "top-right"))).toBe("top-right");
    expect(withPosition({ bold: true }, "bottom-left")).toEqual({ bold: true, align: "left", vertical: "bottom" });
  });

  it("puts font, size, color and position on the frame theme and effects on the model", () => {
    const model = styleModel(emptyModel(defaultTheme()), { size: 72, color: "#ff0000", italic: true, align: "right", vertical: "top" });
    expect(model.theme).toMatchObject({ fontSize: 72, color: "#ff0000", align: "right", vertical: "top" });
    expect(model.style).toEqual({ italic: true });
    expect(styleModel(emptyModel(defaultTheme()), undefined).style).toBeUndefined();
  });

  it("lets an item turn off a theme-wide effect", () => {
    const theme = { ...defaultTheme(), effects: { italic: true, shadow: true } };
    const model = styleModel(emptyModel(theme), { italic: false });
    expect(model.style).toEqual({ italic: false, shadow: true });
    expect(effectsCss(model.style, theme)).toMatchObject({ "font-style": undefined, "text-shadow": expect.stringContaining("rgba") });
  });
});
