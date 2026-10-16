import type { ItemKind, PresentationItem, PresentationModel } from "./types";

/**
 * Rundown kinds that already persist on a service. Future sources (sermon, camera, NDI)
 * become one of these items, or a new ItemKind added with a schema bump — not a second model.
 * Composition items reference a saved look by id; they are not a second live state.
 */
export type ContentSourceKind = ItemKind | "sermon" | "video" | "camera" | "ndi" | "plugin" | "timer" | "composition";

export type ContentSource = {
  id: string;
  kind: ContentSourceKind;
  title: string;
  /** Present when the source is already a service item. */
  item?: PresentationItem;
};

/** Every source must compile to the same frame the audience renderer already paints. */
export type ContentAdapter = {
  kind: ContentSourceKind;
  toPreview(source: ContentSource): Promise<PresentationModel>;
};

export function isRundownKind(kind: string): kind is ItemKind {
  return kind === "bible" || kind === "lyric" || kind === "slide" || kind === "image" || kind === "announcement" || kind === "composition";
}
