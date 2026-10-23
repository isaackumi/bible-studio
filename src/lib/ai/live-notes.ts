import { chatRequest, type AiRequest, type AiSettings } from "./summarize";

// Live sermon notes: what the speech recognizer heard while the pastor preached, turned by the
// church's AI into clean notes a few minutes at a time. Each turn gets the notes so far and only
// the words heard since, and gives back the whole set of notes, so earlier points can be put right
// as the sermon goes on. The operator accepts each version (or lets them through by themselves).

const INSTRUCTIONS = `You keep clean notes of a sermon while it is being preached, from a live speech-recognition transcript.
You get the notes so far and the newest words heard. Give back the whole notes, updated.
Rules:
- Short headings for the main points, in the order preached ("## " before each), with bullet points under them ("- ").
- Fix what speech recognition gets wrong: Bible books and references ("efficient 4" is "Ephesians 4"), names, and words that make no sense in context.
- Write scripture references in standard form (John 3:16). Keep memorable sentences as short quotes.
- Leave out filler, repetition, greetings, announcements and prayers unless they carry the message.
- Never invent points, verses or quotes that were not said. If the newest words add nothing, return the notes as they were.
- Keep the earlier notes unless the new words show they were misheard.
- Plain text only: headings, bullets and quotes. No other markdown, no comments about the task.
Answer with JSON only: {"notes": "..."}`;

/** The largest amount sent at once: the notes so far and the newest words, each trimmed from the start. */
export const MOST_NOTES_CHARS = 8000;
export const MOST_NEW_CHARS = 12000;

export function liveNotesRequest(settings: AiSettings, input: { title: string; notes: string; heard: string }): AiRequest {
  const notes = input.notes.trim().slice(-MOST_NOTES_CHARS);
  const heard = input.heard.trim().slice(-MOST_NEW_CHARS);
  const message = `${input.title ? `Sermon: ${input.title}\n\n` : ""}Notes so far:\n${notes || "(none yet)"}\n\nNewest words heard:\n${heard}`;
  return chatRequest(settings, INSTRUCTIONS, message, { maxTokens: 2500, temperature: 0.2 });
}

/** The notes from the AI's answer; null when it did not answer in the expected shape. */
export function parseLiveNotes(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const data = JSON.parse(text.slice(start, end + 1)) as { notes?: unknown };
      if (typeof data.notes === "string" && data.notes.trim()) return tidy(data.notes);
    } catch {
      // Not JSON after all: fall through to the plain-text answer below.
    }
  }
  // Some local models answer with the notes alone; take them when they look like notes.
  const plain = text.replace(/^```[a-z]*\n?|```$/g, "").trim();
  return /^(##|- )/m.test(plain) ? tidy(plain) : null;
}

const tidy = (notes: string) => notes.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 30000);

/** Words in a piece of text, for "1,240 words heard" and for deciding a turn is worth asking for. */
export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
