import { afterEach, describe, expect, it, vi } from "vitest";
import { fade, reducedMotion } from "./motion";

function page(calm: boolean, reduce: boolean) {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: reduce }) });
  vi.stubGlobal("getComputedStyle", () => ({ opacity: "1" }));
  vi.stubGlobal("document", { documentElement: { hasAttribute: (name: string) => calm && name === "data-calm" } });
}

describe("motion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("leaves motion out when the computer asks for less, or the desk is Calm", () => {
    page(false, true);
    expect(reducedMotion()).toBe(true);
    page(true, false);
    expect(reducedMotion()).toBe(true);
    page(false, false);
    expect(reducedMotion()).toBe(false);
  });

  it("makes transitions instant then, and keeps them otherwise", () => {
    page(false, true);
    expect(fade({} as Element, { duration: 160 }).duration).toBe(0);
    page(false, false);
    expect(fade({} as Element, { duration: 160 }).duration).toBe(160);
  });
});
