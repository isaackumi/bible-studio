import type { ScreenTransition } from "../domain/types";

// How a new frame replaces the old one on a screen. "fade" brings the new frame up over the
// background (the desk's long-standing take); the others need the old frame kept a moment, so the
// screen paints it under the new one and moves both.

export type TransitionFrames = { incoming: Keyframe[]; outgoing: Keyframe[] | null; easing: string };

const PUSH: Partial<Record<ScreenTransition, [string, string]>> = {
  "push-left": ["translateX(100%)", "translateX(-100%)"],
  "push-right": ["translateX(-100%)", "translateX(100%)"],
  "push-up": ["translateY(100%)", "translateY(-100%)"],
  "push-down": ["translateY(-100%)", "translateY(100%)"],
};

/** Whether the old frame stays on the screen while this transition runs. */
export function keepsOutgoing(kind: ScreenTransition): boolean {
  return kind !== "cut" && kind !== "fade";
}

export function transitionFrames(kind: ScreenTransition): TransitionFrames | null {
  const push = PUSH[kind];
  if (push) {
    return {
      incoming: [{ transform: push[0] }, { transform: "translate(0, 0)" }],
      outgoing: [{ transform: "translate(0, 0)" }, { transform: push[1] }],
      easing: "cubic-bezier(0.65, 0, 0.35, 1)",
    };
  }
  switch (kind) {
    case "fade":
      return { incoming: [{ opacity: 0 }, { opacity: 1 }], outgoing: null, easing: "ease" };
    case "dissolve":
      return { incoming: [{ opacity: 0 }, { opacity: 1 }], outgoing: [{ opacity: 1 }, { opacity: 1 }], easing: "ease-in-out" };
    case "zoom":
      return {
        incoming: [{ opacity: 0, transform: "scale(1.12)" }, { opacity: 1, transform: "scale(1)" }],
        outgoing: [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.96)" }],
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      };
    case "dip":
      // The old frame goes down to the background first, then the new one comes up from it.
      return {
        incoming: [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }],
        outgoing: [{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }],
        easing: "ease-in-out",
      };
    default:
      return null;
  }
}
