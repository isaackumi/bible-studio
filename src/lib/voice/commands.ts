import { COMMANDS, type CommandId } from "../commands/registry";

/**
 * Spoken operator commands. Every command needs the wake word ("studio …" or "church studio …"),
 * so sermon speech such as "take this to heart" never acts. Commands reuse the desk's CommandIds;
 * `live` marks the ones that change Program so the caller can require explicit permission.
 */
export type VoiceCommand =
  | { kind: "command"; id: CommandId; live: boolean; phrase: string }
  | { kind: "library"; tab: "bible" | "songs"; live: false; phrase: string }
  | { kind: "search"; scope: "scripture" | "songs"; query: string; live: false; phrase: string }
  | { kind: "reference"; query: string; live: false; phrase: string }
  | { kind: "translation"; id: string; live: false; phrase: string };

/** What a custom phrase can do: any desk command, or open a library. */
export type VoiceAction = CommandId | "open-scripture" | "open-songs";
export type CustomVoiceCommand = { phrase: string; action: VoiceAction };

export type VoiceParseOptions = {
  /** Require "Studio …" (default true). Off: only a whole-utterance command counts. */
  wake?: boolean;
  translations?: Array<{ id: string; abbreviation: string; name: string }>;
  custom?: CustomVoiceCommand[];
};

export const VOICE_ACTIONS: Array<{ id: VoiceAction; label: string }> = [
  { id: "next", label: "Next" },
  { id: "previous", label: "Previous" },
  { id: "take", label: "Take (Program)" },
  { id: "cut", label: "Cut (Program)" },
  { id: "clear", label: "Clear (Program)" },
  { id: "black", label: "Black (Program)" },
  { id: "logo", label: "Logo (Program)" },
  { id: "timer-pause", label: "Pause timer (Program)" },
  { id: "timer-resume", label: "Start timer (Program)" },
  { id: "timer-reset", label: "Reset timer (Program)" },
  { id: "open-scripture", label: "Open scripture" },
  { id: "open-songs", label: "Open songs" },
];

const WAKE = /^(?:church\s+)?studios?\b[\s,.:!-]*/;

const PHRASES: Array<[RegExp, CommandId]> = [
  [/^(?:next|next (?:slide|verse|section|item|one)|forward|go forward|advance)$/, "next"],
  [/^(?:previous|prev|back|go back|previous (?:slide|verse|section|item|one)|last (?:slide|verse|one))$/, "previous"],
  [/^(?:take|go live|live|send (?:it|to program)|put it (?:up|live))$/, "take"],
  [/^(?:cut|cut to program|hard cut)$/, "cut"],
  [/^(?:clear|clear (?:the )?(?:screen|program|output))$/, "clear"],
  [/^(?:black|blackout|black ?out|black (?:the )?screen|go black|fade to black)$/, "black"],
  [/^(?:logo|show (?:the )?logo)$/, "logo"],
  [/^(?:pause|stop|hold|freeze) (?:the )?(?:timer|countdown|clock)$/, "timer-pause"],
  [/^(?:start|resume|continue|run) (?:the )?(?:timer|countdown)$/, "timer-resume"],
  [/^(?:reset|restart) (?:the )?(?:timer|countdown)$/, "timer-reset"],
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"?!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  const wanted = name.replace(/\b(?:the|version|translation|bible)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!wanted) return null;
  for (const translation of translations) {
    const abbreviation = translation.abbreviation.toLowerCase();
    const full = translation.name.toLowerCase().replace(/\b(?:the|version|translation|bible|in)\b/g, " ").replace(/\s+/g, " ").trim();
    if (wanted === abbreviation || wanted === abbreviation.split("").join(" ") || wanted === full || (full && full.includes(wanted) && wanted.length >= 4)) {
      return translation.id;
    }
  }
  return null;
}

export function parseVoiceCommand(text: string, options: VoiceParseOptions = {}): VoiceCommand | null {
  const spoken = normalize(text);
  const wake = WAKE.exec(spoken);
  if (!wake && options.wake !== false) return null;
  const phrase = spoken.slice(wake ? wake[0].length : 0).replace(/[.,]+$/, "").trim();
  if (!phrase) return null;

  for (const entry of options.custom ?? []) {
    if (normalize(entry.phrase).replace(/[.,]+$/, "") === phrase) return actionCommand(entry.action, phrase);
  }

  const translation = /^(?:switch to|use|give me|change to|read from|read in|go to)\s+(.+)$/.exec(phrase);
  if (translation && options.translations?.length) {
    const id = matchTranslation(translation[1]!, options.translations);
    if (id) return { kind: "translation", id, live: false, phrase };
  }

  for (const [pattern, id] of PHRASES) {
    if (!pattern.test(phrase)) continue;
    const live = COMMANDS.find((command) => command.id === id)?.changesProgram ?? false;
    return { kind: "command", id, live, phrase };
  }

  const library = /^(?:open|show|go to)\s+(?:the\s+)?(scripture|scriptures|bible|songs?|lyrics)$/.exec(phrase);
  if (library) {
    const tab = library[1]!.startsWith("song") || library[1] === "lyrics" ? "songs" : "bible";
    return { kind: "library", tab, live: false, phrase };
  }

  // Open-ended phrases need the wake word: without it, sermon speech ("show me 3 things") could match.
  if (!wake) return null;

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
  return `Show ${command.query}`;
}

/** Keep valid settings: known actions, short non-empty phrases, no duplicates. */
export function sanitizeVoiceSettings(value: unknown): { commands: boolean; wake: boolean; custom: CustomVoiceCommand[] } {
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
  return { commands: record.commands !== false, wake: record.wake !== false, custom: custom.slice(0, 50) };
}
