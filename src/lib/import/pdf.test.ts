import { describe, expect, it } from "vitest";
import { pageName, renderScale } from "./pdf";

describe("pdf slides", () => {
  it("names pages after the file", () => {
    expect(pageName("Sermon.pdf", 0, 1)).toBe("Sermon.png");
    expect(pageName("Sermon.PDF", 2, 12)).toBe("Sermon — page 3.png");
    expect(pageName(".pdf", 0, 2)).toBe("Slides — page 1.png");
  });

  it("renders about 1920 pixels wide, within limits", () => {
    expect(renderScale(960)).toBe(2);
    expect(renderScale(720)).toBeCloseTo(2.667, 2);
    expect(renderScale(10)).toBe(6);
    expect(renderScale(0)).toBe(1);
  });
});
