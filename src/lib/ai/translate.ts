// Caption translation with the church's own AI service: one spoken phrase into the languages the
// church chose, in one request. The answer is JSON keyed by language code.

import { CAPTION_LANGUAGES } from "../domain/captions";
import { chatRequest, type AiRequest, type AiSettings } from "./summarize";

const INSTRUCTIONS = `You translate live church sermon captions. Translate the phrase faithfully and naturally for a congregation, keeping names and Bible references. Do not add anything.
Answer with JSON only, one key per language code, e.g. {"es": "...", "fr": "..."}.`;

export function translateRequest(settings: AiSettings, phrase: string, languages: string[], context: string): AiRequest {
  const names = languages.map((code) => `${code} (${CAPTION_LANGUAGES.find((language) => language.code === code)?.name ?? code})`).join(", ");
  const message = `${context ? `Said just before (for context only, do not translate): ${context.slice(-400)}\n\n` : ""}Translate into: ${names}\n\nPhrase: ${phrase.slice(0, 1000)}`;
  return chatRequest(settings, INSTRUCTIONS, message, { maxTokens: 600, temperature: 0.2 });
}

/** The translations from the model's answer (stray words or a ```json fence allowed). */
export function parseTranslations(text: string, languages: string[]): Record<string, string> {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return {};
  try {
    const value = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const code of languages) {
      const translated = value[code];
      if (typeof translated === "string" && translated.trim()) out[code] = translated.trim().slice(0, 1200);
    }
    return out;
  } catch {
    return {};
  }
}
