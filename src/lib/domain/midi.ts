// MIDI triggers: which message from a pad, footswitch, keyboard or the band's software does what on
// the desk. A binding is learned from the device (press Learn, then the pad), so it suits any
// hardware. Only presses count: a note played (not released), a controller pushed above zero, a
// program chosen.

import { msg } from "../i18n/core";

/** The desk actions a MIDI message can run: the same ones the keyboard shortcuts do. */
export type MidiAction = "take" | "cut" | "next" | "previous" | "black" | "clear" | "clear-words" | "logo";

export const MIDI_ACTIONS: Array<{ id: MidiAction; label: string }> = [
  { id: "take", label: msg("LIVE (send Preview to the screen)") },
  { id: "next", label: msg("Next") },
  { id: "previous", label: msg("Previous") },
  { id: "cut", label: msg("Cut (no transition)") },
  { id: "black", label: msg("BLACK") },
  { id: "clear", label: msg("CLEAR") },
  { id: "clear-words", label: msg("CLEAR WORDS") },
  { id: "logo", label: msg("LOGO") },
];

/** Which message: a note, a controller (CC) or a program change, on one of the 16 channels (0–15). */
export type MidiBinding = { kind: "note" | "cc" | "program"; channel: number; number: number };

export type MidiSettings = {
  /** The input listened to (its name), or null for none. */
  device: string | null;
  bindings: Partial<Record<MidiAction, MidiBinding>>;
};

export function emptyMidiSettings(): MidiSettings {
  return { device: null, bindings: {} };
}

const isByte = (value: unknown, most: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= most;

function sanitizeBinding(value: unknown): MidiBinding | null {
  const record = value && typeof value === "object" ? (value as Partial<MidiBinding>) : null;
  if (!record || (record.kind !== "note" && record.kind !== "cc" && record.kind !== "program")) return null;
  if (!isByte(record.channel, 15) || !isByte(record.number, 127)) return null;
  return { kind: record.kind, channel: record.channel, number: record.number };
}

export function sanitizeMidiSettings(value: unknown): MidiSettings {
  const record = value && typeof value === "object" ? (value as Partial<MidiSettings>) : {};
  const bindings: Partial<Record<MidiAction, MidiBinding>> = {};
  const saved = record.bindings && typeof record.bindings === "object" ? (record.bindings as Record<string, unknown>) : {};
  for (const { id } of MIDI_ACTIONS) {
    const binding = sanitizeBinding(saved[id]);
    if (binding) bindings[id] = binding;
  }
  return { device: typeof record.device === "string" && record.device.trim() ? record.device.slice(0, 200) : null, bindings };
}

/**
 * A press, from a message's bytes; null for anything else (a note released, a controller back to
 * zero, clock and other system messages). Note on with velocity 0 is a release, as MIDI defines it.
 */
export function pressOf(bytes: number[]): MidiBinding | null {
  const [status, first, second] = bytes;
  if (!isByte(status, 0xef) || status < 0x80) return null;
  const kind = status & 0xf0;
  const channel = status & 0x0f;
  if (kind === 0x90 && isByte(first, 127) && isByte(second, 127) && second > 0) return { kind: "note", channel, number: first };
  if (kind === 0xb0 && isByte(first, 127) && isByte(second, 127) && second > 0) return { kind: "cc", channel, number: first };
  if (kind === 0xc0 && isByte(first, 127)) return { kind: "program", channel, number: first };
  return null;
}

export const sameBinding = (a: MidiBinding, b: MidiBinding) => a.kind === b.kind && a.channel === b.channel && a.number === b.number;

/** The action a press runs, if any. */
export function actionFor(settings: MidiSettings, press: MidiBinding): MidiAction | null {
  for (const { id } of MIDI_ACTIONS) {
    const binding = settings.bindings[id];
    if (binding && sameBinding(binding, press)) return id;
  }
  return null;
}

/** Learning a press for one action: any other action that had it gives it up, so one press does one thing. */
export function learn(settings: MidiSettings, action: MidiAction, press: MidiBinding): MidiSettings {
  const bindings: Partial<Record<MidiAction, MidiBinding>> = {};
  for (const [id, binding] of Object.entries(settings.bindings) as Array<[MidiAction, MidiBinding]>) {
    if (!sameBinding(binding, press)) bindings[id] = binding;
  }
  bindings[action] = press;
  return { ...settings, bindings };
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** "Note C3 · channel 1", "CC 20 · channel 1", "Program 5 · channel 10": for people, channels from 1. */
export function describeBinding(binding: MidiBinding): { kind: string; value: string; channel: number } {
  const channel = binding.channel + 1;
  if (binding.kind === "note") return { kind: "note", value: `${NAMES[binding.number % 12]}${Math.floor(binding.number / 12) - 1}`, channel };
  if (binding.kind === "cc") return { kind: "cc", value: String(binding.number), channel };
  return { kind: "program", value: String(binding.number + 1), channel };
}
