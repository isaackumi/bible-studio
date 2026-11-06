// MIDI triggers on this computer: which input to listen to, the presses learned for each desk action,
// and the listening itself. Kept on this computer (not in the shared library): a MIDI device is
// plugged into one machine. A press runs the same desk action as its keyboard shortcut.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { actionFor, emptyMidiSettings, learn, pressOf, sanitizeMidiSettings, type MidiAction, type MidiSettings } from "../domain/midi";
import { isDesktop } from "../platform/runtime";
import { t } from "../i18n/core";
import { session } from "./session.svelte";

const KEY = "church-studio.midi";
/** A pad that bounces sends two presses close together: the second is not a second press. */
const BOUNCE_MS = 150;

function load(): MidiSettings {
  try {
    return sanitizeMidiSettings(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return emptyMidiSettings();
  }
}

class MidiControl {
  settings = $state<MidiSettings>(typeof localStorage === "undefined" ? emptyMidiSettings() : load());
  /** The inputs on this computer, by name (refreshed when Settings opens). */
  inputs = $state<string[]>([]);
  /** Listening to the chosen input, or why not. */
  status = $state<"off" | "on" | "missing" | "error">("off");
  error = $state("");
  /** The action waiting for a press to learn, in Settings. */
  learning = $state<MidiAction | null>(null);
  /** The last press seen, for Settings ("Heard C3 on channel 1"). */
  lastPress = $state<string>("");

  private unlisten: (() => void) | null = null;
  private lastAt = new Map<string, number>();

  get supported(): boolean {
    return isDesktop();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      // Storage blocked: the choices last until the app closes.
    }
  }

  refreshInputs = async () => {
    if (!this.supported) return;
    try {
      this.inputs = await invoke<string[]>("midi_inputs");
    } catch (error) {
      this.inputs = [];
      this.status = "error";
      this.error = error instanceof Error ? error.message : String(error);
    }
  };

  /** Listen to the chosen input (at start, and when it changes). Quiet when none is chosen. */
  start = async () => {
    if (!this.supported) return;
    const device = this.settings.device;
    if (!device) {
      await this.stop();
      return;
    }
    if (!this.unlisten) this.unlisten = await listen<number[]>("midi-message", (event) => this.onMessage(event.payload));
    try {
      await invoke("midi_listen", { name: device });
      this.status = "on";
      this.error = "";
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.status = reason.includes("not connected") ? "missing" : "error";
      this.error = reason;
    }
  };

  stop = async () => {
    this.status = "off";
    if (this.supported) await invoke("midi_stop").catch(() => {});
  };

  choose = async (device: string | null) => {
    this.settings = { ...this.settings, device };
    this.save();
    await this.start();
  };

  /** Learn the next press for this action (pressing Learn again, or Escape in Settings, cancels). */
  startLearning = (action: MidiAction | null) => {
    this.learning = this.learning === action ? null : action;
  };

  forget = (action: MidiAction) => {
    const bindings = { ...this.settings.bindings };
    delete bindings[action];
    this.settings = { ...this.settings, bindings };
    this.save();
  };

  private onMessage(bytes: number[]) {
    const press = pressOf(bytes);
    if (!press) return;
    const key = `${press.kind}:${press.channel}:${press.number}`;
    const now = Date.now();
    if (now - (this.lastAt.get(key) ?? 0) < BOUNCE_MS) return;
    this.lastAt.set(key, now);
    this.lastPress = key;
    // Learning: this press is for the action waiting, and runs nothing.
    if (this.learning) {
      this.settings = learn(this.settings, this.learning, press);
      this.learning = null;
      this.save();
      session.quiet(t("MIDI learned."));
      return;
    }
    const action = actionFor(this.settings, press);
    if (action) void session.run(action);
  }
}

export const midi = new MidiControl();
