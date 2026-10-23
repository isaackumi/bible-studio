import { chatRequest, type AiRequest, type AiSettings } from "./summarize";

// Verses by meaning, while listening: when the preacher paraphrases a verse or describes it ("the
// verse where Jesus says he is the vine") and no reference or close quote was heard, the church's
// AI names the passage. Only speech that sounds like it is about scripture is sent, and not often.

export type HeardVerse = { reference: string; sure: boolean };

/** Words a preacher uses around scripture. Without one, nothing is sent. */
const CUES = /\b(bible|scriptures?|verses?|chapter|written|word of god|god'?s word|says|said|saith|writes|wrote|tells us|jesus|christ|paul|peter|james|john|david|moses|abraham|psalms?|psalmist|proverbs?|prophets?|isaiah|jeremiah|apostle|gospel|testament|parable|the lord)\b/i;

/** At least this many seconds between two questions to the AI. */
export const VERSE_ASK_GAP_SECONDS = 10;

export function soundsLikeScripture(heard: string): boolean {
  return heard.trim().split(/\s+/).length >= 6 && CUES.test(heard);
}

const INSTRUCTIONS = `You listen to a preacher for a church projection team. From what was just said, name the
Bible verses the preacher is quoting, paraphrasing or clearly pointing to, at most 3, most likely
first. For each give "reference" (book, chapter and verse, like "John 15:5" or "Romans 8:28-30")
and "sure" (true only when the words plainly match that passage). If no particular verse is meant,
answer with an empty list. Do not guess from a general theme.
Answer with JSON only: {"verses": [{"reference": "John 15:5", "sure": true}]}`;

export function versesRequest(settings: AiSettings, heard: string): AiRequest {
  return chatRequest(settings, INSTRUCTIONS, `The preacher said: ${heard.slice(-800)}`, { maxTokens: 300, temperature: 0 });
}

export function parseHeardVerses(text: string): HeardVerse[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = data && typeof data === "object" && Array.isArray((data as { verses?: unknown }).verses) ? (data as { verses: unknown[] }).verses : [];
  return list
    .map((raw) => {
      const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      return { reference: typeof entry.reference === "string" ? entry.reference.replace(/\s+/g, " ").trim().slice(0, 60) : "", sure: entry.sure === true };
    })
    .filter((entry) => /\d/.test(entry.reference))
    .slice(0, 3);
}
