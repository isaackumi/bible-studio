import { emptyModel } from "./theme";
import type { PresentationModel, Theme, VerseText } from "./types";

type BuildBase = {
  theme: Theme;
  backgroundImageUrl?: string | null;
};

export function presentScripture(
  input: BuildBase & {
    reference: string;
    attribution: string | null;
    verses: VerseText[];
  },
): PresentationModel {
  return {
    layout: "scripture",
    theme: input.theme,
    reference: input.reference,
    attribution: input.theme.attribution.show ? input.attribution : null,
    lines: input.verses.map((verse) => ({ marker: String(verse.verse), text: verse.text })),
    imageUrl: null,
    backgroundImageUrl: input.backgroundImageUrl ?? null,
  };
}

export function presentLyrics(
  input: BuildBase & { label: string; lines: string[] },
): PresentationModel {
  return {
    layout: "lyrics",
    theme: input.theme,
    reference: input.label,
    attribution: null,
    lines: input.lines.filter((line) => line.trim().length > 0).map((text) => ({ text })),
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
