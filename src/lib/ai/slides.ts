import { chatRequest, type AiRequest, type AiSettings } from "./summarize";

// AI slide generation: a slide deck from sermon notes, a Bible passage, or a topic, written by the
// church's own AI service. The answer is a short outline (a heading and a line or two per slide);
// Church Studio lays it out as a deck in the theme, ready to edit.

export type SlideSource = "notes" | "passage" | "topic";

export type GeneratedSlide = { heading: string; body: string; scripture: string };
export type GeneratedDeck = { title: string; slides: GeneratedSlide[] };

export const SLIDE_COUNTS = [4, 6, 8, 10, 12] as const;

const INSTRUCTIONS = `You make projection slides for a church service. Write a short slide deck.
Each slide has "heading" (at most 8 words, readable from the back of the room), "body" (at most
25 words, may be empty) and "scripture" (a Bible reference like "Romans 8:28" when the slide is
about a verse, else ""). Start with a title slide (its body can name the passage or the speaker).
Plain words, no emoji, no markdown. Only give scripture references that are in the material, or,
for a topic, well-known passages that truly fit it.
Answer with JSON only: {"title": "...", "slides": [{"heading": "...", "body": "...", "scripture": "..."}]}`;

const WHAT: Record<SlideSource, string> = {
  notes: "Make the slides from these sermon notes, in the order of the notes, keeping the preacher's words where you can.",
  passage: "Make slides that walk through this Bible passage: its setting, its main points and what it means for us.",
  topic: "Make slides for a short talk or Bible study on this topic.",
};

export function slidesRequest(settings: AiSettings, input: { source: SlideSource; text: string; title?: string; count: number }): AiRequest {
  const count = Math.min(12, Math.max(3, Math.round(input.count)));
  const message = `${WHAT[input.source]} Write about ${count} slides in all.\n\n${input.title ? `Title: ${input.title}\n\n` : ""}${input.text.slice(0, 40_000)}`;
  return chatRequest(settings, INSTRUCTIONS, message, { maxTokens: 2500, temperature: 0.4 });
}

const clean = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .replace(/[*_#`]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/** Read the deck JSON (allowing a ```json fence or stray words around it). */
export function parseSlides(text: string): GeneratedDeck {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let data: unknown = null;
  if (start >= 0 && end > start) {
    try {
      data = JSON.parse(text.slice(start, end + 1));
    } catch {
      data = null;
    }
  }
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const slides = (Array.isArray(record?.slides) ? record!.slides : [])
    .map((raw) => {
      const slide = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      return { heading: clean(slide.heading, 90), body: clean(slide.body, 260), scripture: clean(slide.scripture, 60) };
    })
    .filter((slide) => slide.heading || slide.body)
    .slice(0, 16);
  if (!slides.length) throw new Error("The AI answer was not in the expected shape. Try again.");
  return { title: clean(record?.title, 80) || slides[0]!.heading || "Slides", slides };
}
