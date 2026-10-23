import { describe, expect, it } from "vitest";
import { deepgramUrl, elevenLabsUrl, readHeard, speechHints, toPcm16 } from "./cloud-listen";
import { sanitizeVoiceSettings } from "./commands";

describe("listening with a speech service", () => {
  it("listens for the church's words first, then Bible books, within each service's limit", () => {
    const hints = speechHints(["Nana Akufo", "  ", "Grace Chapel"], 50);
    expect(hints.slice(0, 3)).toEqual(["Nana Akufo", "Grace Chapel", "Ephesians"]);
    expect(hints).toContain("Corinthians");
    expect(hints.filter((hint) => hint.includes("Corinthians"))).toEqual(["Corinthians"]);
    expect(hints.length).toBe(50);
    expect(speechHints([], 100).length).toBeLessThanOrEqual(100);
  });

  it("asks ElevenLabs and Deepgram for 16 kHz speech with the hints", () => {
    const eleven = new URL(elevenLabsUrl("tok", ["Ephesians", "Nana"]));
    expect(eleven.origin + eleven.pathname).toBe("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
    expect(eleven.searchParams.get("model_id")).toBe("scribe_v2_realtime");
    expect(eleven.searchParams.get("audio_format")).toBe("pcm_16000");
    expect(eleven.searchParams.getAll("keyterms")).toEqual(["Ephesians", "Nana"]);
    const deep = new URL(deepgramUrl(["Ephesians"]));
    expect(deep.searchParams.get("model")).toBe("nova-3");
    expect(deep.searchParams.get("encoding")).toBe("linear16");
    expect(deep.searchParams.getAll("keyterm")).toEqual(["Ephesians"]);
    // The key never goes in the address.
    expect(deepgramUrl([])).not.toContain("token");
  });

  it("reads what each service heard, and a refused key", () => {
    expect(readHeard("elevenlabs", JSON.stringify({ message_type: "partial_transcript", text: "turn to ephesians" }))).toEqual({ text: "turn to ephesians", final: false });
    expect(readHeard("elevenlabs", JSON.stringify({ message_type: "committed_transcript", text: "Turn to Ephesians 2." }))).toEqual({ text: "Turn to Ephesians 2.", final: true });
    expect(readHeard("elevenlabs", JSON.stringify({ message_type: "auth_error", error: "bad key" }))).toEqual({ error: "bad key", auth: true });
    expect(readHeard("elevenlabs", JSON.stringify({ message_type: "session_started" }))).toBeNull();
    expect(readHeard("deepgram", JSON.stringify({ type: "Results", is_final: true, channel: { alternatives: [{ transcript: "John 3:16" }] } }))).toEqual({ text: "John 3:16", final: true });
    expect(readHeard("deepgram", "not json")).toBeNull();
  });

  it("turns the computer's sound into 16 kHz samples", () => {
    const second = new Float32Array(48_000).fill(0.5);
    const out = toPcm16(second, 48_000);
    expect(out.length).toBe(16_000);
    expect(out[0]).toBe(16383);
    // Three samples become one (their average), and anything past full scale is held at it.
    expect(toPcm16(new Float32Array([1, 1, 1, -2, -2, -2]), 48_000)).toEqual(new Int16Array([32767, -32768]));
  });

  it("keeps the chosen service and its keys, and nothing odd", () => {
    const voice = sanitizeVoiceSettings({ engine: "deepgram", speechKeys: { deepgram: "  dg-key ", elevenlabs: "", other: "x" } });
    expect(voice.engine).toBe("deepgram");
    expect(voice.speechKeys).toEqual({ deepgram: "dg-key" });
    expect(sanitizeVoiceSettings({ engine: "nonsense" }).engine).toBe("system");
  });
});
