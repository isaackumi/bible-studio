// The interface in the operator's language. The English text is the key: t("Up next") gives the
// French line when French is chosen, and the English when a line has no translation yet, so a
// missing entry never shows a code. Placeholders are {name}: t("Step {n} of {total}", { n, total }).
// This module has no Svelte in it so domain code can use it; i18n.svelte.ts makes it reactive.
//
// Each language's lines are loaded when that language is chosen (loadLanguage), not with the app:
// they are about 300 KB each, and a window that shows English (every output window) never needs them.
// They are files inside the app, so loading one takes a moment and needs no internet.

export type UiLanguage = "en" | "fr" | "es";

export const UI_LANGUAGES: Array<{ id: UiLanguage; name: string; english: string }> = [
  { id: "en", name: "English", english: "English" },
  { id: "fr", name: "Français", english: "French" },
  { id: "es", name: "Español", english: "Spanish" },
];

const LOADERS: Record<Exclude<UiLanguage, "en">, () => Promise<Readonly<Record<string, string>>>> = {
  fr: () => import("./fr").then((module) => module.fr),
  es: () => import("./es").then((module) => module.es),
};
const CATALOGS: Partial<Record<UiLanguage, Readonly<Record<string, string>>>> = {};
const loading: Partial<Record<UiLanguage, Promise<void>>> = {};

/** Load a language's lines (once); switch to it after this resolves, so nothing shows half-translated. */
export function loadLanguage(language: UiLanguage): Promise<void> {
  if (language === "en" || CATALOGS[language]) return Promise.resolve();
  return (loading[language] ??= LOADERS[language]().then(
    (lines) => void (CATALOGS[language] = lines),
    (error) => {
      // A failed load (it should not happen: the files are inside the app) can be tried again.
      delete loading[language];
      throw error;
    },
  ));
}

/** Whether a language's lines are here (English always is). */
export const languageLoaded = (language: UiLanguage): boolean => language === "en" || !!CATALOGS[language];

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

/** The interface language now (for words handed to another window, such as the game screen). */
export const currentLanguage = (): UiLanguage => read();

/** A line in the chosen language. */
export function t(text: string, params?: Params): string {
  return translate(read(), text, params);
}

/** A count: tn(3, "{n} step", "{n} steps"). French uses the singular for 0 and 1; Spanish, like English, for 1. */
export function tn(n: number, one: string, other: string, params?: Params): string {
  const language = read();
  const singular = language === "fr" ? n < 2 : n === 1;
  return translate(language, singular ? one : other, { n, ...params });
}
