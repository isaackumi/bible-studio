import { describe, expect, it } from "vitest";
import { gameRequest, parseGame } from "./games";
import { emptyAiSettings } from "./summarize";

describe("AI quiz maker", () => {
  it("asks for the right number of questions for the source, level and audience", () => {
    const body = JSON.parse(gameRequest({ ...emptyAiSettings(), key: "k" }, { source: "sermon", title: "Saved by grace", text: "Ephesians 2", count: 30, level: "easy", audience: "children" }).body);
    const message = body.messages[0].content as string;
    expect(message).toContain("who was listening");
    expect(message).toContain("Write 15 questions");
    expect(message).toContain("children aged 7 to 12");
    expect(message).toContain("Write everything in English.");
  });

  it("makes a quiz from any pasted text, questions included", () => {
    const body = JSON.parse(gameRequest({ ...emptyAiSettings(), key: "k" }, { source: "text", title: "Recap", text: "1. Who led Israel out of Egypt?", count: 5, level: "mixed", audience: "everyone" }).body);
    expect(body.messages[0].content).toContain("questions someone has already written");
  });

  it("reads the quiz as a game, timed by level, dropping unusable questions", () => {
    const game = parseGame('```json\n{"title":"Grace quiz","questions":[{"prompt":"By what are we saved?","choices":["Grace","Works","Luck","Law"],"correct":0},{"prompt":"","choices":["a"]},{"prompt":"Which letter?","choices":["Romans","Ephesians","James","Jude"],"correct":1}]}\n```', { title: "", level: "hard" });
    expect(game.title).toBe("Grace quiz");
    expect(game.questions).toHaveLength(2);
    expect(game.questions[1]).toMatchObject({ correct: 1, seconds: 15, points: 1000 });
    expect(() => parseGame("sorry", { title: "", level: "easy" })).toThrow();
  });
});
