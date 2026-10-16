import type { ProgramPacket } from "../domain/types";
import { detectOutputCapabilities, type OutputCapabilities } from "../platform/output-capabilities";
import { isDesktop } from "../platform/runtime";

export type OutputSinkKind = "tauri-window" | "browser-window" | "ndi" | "stage";

export type OutputSink = {
  kind: OutputSinkKind;
  available: boolean;
};

/**
 * Sinks consume a Program packet. They must not call applyProgramAction.
 * NDI is listed so later work plugs in here instead of inventing a second Program.
 */
export function outputSinks(desktop = isDesktop(), caps: OutputCapabilities = detectOutputCapabilities({ desktop })): OutputSink[] {
  return [
    { kind: "tauri-window", available: desktop && caps.canOpenAudienceWindow },
    { kind: "browser-window", available: !desktop && caps.canOpenAudienceWindow },
    { kind: "ndi", available: false },
    // Stage reads Program + Preview from the desk (StageOutput); it opens wherever a window can.
    { kind: "stage", available: desktop || caps.canOpenAudienceWindow },
  ];
}

export type ProgramPublish = (packet: ProgramPacket) => void | Promise<void>;

/** Sinks consume Program. A throw must not roll back or Take. */
export async function deliverProgram(packet: ProgramPacket, publish: ProgramPublish): Promise<boolean> {
  try {
    await publish(packet);
    return true;
  } catch {
    return false;
  }
}
