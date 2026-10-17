import { describe, expect, it } from "vitest";
import { parsePptx, pptxMediaFiles, pptxToDeck } from "./pptx";
import { createZip } from "./zip";

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const encoder = new TextEncoder();
const file = (name: string, text: string) => ({ name, data: encoder.encode(text) });

function rels(list: Array<[id: string, type: string, target: string]>) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map(([id, type, target]) => `<Relationship Target="${target}" Type="${REL}/${type}" Id="${id}"/>`)
    .join("")}</Relationships>`;
}

function slide(tree: string, extra = "") {
  return `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}><p:cSld>${extra}<p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${tree}</p:spTree></p:cSld></p:sld>`;
}

const layout = `<p:sldLayout ${NS}><p:cSld><p:spTree>
  <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="1219200" y="685800"/><a:ext cx="9753600" cy="1371600"/></a:xfrm></p:spPr></p:sp>
  <p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="609600" y="2057400"/><a:ext cx="10972800" cy="4114800"/></a:xfrm></p:spPr></p:sp>
</p:spTree></p:cSld></p:sldLayout>`;

const master = `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></p:bgPr></p:bg><p:spTree/></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1"/>
<p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle></p:txStyles>
</p:sldMaster>`;

const theme = `<a:theme ${NS}><a:themeElements><a:clrScheme name="Test">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2>
<a:accent1><a:srgbClr val="2266CC"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
</a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;

// Slide "A" lives in slide2.xml but is listed first: order must follow the id list.
const slideA = slide(
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
    <p:spPr><a:xfrm><a:off y="685800" x="1219200"/><a:ext cx="9753600" cy="1371600"/></a:xfrm></p:spPr>
    <p:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="4000" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr><a:t>Welcome &amp; Worship</a:t></a:r></a:p></p:txBody></p:sp>
  <p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>
    <p:txBody><a:bodyPr/><a:p><a:pPr algn="r"/><a:r><a:rPr i="1"/><a:t>Line &lt;one&gt;</a:t></a:r><a:r><a:t xml:space="preserve"> &#x2014; part&#39;s two</a:t></a:r></a:p><a:p><a:r><a:t>Second &quot;line&quot;</a:t></a:r></a:p></p:txBody></p:sp>
  <p:sp><p:nvSpPr><p:cNvPr id="4" name="Box"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="0" y="6096000"/><a:ext cx="12192000" cy="762000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="003366"/></a:solidFill></p:spPr></p:sp>
  <p:pic><p:nvPicPr><p:cNvPr id="5" name="Picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
    <p:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
    <p:spPr><a:xfrm><a:off x="6096000" y="3429000"/><a:ext cx="3048000" cy="1714500"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr></p:pic>`,
  `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FAF0E6"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`,
);

const slideB = slide(
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>
    <p:txBody><a:bodyPr/><a:p><a:r><a:rPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:rPr><a:t>Announcements</a:t></a:r></a:p></p:txBody></p:sp>
  <p:sp><p:nvSpPr><p:cNvPr id="3" name="Empty"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>
  <p:sp><p:nvSpPr><p:cNvPr id="4" name="Dot"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="609600" y="609600"/><a:ext cx="1219200" cy="1219200"/></a:xfrm><a:prstGeom prst="ellipse"/></p:spPr>
    <p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent2"/></a:fillRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style></p:sp>`,
  `<p:bg><p:bgPr><a:blipFill><a:blip r:embed="rIdBg"/></a:blipFill></p:bgPr></p:bg>`,
);

const notes = `<p:notes ${NS}><p:cSld><p:spTree>
  <p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>
  <p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>
    <p:txBody><a:bodyPr/><a:p><a:r><a:t>Greet visitors</a:t></a:r></a:p><a:p><a:r><a:t>Mention the picnic</a:t></a:r></a:p></p:txBody></p:sp>
  <p:sp><p:nvSpPr><p:cNvPr id="4" name="Number"/><p:cNvSpPr/><p:nvPr><p:ph type="sldNum" idx="5"/></p:nvPr></p:nvSpPr><p:spPr/>
    <p:txBody><a:bodyPr/><a:p><a:fld type="slidenum"><a:t>1</a:t></a:fld></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:notes>`;

