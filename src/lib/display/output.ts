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

/** The subset of Window Management `ScreenDetailed` this module reads. */
export type ScreenLike = {
  label?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  isPrimary?: boolean;
  isInternal?: boolean;
};

function sameScreen(left: ScreenLike, right: ScreenLike) {
  return left.left === right.left && left.top === right.top && left.width === right.width && left.height === right.height;
}

/**
 * A screen other than the operator's: external before internal, then the largest.
 * Null when there is only one screen; the operator then drags the window as before.
 */
export function pickAudienceScreen(screens: ScreenLike[], current: ScreenLike | null): ScreenLike | null {
  const others = screens.filter((screen) => !current || !sameScreen(screen, current));
  if (!others.length) return null;
  return [...others].sort(
    (a, b) => Number(!!a.isInternal) - Number(!!b.isInternal) || b.width * b.height - a.width * a.height,
  )[0]!;
}

export function placementFeatures(screen: ScreenLike): string {
  return `popup=yes,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}`;
}

export function openBrowserAudience(
  open: (url: string, name: string, features: string) => BrowserOutputWindow | null,
  placement: { features: string; label: string } | null = null,
): { window: BrowserOutputWindow | null; state: BrowserOutputState } {
  const opened = open(AUDIENCE_URL, AUDIENCE_NAME, placement?.features ?? AUDIENCE_FEATURES);
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
      message: placement
        ? `Audience window is on ${placement.label}. Choose Fill this screen on that window for full screen.`
        : "Audience window is open. Drag it onto the external display, then choose Fill this screen on that window. This browser cannot move it there.",
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
