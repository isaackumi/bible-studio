import { emptyModel } from "./theme";
import type { PresentationLine, PresentationModel, Theme, VerseText } from "./types";

type BuildBase = {
  theme: Theme;
  backgroundImageUrl?: string | null;
};

export function presentScripture(
  input: BuildBase & {
    reference: string;
    attribution: string | null;
    verses: VerseText[];
    /** A second translation shown beside the first. */
    second?: { attribution: string | null; verses: VerseText[] } | null;
  },
): PresentationModel {
  const lines = (verses: VerseText[]) => verses.map((verse) => ({ marker: String(verse.verse), text: verse.text }));
  return {
    layout: "scripture",
    theme: input.theme,
    reference: input.reference,
    attribution: input.theme.attribution.show ? input.attribution : null,
    lines: lines(input.verses),
    imageUrl: null,
    backgroundImageUrl: input.backgroundImageUrl ?? null,
    ...(input.second?.verses.length
      ? { parallel: { attribution: input.theme.attribution.show ? input.second.attribution : null, lines: lines(input.second.verses) } }
      : {}),
  };
}

export function presentLyrics(
  input: BuildBase & { label: string; lines: Array<string | PresentationLine>; credit?: string | null },
): PresentationModel {
  return {
    layout: "lyrics",
    theme: input.theme,
    reference: input.label,
    attribution: input.credit?.trim() || null,
    lines: input.lines
      .map((line) => (typeof line === "string" ? { text: line } : line))
      .filter((line) => line.text.trim().length > 0),
    imageUrl: null,
    backgroundImageUrl: input.backgroundImageUrl ?? null,
  };
}

export function presentText(
  input: BuildBase & { layout: "title"; heading: string; body: string },
): PresentationModel {
  const lines = [];
  if (input.heading.trim()) lines.push({ text: input.heading.trim() });
  for (const line of input.body.split("\n")) {
    if (line.trim()) lines.push({ text: line.trim() });
  }
  return {
    layout: "title",
    theme: input.theme,
    reference: null,
    attribution: null,
    lines,
    imageUrl: null,
    backgroundImageUrl: input.backgroundImageUrl ?? null,
  };
}

export function presentImageOrEmpty(theme: Theme, imageUrl: string | null | undefined): PresentationModel {
  if (!imageUrl) return emptyModel(theme);
  return presentImage({ theme, imageUrl });
}

/** A video frame. A missing file paints the empty frame instead of a broken player. */
export function presentVideo(input: BuildBase & { videoUrl: string | null | undefined; loop?: boolean; muted?: boolean }): PresentationModel {
  if (!input.videoUrl) return emptyModel(input.theme);
  return {
    layout: "video",
    theme: input.theme,
    reference: null,
    attribution: null,
    lines: [],
    imageUrl: null,
    backgroundImageUrl: null,
    video: { url: input.videoUrl, loop: input.loop ?? false, muted: input.muted ?? false },
  };
}

export function presentImage(input: BuildBase & { imageUrl: string }): PresentationModel {
  return {
    layout: "image",
    theme: input.theme,
    reference: null,
    attribution: null,
    lines: [],
    imageUrl: input.imageUrl,
    backgroundImageUrl: null,
  };
}
