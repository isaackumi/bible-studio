import { describe, expect, it } from "vitest";
import { displayWash } from "./backgrounds";
import { defaultTheme, factoryThemes, mergeFactoryThemes, sanitizeTheme, sanitizeTransition, transitionChanged } from "./theme";

describe("theme transitions", () => {
  it("keeps a saved transition and repairs malformed values", () => {
    expect(sanitizeTransition({ type: "cut", ms: 750 })).toEqual({ type: "cut", ms: 750 });
    expect(sanitizeTransition({ type: "slide", ms: 9000 })).toEqual({ type: "fade", ms: 2000 });
    expect(sanitizeTransition({ type: "cut", ms: -4 })).toEqual({ type: "cut", ms: 0 });
    expect(sanitizeTransition(undefined)).toEqual({ type: "fade", ms: 450 });
    const theme = sanitizeTheme({ ...defaultTheme(), transition: { type: "fade", ms: Number.NaN } });
    expect(theme.transition).toEqual({ type: "fade", ms: 450 });
    expect(theme.name).toBe("Signal");
    expect(theme.layout).toBe("frame");
  });

  it("keeps a lower-third layout and repairs an unknown one", () => {
    expect(sanitizeTheme({ ...defaultTheme(), layout: "lower-third" }).layout).toBe("lower-third");
    expect(sanitizeTheme({ ...defaultTheme(), layout: "slide" as "frame" }).layout).toBe("frame");
  });

  it("adds the built-in display themes without replacing a saved Signal", () => {
    const names = factoryThemes().map((theme) => theme.name);
    expect(names).toEqual(["Signal", "Manuscript", "Vespers", "Nave", "Day", "Caption", "Dawn", "Sea", "Ember", "Garden", "Glass"]);
    expect(new Set(factoryThemes().map((theme) => theme.id)).size).toBe(names.length);
    const custom = { ...defaultTheme(), color: "#ffffff", name: "House" };
    const merged = mergeFactoryThemes([custom]);
    expect(merged[0]).toMatchObject({ id: "theme-manuscript", name: "House", color: "#ffffff" });
    expect(merged.map((theme) => theme.name)).toEqual(["House", "Manuscript", "Vespers", "Nave", "Day", "Caption", "Dawn", "Sea", "Ember", "Garden", "Glass"]);
    expect(merged.find((theme) => theme.name === "Sea")?.background).toEqual({ type: "wash", washId: "sea" });
  });

  it("keeps a known display background and replaces an unknown one", () => {
    expect(displayWash("sea")?.name).toBe("Sea");
    const kept = sanitizeTheme({ ...defaultTheme(), background: { type: "wash", washId: "linen" } });
    expect(kept.background).toEqual({ type: "wash", washId: "linen" });
    const dropped = sanitizeTheme({ ...defaultTheme(), background: { type: "wash", washId: "missing" } });
    expect(dropped.background).toEqual({ type: "color", color: "#050505" });
  });

  it("does not treat the stored transition as a new edit", () => {
    const theme = defaultTheme();
    expect(transitionChanged(theme.transition, "fade", 450)).toBe(false);
    expect(transitionChanged({ type: "cut", ms: 750 }, "cut", 750)).toBe(false);
    expect(transitionChanged({ type: "fade", ms: 450 }, "cut", 450)).toBe(true);
    expect(transitionChanged({ type: "fade", ms: 450 }, "fade", 5000)).toBe(true);
  });
});