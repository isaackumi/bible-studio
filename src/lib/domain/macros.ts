// Macros: one button for a run of steps the team does together, like starting the service (fade the
// walk-in music, begin the first part, show its first item) or handing over to the preacher. Steps run
// in order; a wait holds the next step for a few seconds.

import { msg, t } from "../i18n/core";

export type MacroStep =
  | { kind: "fade-music"; seconds: number }
  | { kind: "play-playlist"; playlistId: string }
  | { kind: "stop-music" }
  | { kind: "program"; action: "take" | "clear" | "clear-words" | "black" | "logo" }
  | { kind: "show-item"; which: "next" | "first-of-part"; live: boolean }
  | { kind: "start-part"; which: "next" | "first" }
  | { kind: "countdown"; mode: "full" | "overlay-on" | "overlay-off" }
  | { kind: "captions"; on: boolean }
  | { kind: "stage-message"; text: string }
  | { kind: "wait"; seconds: number }
  /** The production app (OBS, vMix): a scene or input on air, or its stream and recording. */
  | { kind: "switcher"; action: SwitcherAction; scene: string };

export type SwitcherAction = "scene" | "stream-start" | "stream-stop" | "record-start" | "record-stop";
const SWITCHER_ACTIONS: SwitcherAction[] = ["scene", "stream-start", "stream-stop", "record-start", "record-stop"];

export type Macro = { id: string; name: string; steps: MacroStep[] };

export const STEP_KINDS: Array<{ kind: MacroStep["kind"]; label: string; make: () => MacroStep }> = [
  { kind: "fade-music", label: msg("Fade the music out"), make: () => ({ kind: "fade-music", seconds: 4 }) },
  { kind: "play-playlist", label: msg("Play a playlist"), make: () => ({ kind: "play-playlist", playlistId: "walk-in" }) },
  { kind: "stop-music", label: msg("Stop the music"), make: () => ({ kind: "stop-music" }) },
  { kind: "start-part", label: msg("Begin a part of the service"), make: () => ({ kind: "start-part", which: "next" }) },
  { kind: "show-item", label: msg("Show an item"), make: () => ({ kind: "show-item", which: "first-of-part", live: true }) },
  { kind: "program", label: msg("Screen: live, clear, black, logo"), make: () => ({ kind: "program", action: "take" }) },
  { kind: "countdown", label: msg("Countdown"), make: () => ({ kind: "countdown", mode: "overlay-on" }) },
  { kind: "captions", label: msg("Captions on or off"), make: () => ({ kind: "captions", on: true }) },
  { kind: "stage-message", label: msg("Message to the stage"), make: () => ({ kind: "stage-message", text: "You're on" }) },
  { kind: "wait", label: msg("Wait"), make: () => ({ kind: "wait", seconds: 2 }) },
  { kind: "switcher", label: msg("OBS or vMix: scene, stream, record"), make: () => ({ kind: "switcher", action: "scene", scene: "" }) },
];

// The screen actions, named for the scanner that checks every line has its translation.
msg("Go live (Preview to the screen)"); msg("Clear the screen"); msg("Clear the words"); msg("Black"); msg("Logo");

const MAX_MACROS = 24;
const MAX_STEPS = 20;

/** A sample to start from: edit it, or make your own. */
export function defaultMacros(): Macro[] {
  return [
    {
      id: "start-service",
      name: "Start the service",
      steps: [
        { kind: "fade-music", seconds: 4 },
        { kind: "start-part", which: "first" },
        { kind: "show-item", which: "first-of-part", live: true },
      ],
    },
    {
      id: "sermon",
      name: "Over to the preacher",
      steps: [
        { kind: "start-part", which: "next" },
        { kind: "countdown", mode: "overlay-on" },
        { kind: "stage-message", text: "Time starts now" },
      ],
    },
  ];
}

