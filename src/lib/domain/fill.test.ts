import { describe, expect, it } from "vitest";
import { addStop, encodeFill, fillCss, GRADIENT_PRESETS, mainColor, MOST_STOPS, sanitizeFill, type Fill } from "./fill";
import { sanitizeIconNodes } from "./icon";
import { backgroundCss, compileSource, createComposition, sanitizeBackground } from "./composition";
import { defaultTheme } from "./theme";

const ctx = { theme: defaultTheme(), now: 0 };

describe("fills", () => {
  it("paints one colour, a straight gradient or a round one as CSS", () => {
    expect(fillCss({ kind: "solid", color: "#112233" })).toBe("#112233");
    expect(fillCss({ kind: "linear", angle: 90, stops: [{ color: "#000000", at: 0 }, { color: "#ffffff", at: 100 }] })).toBe("linear-gradient(90deg, #000000 0%, #ffffff 100%)");
    expect(fillCss({ kind: "radial", x: 50, y: 30, stops: [{ color: "#ff0000", at: 0 }, { color: "#0000ff", at: 80 }] })).toBe("radial-gradient(circle at 50% 30%, #ff0000 0%, #0000ff 80%)");
  });

  it("keeps old plain colours, and cleans anything else it is given", () => {
    expect(sanitizeFill("#ABCDEF")).toEqual({ kind: "solid", color: "#abcdef" });
    const fill: Fill = { kind: "linear", angle: 400, stops: [{ color: "#ffffff", at: 120 }, { color: "#000000", at: -5 }, { color: "red", at: 50 }] };
    expect(sanitizeFill(JSON.stringify(fill))).toEqual({ kind: "linear", angle: 360, stops: [{ color: "#000000", at: 0 }, { color: "#ffffff", at: 100 }] });
    expect(sanitizeFill("{not json", { kind: "solid", color: "#000000" })).toEqual({ kind: "solid", color: "#000000" });
    expect(sanitizeFill({ kind: "linear", angle: 0, stops: [{ color: "#000000", at: 0 }] })).toEqual({ kind: "solid", color: "#ffffff" });
    // A plain colour stays a plain colour when stored, so older pages read it unchanged.
    expect(encodeFill({ kind: "solid", color: "#123456" })).toBe("#123456");
  });

  it("adds a stop where clicked in the colour already there, up to a limit", () => {
    const stops = [{ color: "#000000", at: 0 }, { color: "#ffffff", at: 100 }];
    expect(addStop(stops, 40)).toEqual([{ color: "#000000", at: 0 }, { color: "#000000", at: 40 }, { color: "#ffffff", at: 100 }]);
    let many = stops;
    for (let i = 0; i < 10; i++) many = addStop(many, 10 + i);
    expect(many).toHaveLength(MOST_STOPS);
  });

  it("has presets that all clean to themselves", () => {
    for (const preset of GRADIENT_PRESETS) expect(sanitizeFill(encodeFill(preset.fill))).toEqual(preset.fill);
    expect(mainColor(GRADIENT_PRESETS[0]!.fill)).toBe("#1a0d0a");
  });
});

describe("shapes, icons and pages with gradients", () => {
  it("draws a shape with a gradient, an outline and a shadow, and an old shape as before", () => {
    const fill = encodeFill({ kind: "linear", angle: 90, stops: [{ color: "#000000", at: 0 }, { color: "#ffffff", at: 100 }] });
    const model = compileSource({ type: "shape", id: "rect", title: "Box", payload: { kind: "rect", fill, radius: "8", stroke: "#ff0000", strokeWidth: "4", shadow: "soft" } }, ctx);
    expect(model.shape).toEqual({ kind: "rect", fill: "linear-gradient(90deg, #000000 0%, #ffffff 100%)", radius: 8, stroke: { color: "#ff0000", width: 4 }, shadow: "soft" });
    expect(compileSource({ type: "shape", id: "e", title: "E", payload: { kind: "ellipse", fill: "#00ff00", radius: "0" } }, ctx).shape).toEqual({ kind: "ellipse", fill: "#00ff00", radius: 0 });
  });

  it("keeps only an icon's geometry: no scripts, links or styles", () => {
    const nodes = sanitizeIconNodes(JSON.stringify([
      ["path", { d: "M10 9h4", onload: "alert(1)", style: "x" }],
      ["script", { d: "M0 0" }],
      ["circle", { cx: "12", cy: "12", r: "3", href: "javascript:alert(1)" }],
      ["path", { d: "url(javascript:alert(1))" }],
    ]));
    expect(nodes).toEqual([["path", { d: "M10 9h4" }], ["circle", { cx: "12", cy: "12", r: "3" }]]);
    const icon = compileSource({ type: "icon", id: "church", title: "Church", payload: { nodes: JSON.stringify(nodes), color: "#ffcc00", strokeWidth: "9" } }, ctx).icon;
    expect(icon).toEqual({ nodes, color: "#ffcc00", strokeWidth: 4 });
  });

  it("paints a page with a several-colour gradient, and an older two-colour page as before", () => {
    const fill = encodeFill({ kind: "radial", x: 50, y: 100, stops: [{ color: "#ffb03a", at: 0 }, { color: "#2a0705", at: 100 }] });
    const page = sanitizeBackground({ ...createComposition("P").background, type: "gradient", color: "#000000", to: "#ffffff", angle: 90, fill })!;
    expect(backgroundCss(page)).toBe("radial-gradient(circle at 50% 100%, #ffb03a 0%, #2a0705 100%)");
    const older = sanitizeBackground({ type: "gradient", color: "#000000", to: "#ffffff", angle: 90 })!;
    expect(backgroundCss(older)).toBe("linear-gradient(90deg, #000000, #ffffff)");
  });
});
