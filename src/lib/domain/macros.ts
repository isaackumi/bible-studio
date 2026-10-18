// Macros: one button for a run of steps the team does together, like starting the service (fade the
// walk-in music, begin the first part, show its first item) or handing over to the preacher. Steps run
// in order; a wait holds the next step for a few seconds.

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
  | { kind: "wait"; seconds: number };

export type Macro = { id: string; name: string; steps: MacroStep[] };

export const STEP_KINDS: Array<{ kind: MacroStep["kind"]; label: string; make: () => MacroStep }> = [
  { kind: "fade-music", label: "Fade the music out", make: () => ({ kind: "fade-music", seconds: 4 }) },
  { kind: "play-playlist", label: "Play a playlist", make: () => ({ kind: "play-playlist", playlistId: "walk-in" }) },
  { kind: "stop-music", label: "Stop the music", make: () => ({ kind: "stop-music" }) },
  { kind: "start-part", label: "Begin a part of the service", make: () => ({ kind: "start-part", which: "next" }) },
  { kind: "show-item", label: "Show an item", make: () => ({ kind: "show-item", which: "first-of-part", live: true }) },
  { kind: "program", label: "Screen: live, clear, black, logo", make: () => ({ kind: "program", action: "take" }) },
  { kind: "countdown", label: "Countdown", make: () => ({ kind: "countdown", mode: "overlay-on" }) },
  { kind: "captions", label: "Captions on or off", make: () => ({ kind: "captions", on: true }) },
  { kind: "stage-message", label: "Message to the stage", make: () => ({ kind: "stage-message", text: "You're on" }) },
  { kind: "wait", label: "Wait", make: () => ({ kind: "wait", seconds: 2 }) },
];

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
      return `Fade the music out (${step.seconds} s)`;
    case "play-playlist":
      return `Play ${names.playlist(step.playlistId)}`;
    case "stop-music":
      return "Stop the music";
    case "program":
      return { take: "Go live (Preview to the screen)", clear: "Clear the screen", "clear-words": "Clear the words", black: "Black", logo: "Logo" }[step.action];
    case "show-item":
      return `${step.which === "next" ? "Next item" : "First item of the part"}${step.live ? ", on the screen" : ", on Preview"}`;
    case "start-part":
      return step.which === "first" ? "Begin the first part" : "Begin the next part";
    case "countdown":
      return step.mode === "full" ? "Countdown, full screen on Preview" : step.mode === "overlay-on" ? "Countdown on the screen" : "Countdown off";
    case "captions":
      return step.on ? "Captions on" : "Captions off";
    case "stage-message":
      return step.text ? `Stage: “${step.text}”` : "Clear the stage message";
    case "wait":
      return `Wait ${step.seconds} s`;
  }
}
