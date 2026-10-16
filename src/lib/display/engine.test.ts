import { describe, expect, it } from "vitest";
import { deliverProgram, outputSinks } from "./engine";
import { detectOutputCapabilities } from "../platform/output-capabilities";
import { applyProgramAction, createLiveState, programPacket } from "../domain/live";
import { defaultTheme } from "../domain/theme";

describe("output engine", () => {
  it("picks the browser window sink on the web, offers stage, and leaves NDI closed", () => {
    const caps = detectOutputCapabilities({ desktop: false, open: () => null });
    expect(outputSinks(false, caps)).toEqual([
      { kind: "tauri-window", available: false },
      { kind: "browser-window", available: true },
      { kind: "ndi", available: false },
      { kind: "stage", available: true },
    ]);
    expect(outputSinks(false, detectOutputCapabilities({ desktop: false })).find((sink) => sink.kind === "stage")?.available).toBe(false);
  });

  it("picks the native window sink on desktop", () => {
    const caps = detectOutputCapabilities({ desktop: true });
    expect(outputSinks(true, caps).find((sink) => sink.kind === "tauri-window")?.available).toBe(true);
    expect(outputSinks(true, caps).find((sink) => sink.kind === "browser-window")?.available).toBe(false);
  });

  it("does not mutate Program when a sink publish throws", async () => {
    const theme = defaultTheme();
    let live = createLiveState(theme);
    live = applyProgramAction(live, "black", theme, { title: "Logo", imageUrl: null });
    const program = live.program;
    const ok = await deliverProgram(programPacket(live, 0), () => {
      throw new Error("window closed");
    });
    expect(ok).toBe(false);
    expect(live.program).toEqual(program);
  });
});
