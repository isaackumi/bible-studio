import { describe, expect, it } from "vitest";
import { squeezeFor } from "./fit-bar";

describe("a top bar that always fits", () => {
  it("takes no step when everything fits", () => {
    expect(squeezeFor(() => false)).toBe(0);
  });

  it("takes the first step at which the contents fit", () => {
    const widths = [1500, 1460, 1420, 1380];
    expect(squeezeFor((step) => widths[step]! > 1440)).toBe(2);
  });

  it("stops at the last step when nothing fits", () => {
    expect(squeezeFor(() => true)).toBe(3);
  });
});
