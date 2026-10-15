import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState, frame, setPreview } from "./live";
import { importDocument, preserveServiceItems } from "./import-content";
import { presentText } from "./present";
import { defaultTheme } from "./theme";

const theme = defaultTheme();
let n = 0;
const uid = () => `id-${++n}`;

describe("content import", () => {
  it("turns plain text and Markdown into slides without touching Program", () => {
    n = 0;
    const text = importDocument("welcome.txt", "Come in and sit.", uid);
    expect(text).toHaveLength(1);
    expect(text[0]?.kind).toBe("slide");
    expect(text[0]?.slide?.heading).toBe("welcome");
    expect(text[0]?.slide?.body).toBe("Come in and sit.");

    n = 0;
    const markdown = importDocument(
      "order.md",
      "# Welcome\nCome in.\n\n## Offering\nGive cheerfully.",
      uid,
    );
    expect(markdown.map((item) => item.slide?.heading)).toEqual(["Welcome", "Offering"]);
    expect(markdown[1]?.slide?.body).toBe("Give cheerfully.");

    let live = createLiveState(theme);
    const program = live.program;
    const model = presentText({
      theme,
      layout: "title",
      heading: markdown[0]!.slide!.heading,
      body: markdown[0]!.slide!.body,
    });
    live = setPreview(live, frame(model, markdown[0]!.id, "cut"));
    expect(live.program).toEqual(program);
  });

  it("rejects an empty file or an unsupported format without compiling a frame", () => {
    const live = createLiveState(theme);
    const program = live.program;
    expect(() => importDocument("notes.txt", "   ", uid)).toThrow(/no content/i);
    expect(() => importDocument("talk.pdf", "%PDF-1.4", uid)).toThrow(/cannot import that format/i);
    expect(() => importDocument("deck.pptx", "pk", uid)).toThrow(/cannot import that format/i);
    expect(live.program).toEqual(program);
    expect(JSON.stringify(live.program)).not.toMatch(/%PDF/);
  });

  it("keeps unknown service item kinds and extra fields", () => {
    const items = preserveServiceItems([
      { id: "cam-1", kind: "camera", title: "Cam 1", camera: { deviceId: "alpha" } },
      { id: "welcome", kind: "slide", title: "Welcome", slide: { heading: "Welcome", body: "", imageId: null } },
      { kind: "ndi" },
    ]);
    expect(items.map((item) => item.kind)).toEqual(["camera", "slide"]);
    expect(JSON.stringify(items[0])).toContain("alpha");
    expect(items[1]?.slide?.heading).toBe("Welcome");

    let live = createLiveState(theme);
    const program = live.program;
    const model = presentText({ theme, layout: "title", heading: items[0]!.title, body: "" });
    live = setPreview(live, frame(model, items[0]!.id, "cut"));
    expect(live.program).toEqual(program);
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.lines[0]?.text).toBe("Cam 1");
  });
});
