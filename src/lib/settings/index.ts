// The Settings search index, built from the Settings markup. Loaded only when the search opens,
// so the sources it reads stay out of the desk's first load.

import { COMMANDS } from "../commands/registry";
import { extractSettings, type SettingEntry } from "./search";

const dialogs = import.meta.glob<string>("../components/settings/*.svelte", { query: "?raw", import: "default", eager: true });
const shared = import.meta.glob<string>("../components/{AudioSettings,RemotePanel,CapabilityList}.svelte", { query: "?raw", import: "default", eager: true });

const byName = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).map(([path, source]) => [path.split("/").pop()!.replace(/\.svelte$/, ""), source]));

let built: SettingEntry[] | null = null;

export function settingsIndex(): SettingEntry[] {
  if (built) return built;
  const components = { ...byName(dialogs), ...byName(shared) };
  const entries = extractSettings(components.SettingsDialog ?? "", components);
  // Keyboard: each command is a row of its own ("Go live", "Black"), drawn from the registry.
  for (const command of COMMANDS) {
    const id = `keyboard:${command.title}`;
    if (!entries.some((entry) => entry.id === id)) entries.push({ id, section: "keyboard", kind: "row", title: command.title, about: "", context: command.group, words: "shortcut key hotkey" });
  }
  built = entries;
  return entries;
}
