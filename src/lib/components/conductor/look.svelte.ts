import { session } from "../../app/session.svelte";
import type { Theme } from "../../domain/types";

// The Conductor Desk's look changes, shared by the look line and Tools › Screen: with "Live too" on,
// a change shows on the screen at once; off, it waits on Next for the lever.

export const look = $state({ liveToo: true });

export function restyle(patch: Partial<Theme>) {
  session.saveTheme({ ...$state.snapshot(session.theme()), ...patch } as Theme);
  if (look.liveToo) void session.restyleProgram();
}
