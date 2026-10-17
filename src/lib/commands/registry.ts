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

export const COMMANDS: CommandSpec[] = [
  { id: "take", title: "Go live", group: "Program", changesProgram: true, shortcut: "take" },
  { id: "cut", title: "Cut", group: "Program", changesProgram: true, shortcut: "cut" },
  { id: "clear", title: "Clear", group: "Program", changesProgram: true, shortcut: "clear" },
  { id: "black", title: "Black", group: "Program", changesProgram: true, shortcut: "black" },
  { id: "logo", title: "Logo", group: "Program", changesProgram: true, shortcut: "logo" },
  { id: "timer-pause", title: "Pause timer", group: "Program", changesProgram: true, shortcut: null },
  { id: "timer-resume", title: "Start timer", group: "Program", changesProgram: true, shortcut: null },
  { id: "timer-reset", title: "Reset timer", group: "Program", changesProgram: true, shortcut: null },
  { id: "previous", title: "Previous", group: "Service", changesProgram: false, shortcut: "previous" },
  { id: "next", title: "Next", group: "Service", changesProgram: false, shortcut: "next" },
  { id: "escape", title: "Leave text field", group: "Service", changesProgram: false, shortcut: "escape" },
  { id: "focus", title: "Focus preview and program", group: "Workspace", changesProgram: false, shortcut: "focus" },
  { id: "library", title: "Show or hide library", group: "Workspace", changesProgram: false, shortcut: "library" },
  { id: "queue", title: "Show or hide queue", group: "Workspace", changesProgram: false, shortcut: "queue" },
  { id: "find", title: "Search", group: "Workspace", changesProgram: false, shortcut: "find" },
  { id: "open-settings", title: "Open settings", group: "Workspace", changesProgram: false, shortcut: null },
  { id: "save-workspace", title: "Save workspace", group: "Workspace", changesProgram: false, shortcut: null },
  { id: "toggle-audience", title: "Toggle audience output", group: "Output", changesProgram: false, shortcut: null },
  { id: "toggle-live", title: "Toggle live mode", group: "Workspace", changesProgram: false, shortcut: null },
];

export function programCommandIds(): CommandId[] {
  return COMMANDS.filter((command) => command.changesProgram).map((command) => command.id);
}

export function changesProgram(id: CommandId): boolean {
  return COMMANDS.some((command) => command.id === id && command.changesProgram);
}

/** Change the timer already on Program (not which frame is on Program). */
export const TIMER_COMMANDS: CommandId[] = ["timer-pause", "timer-resume", "timer-reset"];

/** Program changes only through the frame actions (take, cut, clear, black, logo) and timer controls. */
export function programCommandsMatchActions(): boolean {
  const ids = programCommandIds();
  const expected: CommandId[] = [...PROGRAM_ACTIONS, ...TIMER_COMMANDS];
  return ids.length === expected.length && expected.every((action, index) => action === ids[index]);
}
