import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState, frame, programPacket, setPreview } from "./live";
import { presentText } from "./present";
import {
  deskNotes,
  sanitizeSermon,
  sermonAudienceItem,
  sermonError,
  sermonModelContainsNotes,
} from "./sermon";
import { defaultTheme } from "./theme";
import type { Sermon } from "./types";

const theme = defaultTheme();
const NOTES = "OPERATOR-ONLY: stay off the audience screen.";
const SECTION_NOTES = "Cue the band. Do not put this on Program.";

function sermon(partial: Partial<Sermon> = {}): Sermon {
  return sanitizeSermon({
    id: "sermon-1",
    title: "The Word",
    speaker: "Ada",
    notes: NOTES,
    sections: [
      {
        id: "sec-1",
        name: "Opening",
        notes: SECTION_NOTES,
        items: [],
      },
    ],
    updatedAt: "2026-10-15T00:00:00.000Z",
    ...partial,
  });
}

describe("sermon content", () => {
  it("keeps operator notes on the desk and compiles a section to an audience slide without them", () => {
    const doc = sermon();
    expect(deskNotes(doc, "sec-1")).toContain(NOTES);
    expect(deskNotes(doc, "sec-1")).toContain(SECTION_NOTES);
    const item = sermonAudienceItem(doc.sections[0]!);
    expect(item.kind).toBe("slide");
    expect(item.slide?.heading).toBe("Opening");
    expect(JSON.stringify(item)).not.toContain(NOTES);
    expect(JSON.stringify(item)).not.toContain(SECTION_NOTES);
  });

  it("does not copy notes onto Preview or Program", () => {
    const doc = sermon();
    const item = sermonAudienceItem(doc.sections[0]!);
    const model = presentText({
      theme,
      layout: "title",
      heading: item.slide?.heading ?? item.title,
      body: item.slide?.body ?? "",
    });
    expect(sermonModelContainsNotes(model, doc)).toBe(false);

    let live = createLiveState(theme);
    const program = live.program;
    live = setPreview(live, frame(model, item.id, "cut"));
    expect(live.program).toEqual(program);
    expect(sermonModelContainsNotes(live.preview.model, doc)).toBe(false);

    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(sermonModelContainsNotes(taken.program.model, doc)).toBe(false);
    expect(JSON.stringify(programPacket(taken, 200))).not.toContain(NOTES);
    expect(JSON.stringify(programPacket(taken, 200))).not.toContain(SECTION_NOTES);
  });

  it("uses an existing presentation item when the section already has one", () => {
    const doc = sermon({
      sections: [
        {
          id: "sec-1",
          name: "Opening",
          notes: SECTION_NOTES,
          items: [
            {
              id: "slide-1",
              kind: "slide",
              title: "John 1",
              slide: { heading: "In the beginning", body: "was the Word", imageId: null },
            },
          ],
        },
      ],
    });
    const item = sermonAudienceItem(doc.sections[0]!);
    expect(item.id).toBe("slide-1");
    expect(item.slide?.heading).toBe("In the beginning");
    expect(JSON.stringify(item)).not.toContain(SECTION_NOTES);
  });

  it("asks for a title before save", () => {
    expect(sermonError(sermon({ title: "   " }))).toBe("Add a sermon title.");
    expect(sermonError(sermon())).toBeNull();
  });
});

describe("forgiving sermon search", async () => {
  const { searchSermonHits } = await import("./sermon");
  const sermon = {
    id: "s1",
    title: "The fruit of the Spirit",
    speaker: "Pastor Ama",
    notes: "",
    sections: [
      { id: "a", name: "Love is patient", notes: "Galatians five, the first fruit", items: [] },
      { id: "b", name: "Joy in trials", notes: "James one two", items: [] },
    ],
  } as unknown as Parameters<typeof searchSermonHits>[0][number];

  it("finds sermons with slips and partial words", () => {
    expect(searchSermonHits([sermon], "fruit of the spirt")[0]?.sermonId).toBe("s1");
    expect(searchSermonHits([sermon], "pastr ama").length).toBeGreaterThan(0);
    expect(searchSermonHits([sermon], "joy trails")[0]?.sectionId).toBe("b");
    expect(searchSermonHits([sermon], "zebra crossing")).toEqual([]);
  });
});