function cleanStep(value: unknown): MacroStep | null {
  const step = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!step) return null;
  const seconds = (raw: unknown, fallback: number) => (typeof raw === "number" && Number.isFinite(raw) ? Math.min(60, Math.max(0, Math.round(raw * 10) / 10)) : fallback);
  switch (step.kind) {
    case "fade-music":
      return { kind: "fade-music", seconds: seconds(step.seconds, 4) || 4 };
    case "play-playlist":
      return typeof step.playlistId === "string" && step.playlistId ? { kind: "play-playlist", playlistId: step.playlistId } : null;
    case "stop-music":
      return { kind: "stop-music" };
    case "program":
      return ["take", "clear", "clear-words", "black", "logo"].includes(step.action as string) ? { kind: "program", action: step.action as "take" } : null;
    case "show-item":
      return { kind: "show-item", which: step.which === "next" ? "next" : "first-of-part", live: step.live !== false };
    case "start-part":
      return { kind: "start-part", which: step.which === "first" ? "first" : "next" };
    case "countdown":
      return { kind: "countdown", mode: step.mode === "full" || step.mode === "overlay-off" ? step.mode : "overlay-on" };
    case "captions":
      return { kind: "captions", on: step.on !== false };
    case "stage-message":
      return { kind: "stage-message", text: typeof step.text === "string" ? step.text.slice(0, 140) : "" };
    case "wait":
      return { kind: "wait", seconds: seconds(step.seconds, 2) };
    case "switcher":
      return {
        kind: "switcher",
        action: SWITCHER_ACTIONS.includes(step.action as SwitcherAction) ? (step.action as SwitcherAction) : "scene",
        scene: typeof step.scene === "string" ? step.scene.slice(0, 120) : "",
      };
    default:
      return null;
  }
}

export function sanitizeMacros(value: unknown): Macro[] {
  if (!Array.isArray(value)) return defaultMacros();
  const seen = new Set<string>();
  return value
    .flatMap((raw): Macro[] => {
      const record = raw && typeof raw === "object" ? (raw as Partial<Macro>) : null;
      if (!record || typeof record.id !== "string" || !record.id || seen.has(record.id)) return [];
      seen.add(record.id);
      const steps = (Array.isArray(record.steps) ? record.steps : []).map(cleanStep).filter((step): step is MacroStep => step !== null).slice(0, MAX_STEPS);
      return [{ id: record.id, name: typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 40) : "Macro", steps }];
    })
    .slice(0, MAX_MACROS);
}

/** One line per step, for the button's tooltip and the editor ("Fade the music out (4 s)"). */
export function describeStep(step: MacroStep, names: { playlist: (id: string) => string }): string {
  switch (step.kind) {
    case "fade-music":
      return t("Fade the music out ({seconds} s)", { seconds: step.seconds });
    case "play-playlist":
      return t("Play {name}", { name: names.playlist(step.playlistId) });
    case "stop-music":
      return t("Stop the music");
    case "program":
      return t({ take: "Go live (Preview to the screen)", clear: "Clear the screen", "clear-words": "Clear the words", black: "Black", logo: "Logo" }[step.action]);
    case "show-item":
      if (step.which === "next") return step.live ? t("Next item, on the screen") : t("Next item, on Preview");
      return step.live ? t("First item of the part, on the screen") : t("First item of the part, on Preview");
    case "start-part":
      return step.which === "first" ? t("Begin the first part") : t("Begin the next part");
    case "countdown":
      return step.mode === "full" ? t("Countdown, full screen on Preview") : step.mode === "overlay-on" ? t("Countdown on the screen") : t("Countdown off");
    case "captions":
      return step.on ? t("Captions on") : t("Captions off");
    case "stage-message":
      return step.text ? t("Stage: “{text}”", { text: step.text }) : t("Clear the stage message");
    case "wait":
      return t("Wait {seconds} s", { seconds: step.seconds });
    case "switcher":
      return step.action === "scene"
        ? t("Production app: put “{scene}” on air", { scene: step.scene || "…" })
        : { "stream-start": t("Production app: start streaming"), "stream-stop": t("Production app: stop streaming"), "record-start": t("Production app: start recording"), "record-stop": t("Production app: stop recording") }[step.action];
  }
}
