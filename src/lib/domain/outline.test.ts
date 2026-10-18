import { describe, expect, it } from "vitest";
import { buildOutline, outlineHtml, outlineText } from "./outline";
import type { Service, Song } from "./types";

const songs: Song[] = [
  {
    id: "s1",
    title: "Way Maker",
    author: "Sinach",
    sections: [
      { id: "v", kind: "verse", label: "Verse 1", lines: [] },
      { id: "c", kind: "chorus", label: "Chorus", lines: [] },
    ],
    order: ["v", "c", "c"],
  },
];
const service: Service = {
  id: "x",
  name: "Sunday service",
  startTime: "08:00",
  updatedAt: "",
  sections: [
    { id: "a", name: "Opening Prayer", minutes: 60, items: [] },
    { id: "b", name: "Worship", until: "09:30", items: [{ id: "i1", kind: "lyric", title: "Way Maker", lyric: { songId: "s1", sectionId: "v" } }] },
    {
      id: "c",
      name: "Preaching",
      minutes: 45,
      items: [
        { id: "i2", kind: "bible", title: "John 3:16", bible: { translationId: "kjv", bookOrd: 43, chapter: 3, startVerse: 16, endVerse: 16, reference: "John 3:16" } },
        { id: "i3", kind: "announcement", title: "Camp", announcement: { heading: "Youth camp", body: "Saturday 9am" } },
      ],
    },
  ],
};

describe("programme outline", () => {
  const outline = buildOutline(service, songs, "Grace Chapel", new Date(2026, 9, 18));

  it("lays out parts with times and items", () => {
    expect(outline.parts.map((part) => `${part.name} ${part.length}`)).toEqual(["Opening Prayer 1 h", "Worship 30 min", "Preaching 45 min"]);
    expect(outline.parts[1]!.items[0]).toEqual({ kind: "Song", title: "Way Maker", detail: "Sinach · V1 C C" });
  });

  it("writes a run sheet and an order of service as text", () => {
    const sheet = outlineText(outline, { style: "run-sheet", times: true, items: true });
    expect(sheet).toContain("Song: Way Maker — Sinach · V1 C C");
    expect(sheet).toContain("Announcement: Youth camp — Saturday 9am");
    const order = outlineText(outline, { style: "order", times: false, items: true });
    expect(order).toContain("   Way Maker\n");
    expect(order).not.toContain("Youth camp");
    expect(order).not.toContain("(1 h)");
  });

  it("makes a printable page with escaped words", () => {
    const html = outlineHtml({ ...outline, title: "A <b> & C" }, { style: "run-sheet", times: true, items: true });
    expect(html).toContain("A &lt;b&gt; &amp; C");
    expect(html).toContain("@page");
  });
});
