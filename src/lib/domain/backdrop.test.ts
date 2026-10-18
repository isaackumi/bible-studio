import { describe, expect, it } from "vitest";
import { backdropCss, sanitizeBackdrop } from "./backgrounds";

describe("photo and video background look", () => {
  it("keeps sensible values and drops the default", () => {
    expect(sanitizeBackdrop({ fit: "contain", scale: 9, blur: -2, tint: "#FFAA00", tintOpacity: 2 })).toEqual({ fit: "contain", scale: 3, blur: 0, tint: "#ffaa00", tintOpacity: 0.8 });
    expect(sanitizeBackdrop({ fit: "cover", scale: 1, blur: 0, tint: "#000000", tintOpacity: 0 })).toBeUndefined();
    expect(sanitizeBackdrop("x")).toBeUndefined();
  });

  it("turns the look into CSS, zooming a blurred picture so its edges stay covered", () => {
    expect(backdropCss(undefined)).toEqual({ size: "cover", objectFit: "cover", transform: "none", filter: "none" });
    expect(backdropCss({ fit: "stretch", scale: 1.5, blur: 0, tint: "#000000", tintOpacity: 0 })).toMatchObject({ size: "100% 100%", objectFit: "fill", transform: "scale(1.5)" });
    const soft = backdropCss({ fit: "cover", scale: 1, blur: 18, tint: "#000000", tintOpacity: 0 });
    expect(soft.filter).toBe("blur(18px)");
    expect(soft.transform).toBe("scale(1.1)");
  });
});
