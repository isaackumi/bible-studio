// Search everything in Settings: every page, card and row. The index is read from the Settings
// markup itself (the <strong> of a row, the <h3> of a card, a section label), so a row is
// searchable the day it is written and never needs a list kept by hand. Choosing a hit opens its
// page and points at the row.

export type SettingKind = "page" | "group" | "card" | "row";

export type SettingEntry = {
  /** `section:title`, stable across languages (the English line is the key). */
  id: string;
  section: string;
  kind: SettingKind;
  /** English, as written in the markup; shown through t(). */
  title: string;
  about: string;
  /** The card or section label the row sits under, English. */
  context: string;
  /** Extra search words (English), never shown. */
  words: string;
};

export type SettingsPage = { id: string; title: string; about: string; keywords: string; group: string };

const LITERAL = String.raw`"((?:[^"\\]|\\.)*)"`;
const tCall = (inner: string) => String.raw`\{t\(${inner}[^}]*\}`;
// One pattern, document order: a section label, a card heading (+ its note), a row title (+ its line).
const PIECE = new RegExp(
  [
    String.raw`<p class="section-label">${tCall(LITERAL)}`,
    String.raw`<h3>${tCall(LITERAL)}</h3>\s*(?:<p class="card-note">\{t\(${LITERAL})?`,
    String.raw`<strong>${tCall(LITERAL)}[^<]*</strong>\s*(?:<span>\{t\(${LITERAL})?`,
  ].join("|"),
  "g",
);
const SECTION = /\{(?:#if|:else if) section === "(\w+)"\}/g;
const COMPONENT = /<([A-Z]\w*)[\s/>]/g;

const unquote = (text: string) => JSON.parse(`"${text}"`) as string;
/** The markup of a component, without its script and style. */
const markup = (source: string) => source.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");

/** Words a church might type for a setting, by its English title. */
export const SYNONYMS: Record<string, string> = {
  "Church name": "name title organisation organization",
  "Logo text": "logo brand",
  "CCLI license #": "copyright ccli license number",
  Language: "language english french spanish français español interface ui translate words menu",
  "Clean the microphone before listening": "noise filter suppression strong light off hiss hum fan background",
  "Which recognizer listens": "accurate most engine model speech recognition recognizer system apple privacy offline",
  "Accurate listening model": "download model speech offline",
  "Most accurate listening model": "best download model speech offline",
  "Misheard words": "corrections replace vocabulary dictionary names wrong",
  "Stream key": "rtmp rtmps youtube facebook key secret",
  "Live captions": "subtitles transcript deaf",
  "Speech model": "model delete space",
  Cache: "clear cache temporary",
  "Pair a phone": "remote phone tablet qr pair",
  "Desk size": "zoom spacing scale density text size",
};

/** Every row, card and section label in the Settings markup, by page. */
export function extractSettings(dialog: string, components: Record<string, string>): SettingEntry[] {
  const entries: SettingEntry[] = [];
  const seen = new Set<string>();
  const add = (section: string, kind: SettingKind, title: string, about: string, context: string) => {
    // A line with a placeholder ("Last backup {date}") is not a name anyone types.
    if (!title.trim() || title.includes("{")) return;
    const id = `${section}:${title}`;
    if (seen.has(id)) return;
    seen.add(id);
    entries.push({ id, section, kind, title, about: about.includes("{") ? "" : about, context, words: SYNONYMS[title] ?? "" });
  };
  const scan = (text: string, section: string, visited: Set<string>) => {
    let context = "";
    for (const match of text.matchAll(PIECE)) {
      const [, label, card, note, row, line] = match;
      if (label !== undefined) {
        context = unquote(label);
        add(section, "group", context, "", "");
      } else if (card !== undefined) {
        context = unquote(card);
        add(section, "card", context, note === undefined ? "" : unquote(note), "");
      } else if (row !== undefined) {
        add(section, "row", unquote(row), line === undefined ? "" : unquote(line), context);
      }
    }
    for (const [, name] of text.matchAll(COMPONENT)) {
      const source = name ? components[name] : undefined;
      if (!name || !source || visited.has(name)) continue;
      scan(markup(source), section, new Set([...visited, name]));
    }
  };
  const body = markup(dialog);
  const marks = [...body.matchAll(SECTION)];
  marks.forEach((mark, index) => {
    const end = marks[index + 1]?.index ?? body.length;
    scan(body.slice(mark.index, end), mark[1]!, new Set());
  });
  return entries;
}

/** Lower case, no accents, words only: "Réglages › Écran" → "reglages ecran". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** One letter wrong, missing or extra ("microphne", "storge"). */
function nearly(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export type SettingHit = SettingEntry & { score: number };

/**
 * The entries matching `query`, best first. Every word typed must be found (as the start of a
 * word, inside a longer word, or with one letter wrong); a match in the title beats one in the
 * description or the page. `translate` gives the line in the desk's language.
 */
export function searchSettings(entries: SettingEntry[], pages: SettingsPage[], query: string, translate: (text: string) => string = (text) => text, limit = 40): SettingHit[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(" ");
  const byId = new Map(pages.map((page) => [page.id, page]));
  const all: SettingEntry[] = [
    ...pages.map((page) => ({ id: `${page.id}:`, section: page.id, kind: "page" as const, title: page.title, about: page.about, context: "", words: page.keywords })),
    ...entries.filter((entry) => byId.has(entry.section)),
  ];
  const hits: SettingHit[] = [];
  for (const entry of all) {
    const page = byId.get(entry.section)!;
    const title = normalize(`${translate(entry.title)} ${entry.title}`);
    const titleWords = title.split(" ");
    const shown = normalize(translate(entry.title));
    // Where else a word may be found, closest to the setting first: its own search words, its
    // description, then the card it sits in and its page.
    const layers = [
      entry.words,
      [entry.about && translate(entry.about), entry.about].join(" "),
      [entry.context && translate(entry.context), entry.context, entry.kind === "page" ? "" : `${translate(page.title)} ${page.title} ${page.keywords}`, translate(page.group)].join(" "),
    ].map((text) => {
      const plain = normalize(text);
      return { text: plain, words: plain.split(" ") };
    });
    const found = (token: string, words: string[], text: string) =>
      words.some((word) => word.startsWith(token)) || (token.length >= 3 && text.includes(token));
    const fuzzy = (token: string, words: string[]) => token.length >= 5 && words.some((word) => nearly(token, word.slice(0, token.length + 1)) || nearly(token, word));
    const within = (depth: number, loose = false) =>
      tokens.every((token) => found(token, titleWords, title) || layers.slice(0, depth).some((layer) => found(token, layer.words, layer.text) || (loose && fuzzy(token, layer.words))) || (loose && fuzzy(token, titleWords)));
    let score = 0;
    if (shown === q) score = 100;
    else if (shown.startsWith(q)) score = 90;
    else if (titleWords.some((word) => word.startsWith(q)) || title.includes(q)) score = 75;
    else if (within(0)) score = 60;
    else if (within(1)) score = 50;
    else if (within(2)) score = 40;
    else if (within(3)) score = 30;
    else if (within(3, true)) score = 15;
    if (!score) continue;
    score += entry.kind === "page" ? 8 : entry.kind === "card" ? 3 : entry.kind === "group" ? 2 : 0;
    // Shorter titles first among equals: "Cache" before "Clear the cache and start again".
    score -= Math.min(shown.length, 80) / 100;
    hits.push({ ...entry, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// --- Recent ---------------------------------------------------------------------------------------

export const RECENT_KEY = "church-studio.settings-search";
export type Recent = { queries: string[]; picks: string[] };

type Store = Pick<Storage, "getItem" | "setItem">;

function storage(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** What this computer searched and opened lately (none in a private window). */
export function readRecent(store: Store | null = storage()): Recent {
  try {
    const value = JSON.parse(store?.getItem(RECENT_KEY) ?? "null") as Partial<Recent> | null;
    const strings = (list: unknown) => (Array.isArray(list) ? list.filter((item): item is string => typeof item === "string").slice(0, 6) : []);
    return { queries: strings(value?.queries), picks: strings(value?.picks) };
  } catch {
    return { queries: [], picks: [] };
  }
}

/** Remember a pick (and the words that found it), newest first, six of each. */
export function rememberRecent(pick: string, query: string, store: Store | null = storage()): Recent {
  const recent = readRecent(store);
  const words = query.trim();
  const next: Recent = {
    picks: [pick, ...recent.picks.filter((item) => item !== pick)].slice(0, 6),
    queries: words ? [words, ...recent.queries.filter((item) => item.toLowerCase() !== words.toLowerCase())].slice(0, 6) : recent.queries,
  };
  try {
    store?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Full or blocked storage: the search still works, it just forgets.
  }
  return next;
}

export function clearRecent(store: Store | null = storage()): Recent {
  try {
    store?.setItem(RECENT_KEY, JSON.stringify({ queries: [], picks: [] }));
  } catch {
    // As above.
  }
  return { queries: [], picks: [] };
}

/** `text` cut into plain and matched pieces, for marking the words typed in a result. */
export function highlight(text: string, query: string): Array<{ text: string; match: boolean }> {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter((token) => token.length > 0);
  if (!tokens.length) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const marked = new Array<boolean>(text.length).fill(false);
  const starts = (at: number) => at === 0 || !/[\p{L}\p{N}]/u.test(lower[at - 1]!);
  for (const token of tokens) {
    const places: number[] = [];
    for (let at = lower.indexOf(token); at !== -1; at = lower.indexOf(token, at + 1)) places.push(at);
    // The start of a word, as the search matched it; inside a word only for longer words typed.
    const best = places.filter(starts);
    for (const at of best.length ? best : token.length >= 3 ? places.slice(0, 1) : []) marked.fill(true, at, at + token.length);
  }
  const pieces: Array<{ text: string; match: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const last = pieces[pieces.length - 1];
    if (last && last.match === marked[i]) last.text += text[i];
    else pieces.push({ text: text[i]!, match: marked[i]! });
  }
  return pieces;
}
