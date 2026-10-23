import { sanitizeGame, type Game } from "../domain/games";
import { chatRequest, type AiRequest, type AiSettings } from "./summarize";

// A quiz written by the church's own AI: from today's sermon (were people listening?), a book
// the church is reading together (its summary pasted in), a Bible passage, or a topic. It comes
// back as an ordinary game, opened in the editor for the operator to check before anyone plays.

export type GameSource = "sermon" | "reading" | "text" | "passage" | "topic";
export type GameLevel = "easy" | "mixed" | "hard";
export type GameAudience = "everyone" | "youth" | "children";

export const GAME_COUNTS = [5, 8, 10, 12, 15] as const;

const INSTRUCTIONS = `You write a fun, fair multiple-choice quiz for a church to play on phones, like a game show.
Rules:
- Each question has exactly 4 answers, one of them right ("correct" is its index, 0 to 3). Put the right answer in a different place each time.
- Questions at most 110 characters; answers at most 50 characters. Plain words, no emoji, no markdown.
- The wrong answers are believable, never silly or mocking.
- Ask about what the material actually says, so people who listened or read can answer. Never invent quotes, names or numbers it does not contain.
- For Bible material, keep to what the text says; do not guess at disputed details.
Answer with JSON only: {"title": "...", "description": "...", "questions": [{"prompt": "...", "choices": ["...", "...", "...", "..."], "correct": 0}]}`;

const WHAT: Record<GameSource, string> = {
  sermon: "Write the quiz from today's sermon, so the church can see who was listening. Cover its main points in order.",
  reading: "Write the quiz from this book the church is reading together. Cover the main ideas and events of the summary.",
  text: "Write the quiz from this text: a summary, an article, notes, or questions someone has already written. If it already holds questions, use them, tidied, with believable wrong answers; otherwise ask about what it says.",
  passage: "Write the quiz about this Bible passage: what happens, who is in it, and what it teaches.",
  topic: "Write the quiz about this topic, for a church gathering.",
};

const LEVEL: Record<GameLevel, string> = {
  easy: "Make it easy: clear questions anyone who paid a little attention can answer.",
  mixed: "Start easy and get a little harder towards the end.",
  hard: "Make it a real challenge for people who know the material well.",
};

const AUDIENCE: Record<GameAudience, string> = {
  everyone: "For everyone in church, young and old.",
  youth: "For a youth group: lively, but still respectful.",
  children: "For children aged 7 to 12: short words, simple questions.",
};

const LANGUAGE: Record<"en" | "fr" | "es", string> = { en: "English", fr: "French", es: "Spanish" };

export function gameRequest(settings: AiSettings, input: { source: GameSource; title: string; text: string; count: number; level: GameLevel; audience: GameAudience; language?: "en" | "fr" | "es" }): AiRequest {
  const count = Math.min(15, Math.max(3, Math.round(input.count)));
  // Always in the church's own language, even when the material quotes another (a Twi sermon note).
  const language = `Write everything in ${LANGUAGE[input.language ?? "en"]}.`;
  const message = `${WHAT[input.source]} ${LEVEL[input.level]} ${AUDIENCE[input.audience]} ${language} Write ${count} questions.\n\n${input.title ? `Title: ${input.title}\n\n` : ""}${input.text.slice(0, 30_000)}`;
  return chatRequest(settings, INSTRUCTIONS, message, { maxTokens: 3500, temperature: 0.5 });
}

/** The AI's quiz as a game: time and points by level; questions that are not usable are left out. */
export function parseGame(text: string, input: { title: string; level: GameLevel }): Game {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let data: Record<string, unknown> = {};
  try {
    data = start >= 0 && end > start ? (JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }
  const seconds = input.level === "easy" ? 25 : input.level === "hard" ? 15 : 20;
  const questions = (Array.isArray(data.questions) ? data.questions : []).map((raw) => {
    const question = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return { prompt: question.prompt, choices: question.choices, correct: question.correct, seconds, points: 1000 };
  });
  const game = sanitizeGame({ title: (typeof data.title === "string" && data.title.trim()) || input.title || "Quiz", description: data.description, kind: "quiz", questions, updatedAt: new Date().toISOString() });
  const usable = game ? game.questions.filter((question) => question.prompt && question.choices.filter(Boolean).length >= 2 && question.correct !== null) : [];
  if (!game || !usable.length) throw new Error("The AI answer was not in the expected shape. Try again.");
  return { ...game, questions: usable };
}
