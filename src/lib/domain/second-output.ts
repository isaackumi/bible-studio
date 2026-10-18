// A second audience screen with its own look: a lobby TV, an overflow room, a hallway. It follows
// Program, either the same as the audience or the words only (scripture and lyrics; pictures,
// videos and cameras become the church name), in the audience's theme or one of its own.

import { logoModel } from "./theme";
import type { PresentationModel, Theme } from "./types";

export type SecondOutputSettings = {
  name: string;
  /** "same": what the audience sees. "words": scripture and lyrics only. */
  show: "same" | "words";
  /** A theme of its own; null uses the audience's theme. */
  themeId: string | null;
  /** Alerts (a nursery call) on this screen too. */
  alerts: boolean;
  /** The display it opens on (desktop); null picks a free one. */
  displayKey: string | null;
};

export function defaultSecondOutput(): SecondOutputSettings {
  return { name: "Lobby", show: "words", themeId: null, alerts: true, displayKey: null };
}

export function sanitizeSecondOutput(value: unknown): SecondOutputSettings {
  const record = value && typeof value === "object" ? (value as Partial<SecondOutputSettings>) : {};
  const base = defaultSecondOutput();
  return {
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 40) : base.name,
    show: record.show === "same" ? "same" : "words",
    themeId: typeof record.themeId === "string" && record.themeId ? record.themeId : null,
    alerts: record.alerts !== false,
    displayKey: typeof record.displayKey === "string" && record.displayKey ? record.displayKey : null,
  };
}

const WORDS = new Set<PresentationModel["layout"]>(["scripture", "lyrics", "title", "lower-third"]);

/** The theme's own background for words (its photo or video resolved by the desk). */
export type ThemeBackdrop = { theme: Theme; photo: string | null; video: string | null };

function restyle(model: PresentationModel, backdrop: ThemeBackdrop | null): PresentationModel {
  if (!backdrop) return model;
  return { ...model, theme: backdrop.theme, backgroundImageUrl: backdrop.photo, backgroundVideoUrl: backdrop.video, fill: undefined };
}

/**
 * What the second screen shows for this Program frame. `backdrop` is the second screen's own
 * theme (null: keep the audience's look); `logo` is the church name or logo for "words" mode.
 */
export function secondOutputModel(
  program: PresentationModel,
  settings: Pick<SecondOutputSettings, "show" | "alerts">,
  backdrop: ThemeBackdrop | null,
  logo: { theme: Theme; title: string; imageUrl: string | null },
): PresentationModel {
  let model: PresentationModel = program;
  if (settings.show === "words" && program.layout !== "black" && program.layout !== "empty") {
    const words =
      WORDS.has(program.layout)
        ? program
        : program.layout === "composition"
          ? [...(program.layers ?? [])].sort((a, b) => b.zIndex - a.zIndex).find((layer) => layer.opacity > 0 && WORDS.has(layer.model.layout))?.model
          : undefined;
    model = words ? { ...words, alert: program.alert, overlays: undefined } : { ...logoModel(backdrop?.theme ?? logo.theme, logo.title, logo.imageUrl), alert: program.alert };
    // Words take this screen's theme (or the audience theme) as a full frame.
    model = WORDS.has(model.layout) ? restyle(model, backdrop ?? { theme: model.theme, photo: model.backgroundImageUrl, video: model.backgroundVideoUrl ?? null }) : model;
  } else if (WORDS.has(program.layout) || program.layout === "empty") {
    model = restyle(program, backdrop);
  }
  if (!settings.alerts && model.alert) {
    model = { ...model };
    delete model.alert;
  }
  return model;
}
