import { msg } from "../i18n/core";
import type { ShortcutAction } from "../domain/types";
import { PROGRAM_ACTIONS } from "../domain/types";

export type CommandId =
  | ShortcutAction
  | "open-settings"
  | "toggle-audience"
  | "toggle-live"
  | "save-workspace"
  | "timer-pause"
  | "timer-resume"
  | "timer-reset";

export type CommandSpec = {
  id: CommandId;
  title: string;
  group: "Program" | "Service" | "Workspace" | "Output";
  changesProgram: boolean;
  shortcut: ShortcutAction | null;
};

// The groups, named for the scanner that checks every line has its translation.
msg("Program"); msg("Service"); msg("Workspace"); msg("Output");

export const COMMANDS: CommandSpec[] = [
  { id: "take", title: msg("Go live"), group: "Program", changesProgram: true, shortcut: "take" },
  { id: "cut", title: msg("Cut"), group: "Program", changesProgram: true, shortcut: "cut" },
  { id: "clear", title: msg("Clear"), group: "Program", changesProgram: true, shortcut: "clear" },
  { id: "black", title: msg("Black"), group: "Program", changesProgram: true, shortcut: "black" },
  { id: "logo", title: msg("Logo"), group: "Program", changesProgram: true, shortcut: "logo" },
  { id: "clear-words", title: msg("Clear words (keep the background)"), group: "Program", changesProgram: true, shortcut: "clear-words" },
  { id: "timer-pause", title: msg("Pause timer"), group: "Program", changesProgram: true, shortcut: null },
  { id: "timer-resume", title: msg("Start timer"), group: "Program", changesProgram: true, shortcut: null },
  { id: "timer-reset", title: msg("Reset timer"), group: "Program", changesProgram: true, shortcut: null },
  { id: "previous", title: msg("Previous"), group: "Service", changesProgram: false, shortcut: "previous" },
  { id: "next", title: msg("Next"), group: "Service", changesProgram: false, shortcut: "next" },
  { id: "escape", title: msg("Leave text field"), group: "Service", changesProgram: false, shortcut: "escape" },
  { id: "focus", title: msg("Focus preview and program"), group: "Workspace", changesProgram: false, shortcut: "focus" },
  { id: "library", title: msg("Show or hide library"), group: "Workspace", changesProgram: false, shortcut: "library" },
  { id: "queue", title: msg("Show or hide queue"), group: "Workspace", changesProgram: false, shortcut: "queue" },
  { id: "find", title: msg("Search"), group: "Workspace", changesProgram: false, shortcut: "find" },
  { id: "open-settings", title: msg("Open settings"), group: "Workspace", changesProgram: false, shortcut: null },
  { id: "save-workspace", title: msg("Save workspace"), group: "Workspace", changesProgram: false, shortcut: null },
  { id: "toggle-audience", title: msg("Toggle audience output"), group: "Output", changesProgram: false, shortcut: null },
  { id: "toggle-live", title: msg("Toggle live mode"), group: "Workspace", changesProgram: false, shortcut: null },
];

export function programCommandIds(): CommandId[] {
  return COMMANDS.filter((command) => command.changesProgram).map((command) => command.id);
}

export function changesProgram(id: CommandId): boolean {
  return COMMANDS.some((command) => command.id === id && command.changesProgram);
}

/** Change the timer already on Program (not which frame is on Program). */
export const TIMER_COMMANDS: CommandId[] = ["timer-pause", "timer-resume", "timer-reset"];

/** Change what is already on Program in place: take its words away. */
export const IN_PLACE_COMMANDS: CommandId[] = ["clear-words"];

/** Program changes only through the frame actions (take, cut, clear, black, logo), clear words and timer controls. */
export function programCommandsMatchActions(): boolean {
  const ids = programCommandIds();
  const expected: CommandId[] = [...PROGRAM_ACTIONS, ...IN_PLACE_COMMANDS, ...TIMER_COMMANDS];
  return ids.length === expected.length && expected.every((action, index) => action === ids[index]);
}
