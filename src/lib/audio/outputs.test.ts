import { describe, expect, it } from "vitest";
import { chooseOutput, outputsKey, planOutput, type AudioOutputDevice } from "./outputs";

const speakers: AudioOutputDevice = { id: "BuiltInSpeakerDevice", name: "MacBook Pro Speakers", transport: "built-in", isDefault: true };
const dell: AudioOutputDevice = { id: "dell", name: "DELL U2415", transport: "displayport", isDefault: false };
const tv: AudioOutputDevice = { id: "tv", name: "Samsung TV", transport: "hdmi", isDefault: false };
const usb: AudioOutputDevice = { id: "usb", name: "Church USB Audio", transport: "usb", isDefault: false };
const focusrite: AudioOutputDevice = { id: "scarlett", name: "Scarlett 2i2", transport: "usb", isDefault: false };
const teams: AudioOutputDevice = { id: "teams", name: "Microsoft Teams Audio", transport: "virtual", isDefault: false };
const airpods: AudioOutputDevice = { id: "airpods", name: "AirPods Pro", transport: "bluetooth", isDefault: false };

describe("choosing the congregation's sound output", () => {
  it("uses the laptop's own output when nothing is plugged in", () => {
    expect(chooseOutput([speakers, teams], "auto")).toMatchObject({ output: speakers, why: "computer", missing: false });
  });

  it("uses the audience screen's audio, but not a desk monitor's", () => {
    expect(chooseOutput([speakers, dell, teams], "auto", ["DELL U2415"])).toMatchObject({ output: dell, why: "display" });
    expect(chooseOutput([speakers, dell, teams], "auto", ["Epson projector"])).toMatchObject({ output: speakers, why: "computer" });
    expect(chooseOutput([speakers, dell, teams], "auto")).toMatchObject({ output: speakers, why: "computer" });
  });

  it("prefers an audio interface into the mixer to a display's speakers", () => {
    expect(chooseOutput([speakers, dell, usb], "auto", ["DELL U2415"])).toMatchObject({ output: usb, why: "interface" });
  });

  it("keeps the computer's output when it is already the room's", () => {
    expect(chooseOutput([{ ...speakers, isDefault: false }, { ...dell, isDefault: true }, usb], "auto")).toMatchObject({ output: { id: "dell" }, why: "default-external" });
  });

  it("picks the same one every time from several, the audience screen's audio first", () => {
    expect(chooseOutput([speakers, usb, focusrite], "auto").output?.id).toBe("usb");
    expect(chooseOutput([speakers, focusrite, usb], "auto").output?.id).toBe("usb");
    expect(chooseOutput([speakers, dell, tv], "auto", ["Samsung TV"]).output?.id).toBe("tv");
    expect(chooseOutput([speakers, tv, dell], "auto", ["Samsung TV", "DELL U2415"]).output?.id).toBe("dell");
  });

  it("never picks headphones, AirPlay or a meeting app by itself", () => {
    expect(chooseOutput([{ ...speakers, isDefault: false }, { ...airpods, isDefault: true }, teams], "auto")).toMatchObject({ output: { id: "airpods" }, why: "computer" });
    expect(chooseOutput([speakers, airpods, teams], "auto").output?.id).toBe("BuiltInSpeakerDevice");
  });

  it("keeps a chosen output, even the laptop's own, while it is connected", () => {
    expect(chooseOutput([speakers, dell, usb], "BuiltInSpeakerDevice")).toMatchObject({ output: speakers, why: "chosen" });
    expect(chooseOutput([speakers, dell, usb, airpods], "airpods")).toMatchObject({ output: airpods, why: "chosen" });
  });

  it("falls back when the chosen output is unplugged, and says so", () => {
    expect(chooseOutput([speakers, dell], "usb", ["DELL U2415"])).toMatchObject({ output: dell, why: "display", missing: true });
    expect(chooseOutput([speakers], "usb")).toMatchObject({ output: speakers, why: "computer", missing: true });
  });

  it("has nothing to offer when the computer lists no outputs", () => {
    expect(chooseOutput([], "auto")).toMatchObject({ output: null, why: "computer" });
  });

  it("notices an output coming or going, not a change of order or default", () => {
    expect(outputsKey([speakers, dell])).toBe(outputsKey([{ ...dell, isDefault: true }, { ...speakers, isDefault: false }]));
    expect(outputsKey([speakers, dell])).not.toBe(outputsKey([speakers, dell, usb]));
  });
});

describe("when outputs come and go", () => {
  const home = { ...speakers, isDefault: true };
  const away = { ...speakers, isDefault: false };

  it("leaves a laptop alone at start when nothing is plugged in", () => {
    expect(planOutput(null, [home, teams], "auto", [])).toMatchObject({ switchTo: null, notice: null });
  });

  it("moves to the interface at start, quietly", () => {
    expect(planOutput(null, [home, usb], "auto", [])).toMatchObject({ switchTo: { id: "usb" }, notice: { kind: "start", output: "Church USB Audio" } });
  });

  it("moves to an interface plugged in mid-service, and says so", () => {
    expect(planOutput([home], [home, usb], "auto", [])).toMatchObject({ switchTo: { id: "usb" }, notice: { kind: "moved", cause: "plugged-in", output: "Church USB Audio" } });
  });

  it("when the interface in use is pulled out, says where the sound went", () => {
    // The computer has already gone back to its speakers; Church Studio says so and leaves it.
    expect(planOutput([away, { ...usb, isDefault: true }], [home], "auto", [])).toMatchObject({ switchTo: null, notice: { kind: "moved", cause: "unplugged", output: "MacBook Pro Speakers" } });
    // With the audience screen's sound still there, it goes there instead.
    expect(planOutput([away, dell, { ...usb, isDefault: true }], [home, dell], "auto", ["DELL U2415"])).toMatchObject({ switchTo: { id: "dell" }, notice: { kind: "moved", cause: "unplugged" } });
  });

  it("names a chosen output that was unplugged, and goes back to it when it returns", () => {
    expect(planOutput([away, { ...usb, isDefault: true }], [home], "usb", [], { chosenName: "Church USB Audio" })).toMatchObject({ switchTo: null, notice: { kind: "unplugged", name: "Church USB Audio", output: "MacBook Pro Speakers" } });
    expect(planOutput([home], [home, usb], "usb", [])).toMatchObject({ switchTo: { id: "usb" }, notice: { kind: "moved", cause: "plugged-in" } });
  });

  it("switches straight away when the church chooses, even to this computer", () => {
    expect(planOutput(null, [away, { ...usb, isDefault: true }], "BuiltInSpeakerDevice", [], { chosenNow: true })).toMatchObject({ switchTo: { id: "BuiltInSpeakerDevice" }, notice: null });
  });

  it("follows the audience screen to its own speakers", () => {
    expect(planOutput([home, dell], [home, dell], "auto", ["DELL U2415"])).toMatchObject({ switchTo: { id: "dell" }, notice: { kind: "moved", cause: "screen" } });
  });
});
