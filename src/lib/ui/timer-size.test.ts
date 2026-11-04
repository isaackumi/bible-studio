import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A countdown placed in a production scene must show at the size chosen for it (Look and position),
// on the desk and the audience screen alike. A fixed, forced size in the stylesheet overrode it.
describe("timer text size", () => {
  it("is never forced in a scene by the stylesheet", () => {
    const css = readFileSync("src/app.css", "utf8");
    const forced = [...css.matchAll(/\.frame\.nested\.timer[^{]*\{[^}]*font-size:[^;}]*!important/g)];
    expect(forced.map((match) => match[0].split("{")[0]!.trim())).toEqual([]);
  });

  it("follows the chosen size, shrunk only to fit its box", () => {
    const view = readFileSync("src/lib/components/FrameView.svelte", "utf8");
    expect(view).toContain('model.layout === "logo" ? "92px" : `calc(${model.theme.fontSize}px * var(--fit, 1))`');
  });
});
