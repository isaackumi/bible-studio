import { describe, expect, it } from "vitest";
import { sanitizeRich } from "./rich-text";
import { paintOverlays, sanitizeOverlays } from "./screen-overlays";
import { presentLowerThird, applyLowerThirdTemplate, compileSource, LOWER_THIRD_TEMPLATES, type Composition } from "./composition";
import { lyricsFor, sanitizeSong } from "./song";
import { deskNotesRich, sanitizeSermon } from "./sermon";
import { defaultTheme } from "./theme";
import type { Song } from "./types";

const bold = sanitizeRich({ blocks: [{ type: "p", runs: [{ text: "Pastor ", bold: true }, { text: "Ama", color: "#fa4f00" }] }] })!;

describe("formatting everywhere text is used", () => {
  it("overlays keep their formatted words through saving and painting", () => {
    const [overlay] = sanitizeOverlays([{ id: "o", kind: "lower-third", on: true, text: "Pastor Ama", subtitle: "Host", rich: bold, subtitleRich: { blocks: [] } }]);
    expect(overlay!.rich).toEqual(bold);
    expect(overlay!.subtitleRich).toBeUndefined();
    expect(paintOverlays([overlay!], () => null)[0]!.rich).toEqual(bold);
  });

  it("a lower third draws a formatted title over a smaller subtitle", () => {
    const theme = defaultTheme();
    const model = presentLowerThird(theme, "Pastor Ama", "Host", bold, null);
    expect(model.rich!.blocks[0]!.runs).toEqual(bold.blocks[0]!.runs);
    const small = theme.attribution.size / theme.fontSize;
    expect(model.rich!.blocks[1]!.runs[0]).toEqual({ text: "Host", size: Math.round(small * 100) / 100 });
    expect(presentLowerThird(theme, "Plain", "").rich).toBeUndefined();
  });

  it("a lower-third template change keeps the formatting it is given, and the layer's style", () => {
    const look = { id: "l", name: "L", layers: [{ id: "a", name: "A", bounds: { x: 0, y: 0, w: 50, h: 20 }, fit: "contain", visible: true, source: { type: "lower-third", id: "speaker", title: "x", payload: { style: '{"bold":true}' } } }] } as unknown as Composition;
    const next = applyLowerThirdTemplate(look, "a", LOWER_THIRD_TEMPLATES[0]!, "Pastor Ama", "", { title: bold });
    const source = next.layers[0]!.source;
    expect(source.payload.style).toBe('{"bold":true}');
    expect(compileSource(source, { theme: defaultTheme(), now: 0 }).rich?.blocks[0]!.runs).toEqual(bold.blocks[0]!.runs);
  });

  it("formatted lyrics stay line for line, and give way when the words change elsewhere", () => {
    const rich = sanitizeRich({ blocks: [{ type: "p", runs: [{ text: "Amazing ", bold: true }, { text: "grace" }] }, { type: "p", runs: [] }, { type: "p", runs: [{ text: "How sweet", italic: true }] }] })!;
    const song = { id: "s", title: "Grace", author: "", sections: [{ id: "v", kind: "verse", label: "Verse 1", lines: ["Amazing grace", "", "How sweet"], rich }] } as Song;
    const clean = sanitizeSong(song);
    expect(clean.sections[0]!.rich).toEqual(rich);
    const { lines } = lyricsFor(clean, "v", "Grace");
    expect(lines).toEqual([
      { text: "Amazing grace", runs: rich.blocks[0]!.runs },
      { text: "How sweet", runs: rich.blocks[2]!.runs },
    ]);
    const edited = sanitizeSong({ ...song, sections: [{ ...song.sections[0]!, lines: ["Something new"] }] });
    expect(edited.sections[0]!.rich).toBeUndefined();
    expect(edited.sections[0]!.lines).toEqual(["Something new"]);
  });

  it("sermon notes keep their formatting, and the desk shows both parts together", () => {
    const notes = sanitizeRich({ blocks: [{ type: "bullet", runs: [{ text: "Pause here", bold: true }] }] })!;
    const sermon = sanitizeSermon({ id: "m", title: "T", speaker: "", notes: "Pray first", sections: [{ id: "a", name: "A", notes: "Pause here", notesRich: notes, items: [] }], updatedAt: "" });
    expect(sermon.sections[0]!.notesRich).toEqual(notes);
    const doc = deskNotesRich(sermon, "a")!;
    expect(doc.blocks.map((block) => block.type)).toEqual(["p", "p", "bullet"]);
    expect(deskNotesRich({ ...sermon, sections: [{ ...sermon.sections[0]!, notesRich: undefined }] }, "a")).toBeNull();
  });
});
