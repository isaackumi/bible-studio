import { msg } from "../i18n/core";
import { COMMANDS, type CommandId } from "../commands/registry";
import { soundsLikeBook, type WordFix } from "./words";

/**
 * Spoken operator commands in plain words: "next verse", "go back", "give me King James".
 * Only a whole utterance counts (a command said on its own), so sermon speech such as
 * "take this to heart" never acts. A church can still require the wake word ("studio …"). Commands reuse the desk's CommandIds;
 * `live` marks the ones that change Program so the caller can require explicit permission.
 */
export type VoiceCommand =
  | { kind: "command"; id: CommandId; live: boolean; phrase: string }
  | { kind: "library"; tab: "bible" | "songs"; live: false; phrase: string }
  | { kind: "search"; scope: "scripture" | "songs"; query: string; live: false; phrase: string }
  | { kind: "reference"; query: string; live: false; phrase: string }
  | { kind: "translation"; id: string; live: false; phrase: string }
  | { kind: "where"; query: string; live: false; phrase: string };

/** What a custom phrase can do: any desk command, or open a library. */
export type VoiceAction = CommandId | "open-scripture" | "open-songs";
export type CustomVoiceCommand = { phrase: string; action: VoiceAction };

export type VoiceParseOptions = {
  /** Require "Studio …" (default off). Off: only a whole-utterance command counts. */
  wake?: boolean;
  translations?: Array<{ id: string; abbreviation: string; name: string }>;
  custom?: CustomVoiceCommand[];
};

export const VOICE_ACTIONS: Array<{ id: VoiceAction; label: string }> = [
  { id: "next", label: msg("Next") },
  { id: "previous", label: msg("Previous") },
  { id: "take", label: msg("Go live") },
  { id: "cut", label: msg("Cut (Program)") },
  { id: "clear", label: msg("Clear (Program)") },
  { id: "black", label: msg("Black (Program)") },
  { id: "logo", label: msg("Logo (Program)") },
  { id: "timer-pause", label: msg("Pause timer (Program)") },
  { id: "timer-resume", label: msg("Start timer (Program)") },
  { id: "timer-reset", label: msg("Reset timer (Program)") },
  { id: "open-scripture", label: msg("Open scripture") },
  { id: "open-songs", label: msg("Open songs") },
];

const WAKE = /^(?:hey\s+)?(?:church\s+)?studios?\b[\s,.:!-]*/;

// Words people wrap a command in: "okay, next verse please", "can you go back", "let's go to the next one".
const LEAD = /^(?:(?:ok(?:ay)?|alright|all right|so|now|and|um+|uh+|please|can you|could you|would you|will you|let'?s|let us|i want to|we(?:'ll| will)|go ahead and|just)\s+)+/;
const TAIL = /(?:\s+(?:please|now|for me|for us|thank you|thanks|then|again))+$/;

const UNIT = "(?:slide|verse|scripture|section|item|one|page|line|song|part)";

/** Whole-utterance phrases. Without the wake word only these (and the guarded forms below) act. */
const PHRASES: Array<[RegExp, CommandId]> = [
  [new RegExp(`^(?:next|next ${UNIT}|the next ${UNIT}|(?:go|move|skip|jump) (?:on )?(?:to )?(?:the )?next(?: ${UNIT})?|(?:show|read|give me|bring up) (?:me )?(?:the )?next(?: ${UNIT})?|move on|moving on|keep going|continue|forward|go forward|advance|next please|one more|following ${UNIT})$`), "next"],
  [new RegExp(`^(?:previous|prev|back|go back|back one|one back|go back one(?: ${UNIT})?|previous ${UNIT}|the previous ${UNIT}|last ${UNIT}|the last ${UNIT}|(?:go|move|jump) (?:back )?to (?:the )?(?:previous|last)(?: ${UNIT})?|(?:show|read|give me) (?:me )?(?:the )?(?:previous|last)(?: ${UNIT})?|the ${UNIT} before|before that|go backwards?|backwards?)$`), "previous"],
  [/^(?:take|take it|go live|live|send (?:it|to program|it live)|put it (?:up|live|on (?:the )?screen)|show (?:it )?on (?:the )?screen|show the congregation)$/, "take"],
  [/^(?:cut|cut to program|hard cut)$/, "cut"],
  [/^(?:clear|clear (?:it|the screen|the program|the output|screen)|take it (?:down|off)|remove it|nothing on (?:the )?screen)$/, "clear"],
  [/^(?:black|blackout|black ?out|black (?:the )?screen|go black|fade to black|blank|blank (?:the )?screen)$/, "black"],
  [/^(?:logo|show (?:the )?logo|put (?:the )?logo up)$/, "logo"],
  [/^(?:pause|stop|hold|freeze) (?:the )?(?:timer|countdown|clock)$/, "timer-pause"],
  [/^(?:start|resume|continue|run) (?:the )?(?:timer|countdown)$/, "timer-resume"],
  [/^(?:reset|restart) (?:the )?(?:timer|countdown)$/, "timer-reset"],
];

