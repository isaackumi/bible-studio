import { blackModel, emptyModel, logoModel } from "./theme";
import type { LiveFrame, LiveState, PresentationModel, ProgramAction, Theme } from "./types";

export function createLiveState(theme: Theme): LiveState {
  const empty = frame(emptyModel(theme), null, "cut");
  return { preview: empty, program: empty, revision: 0 };
}

export function frame(model: PresentationModel, sourceId: string | null, transition: LiveFrame["transition"]): LiveFrame {
  return { transition, sourceId, model };
}

export function setPreview(state: LiveState, next: LiveFrame): LiveState {
  return {
    ...state,
    preview: { ...next, transition: "cut" },
  };
}

/** Replace Program scripture in place. Does not copy Preview. Used when the live translation changes. */
export function replaceProgramModel(state: LiveState, model: PresentationModel): LiveState {
  return {
    preview: state.preview,
    program: { ...state.program, model, transition: "fade" },
    revision: state.revision + 1,
  };
}

export function applyProgramAction(
  state: LiveState,
  action: ProgramAction,
  theme: Theme,
  logo: { title: string; imageUrl: string | null },
): LiveState {
  if (action === "take" || action === "cut") {
    return {
      preview: state.preview,
      program: {
        ...state.preview,
        transition: action === "take" ? "fade" : "cut",
      },
      revision: state.revision + 1,
    };
  }
  const model =
    action === "black"
      ? blackModel(theme)
      : action === "logo"
        ? logoModel(theme, logo.title, logo.imageUrl)
        : emptyModel(theme);
  return {
    preview: state.preview,
    program: frame(model, null, "fade"),
    revision: state.revision + 1,
  };
}

export function programPacket(state: LiveState, transitionMs: number, epoch = 0) {
  return {
    epoch,
    revision: state.revision,
    transition: state.program.transition,
    transitionMs: state.program.transition === "cut" ? 0 : transitionMs,
    frame: state.program,
  };
}

export function sameProgram(left: LiveState, right: LiveState): boolean {
  return JSON.stringify(left.program) === JSON.stringify(right.program) && left.revision === right.revision;
}
