import { describe, expect, it } from "vitest";
import { questionStats, reportSummary, reportText, sanitizeReport, type GameReport } from "./game-report";

const report: GameReport = {
  id: "report:1",
  gameId: "game:1",
  title: "Saved by grace",
  at: "2026-10-25T12:00:00.000Z",
  players: 20,
  questions: [
    { prompt: "Saved by?", choices: ["Grace", "Works"], correct: 0, counts: [18, 2] },
    { prompt: "Which letter?", choices: ["Romans", "Ephesians", "James"], correct: 1, counts: [8, 6, 6] },
    { prompt: "Favourite song?", choices: ["A", "B"], correct: null, counts: [5, 5] },
  ],
  top: [{ name: "Ama", score: 3000 }],
};

describe("who was listening", () => {
  it("gives each question's share right, and nothing for a poll", () => {
    expect(questionStats(report.questions[0]!)).toEqual({ answered: 20, right: 0.9 });
    expect(questionStats(report.questions[2]!)).toEqual({ answered: 10, right: null });
  });

  it("finds the hardest and easiest question and the average share right", () => {
    expect(reportSummary(report)).toEqual({ right: 0.6, hardest: 1, easiest: 0, answered: 17 });
  });

  it("writes a plain-text report with each answer", () => {
    const text = reportText(report, () => "25 Oct");
    expect(text).toContain("Saved by grace · 25 Oct");
    expect(text).toContain("2. Which letter? · 30% right of 20 (hardest)");
    expect(text).toContain("Answer: Ephesians");
    expect(text).toContain("1. Ama · 3000");
  });

  it("keeps a stored report tidy, and drops one with no questions", () => {
    expect(sanitizeReport({ ...report, questions: [{ prompt: "Q", choices: ["a", "b"], correct: 5, counts: [-1, "3"] }] })?.questions[0]).toEqual({ prompt: "Q", choices: ["a", "b"], correct: null, counts: [0, 3] });
    expect(sanitizeReport({ ...report, questions: [] })).toBeNull();
  });
});
