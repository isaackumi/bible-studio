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
export function replaceProgramModel(state: LiveState, model: PresentationModel, transition: "cut" | "fade" = "fade"): LiveState {
  return {
    preview: state.preview,
    program: { ...state.program, model, transition },
    revision: state.revision + 1,
  };
}

/** Put an earlier Program frame back (Undo), cut in, as a new revision so every screen follows. */
export function restoreProgram(state: LiveState, program: LiveState["program"]): LiveState {
  return { preview: state.preview, program: { ...program, transition: "cut" }, revision: state.revision + 1 };
}

export function applyProgramAction(
  state: LiveState,
  action: ProgramAction,
  theme: Theme,
  logo: { title: string; imageUrl: string | null },
  options?: { transition?: LiveFrame["transition"] },
): LiveState {
  if (action === "take" || action === "cut") {
    const transition =
      action === "cut" ? "cut" : options?.transition ?? "fade";
    return {
      preview: state.preview,
      program: {
        ...state.preview,
        transition,
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

/** Layouts that are words on the screen (what Clear words takes away). */
const WORD_LAYOUTS = new Set<PresentationModel["layout"]>(["scripture", "lyrics", "title", "lower-third"]);

/**
 * Program without its words: the background (theme photo, video, motion), a camera, a picture
 * or a look's other regions stay. Null when there are no words to take away.
 */
export function withoutWords(model: PresentationModel): PresentationModel | null {
  if (model.layout === "composition") {
    const layers = model.layers ?? [];
    const kept = layers.filter((layer) => !WORD_LAYOUTS.has(layer.model.layout));
    return kept.length === layers.length ? null : { ...model, layers: kept };
  }
  if (!WORD_LAYOUTS.has(model.layout)) return null;
  const rest: PresentationModel = { ...model, layout: "empty", lines: [], reference: null, attribution: null };
  delete rest.parallel;
  delete rest.announcement;
  return rest;
}
