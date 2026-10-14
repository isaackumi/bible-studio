import { describe, expect, it } from "vitest";
import { presentImageOrEmpty, presentScripture } from "./present";
import { defaultTheme } from "./theme";

describe("presentation model", () => {
  it("formats scripture without knowing which translation supplied the words", () => {
    const model = presentScripture({
      theme: defaultTheme(),
      reference: "John 3:16-17",
      attribution: "WEB",
      verses: [
        { verse: 16, text: "For God so loved the world" },
        { verse: 17, text: "For God didn't send his Son" },
      ],
    });
    expect(model.layout).toBe("scripture");
    expect(model.attribution).toBe("WEB");
    expect(model.lines.map((line) => line.marker)).toEqual(["16", "17"]);
    expect(model.lines[0]?.text).toContain("loved the world");
  });

  it("keeps a lower-third theme on the scripture layout", () => {
    const theme = { ...defaultTheme(), layout: "lower-third" as const };
    const model = presentScripture({
      theme,
      reference: "John 3:16",
      attribution: "KJV",
      verses: [{ verse: 16, text: "For God so loved the world" }],
    });
    expect(model.layout).toBe("scripture");
    expect(model.theme.layout).toBe("lower-third");
  });

  it("shows an empty frame when an image file is missing", () => {
    const model = presentImageOrEmpty(defaultTheme(), null);
    expect(model.layout).toBe("empty");
    expect(model.imageUrl).toBeNull();
  });
});
