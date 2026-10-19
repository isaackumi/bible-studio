import { describe, expect, it } from "vitest";
import { hexColor, htmlToRich, parseRich, plainFromRich, encodeRich, richFromPlain, richIsEmpty, richLines, richToHtml, sanitizeRich, stepOf, type NodeLike } from "./rich-text";

// A stand-in for the editor's DOM: elements with attributes, and text.
function el(name: string, attrs: Record<string, string> = {}, ...children: Array<NodeLike | string>): NodeLike {
  return {
    nodeType: 1,
    nodeName: name.toUpperCase(),
    childNodes: children.map((child) => (typeof child === "string" ? text(child) : child)),
    getAttribute: (key: string) => attrs[key] ?? null,
  };
}
function text(value: string): NodeLike {
  return { nodeType: 3, nodeName: "#text", nodeValue: value, childNodes: [] };
}
const root = (...children: Array<NodeLike | string>) => el("div", {}, ...children);

describe("formatted text", () => {
  it("reads bold, italic, underline, strike, colour, highlight, font and size from the editor", () => {
    const doc = htmlToRich(
      root(
        el("h1", { style: "text-align: center" }, "Welcome"),
        el("div", {}, "Plain ", el("b", {}, "bold ", el("i", {}, "both")), " ", el("u", {}, "under"), el("s", {}, "gone")),
        el("div", {}, el("font", { color: "#ff0000", face: "Georgia", size: "6" }, "red"), el("span", { style: "background-color: rgb(255, 224, 102)" }, "lit")),
      ),
    );
    expect(doc.blocks[0]).toEqual({ type: "title", align: "center", runs: [{ text: "Welcome" }] });
    expect(doc.blocks[1]!.runs).toEqual([
      { text: "Plain " },
      { text: "bold ", bold: true },
      { text: "both", bold: true, italic: true },
      { text: " " },
      { text: "under", underline: true },
      { text: "gone", strike: true },
    ]);
    expect(doc.blocks[2]!.runs).toEqual([
      { text: "red", color: "#ff0000", font: "Georgia, serif", size: 2.2 },
      { text: "lit", highlight: "#ffe066" },
    ]);
  });

  it("reads bullets, numbers and quotes", () => {
    const doc = htmlToRich(root(el("ul", {}, el("li", {}, "one"), el("li", {}, "two")), el("ol", {}, el("li", {}, "first")), el("blockquote", {}, "said")));
    expect(doc.blocks.map((block) => block.type)).toEqual(["bullet", "bullet", "number", "quote"]);
    expect(richLines(doc)).toEqual(["• one", "• two", "1. first", "said"]);
  });

  it("keeps blank lines but not the editor's placeholder breaks", () => {
    const doc = htmlToRich(root("first", el("div", {}, el("br")), el("div", {}, "third"), el("div", {}, "a", el("br"), "b"), el("div", {}, el("br"))));
    expect(richLines(doc)).toEqual(["first", "", "third", "a", "b"]);
  });

  it("round-trips through the editor's markup, escaping what was typed", () => {
    const doc = sanitizeRich({ blocks: [{ type: "p", runs: [{ text: "<script>", bold: true, color: "#00ff00", size: 1.3 }] }, { type: "bullet", runs: [{ text: "x" }] }] })!;
    const html = richToHtml(doc);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<ul><li>x</li></ul>");
    expect(html).toContain('size="4"');
    expect(parseRich(encodeRich(doc))).toEqual(doc);
  });

  it("cleans what it does not know", () => {
    const doc = sanitizeRich({ blocks: [{ type: "weird", runs: [{ text: "a", color: "red", font: "Comic Sans", size: 9, bold: "yes" }, { text: "" }, { text: "b" }] }] })!;
    expect(doc.blocks[0]).toEqual({ type: "p", runs: [{ text: "a", size: 4 }, { text: "b" }] });
    expect(sanitizeRich("nope")).toBeNull();
    expect(parseRich("{broken")).toBeNull();
  });

  it("moves between the simple and formatted editors", () => {
    const doc = richFromPlain("Notices", "Prayer at 6\n- Bring a friend\n2. Youth Friday");
    expect(doc.blocks.map((block) => block.type)).toEqual(["title", "p", "bullet", "number"]);
    expect(plainFromRich(doc)).toEqual({ heading: "Notices", body: "Prayer at 6\n• Bring a friend\n1. Youth Friday" });
    expect(richIsEmpty(richFromPlain("", ""))).toBe(true);
    expect(richIsEmpty(doc)).toBe(false);
  });

  it("reads colours and sizes", () => {
    expect(hexColor("rgb(250, 79, 0)")).toBe("#fa4f00");
    expect(hexColor("#ABC")).toBe("#aabbcc");
    expect(hexColor("rgba(0, 0, 0, 0)")).toBeUndefined();
    expect(stepOf(1)).toBe(3);
    expect(stepOf(2.9)).toBe(7);
  });
});

