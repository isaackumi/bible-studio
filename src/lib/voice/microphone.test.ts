import { describe, expect, it } from "vitest";
import { micDead, pickMicrophone, type MicHeard } from "./microphone";

const mic = (name: string, peak: number, live = peak > 0, error: string | null = null): MicHeard => ({ name, peak, live, error });
// The PC this was found on: four phone-as-webcam microphones, Windows' default among them, and the real one.
const IRIUN = [mic("Microphone (Iriun Webcam)", 0), mic("Microphone (Iriun Webcam #2)", 0), mic("Microphone (Iriun Webcam #3)", 0), mic("Microphone (Iriun Webcam #4)", 0)];
const REALTEK = "Microphone (2- Realtek(R) Audio)";

describe("which microphone listening uses", () => {
  it("leaves a silent default for the one that is live, and says why", () => {
    const choice = pickMicrophone([...IRIUN, mic(REALTEK, 0.004)], null, "Microphone (Iriun Webcam)");
    expect(choice).toEqual({ name: REALTEK, moved: { from: "Microphone (Iriun Webcam)", because: "silent" }, allSilent: false });
  });

  it("keeps a live microphone the church chose, even when another is louder", () => {
    const choice = pickMicrophone([mic("Desk feed", 0.001), mic("Laptop microphone", 0.3)], "Desk feed", "Laptop microphone");
    expect(choice).toEqual({ name: "Desk feed", moved: null, allSilent: false });
  });

  it("keeps the default when it is live: a quiet room is not a dead microphone", () => {
    expect(pickMicrophone([mic("Built-in", 0.0003), mic("USB interface", 0.2)], null, "Built-in")).toMatchObject({ name: "Built-in", moved: null });
  });

  it("moves off a chosen microphone that is unplugged, to the default when it is live", () => {
    expect(pickMicrophone([mic("Built-in", 0.01)], "USB interface", "Built-in")).toEqual({ name: "Built-in", moved: { from: "USB interface", because: "unplugged" }, allSilent: false });
  });

  it("moves off one that would not open (taken by another app)", () => {
    expect(pickMicrophone([mic("Headset", 0, false, "in use"), mic("Built-in", 0.01)], "Headset", "Built-in")).toMatchObject({ name: "Built-in", moved: { from: "Headset", because: "silent" } });
  });

  it("says so when every microphone is silent, and changes nothing", () => {
    expect(pickMicrophone(IRIUN, null, "Microphone (Iriun Webcam)")).toEqual({ name: "Microphone (Iriun Webcam)", moved: null, allSilent: true });
  });

  it("treats exact silence, an error or a missing microphone as dead, and a quiet hiss as alive", () => {
    expect(micDead([mic("A", 0)], "A")).toBe(true);
    expect(micDead([mic("A", 0, false, "gone")], "A")).toBe(true);
    expect(micDead([], "A")).toBe(true);
    expect(micDead([mic("A", 0.0002)], "A")).toBe(false);
  });

  it("names a microphone the short way on the desk", async () => {
    const { micLabel } = await import("./microphone");
    expect(micLabel("Microphone (2- Realtek(R) Audio)")).toBe("Realtek(R) Audio");
    expect(micLabel("Microphone (Iriun Webcam #2)")).toBe("Iriun Webcam #2");
    expect(micLabel("MacBook Pro Microphone")).toBe("MacBook Pro Microphone");
  });
});
