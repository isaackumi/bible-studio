import type { OutputCapabilities } from "./output-capabilities";
import type { ComputerOs } from "./os";

/** One line of "what this computer can do here, and why not". */
export type CapabilityRow = { id: string; label: string; available: boolean; detail: string };

export type CapabilityInput = {
  desktop: boolean;
  caps: OutputCapabilities;
  /** Web Speech engine present (browser). The desktop app listens with the Mac's or Windows' own engine. */
  speech: boolean;
  /** Window Management (getScreenDetails) present. */
  screenDetails: boolean;
  /** HTTPS or localhost: browsers only allow camera and microphone there. */
  secure: boolean;
  os: ComputerOs;
};

export function capabilityReport(input: CapabilityInput): CapabilityRow[] {
  const { desktop, caps } = input;
  const mediaBlocked = !desktop && !input.secure ? "Browsers only allow this on HTTPS or localhost." : "";
  return [
    {
      id: "audience",
      label: "Audience output",
      available: caps.canOpenAudienceWindow,
      detail: desktop
        ? "A borderless window on the chosen display."
        : caps.canOpenAudienceWindow
          ? "A pop-up window. Allow pop-ups for this site."
          : "This window cannot open another window.",
    },
    {
      id: "placement",
      label: "Second-screen placement",
      available: desktop || input.screenDetails,
      detail: desktop
        ? "The audience window goes on the display chosen in Displays."
        : input.screenDetails
          ? "Chrome/Edge places the window on the second screen (asks permission once)."
          : "This browser cannot place windows on another screen; drag the window there.",
    },
    {
      id: "fullscreen",
      label: "Full screen",
      available: caps.canRequestFullscreen,
      detail: desktop ? "The audience window covers the whole display." : caps.canRequestFullscreen ? "Click Fill this screen on the audience window." : "Full screen is blocked in this window.",
    },
    {
      id: "camera",
      label: "Cameras",
      available: caps.canUseCamera && !mediaBlocked,
      detail: mediaBlocked || (caps.canUseCamera ? "USB cameras, capture cards, Continuity Camera and phone-webcam apps." : "No camera access in this window."),
    },
    {
      id: "voice",
      label: "Voice",
      available: desktop ? input.os === "mac" || input.os === "windows" : input.speech && !mediaBlocked,
      detail: desktop
        ? input.os === "mac"
          ? "On-device speech recognition (macOS)."
          : input.os === "windows"
            ? "On-device speech recognition (Windows)."
            : "Listening on this computer needs a Mac or Windows. ElevenLabs or Deepgram work here with your own key."
        : mediaBlocked || (input.speech ? "Browser speech recognition (sends audio to the browser's online service)." : "This browser has no speech recognition. Use Chrome or Edge, or the desktop app."),
    },
    {
      id: "remote",
      label: "Phone remote over Wi-Fi",
      available: desktop,
      detail: desktop
        ? "Pair a phone with a QR code in Remote. Same network as this computer."
        : "Needs the desktop app: a browser tab cannot run a network server. A pad window on this computer still works.",
    },
    {
      id: "stage",
      label: "Stage display",
      available: caps.canOpenAudienceWindow,
      detail: "Live now, next, the time and timers, on its own screen.",
    },
    { id: "media", label: "Images, video and PDF", available: true, detail: "Stored on this computer. PowerPoint/Keynote: save as PDF first." },
    { id: "ndi", label: "NDI in/out", available: false, detail: "Not built yet: needs the NDI runtime and the desktop app." },
    { id: "recording", label: "Recording and streaming", available: false, detail: "Not built yet. Capture the audience window in OBS meanwhile." },
  ];
}
