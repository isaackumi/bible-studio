import { richIsEmpty, richLines, type RichDoc } from "./rich-text";
import { emptyModel } from "./theme";
import { webTarget } from "./web";
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
  input: BuildBase & { layout: "title"; heading: string; body: string; rich?: RichDoc | null },
): PresentationModel {
  // Formatted text is drawn from its blocks; its plain lines stay for search, captions and sizing.
  const rich = input.rich && !richIsEmpty(input.rich) ? input.rich : null;
  const lines = [];
  if (rich) {
    for (const line of richLines(rich)) if (line.trim()) lines.push({ text: line.trim() });
  } else {
    if (input.heading.trim()) lines.push({ text: input.heading.trim() });
    for (const line of input.body.split("\n")) {
      if (line.trim()) lines.push({ text: line.trim() });
    }
  }
  return {
    ...(rich ? { rich } : {}),
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

/** A YouTube or Vimeo video (or a web page) from a link, in its own player; sound on the audience screen only. */
export function presentWeb(input: BuildBase & { url: string; mute?: boolean; loop?: boolean }): PresentationModel {
  const target = webTarget(input.url, { mute: input.mute, loop: input.loop });
  if (!target) return emptyModel(input.theme);
  return { layout: "web", theme: input.theme, reference: target.label, attribution: null, lines: [], imageUrl: null, backgroundImageUrl: null, web: { url: target.url, kind: target.kind, label: target.label, zoom: 1, mute: input.mute ?? false } };
}

/** A video frame. A missing file paints the empty frame instead of a broken player. */
export function presentVideo(input: BuildBase & { videoUrl: string | null | undefined; loop?: boolean; muted?: boolean; start?: number; stop?: number; end?: import("./video-play").VideoEnd }): PresentationModel {
  if (!input.videoUrl) return emptyModel(input.theme);
  return {
    layout: "video",
    theme: input.theme,
    reference: null,
    attribution: null,
    lines: [],
    imageUrl: null,
    backgroundImageUrl: null,
    video: {
      url: input.videoUrl,
      loop: input.loop ?? false,
      muted: input.muted ?? false,
      ...(input.start !== undefined ? { start: input.start } : {}),
      ...(input.stop !== undefined ? { stop: input.stop } : {}),
      ...(input.end ? { end: input.end } : {}),
    },
  };
}

export function presentImage(input: BuildBase & { imageUrl: string; kenBurns?: number; caption?: string; fill?: string; cover?: boolean }): PresentationModel {
  const caption = input.caption?.replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    layout: "image",
    theme: input.theme,
    reference: null,
    attribution: null,
    lines: [],
    imageUrl: input.imageUrl,
    backgroundImageUrl: null,
    ...(input.kenBurns && input.kenBurns > 0 ? { kenBurns: Math.min(120, input.kenBurns) } : {}),
    ...(caption ? { caption } : {}),
    ...(input.fill ? { fill: input.fill } : {}),
    ...(input.cover ? { imageFit: "cover" as const } : {}),
  };
}