describe("formatted text end to end", () => {
  it("a Formatted text source keeps its formatting through save and reaches the screen", async () => {
    const { buildSource, fieldsFromSource } = await import("./sources");
    const { compileSource } = await import("./composition");
    const { defaultTheme } = await import("./theme");
    const rich = sanitizeRich({ blocks: [{ type: "title", runs: [{ text: "Welcome", bold: true, color: "#fa4f00" }] }, { type: "bullet", runs: [{ text: "Coffee", italic: true }] }] })!;
    const source = buildSource({ type: "text", heading: "Welcome", body: "• Coffee", style: {}, rich });
    expect(source.payload.mode).toBe("rich");
    const back = fieldsFromSource(source);
    expect(back?.type === "text" && back.rich).toEqual(rich);
    const model = compileSource(source, { theme: defaultTheme(), now: 0 });
    expect(model.rich).toEqual(rich);
    expect(model.lines.map((line) => line.text)).toEqual(["Welcome", "• Coffee"]);
    // Through JSON, as it travels to the audience window.
    expect(JSON.parse(JSON.stringify(model)).rich).toEqual(rich);
  });
});

describe("formatted words on items", () => {
  const rich = sanitizeRich({ blocks: [{ type: "p", runs: [{ text: "Saturday 9am", bold: true }] }, { type: "bullet", runs: [{ text: "Bring a friend" }] }] })!;

  it("a formatted announcement keeps its heading and design, and its body is drawn formatted", async () => {
    const { presentAnnouncement } = await import("./announcement");
    const { defaultTheme } = await import("./theme");
    const { itemWithWords } = await import("./rich-text");
    const item = itemWithWords({ kind: "announcement", title: "Old", announcement: { heading: "Youth camp", body: "", design: "card" as const } as { heading: string; body: string; design: "card"; rich?: typeof rich } }, { heading: "Youth camp", body: "Saturday 9am\n• Bring a friend", rich });
    expect(item.announcement.design).toBe("card");
    expect(item.announcement.rich).toEqual(rich);
    expect(item.title).toBe("Youth camp");
    const model = presentAnnouncement({ theme: defaultTheme(), words: item.announcement });
    expect(model.announcement?.heading).toBe("Youth camp");
    expect(model.announcement?.rich).toEqual(rich);
    expect(model.lines.map((line) => line.text)).toEqual(["Youth camp", "Saturday 9am", "• Bring a friend"]);
  });

  it("a text item keeps its picture, and back in Simple loses only the formatting", async () => {
    const { itemWithWords } = await import("./rich-text");
    const base = { kind: "slide", title: "Text", slide: { heading: "Hi", body: "", imageId: "pic" } };
    const formatted = itemWithWords(base, { heading: "", body: "Saturday 9am", rich });
    expect(formatted.slide).toEqual({ heading: "", body: "Saturday 9am", imageId: "pic", rich });
    const simple = itemWithWords(formatted, { heading: "Hi", body: "Saturday 9am", rich: null });
    expect(simple.slide).toEqual({ heading: "Hi", body: "Saturday 9am", imageId: "pic" });
  });
});
