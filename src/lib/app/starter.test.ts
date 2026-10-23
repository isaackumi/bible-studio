import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("./session.svelte", () => ({ session: { workspace: { games: [] } } }));

const { packGames, sanitizeQuizPacks } = await import("./starter.svelte");
const { ready } = await import("../domain/games");

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../static/starter/quizzes/${path}`, import.meta.url), "utf8")) as unknown;

describe("quiz packs", () => {
  it("lists only packs with an id, a name and a plain .json file", () => {
    expect(sanitizeQuizPacks([{ id: "a", name: "A", file: "a.json", count: 2 }, { id: "b", name: "B", file: "../b.json" }, { id: "a", name: "Again", file: "c.json" }])).toEqual([
      { id: "a", name: "A", description: "", file: "a.json", count: 2 },
    ]);
  });

  it("gives a pack's games ids of their own, so adding it twice adds nothing new", () => {
    const games = packGames("youth-v1", { games: [{ title: "Quiz", kind: "quiz", questions: [{ prompt: "Q?", choices: ["A", "B"], correct: 0 }] }] });
    expect(games.map((game) => game.id)).toEqual(["pack:youth-v1:1"]);
  });

  it("ships packs whose every question can be played, and whose counts are true", () => {
    const packs = sanitizeQuizPacks(read("index.json"));
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      const games = packGames(pack.id, read(pack.file));
      expect(games.length, pack.name).toBe(pack.count);
      for (const game of games) for (const question of game.questions) expect(ready(question, game.kind), `${game.title}: ${question.prompt}`).toBe(true);
    }
  });
});
