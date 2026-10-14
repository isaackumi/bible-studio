import type { ShortcutAction } from "../domain/types";
import { PROGRAM_ACTIONS } from "../domain/types";

export type CommandId =
  | ShortcutAction
  | "open-settings"
  | "toggle-audience"
  | "toggle-live"
  | "save-workspace";

export type CommandSpec = {
  id: CommandId;
  title: string;
  group: "Program" | "Service" | "Workspace" | "Output";
  changesProgram: boolean;
  shortcut: ShortcutAction | null;
};

export const COMMANDS: CommandSpec[] = [
  { id: "take", title: "Take", group: "Program", changesProgram: true, shortcut: "take" },
  { id: "cut", title: "Cut", group: "Program", changesProgram: true, shortcut: "cut" },
  { id: "clear", title: "Clear", group: "Program", changesProgram: true, shortcut: "clear" },
  { id: "black", title: "Black", group: "Program", changesProgram: true, shortcut: "black" },
  { id: "logo", title: "Logo", group: "Program", changesProgram: true, shortcut: "logo" },
  { id: "previous", title: "Previous", group: "Service", changesProgram: false, shortcut: "previous" },
  { id: "next", title: "Next", group: "Service", changesProgram: false, shortcut: "next" },
  { id: "escape", title: "Leave text field", group: "Service", changesProgram: false, shortcut: "escape" },
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

export function programCommandsMatchActions(): boolean {
  const ids = programCommandIds();
  return ids.length === PROGRAM_ACTIONS.length && PROGRAM_ACTIONS.every((action, index) => action === ids[index]);
}
