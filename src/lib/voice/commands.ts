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
  | { kind: "reference"; query: string; live: false; phrase: string };

const WAKE = /^(?:church\s+)?studios?\b[\s,.:!-]*/;

const PHRASES: Array<[RegExp, CommandId]> = [
  [/^(?:next|next (?:slide|verse|section|item|one)|forward|go forward|advance)$/, "next"],
  [/^(?:previous|prev|back|go back|previous (?:slide|verse|section|item|one)|last (?:slide|verse|one))$/, "previous"],
  [/^(?:take|go live|live|send (?:it|to program)|put it (?:up|live))$/, "take"],
  [/^(?:cut|cut to program|hard cut)$/, "cut"],
  [/^(?:clear|clear (?:the )?(?:screen|program|output))$/, "clear"],
  [/^(?:black|blackout|black ?out|black (?:the )?screen|go black|fade to black)$/, "black"],
  [/^(?:logo|show (?:the )?logo)$/, "logo"],
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

export function parseVoiceCommand(text: string): VoiceCommand | null {
  const spoken = normalize(text);
  const wake = WAKE.exec(spoken);
  if (!wake) return null;
  const phrase = spoken.slice(wake[0].length).replace(/[.,]+$/, "").trim();
  if (!phrase) return null;

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
  return `Show ${command.query}`;
}
