import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bindLanguage, guessUiLanguage, sanitizeUiLanguage, t, tn, translate } from "./core";
import { fr } from "./fr";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(svelte|ts)$/.test(name) && !/\.test\.ts$/.test(name) && !path.includes("/i18n/") ? [path] : [];
  });
}

/** Every literal handed to t(), tn() or msg() in the app. */
function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const literal = String.raw`"((?:[^"\\]|\\.)*)"`;
  const single = new RegExp(String.raw`\b(?:t|msg)\(\s*${literal}`, "g");
  const plural = new RegExp(String.raw`\btn\([^,()]+(?:\([^()]*\))?[^,()]*,\s*${literal}\s*,\s*${literal}`, "g");
  for (const file of sources("src")) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(single)) keys.set(JSON.parse(`"${match[1]}"`), file);
    for (const match of text.matchAll(plural)) {
      keys.set(JSON.parse(`"${match[1]}"`), file);
      keys.set(JSON.parse(`"${match[2]}"`), file);
    }
  }
  return keys;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("interface language", () => {
  it("has a French line for every line the app shows", () => {
    const missing = [...usedKeys()].filter(([key]) => !(key in fr)).map(([key, file]) => `${file}: ${key}`);
    // I18N_MISSING=path writes the whole list as JSON, for whoever is adding the translations.
    if (process.env.I18N_MISSING) writeFileSync(process.env.I18N_MISSING, JSON.stringify([...usedKeys().keys()].filter((key) => !(key in fr)), null, 1));
    expect(missing).toEqual([]);
  });

  it("keeps the same placeholders in French", () => {
    const wrong = Object.entries(fr).filter(([key, value]) => placeholders(key).join() !== placeholders(value).join());
    expect(wrong).toEqual([]);
  });

  it("falls back to English and fills placeholders", () => {
    expect(translate("fr", "A line nobody has translated")).toBe("A line nobody has translated");
    expect(translate("en", "Step {n} of {total}", { n: 2, total: 3 })).toBe("Step 2 of 3");
  });

  it("follows the chosen language, with French singular for 0 and 1", () => {
    let language: "en" | "fr" = "fr";
    bindLanguage(() => language);
    expect(t("Macros")).toBe(fr["Macros"]);
    expect(tn(0, "{n} step", "{n} steps")).toBe("0 étape");
    expect(tn(2, "{n} step", "{n} steps")).toBe("2 étapes");
    language = "en";
    expect(tn(0, "{n} step", "{n} steps")).toBe("0 steps");
    bindLanguage(() => "en");
  });

  it("guesses from the computer and cleans saved values", () => {
    expect(guessUiLanguage(["fr-CA", "en"])).toBe("fr");
    expect(guessUiLanguage(["tw-GH"])).toBe("en");
    expect(sanitizeUiLanguage("de")).toBe("en");
    expect(sanitizeUiLanguage("fr")).toBe("fr");
  });
});