/** Spoken names for common translations, matched against the installed ones by abbreviation. */
const TRANSLATION_ALIASES: Record<string, string[]> = {
  kjv: ["king james", "king james version", "the king james", "authorized version", "k j v"],
  nkjv: ["new king james", "new king james version", "n k j v"],
  asv: ["american standard", "american standard version", "a s v"],
  web: ["world english", "world english bible", "w e b"],
  bbe: ["basic english", "bible in basic english", "b b e"],
  niv: ["new international", "new international version", "n i v"],
  esv: ["english standard", "english standard version", "e s v"],
  nlt: ["new living", "new living translation", "n l t"],
  amp: ["amplified", "amplified bible"],
  msg: ["the message", "message bible"],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"?!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop politeness and filler so "okay can you go to the next verse please" reads as "go to the next verse". */
function core(phrase: string): string {
  return phrase.replace(/[,;]+/g, " ").replace(/\s+/g, " ").replace(/[.]+$/, "").trim().replace(LEAD, "").replace(TAIL, "").replace(/[.]+$/, "").trim();
}

/** "john 3 verse 16" / "john chapter 3 verse 16" → "john 3:16". Other shapes pass through. */
function spokenReference(text: string): string {
  return text
    .replace(/\bchapter\s+/g, "")
    .replace(/(\d+)\s+(?:verse|verses|vs)\s+(\d+)/g, "$1:$2")
    .trim();
}

function actionCommand(action: VoiceAction, phrase: string): VoiceCommand {
  if (action === "open-scripture") return { kind: "library", tab: "bible", live: false, phrase };
  if (action === "open-songs") return { kind: "library", tab: "songs", live: false, phrase };
  const live = COMMANDS.find((command) => command.id === action)?.changesProgram ?? false;
  return { kind: "command", id: action, live, phrase };
}

function matchTranslation(name: string, translations: NonNullable<VoiceParseOptions["translations"]>): string | null {
  const wanted = name.replace(/\b(?:the|version|translation|bible|please)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!wanted) return null;
  for (const translation of translations) {
    const abbreviation = translation.abbreviation.toLowerCase();
    const full = translation.name.toLowerCase().replace(/\b(?:the|version|translation|bible|in)\b/g, " ").replace(/\s+/g, " ").trim();
    const aliases = (TRANSLATION_ALIASES[abbreviation] ?? []).map((alias) => alias.replace(/\b(?:the|version|translation|bible)\b/g, " ").replace(/\s+/g, " ").trim());
    if (
      wanted === abbreviation ||
      wanted === abbreviation.split("").join(" ") ||
      wanted === full ||
      aliases.includes(wanted) ||
      (full && full.includes(wanted) && wanted.length >= 4)
    ) {
      return translation.id;
    }
  }
  return null;
}

export function parseVoiceCommand(text: string, options: VoiceParseOptions = {}): VoiceCommand | null {
  const spoken = normalize(text);
  const wake = WAKE.exec(spoken);
  if (!wake && options.wake === true) return null;
  const said = spoken.slice(wake ? wake[0].length : 0).replace(/[.,]+$/, "").trim();
  const phrase = core(said);
  if (!phrase) return null;

  for (const entry of options.custom ?? []) {
    const custom = normalize(entry.phrase).replace(/[.,]+$/, "");
    if (custom === phrase || custom === said) return actionCommand(entry.action, phrase);
  }

  if (options.translations?.length) {
    const asked = /^(?:switch to|switch over to|change to|use|give me|let me have|read (?:it |that |this )?(?:from|in)|read from|go to|show (?:it |that )?in|in|put it in|change it to)\s+(.+)$/.exec(phrase);
    const id = matchTranslation(asked ? asked[1]! : phrase, options.translations);
    if (id) return { kind: "translation", id, live: false, phrase };
  }

  for (const [pattern, id] of PHRASES) {
    if (!pattern.test(phrase)) continue;
    const live = COMMANDS.find((command) => command.id === id)?.changesProgram ?? false;
    return { kind: "command", id, live, phrase };
  }

  const library = /^(?:open|show|go to|bring up|switch to)?\s*(?:the\s+)?(scripture|scriptures|bible|songs?|lyrics|hymns?)$/.exec(phrase);
  if (library && (wake || /^(?:open|show|go to|bring up|switch to)\s/.test(phrase))) {
    const tab = /^(?:songs?|lyrics|hymns?)$/.test(library[1]!) ? "songs" : "bible";
    return { kind: "library", tab, live: false, phrase };
  }

  // A reference after "turn to / open to / go to" works on its own: pastors say it as an instruction.
  const turn = /^(?:turn|open|go|flip|move|jump)(?: over| back)? to\s+(?:the book of\s+)?(.+?\d.*)$/.exec(phrase);
  if (turn) return { kind: "reference", query: spokenReference(turn[1]!), live: false, phrase };

  // Song search says what it is looking for, so it is safe without the wake word too.
  const song = /^(?:search|find|look up|pull up|bring up)\s+(?:for\s+)?(?:the\s+)?(?:song|hymn)\s+(.+)$/.exec(phrase);
  if (song) return { kind: "search", scope: "songs", query: song[1]!.trim(), live: false, phrase };

  // Other open-ended phrases need the wake word: without it, sermon speech ("show me 3 things") could match.
  if (!wake) return null;

  // "Studio, where is the projector?": that part of the screen, pointed at (tour/where.ts).
  const where = /^(?:where(?:'s| is| are| do i| can i)(?: find)?|how do i find|show me where)\s+(.+)$/.exec(phrase);
  if (where) return { kind: "where", query: where[1]!.trim(), live: false, phrase };

  const search = /^(?:search|find|look up)\s+(?:for\s+)?(?:the\s+)?(scripture|scriptures|bible|verse|verses|songs?|lyrics)\s+(?:for\s+)?(.+)$/.exec(phrase);
  if (search) {
    const query = search[2]!.trim();
    if (!query) return null;
    const scope = /^(?:songs?|lyrics)$/.test(search[1]!) ? "songs" : "scripture";
    return { kind: "search", scope, query, live: false, phrase };
  }

  const reference = /^(?:show|open|go to|preview)\s+(.+?\d.*)$/.exec(phrase);
  if (reference) return { kind: "reference", query: spokenReference(reference[1]!), live: false, phrase };

  return null;
}

export function voiceCommandLabel(command: VoiceCommand): string {
  if (command.kind === "command") return COMMANDS.find((entry) => entry.id === command.id)?.title ?? command.id;
  if (command.kind === "library") return command.tab === "songs" ? "Open songs" : "Open scripture";
  if (command.kind === "search") return `Search ${command.scope === "songs" ? "songs" : "scripture"} “${command.query}”`;
  if (command.kind === "translation") return `Translation ${command.id.toUpperCase()}`;
  if (command.kind === "where") return `Where is ${command.query}`;
  return `Show ${command.query}`;
}

/** Keep valid settings: known actions, short non-empty phrases, no duplicates. */
export function sanitizeVoiceSettings(value: unknown): {
  commands: boolean;
  wake: boolean;
  wakeChosen: boolean;
  custom: CustomVoiceCommand[];
  noiseFilter: "off" | "light" | "strong";
  engine: "system" | "accurate" | "parakeet" | "elevenlabs" | "deepgram";
  speechKeys: { elevenlabs?: string; deepgram?: string };
  words: WordFix[];
} {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const actions = new Set<string>(VOICE_ACTIONS.map((entry) => entry.id));
  const seen = new Set<string>();
  const custom: CustomVoiceCommand[] = [];
  for (const entry of Array.isArray(record.custom) ? record.custom : []) {
    if (!entry || typeof entry !== "object") continue;
    const { phrase, action } = entry as { phrase?: unknown; action?: unknown };
    if (typeof phrase !== "string" || typeof action !== "string" || !actions.has(action)) continue;
    const clean = normalize(phrase).replace(/[.,]+$/, "").slice(0, 60);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    custom.push({ phrase: clean, action: action as VoiceAction });
  }
  // The wake word is off unless the operator turned it on themselves (older saves defaulted it on).
  const wakeChosen = record.wakeChosen === true;
  const noiseFilter = record.noiseFilter === "light" || record.noiseFilter === "strong" ? record.noiseFilter : "off";
  // The church's word list: short, unique by what is heard, at most 300.
  const heardSeen = new Set<string>();
  const words: WordFix[] = [];
  for (const entry of Array.isArray(record.words) ? record.words : []) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Partial<WordFix>;
    const heard = typeof item.heard === "string" ? normalize(item.heard).slice(0, 40) : "";
    const means = typeof item.means === "string" ? item.means.trim().slice(0, 60) : "";
    if (!heard || !means || heardSeen.has(heard)) continue;
    // Learned by mistake (an everyday word taken for a book, before learning checked the sound): dropped.
    if (item.source === "learned" && !soundsLikeBook(heard, means)) continue;
    heardSeen.add(heard);
    words.push({ heard, means, source: item.source === "learned" ? "learned" : "yours", uses: Number.isFinite(item.uses) ? Math.max(0, Math.round(item.uses!)) : 0, ...(Number.isFinite(item.at) ? { at: item.at } : {}) });
  }
  const engine = record.engine === "accurate" || record.engine === "parakeet" || record.engine === "elevenlabs" || record.engine === "deepgram" ? record.engine : "system";
  const rawKeys = record.speechKeys && typeof record.speechKeys === "object" ? (record.speechKeys as Record<string, unknown>) : {};
  const key = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : undefined);
  const speechKeys = { ...(key(rawKeys.elevenlabs) ? { elevenlabs: key(rawKeys.elevenlabs) } : {}), ...(key(rawKeys.deepgram) ? { deepgram: key(rawKeys.deepgram) } : {}) };
  return { commands: record.commands !== false, wake: wakeChosen && record.wake === true, wakeChosen, custom: custom.slice(0, 50), noiseFilter, engine, speechKeys, words: words.slice(0, 300), ...(record.keepRecording === true ? { keepRecording: true } : {}) };
}
