import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// What reaches the audience, stage and extra screens may only animate what the graphics card moves
// by itself (transform, opacity): anything else (backgrounds, shadows, sizes, filters) repaints the
// whole layer every frame, which on a 4K projector is half a billion pixels a second.

/** Moved or faded by the graphics card, never repainted. */
const CHEAP = new Set(["transform", "opacity", "rotate", "scale", "translate", "visibility", "offset"]);

/** Everything the output windows draw with: the shared stylesheet and the components that paint screens. */
const OUTPUT = [
  "src/app.css",
  ...["FrameView", "Screen", "AudienceOutput", "StageOutput", "SecondOutput", "ScreenOutput", "MotionBackground", "OverlayLayer", "CaptionBar", "RichView", "QrView"]
    .map((name) => `src/lib/components/${name}.svelte`),
];

function keyframes(text: string): Array<{ name: string; properties: string[] }> {
  return [...text.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)].map((match) => ({
    name: match[1]!,
    properties: [...new Set([...match[2]!.matchAll(/([a-z-]+)\s*:/g)].map((property) => property[1]!))],
  }));
}

describe("animation cost on screens", () => {
  it("animates only what the graphics card moves by itself", () => {
    const files = OUTPUT.filter((file) => readdirSync(join(file, "..")).includes(file.split("/").at(-1)!));
    expect(files.length).toBeGreaterThan(5);
    const expensive = files.flatMap((file) =>
      keyframes(readFileSync(file, "utf8"))
        .map((frame) => ({ file, name: frame.name, bad: frame.properties.filter((property) => !CHEAP.has(property)) }))
        .filter((frame) => frame.bad.length)
        .map((frame) => `${frame.file} @keyframes ${frame.name}: ${frame.bad.join(", ")}`),
    );
    expect(expensive).toEqual([]);
  });
});
