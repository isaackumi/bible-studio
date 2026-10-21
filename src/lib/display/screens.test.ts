import { describe, expect, it } from "vitest";
import { newScreen, placeScreens, screensNow, programFor, sanitizeScreens, screenLetter, switchRole, type ScreenDisplay, type ScreenOutput } from "./screens";
import type { PresentationModel } from "../domain/types";

const display = (key: string, extra: Partial<ScreenDisplay> = {}): ScreenDisplay => ({ key, name: key, x: 0, y: 0, width: 1920, height: 1080, primary: false, audience: false, ...extra });
const screen = (id: string, displayKey: string | null, extra: Partial<ScreenOutput> = {}): ScreenOutput => ({ id, name: "", displayKey, role: "blank", locked: false, ...extra });
const model = (layout: string) => ({ layout }) as unknown as PresentationModel;

describe("screens", () => {
  it("keeps saved screens clean", () => {
    expect(sanitizeScreens([{ id: "abcd1234", name: " Pulpit TV ", displayKey: "LG|1920x1080|1", role: "timer", locked: true }, { id: "abcd1234", role: "stage" }, { id: "x" }, { id: "efgh5678", role: "nonsense" }, "junk"])).toEqual([
      { id: "abcd1234", name: "Pulpit TV", displayKey: "LG|1920x1080|1", role: "timer", locked: true },
      { id: "efgh5678", name: "", displayKey: null, role: "blank", locked: false },
    ]);
    expect(sanitizeScreens(undefined)).toEqual([]);
    expect(screenLetter(0) + screenLetter(4)).toBe("AE");
  });

  it("switches a job unless the screen is locked", () => {
    const screens = [screen("aaaa1111", "A"), screen("bbbb2222", "B", { role: "timer", locked: true })];
    expect(switchRole(screens, "aaaa1111", "stage")[0]!.role).toBe("stage");
    expect(switchRole(screens, "bbbb2222", "stage")[1]!.role).toBe("timer");
  });

  it("shows only what each job is for", () => {
    expect(programFor("program", model("lyrics"))?.layout).toBe("lyrics");
    expect(programFor("scripture", model("scripture"))?.layout).toBe("scripture");
    expect(programFor("scripture", model("lyrics"))).toBeNull();
    expect(programFor("lyrics", model("lyrics"))?.layout).toBe("lyrics");
    expect(programFor("timer", model("scripture"))).toBeNull();
  });

  it("puts each screen on its own monitor, never on the desk's or the audience's", () => {
    const displays = [display("desk", { primary: true }), display("projector", { audience: true }), display("tv-left"), display("tv-right")];
    const screens = [screen("aaaa1111", "tv-left"), screen("bbbb2222", "desk"), screen("cccc3333", "projector"), screen("dddd4444", "tv-left"), screen("eeee5555", "unplugged"), screen("ffff6666", null)];
    const places = placeScreens(screens, displays, "desk");
    expect(places.get("aaaa1111")).toMatchObject({ state: "showing", display: { key: "tv-left" } });
    expect(places.get("bbbb2222")).toMatchObject({ state: "taken", by: "desk" });
    expect(places.get("cccc3333")).toMatchObject({ state: "taken", by: "audience" });
    expect(places.get("dddd4444")).toMatchObject({ state: "taken", by: "screen" });
    expect(places.get("eeee5555")).toEqual({ state: "missing", displayKey: "unplugged" });
    expect(places.get("ffff6666")).toEqual({ state: "no-monitor" });
  });

  it("follows the running part, except locked screens", () => {
    const screens = [screen("aaaa1111", "A", { role: "lyrics" }), screen("bbbb2222", "B", { role: "stage", locked: true }), screen("cccc3333", "C", { role: "scripture" })];
    const now = screensNow(screens, { aaaa1111: "timer", bbbb2222: "timer", cccc3333: "nonsense" });
    expect(now.map((item) => item.role)).toEqual(["timer", "stage", "scripture"]);
    expect(screensNow(screens, undefined)).toBe(screens);
  });

  it("starts a new screen on the first free monitor, the first one as a timer", () => {
    const displays = [display("desk", { primary: true }), display("projector", { audience: true }), display("tv")];
    const first = newScreen([], displays, "desk", "aaaa1111");
    expect(first).toMatchObject({ displayKey: "tv", role: "timer" });
    expect(newScreen([first], displays, "desk", "bbbb2222")).toMatchObject({ displayKey: null, role: "blank" });
  });
});
