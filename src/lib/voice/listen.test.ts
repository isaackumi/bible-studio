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

describe("a reference said across two speech pieces", () => {
  it("is still found once the pieces are joined", async () => {
    const { spokenReference } = await import("./detect");
    const { stitchTranscript } = await import("./listen");
    const first = stitchTranscript("", { text: "turn to first corinthians", final: true, alternatives: [] });
    const second = stitchTranscript(first.committed, { text: "thirteen four", final: false, alternatives: [] });
    expect(spokenReference("thirteen four")).toBeNull();
    const hit = spokenReference(second.text);
    expect(hit && `${hit.bookName} ${hit.chapter}:${hit.startVerse}`).toBe("1 Corinthians 13:4");
  });
});
