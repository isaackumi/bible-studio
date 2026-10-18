// The interface in the operator's language. The English text is the key: t("Up next") gives the
// French line when French is chosen, and the English when a line has no translation yet, so a
// missing entry never shows a code. Placeholders are {name}: t("Step {n} of {total}", { n, total }).
// This module has no Svelte in it so domain code can use it; i18n.svelte.ts makes it reactive.

import { fr } from "./fr";

export type UiLanguage = "en" | "fr";

export const UI_LANGUAGES: Array<{ id: UiLanguage; name: string; english: string }> = [
  { id: "en", name: "English", english: "English" },
  { id: "fr", name: "Français", english: "French" },
];

const CATALOGS: Record<UiLanguage, Readonly<Record<string, string>> | null> = { en: null, fr };

type Params = Record<string, string | number | null | undefined>;

let read: () => UiLanguage = () => "en";

/** The reactive store hands its reader here, so every t() in a template follows the setting. */
export function bindLanguage(reader: () => UiLanguage): void {
  read = reader;
}

export function sanitizeUiLanguage(value: unknown): UiLanguage {
  return UI_LANGUAGES.some((entry) => entry.id === value) ? (value as UiLanguage) : "en";
}

/** The first run's guess from the computer's language ("fr-CA" → French). */
export function guessUiLanguage(languages: readonly string[]): UiLanguage {
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (UI_LANGUAGES.some((entry) => entry.id === base)) return base as UiLanguage;
  }
  return "en";
}

function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key] ?? "") : whole));
}

export function translate(language: UiLanguage, text: string, params?: Params): string {
  return fill(CATALOGS[language]?.[text] ?? text, params);
}

/** Marks a line in data (a list of pages, a menu) for translation; t() it where it is shown. */
export const msg = (text: string): string => text;

/** A line in the chosen language. */
export function t(text: string, params?: Params): string {
  return translate(read(), text, params);
}

/** A count: tn(3, "{n} step", "{n} steps"). French uses the singular for 0 and 1. */
export function tn(n: number, one: string, other: string, params?: Params): string {
  const language = read();
  const singular = language === "fr" ? n < 2 : n === 1;
  return translate(language, singular ? one : other, { n, ...params });
}
