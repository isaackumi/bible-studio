import { describe, expect, it } from "vitest";
import { accessMessage, shouldRestartListening } from "./listen";

describe("voice listen", () => {
  it("keeps listening through silence and engine restarts", () => {
    expect(shouldRestartListening("end")).toBe(true);
    expect(shouldRestartListening("error", "no-speech")).toBe(true);
  });

  it("stops when the operating system refuses the microphone", () => {
    expect(shouldRestartListening("error", "not-allowed")).toBe(false);
    expect(shouldRestartListening("error", "audio-capture")).toBe(false);
  });

  it("names the System Settings toggle when macOS has denied the mic", () => {
    expect(accessMessage({ microphone: "denied", speech: "granted" })).toContain("Microphone");
    expect(accessMessage({ microphone: "granted", speech: "denied" })).toContain("Speech Recognition");
    expect(accessMessage({ microphone: "granted", speech: "granted" })).toBeNull();
  });
});
