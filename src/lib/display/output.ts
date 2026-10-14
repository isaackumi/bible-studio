import type { ProgramPacket } from "../domain/types";

export type BrowserOutputWindow = {
  closed: boolean;
  close(): void;
  focus(): void;
  postMessage(message: unknown, targetOrigin: string): void;
};

export type BrowserOutputState = {
  desired: boolean;
  online: boolean;
  message: string;
};

const AUDIENCE_URL = "/?display=1";
const AUDIENCE_NAME = "church-studio-audience";
const AUDIENCE_FEATURES = "popup=yes,width=1280,height=720";

/** The audience follows Program revisions. Revision 0 is the startup clear. Preview is never a packet. */
export function acceptAudienceFrame(current: ProgramPacket | null, next: ProgramPacket | null): boolean {
  if (!next?.frame?.model) return false;
  if (!current?.frame?.model) return true;
  if (next.revision === 0) return true;
  return next.revision >= current.revision;
}

export function openBrowserAudience(
  open: (url: string, name: string, features: string) => BrowserOutputWindow | null,
): { window: BrowserOutputWindow | null; state: BrowserOutputState } {
  const opened = open(AUDIENCE_URL, AUDIENCE_NAME, AUDIENCE_FEATURES);
  if (!opened) {
    return {
      window: null,
      state: {
        desired: true,
        online: false,
        message: "The browser blocked the audience window. Allow pop-ups for this site, then open it again.",
      },
    };
  }
  return {
    window: opened,
    state: {
      desired: true,
      online: true,
      message: "Audience window is open. Drag it onto the external display, then choose Fill this screen on that window. This browser cannot move it there.",
    },
  };
}

export function browserAudienceState(desired: boolean, audience: BrowserOutputWindow | null): BrowserOutputState {
  if (!desired) return { desired: false, online: false, message: "Audience output is closed." };
  if (!audience || audience.closed) {
    return { desired: true, online: false, message: "The audience window is closed. Open it again." };
  }
  return {
    desired: true,
    online: true,
    message: "Audience window is open. If it is on this screen, drag it to the external display. This browser cannot list or place monitors.",
  };
}
