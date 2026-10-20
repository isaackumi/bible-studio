import { describe, expect, it } from "vitest";
import { readBibleFile, readOpenSong, readOsis, readZefania, verseCount } from "./import";

describe("Bible file import", () => {
  it("reads Zefania XML, keeping book names and dropping notes", () => {
    const xml = `<?xml version="1.0"?><XMLBIBLE biblename="Twi Bible"><INFORMATION><title>Nkwa As&#603;m</title></INFORMATION>
      <BIBLEBOOK bnumber="1" bname="Genesis" bsname="Gen"><CHAPTER cnumber="1"><VERS vnumber="1">Mfiase no Onyankop&#596;n b&#596;&#715; &#596;soro ne asase.<NOTE>A note</NOTE></VERS><VERS vnumber="3">Na Onyankop&#596;n kaa s&#603;: Hann mmra!</VERS></CHAPTER></BIBLEBOOK>
      <BIBLEBOOK bnumber="43" bname="Yohane"><CHAPTER cnumber="3"><VERS vnumber="16"><STYLE fs="bold">Na</STYLE> Onyankop&#596;n d&#596; wiase</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`;
    const bible = readZefania(xml)!;
    expect(bible.name).toBe("Nkwa Asɛm");
    expect(bible.books.map((book) => [book.ord, book.name])).toEqual([[1, "Genesis"], [43, "Yohane"]]);
    expect(bible.books[0]!.chapters[0]).toEqual(["Mfiase no Onyankopɔn bɔˋ ɔsoro ne asase.", "", "Na Onyankopɔn kaa sɛ: Hann mmra!"]);
    expect(bible.books[1]!.chapters[2]![15]).toBe("Na Onyankopɔn dɔ wiase");
    expect(verseCount(bible)).toBe(3);
  });

  it("reads OSIS with container verses and with milestone verses", () => {
    const container = `<osis><osisText osisIDWork="WEB"><header><work osisWork="WEB"><title>World English Bible</title></work></header>
      <div type="book" osisID="John"><chapter osisID="John.3"><verse osisID="John.3.16">For God so loved the world<note>fn</note></verse></chapter></div></osisText></osis>`;
    const a = readOsis(container)!;
    expect(a).toMatchObject({ name: "World English Bible", abbreviation: "WEB" });
    expect(a.books[0]).toMatchObject({ ord: 43, name: "John" });
    expect(a.books[0]!.chapters[2]![15]).toBe("For God so loved the world");
    const milestones = `<osis><osisText osisIDWork="KJV"><div type="book" osisID="Gen"><chapter sID="Gen.1"/>
      <verse sID="Gen.1.1" osisID="Gen.1.1"/>In the beginning God created the heaven and the earth.<verse eID="Gen.1.1"/>
      <verse sID="Gen.1.2" osisID="Gen.1.2"/>And the earth was without form, and void;<verse eID="Gen.1.2"/></div></osisText></osis>`;
    expect(readOsis(milestones)!.books[0]!.chapters[0]).toEqual(["In the beginning God created the heaven and the earth.", "And the earth was without form, and void;"]);
  });

  it("reads OpenSong by book name, or by position for another language", () => {
    const english = `<bible n="ASV"><b n="Genesis"><c n="1"><v n="1">In the beginning</v></c></b><b n="Revelation"><c n="22"><v n="21">Amen.</v></c></b></bible>`;
    expect(readOpenSong(english)!.books.map((book) => book.ord)).toEqual([1, 66]);
    const books = Array.from({ length: 66 }, (_, n) => `<b n="Buk ${n + 1}"><c n="1"><v n="1">Asɛm ${n + 1}</v></c></b>`).join("");
    const twi = readOpenSong(`<bible>${books}</bible>`)!;
    expect(twi.books[42]).toMatchObject({ ord: 43, name: "Buk 43" });
  });

  it("names a Bible from the file when the file has no title, and refuses other files", () => {
    expect(readBibleFile(`<bible><b n="Genesis"><c n="1"><v n="1">Words</v></c></b></bible>`, "My Bible")!.name).toBe("My Bible");
    expect(readBibleFile("<html><body>Not a Bible</body></html>")).toBeNull();
  });
});