function fixture() {
  return createZip([
    file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`),
    file(
      "ppt/presentation.xml",
      `<?xml version="1.0"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId r:id="rId2" id="257"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    ),
    file("ppt/_rels/presentation.xml.rels", rels([["rId1", "slideMaster", "slideMasters/slideMaster1.xml"], ["rId2", "slide", "slides/slide1.xml"], ["rId3", "slide", "/ppt/slides/slide2.xml"]])),
    file("ppt/slides/slide1.xml", slideB),
    file("ppt/slides/_rels/slide1.xml.rels", rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rIdBg", "image", "../media/image2.jpeg"]])),
    file("ppt/slides/slide2.xml", slideA),
    file(
      "ppt/slides/_rels/slide2.xml.rels",
      rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rIdImg", "image", "../media/image1.png"], ["rId9", "notesSlide", "../notesSlides/notesSlide1.xml"]]),
    ),
    file("ppt/notesSlides/notesSlide1.xml", notes),
    file("ppt/slideLayouts/slideLayout1.xml", layout),
    file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]])),
    file("ppt/slideMasters/slideMaster1.xml", master),
    file("ppt/slideMasters/_rels/slideMaster1.xml.rels", rels([["rId1", "theme", "../theme/theme1.xml"]])),
    file("ppt/theme/theme1.xml", theme),
    { name: "ppt/media/image1.png", data: PNG },
    { name: "ppt/media/image2.jpeg", data: new Uint8Array([0xff, 0xd8, 0xff]) },
    { name: "ppt/media/unused.png", data: PNG },
  ]);
}

// A 4:3 deck with no layouts, no theme and no sizes on runs.
function plainFixture() {
  return createZip([
    file("ppt/presentation.xml", `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000" type="screen4x3"/></p:presentation>`),
    file("ppt/_rels/presentation.xml.rels", rels([["rId1", "slide", "slides/slide1.xml"]])),
    file(
      "ppt/slides/slide1.xml",
      slide(`<p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/><p:cNvSpPr/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:spPr/>
        <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="3600"/><a:t>Hymn 42</a:t></a:r></a:p></p:txBody></p:sp>
      <p:grpSp><p:nvGrpSpPr><p:cNvPr id="9" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
        <p:grpSpPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="1828800" cy="1828800"/><a:chOff x="0" y="0"/><a:chExt cx="914400" cy="914400"/></a:xfrm></p:grpSpPr>
        <p:sp><p:nvSpPr><p:cNvPr id="10" name="R"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="0"/><a:ext cx="457200" cy="457200"/></a:xfrm><a:prstGeom prst="roundRect"/><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill></p:spPr></p:sp>
      </p:grpSp>`),
    ),
  ]);
}

