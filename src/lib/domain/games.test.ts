import { describe, expect, it } from "vitest";
import { BUILT_IN_GAMES, finishTheVerseGame, newGame, ready, sanitizeGame, shuffled, whichBookGame, seriesFinal, questionsFromText, questionsAsText } from "./games";

describe("games", () => {
  it("built-in games are all ready to play, with the right answer among the answers", () => {
    for (const game of BUILT_IN_GAMES) {
      expect(game.questions.length, game.title).toBeGreaterThan(0);
      for (const question of game.questions) expect(ready(question, game.kind), `${game.title}: ${question.prompt}`).toBe(true);
    }
  });

  it("mixes the answers and keeps the right one right", () => {
    const question = BUILT_IN_GAMES[0]!.questions[0]!;
    let seed = 0.9;
    const mixed = shuffled(question, () => (seed = (seed * 7.13) % 1));
    expect(mixed.choices.sort()).toEqual([...question.choices].sort());
    const again = shuffled(question, () => 0.1);
    expect(again.choices[again.correct!]).toBe(question.choices[question.correct!]);
  });

  it("cleans a stored game: no right answer in a poll, a bad answer index dropped", () => {
    const game = sanitizeGame({ title: "  Youth night ", kind: "quiz", questions: [{ prompt: "Q", choices: ["a", "b"], correct: 7, seconds: 999, points: -5 }] })!;
    expect(game).toMatchObject({ title: "Youth night", questions: [{ correct: null, seconds: 120, points: 0 }] });
    expect(ready(game.questions[0]!, "quiz")).toBe(false);
    expect(sanitizeGame({ kind: "poll", questions: [{ prompt: "Q", choices: ["a", "b"], correct: 0 }] })!.questions[0]!.correct).toBeNull();
    expect(newGame().questions).toHaveLength(1);
  });

  it("makes Bible games from the verses on this computer", () => {
    const books = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"];
    const verses = [
      { book: 1, text: "In the beginning God created the heaven and the earth.", reference: "Genesis 1:1" },
      { book: 2, text: "Thou shalt have no other gods before me.", reference: "Exodus 20:3" },
      { book: 4, text: "The Lord bless thee, and keep thee: the Lord make his face shine upon thee.", reference: "Numbers 6:24" },
      { book: 5, text: "Hear, O Israel: The Lord our God is one Lord, and thou shalt love the Lord thy God.", reference: "Deuteronomy 6:4" },
    ];
    const which = whichBookGame(verses, books, Math.random, 4);
    expect(which.questions).toHaveLength(4);
    for (const question of which.questions) {
      expect(question.choices).toHaveLength(4);
      const verse = verses.find((entry) => question.prompt.includes(entry.text))!;
      expect(question.choices[question.correct!]).toBe(books[verse.book - 1]);
    }
    const finish = finishTheVerseGame(verses, Math.random, 3);
    for (const question of finish.questions) {
      const verse = verses.find((entry) => question.prompt.startsWith(entry.reference))!;
      expect(verse.text.endsWith(question.choices[question.correct!]!.replace(/^… /, ""))).toBe(true);
    }
  });

  it("makes a series final from every quiz in a series, a little from each in turn", () => {
    const quiz = (id: string, series: string | undefined, prompts: string[]) => ({ id, title: id, description: "", kind: "quiz" as const, updatedAt: "", ...(series ? { series } : {}), questions: prompts.map((prompt) => ({ id: prompt, prompt, choices: ["a", "b"], correct: 0, seconds: 20, points: 1000 })) });
    const games = [quiz("w1", "Faith", ["1a", "1b", "1c"]), quiz("w2", "Faith", ["2a", "2b"]), quiz("other", "Hope", ["x"]), quiz("loose", undefined, ["y"])];
    const final = seriesFinal(games, "Faith", 4, () => 0.5)!;
    expect(final.series).toBe("Faith");
    expect(final.questions.map((question) => question.prompt)).toEqual(["1a", "2a", "1b", "2b"]);
    expect(seriesFinal(games, "Hope")).toBeNull();
  });
});

describe("questions typed or pasted as text", () => {
  it("reads a question, its answers and the starred right one, block by block", () => {
    const questions = questionsFromText("Who built the ark?\nMoses\n* Noah\nAbraham\n\n2. How many disciples?\na) Seven\nb) Twelve ✓\nc) Ten");
    expect(questions.map((q) => [q.prompt, q.choices, q.correct])).toEqual([
      ["Who built the ark?", ["Moses", "Noah", "Abraham"], 1],
      ["How many disciples?", ["Seven", "Twelve", "Ten"], 1],
    ]);
  });

  it("takes the right answer from an Answer line, by letter or by its words", () => {
    expect(questionsFromText("First book?\nA. Exodus\nB. Genesis\nAnswer: B")[0]?.correct).toBe(1);
    expect(questionsFromText("First book?\nExodus\nGenesis\nAnswer: genesis")[0]?.correct).toBe(1);
  });

  it("leaves out blocks with fewer than two answers, and marks nothing right in a poll", () => {
    expect(questionsFromText("Just a line\n\nQuestion\nOne answer")).toEqual([]);
    expect(questionsFromText("Which song?\n* Amazing Grace\nBe Thou My Vision", "poll")[0]?.correct).toBeNull();
  });

  it("writes a game back out in the same shape", () => {
    const game = { ...newGame("Test"), questions: questionsFromText("Who built the ark?\nMoses\n* Noah") };
    expect(questionsAsText(game)).toBe("Who built the ark?\nMoses\n* Noah");
    expect(questionsFromText(questionsAsText(game))[0]?.correct).toBe(1);
  });
});
