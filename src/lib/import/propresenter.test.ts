import { describe, expect, it } from "vitest";
import { decodeMessage, readPro6, readPro7 } from "./propresenter";

const b64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const rtf = (...lines: string[]) => String.raw`{\rtf1\ansi{\fonttbl\f0 Helvetica;}\f0\fs120 ` + lines.join(String.raw`\par `) + "}";

const PRO6 = `<?xml version="1.0" encoding="utf-8"?>
<RVPresentationDocument CCLISongTitle="Amazing Grace" CCLIAuthor="John Newton" CCLICopyrightYear="1779" CCLIPublisher="Public Domain" CCLISongNumber="22025" versionNumber="600">
  <array rvXMLIvarName="groups">
    <RVSlideGrouping name="Verse 1" uuid="G-V1">
      <array rvXMLIvarName="slides">
        <RVDisplaySlide uuid="S1"><array rvXMLIvarName="displayElements"><RVTextElement><NSString rvXMLIvarName="RTFData">${b64(rtf("Amazing grace how sweet the sound", "That saved a wretch like me"))}</NSString></RVTextElement></array></RVDisplaySlide>
        <RVDisplaySlide uuid="S2"><array rvXMLIvarName="displayElements"><RVTextElement><NSString rvXMLIvarName="PlainText">${b64("I once was lost but now am found\nWas blind but now I see")}</NSString></RVTextElement></array></RVDisplaySlide>
      </array>
    </RVSlideGrouping>
    <RVSlideGrouping name="Chorus &amp; Tag" uuid="G-C">
      <array rvXMLIvarName="slides">
        <RVDisplaySlide uuid="S3"><array rvXMLIvarName="displayElements"><RVTextElement RTFData="${b64(rtf("My chains are gone"))}"></RVTextElement></array></RVDisplaySlide>
        <RVDisplaySlide uuid="S4"><array rvXMLIvarName="displayElements"></array></RVDisplaySlide>
      </array>
    </RVSlideGrouping>
  </array>
  <array rvXMLIvarName="arrangements">
    <RVSongArrangement name="Sunday" uuid="A1"><array rvXMLIvarName="groupIDs"><NSString>G-V1</NSString><NSString>G-C</NSString><NSString>G-V1</NSString><NSString>missing</NSString></array></RVSongArrangement>
  </array>
</RVPresentationDocument>`;

describe("ProPresenter 6 import", () => {
  it("reads the parts, one screen per slide, the order and the credits", () => {
    const song = readPro6(PRO6)!;
    expect(song).toMatchObject({ title: "Amazing Grace", author: "John Newton", ccli: "22025", copyright: "1779 Public Domain" });
    expect(song.parts.map((part) => part.label)).toEqual(["Verse 1", "Chorus & Tag"]);
    expect(song.parts[0]!.lines).toEqual(["Amazing grace how sweet the sound", "That saved a wretch like me", "", "I once was lost but now am found", "Was blind but now I see"]);
    expect(song.parts[1]!.lines).toEqual(["My chains are gone"]);
    expect(song.order).toEqual(["G-V1", "G-C", "G-V1"]);
  });

  it("returns nothing for a file that is not a ProPresenter document", () => {
    expect(readPro6("<html></html>")).toBeNull();
  });
});

// A tiny protobuf writer, to build a ProPresenter 7 file laid out as the community schema says.
type Value = number | string | Uint8Array;
const varint = (value: number) => {
  const out: number[] = [];
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) byte |= 0x80;
    out.push(byte);
  } while (value > 0);
  return out;
};
const message = (...fields: Array<[number, Value]>) => {
  const out: number[] = [];
  for (const [number, value] of fields) {
    if (typeof value === "number") out.push(...varint(number * 8), ...varint(value));
    else {
      const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
      out.push(...varint(number * 8 + 2), ...varint(bytes.length), ...bytes);
    }
  }
  return Uint8Array.from(out);
};
const uuid = (id: string) => message([1, id]);
const ids = {
  v1: "11111111-1111-1111-1111-111111111111",
  c: "22222222-2222-2222-2222-222222222222",
  cue1: "AAAAAAAA-0000-0000-0000-000000000001",
  cue2: "AAAAAAAA-0000-0000-0000-000000000002",
  cue3: "AAAAAAAA-0000-0000-0000-000000000003",
  arrangement: "BBBBBBBB-0000-0000-0000-000000000001",
};
/** A cue: uuid, then an action whose slide holds a text element with RTF (nested, as in the app). */
const cue = (id: string, words: string) => message([1, uuid(id)], [10, message([1, message([2, message([1, message([3, message([5, message([13, rtf(...words.split("\n"))])])])])])])]);
const PRO7 = message(
  [2, uuid("99999999-9999-9999-9999-999999999999")],
  [3, "Amazing Grace (file name)"],
  [11, message([1, uuid(ids.arrangement)], [2, "Sunday"], [3, uuid(ids.c)], [3, uuid(ids.v1)], [3, uuid(ids.c)])],
  [12, message([1, message([1, uuid(ids.v1)], [2, "Verse 1"])], [2, uuid(ids.cue1)], [2, uuid(ids.cue2)])],
  [12, message([1, message([1, uuid(ids.c)], [2, "Chorus"])], [2, uuid(ids.cue3)])],
  [13, cue(ids.cue1, "Amazing grace how sweet the sound\nThat saved a wretch like me")],
  [13, cue(ids.cue2, "I once was lost but now am found")],
  [13, cue(ids.cue3, "My chains are gone")],
  [14, message([1, "John Newton"], [3, "Amazing Grace"], [4, "Public Domain"], [5, 1779], [6, 22025])],
);

describe("ProPresenter 7 import", () => {
  it("decodes protobuf messages and refuses bytes that are not one", () => {
    expect(decodeMessage(message([1, 5], [2, "hi"]))?.map((field) => field.number)).toEqual([1, 2]);
    expect(decodeMessage(Uint8Array.from([0x0a, 0x50]))).toBeNull();
  });

  it("reads the groups, one screen per cue, the arrangement and the CCLI details", () => {
    const song = readPro7(PRO7)!;
    expect(song).toMatchObject({ title: "Amazing Grace", author: "John Newton", ccli: "22025", copyright: "1779 Public Domain" });
    expect(song.parts.map((part) => part.label)).toEqual(["Verse 1", "Chorus"]);
    expect(song.parts[0]!.lines).toEqual(["Amazing grace how sweet the sound", "That saved a wretch like me", "", "I once was lost but now am found"]);
    expect(song.order).toEqual([ids.c, ids.v1, ids.c]);
  });

  it("returns nothing for bytes that are not a presentation", () => {
    expect(readPro7(new TextEncoder().encode("just some text"))).toBeNull();
  });
});
