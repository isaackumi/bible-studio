import { describe, expect, it } from "vitest";
import { defaultTheme, sanitizeTheme, sanitizeTransition, transitionChanged } from "./theme";

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

  it("does not treat the stored transition as a new edit", () => {
    const theme = defaultTheme();
    expect(transitionChanged(theme.transition, "fade", 450)).toBe(false);
    expect(transitionChanged({ type: "cut", ms: 750 }, "cut", 750)).toBe(false);
    expect(transitionChanged({ type: "fade", ms: 450 }, "cut", 450)).toBe(true);
    expect(transitionChanged({ type: "fade", ms: 450 }, "fade", 5000)).toBe(true);
  });
});