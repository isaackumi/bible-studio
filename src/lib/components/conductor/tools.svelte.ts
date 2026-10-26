import { session } from "../../app/session.svelte";
import { audienceRoom } from "../../app/rooms.svelte";
import { msg } from "../../i18n/core";
import { restyle } from "./look.svelte";

// The Conductor Desk keeps its face to Next, the lever and Live. Everything else is a tool, in one
// Tools panel grouped by moment, and any switch or button there can be pinned to the desk's bottom
// strip (this computer remembers which).

export type ToolGroup = "listening" | "screen" | "service" | "help";
export type Tool = { id: string; group: ToolGroup; label: string; icon: string; on?: boolean; run: () => unknown };

export const TOOL_GROUPS: Array<{ id: ToolGroup; label: string }> = [
  { id: "listening", label: msg("Listening") },
  { id: "screen", label: msg("Screen") },
  { id: "service", label: msg("Service") },
  { id: "help", label: msg("Help") },
];

/** The switches and buttons in Tools, as they are now (read inside an effect or template). */
export function conductorTools(): Tool[] {
  const pilot = session.autopilot;
  const theme = session.theme();
  const countdown = session.workspace.overlays.find((overlay) => overlay.kind === "countdown")?.on ?? false;
  const tools: Tool[] = [
    { id: "autopilot", group: "listening", label: msg("Autopilot"), icon: "sparkles", on: pilot.on, run: () => (pilot.on ? pilot.stop() : pilot.start()) },
    { id: "verses-live", group: "listening", label: msg("Verses go live"), icon: "bible", on: pilot.verses, run: () => pilot.setVerses(!pilot.verses) },
    { id: "reference", group: "screen", label: msg("Show the reference"), icon: "type", on: theme.reference.show, run: () => restyle({ reference: { ...theme.reference, show: !theme.reference.show } }) },
    { id: "captions", group: "screen", label: msg("Captions"), icon: "captions", on: session.captionsOn, run: () => session.setCaptions(!session.captionsOn) },
  ];
  if (session.service) tools.push({ id: "countdown", group: "screen", label: msg("Countdown"), icon: "timer", on: countdown, run: () => session.toggleCountdownOverlay() });
  tools.push(
    { id: "stage", group: "service", label: msg("Stage display"), icon: "stage", run: () => (session.stageOpen = true) },
    { id: "questions", group: "service", label: msg("Live Q&A"), icon: "users", run: () => audienceRoom.showTab("questions") },
    { id: "pick", group: "service", label: msg("Pick someone"), icon: "users", run: () => audienceRoom.showTab("pick") },
    { id: "where", group: "help", label: msg("Where is…?"), icon: "help", run: () => session.openCommand("where is ") },
    { id: "tour", group: "help", label: msg("This desk's tour"), icon: "help", run: () => session.startTour("conductor") },
    { id: "keys", group: "help", label: msg("Keyboard shortcuts"), icon: "keys", run: () => session.openSettings("keyboard") },
    { id: "whats-new", group: "help", label: msg("What's new"), icon: "sparkles", run: () => session.showWhatsNew() },
  );
  return tools;
}

const PINS_KEY = "church-studio:conductor-pins";

function readPins(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PINS_KEY) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

/** The tools pinned to the desk, in the order they were pinned. */
export const pins = $state<{ ids: string[] }>({ ids: readPins() });

export function togglePin(id: string) {
  pins.ids = pins.ids.includes(id) ? pins.ids.filter((entry) => entry !== id) : [...pins.ids, id].slice(0, 8);
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins.ids));
  } catch {
    // Private windows can refuse storage; the pins last for this session.
  }
}
