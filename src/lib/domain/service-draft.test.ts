import { describe, expect, it } from "vitest";
import { draftService, titleKey } from "./service-draft";
import type { Song } from "./types";

const song = (id: string, title: string): Song => ({ id, title, author: "", sections: [{ id: `${id}-v1`, label: "Verse 1", lines: ["…"] }] }) as Song;
const SONGS = [song("amazing", "Amazing Grace"), song("great", "How Great Thou Art"), song("blessed", "Blessed Assurance"), song("holy", "Holy, Holy, Holy")];

function draft(text: string) {
  let n = 0;
  return draftService(text, { songs: SONGS, translationId: "kjv", newId: () => `id${++n}`, now: new Date("2026-10-27T10:00:00Z") });
}

describe("a pasted order of service as a draft service", () => {
  it("makes the parts, songs from the library, readings, announcements, leaders and times", () => {
    const { service, missingSongs, counts } = draft(`Sunday Service — 27 October

10:00 Call to Worship – Elder Mensah
Praise & Worship (20 min)
  Amazing Grace
  How Great Thou Art
  Way Maker
Scripture Reading: John 3:16-18
Announcements
  Youth camp registration closes Friday
  Harvest thanksgiving on 9 November
Sermon: "Faith that moves" – Pastor Kojo (Hebrews 11:1-6)
Offering
Closing Hymn: Blessed Assurance
Benediction`);
    expect(service.name).toBe("Sunday Service — 27 October");
    expect(service.sections.map((section) => section.name)).toEqual(["Call to Worship", "Praise & Worship", "Scripture Reading", "Announcements", "Sermon: Faith that moves", "Offering", "Closing Hymn", "Benediction"]);
    const part = (name: string) => service.sections.find((section) => section.name === name)!;
    expect(part("Call to Worship").leader).toBe("Elder Mensah");
    expect(part("Praise & Worship")).toMatchObject({ minutes: 20, items: [{ kind: "lyric", title: "Amazing Grace", lyric: { songId: "amazing", sectionId: "amazing-v1" } }, { kind: "lyric", title: "How Great Thou Art" }] });
    expect(part("Scripture Reading").items).toEqual([expect.objectContaining({ kind: "bible", title: "John 3:16-18", bible: expect.objectContaining({ translationId: "kjv", bookOrd: 43, chapter: 3, startVerse: 16, endVerse: 18 }) })]);
    expect(part("Announcements").items.map((item) => item.title)).toEqual(["Youth camp registration closes Friday", "Harvest thanksgiving on 9 November"]);
    expect(part("Sermon: Faith that moves")).toMatchObject({ leader: "Pastor Kojo", items: [{ kind: "bible", title: "Hebrews 11:1-6" }] });
    // "Closing Hymn: Blessed Assurance": the part, with the library's song in it.
    expect(part("Closing Hymn").items).toEqual([expect.objectContaining({ kind: "lyric", lyric: { songId: "blessed", sectionId: "blessed-v1" } })]);
    expect(missingSongs).toEqual([{ title: "Way Maker", part: "Praise & Worship" }]);
    expect(counts).toEqual({ parts: 8, songs: 3, readings: 2, announcements: 2 });
  });

  it("reads a flat list typed in a message, with numbers, bullets and a whole psalm", () => {
    const { service, counts } = draft(`1. Welcome
2. Opening prayer
3. Holy Holy Holy
4. Psalm 23
5. Message - Rev. Asante`);
    expect(service.name).toBe("Sunday Service");
    expect(service.sections.map((section) => section.name)).toEqual(["Welcome", "Opening prayer", "Psalms 23", "Message"]);
    // A library song between parts joins the part before it, rather than becoming one.
    expect(service.sections[1]!.items).toEqual([expect.objectContaining({ kind: "lyric", title: "Holy, Holy, Holy" })]);
    expect(service.sections[2]!.items[0]!.bible).toMatchObject({ bookOrd: 19, chapter: 23, startVerse: 1, endVerse: 200, reference: "Psalms 23" });
    expect(service.sections[3]!.leader).toBe("Rev. Asante");
    expect(counts.songs).toBe(1);
  });

  it("never makes a song up: a song line the library lacks is listed, under its part", () => {
    const { service, missingSongs } = draft(`Worship
Song: Goodness of God
Hymn 12 – Holy, Holy, Holy`);
    expect(service.sections).toHaveLength(1);
    expect(service.sections[0]!.items).toEqual([expect.objectContaining({ title: "Holy, Holy, Holy" })]);
    expect(missingSongs).toEqual([{ title: "Goodness of God", part: "Worship" }]);
  });

  it("matches titles whatever the case, punctuation or a leading 'The'", () => {
    expect(titleKey("Holy, Holy, Holy!")).toBe(titleKey("holy holy holy"));
    expect(titleKey("The Old Rugged Cross")).toBe(titleKey("Old Rugged Cross"));
    expect(titleKey("Praise & Worship")).toBe("praise and worship");
  });

  it("gives an empty paste an empty service, never a made-up part", () => {
    expect(draft("  \n\n ").service.sections).toEqual([]);
  });
});
