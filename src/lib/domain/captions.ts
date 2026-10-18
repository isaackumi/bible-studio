// Live captions: what the speaker says, as text on the screen and on people's phones, optionally
// translated with the church's own AI service. Lines come from the same listening that finds
// verses; a finished phrase becomes a line, and the phrase still being heard shows after it.

export type CaptionLine = {
  id: number;
  text: string;
  at: number;
  /** Translations by language code, filled in as they arrive. */
  tr?: Record<string, string>;
};

export type CaptionState = {
  lines: CaptionLine[];
  /** The phrase still being heard (not final yet). */
  interim: string;
  next: number;
};

export type CaptionSettings = {
  /** Show captions on the audience screen. */
  screen: boolean;
  position: "bottom" | "top";
  size: "s" | "m" | "l";
  /** Languages to translate into (codes), for phones. */
  languages: string[];
};

export const CAPTION_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "pt", name: "Português" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "zh", name: "中文" },
  { code: "ko", name: "한국어" },
  { code: "ja", name: "日本語" },
  { code: "ar", name: "العربية" },
  { code: "hi", name: "हिन्दी" },
  { code: "ru", name: "Русский" },
  { code: "uk", name: "Українська" },
  { code: "sw", name: "Kiswahili" },
  { code: "tw", name: "Twi" },
  { code: "yo", name: "Yorùbá" },
  { code: "ha", name: "Hausa" },
  { code: "ig", name: "Igbo" },
  { code: "am", name: "አማርኛ" },
  { code: "tl", name: "Tagalog" },
  { code: "vi", name: "Tiếng Việt" },
];

const LINES_KEPT = 300;
const MAX_LANGUAGES = 4;

export function emptyCaptions(): CaptionState {
  return { lines: [], interim: "", next: 1 };
}

export function defaultCaptionSettings(): CaptionSettings {
  return { screen: true, position: "bottom", size: "m", languages: [] };
}

export function sanitizeCaptionSettings(value: unknown): CaptionSettings {
  const record = value && typeof value === "object" ? (value as Partial<CaptionSettings>) : {};
  const known = new Set(CAPTION_LANGUAGES.map((language) => language.code));
  return {
    screen: record.screen !== false,
    position: record.position === "top" ? "top" : "bottom",
    size: record.size === "s" || record.size === "l" ? record.size : "m",
    languages: Array.isArray(record.languages) ? [...new Set(record.languages.filter((code): code is string => typeof code === "string" && known.has(code)))].slice(0, MAX_LANGUAGES) : [],
  };
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Sentence case for a phrase as it comes from speech recognition ("for god so loved" → "For god so loved"). */
function tidy(text: string): string {
  const value = clean(text);
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

/** Add what was just heard: a finished phrase becomes a line; an unfinished one waits. */
export function addHeard(state: CaptionState, latest: string, final: boolean, now: number): CaptionState {
  const text = tidy(latest);
  if (!final) return { ...state, interim: text };
  if (!text) return { ...state, interim: "" };
  const last = state.lines[state.lines.length - 1];
  // Recognisers sometimes finish the same phrase twice.
  if (last && clean(last.text).toLowerCase() === text.toLowerCase()) return { ...state, interim: "" };
  const lines = [...state.lines, { id: state.next, text, at: now }].slice(-LINES_KEPT);
  return { lines, interim: "", next: state.next + 1 };
}

export function withTranslation(state: CaptionState, id: number, translations: Record<string, string>): CaptionState {
  return { ...state, lines: state.lines.map((line) => (line.id === id ? { ...line, tr: { ...line.tr, ...translations } } : line)) };
}

/** Words wrapped into rows of about `width` characters. */
export function wrapWords(text: string, width: number): string[] {
  const rows: string[] = [];
  let row = "";
  for (const word of clean(text).split(" ")) {
    if (!word) continue;
    if (row && row.length + 1 + word.length > width) {
      rows.push(row);
      row = word;
    } else row = row ? `${row} ${word}` : word;
  }
  if (row) rows.push(row);
  return rows;
}

/** The last rows to show on a screen: the newest words, wrapped, at most `rows` of them. */
export function captionRows(state: CaptionState, rows = 2, width = 64): string[] {
  const recent = state.lines.slice(-4).map((line) => line.text);
  if (state.interim) recent.push(state.interim);
  const wrapped = wrapWords(recent.join(" "), width);
  return wrapped.slice(-rows);
}

/** Lines after `after` for a phone, in a language when it has been translated (else the original). */
export function linesFor(state: CaptionState, after: number, language: string | null, limit = 60): Array<{ id: number; text: string; translated: boolean }> {
  return state.lines
    .filter((line) => line.id > after)
    .slice(-limit)
    .map((line) => {
      const translated = language ? line.tr?.[language] : undefined;
      return { id: line.id, text: translated ?? line.text, translated: !!translated };
    });
}
