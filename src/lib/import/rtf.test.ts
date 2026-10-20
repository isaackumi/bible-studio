import { describe, expect, it } from "vitest";
import { rtfToText } from "./rtf";

describe("RTF to plain words", () => {
  it("keeps the words and the line breaks, and drops fonts and colours", () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2580{\fonttbl\f0\fswiss\fcharset0 Helvetica;}{\colortbl;\red255\green255\blue255;}\pard\qc\f0\fs120 \cf1 Amazing grace how sweet the sound\par That saved a wretch like me}`;
    expect(rtfToText(rtf)).toBe("Amazing grace how sweet the sound\nThat saved a wretch like me");
  });

  it("reads accented letters, curly quotes and unicode", () => {
    expect(rtfToText(String.raw`{\rtf1 J\'e9sus, Seigneur\par It\rquote s \ldblquote you\rdblquote}`)).toBe("Jésus, Seigneur\nIt’s “you”");
    expect(rtfToText(String.raw`{\rtf1\uc1 Onyame \u603?y\u603? kɛse}`)).toBe("Onyame ɛyɛ kɛse");
  });

  it("skips optional destinations and keeps escaped braces", () => {
    expect(rtfToText(String.raw`{\rtf1{\*\expandedcolortbl;;}Holy \{one\}\line Lord}`)).toBe("Holy {one}\nLord");
  });

  it("returns text that is not RTF unchanged", () => {
    expect(rtfToText("Plain words")).toBe("Plain words");
  });
});