describe("pptx import", () => {
  it("orders slides by the presentation id list, not by file name", async () => {
    const deck = await parsePptx(fixture());
    expect(deck.width).toBe(12192000);
    expect(deck.height).toBe(6858000);
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0]!.elements.find((element) => element.kind === "text")).toMatchObject({ text: "Welcome & Worship" });
    expect(deck.slides[1]!.elements.find((element) => element.kind === "text")).toMatchObject({ text: "Announcements" });
  });

  it("reads title and body text with size, bold, italic, color and alignment", async () => {
    const [first] = (await parsePptx(fixture())).slides;
    const texts = first!.elements.filter((element) => element.kind === "text");
    expect(texts).toHaveLength(2);
    const title = texts[0]!;
    // 40pt on a 960pt-wide slide paints at 80px on the 1920px canvas.
    expect(title.style).toMatchObject({ size: 80, bold: true, color: "#ff0000", align: "center", vertical: "middle", fontFamily: "Georgia" });
    expect(title.bounds).toEqual({ x: 10, y: 10, w: 80, h: 20 });
    const body = texts[1]!;
    expect(body.text).toBe("Line <one> — part's two\nSecond \"line\"");
    // No size on the runs: the master body style (28pt) applies.
    expect(body.style).toMatchObject({ size: 56, italic: true, align: "right", fontFamily: "Arial" });
  });

  it("falls back to the layout placeholder position when a shape has none", async () => {
    const [first, second] = (await parsePptx(fixture())).slides;
    const body = first!.elements.filter((element) => element.kind === "text")[1]!;
    expect(body.bounds).toEqual({ x: 5, y: 30, w: 90, h: 60 });
    const title = second!.elements.find((element) => element.kind === "text")!;
    expect(title.bounds).toEqual({ x: 10, y: 10, w: 80, h: 20 });
    // Theme color through the scheme, centered and 44pt from the master title style.
    expect(title.kind === "text" && title.style).toMatchObject({ color: "#2266cc", align: "center", size: 88 });
  });

  it("reads pictures, shapes, backgrounds and notes", async () => {
    const [first, second] = (await parsePptx(fixture())).slides;
    expect(first!.elements.map((element) => element.kind)).toEqual(["text", "text", "shape", "image"]);
    expect(first!.elements[2]).toEqual({ kind: "shape", shape: "rect", fill: "#003366", bounds: { x: 0, y: 88.89, w: 100, h: 11.11 } });
    expect(first!.elements[3]).toEqual({ kind: "image", media: "ppt/media/image1.png", bounds: { x: 50, y: 50, w: 25, h: 25 } });
    expect(first!.background).toEqual({ color: "#faf0e6" });
    expect(first!.notes).toBe("Greet visitors\nMention the picnic");
    // Theme style fill (fillRef) on a plain ellipse; an empty placeholder adds nothing.
    expect(second!.elements).toContainEqual({ kind: "shape", shape: "ellipse", fill: "#ed7d31", bounds: { x: 5, y: 8.89, w: 10, h: 17.78 } });
    expect(second!.elements).toHaveLength(2);
    expect(second!.background).toEqual({ media: "ppt/media/image2.jpeg" });
    expect(second!.notes).toBe("");
  });

  it("lists only the media the slides use", async () => {
    const files = pptxMediaFiles(await parsePptx(fixture()));
    expect(files.map((entry) => [entry.path, entry.name, entry.mime])).toEqual([
      ["ppt/media/image1.png", "image1.png", "image/png"],
      ["ppt/media/image2.jpeg", "image2.jpeg", "image/jpeg"],
    ]);
    expect(files[0]!.data).toEqual(PNG);
  });

  it("handles 4:3 slides, groups, default sizes and master backgrounds", async () => {
    const parsed = await parsePptx(plainFixture());
    const [only] = parsed.slides;
    expect(only!.background).toBeNull();
    const title = only!.elements[0]!;
    // 36pt on a 720pt-wide slide; no layout, so the default title spot.
    expect(title).toMatchObject({ kind: "text", text: "Hymn 42", style: { size: 96 }, bounds: { x: 6, y: 5, w: 88, h: 18 } });
    // Child at (0.5in, 0) of a 1in group scaled 2× and placed at 1in: lands at 2in, 1in, 1in × 1in.
    expect(only!.elements[1]).toEqual({ kind: "shape", shape: "rect", fill: "#00ff00", bounds: { x: 20, y: 13.33, w: 10, h: 13.33 } });
    const withMaster = await parsePptx(fixture());
    expect(withMaster.slides.every((entry) => entry.background)).toBe(true);
  });

  it("says plainly when a file is not a presentation", async () => {
    await expect(parsePptx(createZip([file("word/document.xml", "<w:document/>")]))).rejects.toThrow("That file is not a PowerPoint presentation.");
    await expect(parsePptx(new Uint8Array([1, 2, 3]))).rejects.toThrow("That file is not a PowerPoint presentation.");
  });
});

describe("pptx to deck", () => {
  it("builds one page per slide with elements in order and library media", async () => {
    const parsed = await parsePptx(fixture());
    const asked: string[] = [];
    const deck = pptxToDeck(parsed, "Sunday service", (mediaPath) => {
      asked.push(mediaPath);
      return mediaPath.endsWith("image1.png") ? { id: "asset:1", name: "image1.png", url: "blob:image1" } : null;
    });
    expect(deck.name).toBe("Sunday service");
    expect(deck.pages).toHaveLength(2);
    expect(asked).toEqual(expect.arrayContaining(["ppt/media/image1.png", "ppt/media/image2.jpeg"]));

    const [first, second] = deck.pages;
    expect(first!.layers.map((layer) => layer.source.type)).toEqual(["text", "text", "shape", "image"]);
    expect(first!.layers.map((layer) => layer.zIndex)).toEqual([0, 1, 2, 3]);
    expect(first!.layers[0]!.source.payload.body).toBe("Welcome & Worship");
    expect(JSON.parse(first!.layers[0]!.source.payload.style!)).toMatchObject({ size: 80, bold: true, color: "#ff0000", align: "center" });
    expect(first!.layers[3]!.source.payload).toMatchObject({ assetId: "asset:1", imageUrl: "blob:image1" });
    expect(first!.background).toMatchObject({ type: "color", color: "#faf0e6" });

    // The background picture is not in the library, so the page keeps a plain color.
    expect(second!.background).toMatchObject({ type: "color", color: "#ffffff" });
    expect(second!.layers.map((layer) => layer.source.type)).toEqual(["text", "shape"]);
  });

  it("uses a background picture from the library", async () => {
    const parsed = await parsePptx(fixture());
    const deck = pptxToDeck(parsed, "Bg", (mediaPath) => ({ id: `asset:${mediaPath}`, name: mediaPath, url: `blob:${mediaPath}` }));
    expect(deck.pages[1]!.background).toMatchObject({ type: "image", assetId: "asset:ppt/media/image2.jpeg", imageUrl: "blob:ppt/media/image2.jpeg" });
  });
});
