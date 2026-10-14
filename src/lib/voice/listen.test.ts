import { describe, expect, it } from "vitest";
import { accessMessage, shouldRestartListening, stitchTranscript } from "./listen";

describe("voice listen", () => {
  it("keeps listening through silence and engine restarts", () => {
    expect(shouldRestartListening("end")).toBe(true);
    expect(shouldRestartListening("error", "no-speech")).toBe(true);
  });

  it("stops when the operating system refuses the microphone", () => {
    expect(shouldRestartListening("error", "not-allowed")).toBe(false);
    expect(shouldRestartListening("error", "audio-capture")).toBe(false);
  });

  it("joins final speech pieces and keeps the words still being recognized", () => {
    let state = stitchTranscript("", { text: "has ever gone without touching the ground.", final: false, alternatives: [] });
    expect(state.text).toBe("has ever gone without touching the ground.");
    expect(state.committed).toBe("");
    state = stitchTranscript(state.committed, { text: "has", final: true, alternatives: ["has"] });
    state = stitchTranscript(state.committed, { text: "ever gone without touching the", final: true, alternatives: [] });
    state = stitchTranscript(state.committed, { text: "ground.", final: true, alternatives: ["ground"] });
    expect(state.text).toBe("has ever gone without touching the ground.");
    state = stitchTranscript(state.committed, { text: "So his", final: false, alternatives: ["So his"] });
    expect(state.text).toBe("has ever gone without touching the ground. So his");
    expect(state.committed).toBe("has ever gone without touching the ground.");
  });

  it("names the System Settings toggle when macOS has denied the mic", () => {
    expect(accessMessage({ microphone: "denied", speech: "granted" })).toContain("Microphone");
    expect(accessMessage({ microphone: "granted", speech: "denied" })).toContain("Speech Recognition");
    expect(accessMessage({ microphone: "granted", speech: "granted" })).toBeNull();
  });
});
