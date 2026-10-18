import { describe, expect, it } from "vitest";
import { parseTranslations, translateRequest } from "./translate";
import { emptyAiSettings } from "./summarize";

describe("caption translation", () => {
  it("asks for every language at once", () => {
    const request = translateRequest({ ...emptyAiSettings(), key: "k" }, "God is love", ["es", "fr"], "Good morning");
    const body = JSON.parse(request.body);
    expect(JSON.stringify(body)).toContain("es (Español), fr (Français)");
    expect(JSON.stringify(body)).toContain("God is love");
  });

  it("reads the answer, ignoring languages not asked for", () => {
    expect(parseTranslations('```json\n{"es": "Dios es amor", "fr": "Dieu est amour", "de": "x"}\n```', ["es", "fr"])).toEqual({ es: "Dios es amor", fr: "Dieu est amour" });
    expect(parseTranslations("no json here", ["es"])).toEqual({});
  });
});
