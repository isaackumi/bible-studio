import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The desk's design rules (Apple's Human Interface Guidelines, checked in code), so a new screen
// cannot quietly break them: text no smaller than 10 px, signal colours as text only through their
// readable *-text shades (Day darkens them), and motion only through ui/motion (which honours
// Reduce motion and Calm).

function svelteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? svelteFiles(path) : path.endsWith(".svelte") ? [path] : [];
  });
}

const files = svelteFiles("src/lib/components").map((path) => ({ path, source: readFileSync(path, "utf8") }));
const styleOf = (source: string) => source.match(/<style[\s\S]*?<\/style>/)?.[0] ?? "";
const lineOf = (source: string, index: number) => source.slice(0, index).split("\n").length;

// Miniature pictures of a screen, where small type is the picture: not text people read.
const MINIATURES = [/AlertsDialog\.svelte$/, /SettingsDialog\.svelte$/];

describe("design rules", () => {
  it("keeps text at 10 px or larger (the desktop minimum)", () => {
    const small = files.flatMap(({ path, source }) =>
      MINIATURES.some((pattern) => pattern.test(path))
        ? []
        : [...styleOf(source).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].filter((match) => Number(match[1]) < 10).map((match) => `${path}: ${match[0]}`),
    );
    expect(small).toEqual([]);
  });

  it("colours text with the readable shades, so it reads on the Day theme too", () => {
    const raw = /(?<![\w-])color:\s*(var\(--(?:accent|live|presence)\)|#f5a524)(?=\s*[;}!])/g;
    const found = files.flatMap(({ path, source }) => (/onboarding\/(MiniApp|Welcome)\.svelte$/.test(path) ? [] : [...source.matchAll(raw)].map((match) => `${path}:${lineOf(source, match.index)} ${match[0]} (use the -text shade)`)));
    expect(found).toEqual([]);
  });

  it("moves things only through ui/motion, which honours Reduce motion and Calm", () => {
    const direct = files.filter(({ source }) => /import\s*\{[^}]*\b(fade|fly|slide|scale|blur)\b[^}]*\}\s*from\s*"svelte\/transition"/.test(source)).map(({ path }) => path);
    expect(direct).toEqual([]);
  });
});
