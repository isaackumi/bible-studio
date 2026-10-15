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
 * NDI and stage are listed so later work plugs in here instead of inventing a second Program.
 */
export function outputSinks(desktop = isDesktop(), caps: OutputCapabilities = detectOutputCapabilities({ desktop })): OutputSink[] {
  return [
    { kind: "tauri-window", available: desktop && caps.canOpenAudienceWindow },
    { kind: "browser-window", available: !desktop && caps.canOpenAudienceWindow },
    { kind: "ndi", available: false },
    { kind: "stage", available: false },
  ];
}

export type ProgramPublish = (packet: ProgramPacket) => void | Promise<void>;
