import { describe, expect, it } from "vitest";
import { actionFor, describeBinding, emptyMidiSettings, learn, pressOf, sanitizeMidiSettings } from "./midi";

describe("MIDI triggers", () => {
  it("reads presses only: a note played, a controller pushed, a program chosen", () => {
    expect(pressOf([0x90, 60, 100])).toEqual({ kind: "note", channel: 0, number: 60 });
    expect(pressOf([0x99, 36, 1])).toEqual({ kind: "note", channel: 9, number: 36 });
    expect(pressOf([0xb0, 20, 127])).toEqual({ kind: "cc", channel: 0, number: 20 });
    expect(pressOf([0xc3, 4])).toEqual({ kind: "program", channel: 3, number: 4 });
    // Releases: note off, note on at velocity 0 (as MIDI defines it), a controller back to zero.
    expect(pressOf([0x80, 60, 64])).toBeNull();
    expect(pressOf([0x90, 60, 0])).toBeNull();
    expect(pressOf([0xb0, 20, 0])).toBeNull();
    // Clock, sensing and broken messages.
    expect(pressOf([0xf8])).toBeNull();
    expect(pressOf([0x90, 200, 100])).toBeNull();
    expect(pressOf([])).toBeNull();
  });

  it("learns a press for an action, and one press does one thing", () => {
    let settings = learn(emptyMidiSettings(), "take", { kind: "note", channel: 0, number: 60 });
    settings = learn(settings, "black", { kind: "cc", channel: 0, number: 64 });
    expect(actionFor(settings, { kind: "note", channel: 0, number: 60 })).toBe("take");
    expect(actionFor(settings, { kind: "note", channel: 1, number: 60 })).toBeNull();
    // The same pad learned for Next leaves LIVE.
    settings = learn(settings, "next", { kind: "note", channel: 0, number: 60 });
    expect(actionFor(settings, { kind: "note", channel: 0, number: 60 })).toBe("next");
    expect(settings.bindings.take).toBeUndefined();
    expect(settings.bindings.black).toEqual({ kind: "cc", channel: 0, number: 64 });
  });

  it("keeps only sound settings from storage", () => {
    expect(sanitizeMidiSettings(null)).toEqual(emptyMidiSettings());
    expect(
      sanitizeMidiSettings({ device: "nanoPAD2", bindings: { take: { kind: "note", channel: 0, number: 36 }, black: { kind: "note", channel: 16, number: 1 }, launch: { kind: "note", channel: 0, number: 1 } } }),
    ).toEqual({ device: "nanoPAD2", bindings: { take: { kind: "note", channel: 0, number: 36 } } });
  });

  it("names a binding for people: notes by name, channels and programs from 1", () => {
    expect(describeBinding({ kind: "note", channel: 0, number: 60 })).toEqual({ kind: "note", value: "C4", channel: 1 });
    expect(describeBinding({ kind: "cc", channel: 9, number: 20 })).toEqual({ kind: "cc", value: "20", channel: 10 });
    expect(describeBinding({ kind: "program", channel: 0, number: 4 })).toEqual({ kind: "program", value: "5", channel: 1 });
  });
});
