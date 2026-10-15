import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState, frame, programPacket, setPreview } from "./live";
import { presentScripture } from "./present";
import {
  attachSermonItem,
  deskNotes,
  moveSermonSection,
  removeSermonSection,
  sanitizeSermon,
  searchSermonHits,
  sermonAudienceItem,
  sermonModelContainsNotes,
} from "./sermon";
import { defaultTheme } from "./theme";
import type { PresentationItem, Sermon } from "./types";

const theme = defaultTheme();
const NOTES = "OPERATOR-ONLY: stay off the audience screen.";
const SECTION_NOTES = "Cue the band. Do not put this on Program.";

const john: PresentationItem = {
  id: "bible-john",
  kind: "bible",
  title: "John 1:1",
  bible: {
    translationId: "kjv",
    bookOrd: 43,
    chapter: 1,
    startVerse: 1,
    endVerse: 1,
    reference: "John 1:1",
  },
};

const photo: PresentationItem = {
  id: "img-1",
  kind: "image",
  title: "Cross",
  image: { assetId: "asset-1" },
};

function sermon(partial: Partial<Sermon> = {}): Sermon {
  return sanitizeSermon({
    id: "sermon-1",
    title: "The Word",
    speaker: "Ada",
    notes: NOTES,
    sections: [
      { id: "sec-1", name: "Opening", notes: SECTION_NOTES, items: [] },
      { id: "sec-2", name: "Close", notes: "", items: [] },
    ],
    updatedAt: "2026-10-15T00:00:00.000Z",
    ...partial,
  });
}

describe("sermon presenter workflow", () => {
  it("searches title, speaker, notes, section name, and attached scripture", () => {
    const withVerse = attachSermonItem(sermon(), "sec-2", john);
    expect(searchSermonHits([withVerse], "   ")).toEqual([]);
    expect([...new Set(searchSermonHits([withVerse], "the word").map((hit) => hit.sermonId))]).toEqual(["sermon-1"]);
    expect(searchSermonHits([withVerse], "ada")[0]?.speaker).toBe("Ada");
    expect(searchSermonHits([withVerse], "cue the band")[0]?.sectionId).toBe("sec-1");
    expect(searchSermonHits([withVerse], "cue the band")[0]?.snippet).toMatch(/Cue the band/i);
    const verse = searchSermonHits([withVerse], "john 1:1");
    expect(verse).toHaveLength(1);
    expect(verse[0]?.sectionId).toBe("sec-2");
    expect(verse[0]?.snippet).toMatch(/John 1:1/i);
  });

  it("reorders and removes sections without dropping notes", () => {
    const moved = moveSermonSection(sermon(), "sec-2", -1);
    expect(moved.sections.map((section) => section.id)).toEqual(["sec-2", "sec-1"]);
    expect(deskNotes(moved, "sec-1")).toContain(SECTION_NOTES);
    const removed = removeSermonSection(moved, "sec-2");
    expect(removed.sections.map((section) => section.id)).toEqual(["sec-1"]);
    expect(deskNotes(removed, "sec-1")).toContain(NOTES);
  });

  it("attaches scripture or an image as the audience item and keeps notes on the desk", () => {
    const withVerse = attachSermonItem(sermon(), "sec-1", john);
    const item = sermonAudienceItem(withVerse.sections[0]!);
    expect(item.kind).toBe("bible");
    expect(item.bible?.reference).toBe("John 1:1");
    expect(JSON.stringify(item)).not.toContain(NOTES);
    expect(JSON.stringify(item)).not.toContain(SECTION_NOTES);
    expect(deskNotes(withVerse, "sec-1")).toContain(SECTION_NOTES);

    const withPhoto = attachSermonItem(withVerse, "sec-1", photo);
    expect(sermonAudienceItem(withPhoto.sections[0]!).kind).toBe("image");
    expect(JSON.stringify(sermonAudienceItem(withPhoto.sections[0]!))).not.toContain(SECTION_NOTES);
  });

  it("sanitized attachments are structured-cloneable for IndexedDB", () => {
    const proxied = new Proxy(john, {});
    const doc = attachSermonItem(sermon(), "sec-1", proxied);
    const cloned = structuredClone(sanitizeSermon(doc));
    expect(cloned.sections[0]?.items[0]?.kind).toBe("bible");
    expect(cloned.sections[0]?.items[0]?.bible?.reference).toBe("John 1:1");
  });

  it("previewing an attached passage does not write Program or leak notes", () => {
    const doc = attachSermonItem(sermon(), "sec-1", john);
    const item = sermonAudienceItem(doc.sections[0]!);
    const model = presentScripture({
      theme,
      reference: item.bible?.reference ?? "",
      attribution: "KJV",
      verses: [{ verse: 1, text: "In the beginning was the Word." }],
    });
    expect(sermonModelContainsNotes(model, doc)).toBe(false);

    let live = createLiveState(theme);
    const program = live.program;
    live = setPreview(live, frame(model, item.id, "cut"));
    expect(live.program).toEqual(program);
    expect(live.preview.model.reference).toBe("John 1:1");

    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(JSON.stringify(programPacket(taken, 200))).not.toContain(NOTES);
    expect(JSON.stringify(programPacket(taken, 200))).not.toContain(SECTION_NOTES);
  });
});
