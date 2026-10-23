import { t } from "../i18n/core";

// Who was listening: what a quiz showed once it ended. Each question as it was answered (how many
// picked each answer, which one was right), the top players and how many played. Kept with the
// church's games so a sermon quiz can be looked back on, and copied for a newsletter or a report.

export type ReportQuestion = { prompt: string; choices: string[]; correct: number | null; counts: number[] };

export type GameReport = {
  id: string;
  gameId: string;
  title: string;
  /** The sermon series and sermon the quiz came from, when it did. */
  series?: string;
  sermonId?: string;
  /** When it ended (ISO). */
  at: string;
  players: number;
  questions: ReportQuestion[];
  top: Array<{ name: string; score: number }>;
  /** Team mode: each team's average score, best first. */
  teams?: Array<{ name: string; score: number }>;
};

/** Reports kept; the oldest go first. */
export const MOST_REPORTS = 40;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const count = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));

export function sanitizeReport(value: unknown): GameReport | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const questions = (Array.isArray(input.questions) ? input.questions : []).slice(0, 100).map((raw): ReportQuestion => {
    const q = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const choices = (Array.isArray(q.choices) ? q.choices : []).map((choice) => text(choice, 120)).slice(0, 6);
    const correct = Number.isInteger(q.correct) && Number(q.correct) >= 0 && Number(q.correct) < choices.length ? Number(q.correct) : null;
    return { prompt: text(q.prompt, 300), choices, correct, counts: choices.map((_, index) => count((Array.isArray(q.counts) ? q.counts : [])[index])) };
  });
  const people = (list: unknown) => (Array.isArray(list) ? list : []).slice(0, 10).map((raw) => {
    const entry = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return { name: text(entry.name, 60), score: count(entry.score) };
  });
  const id = text(input.id, 60);
  if (!id || !questions.length) return null;
  return {
    id,
    gameId: text(input.gameId, 60),
    title: text(input.title, 80) || "Quiz",
    ...(text(input.series, 80) ? { series: text(input.series, 80) } : {}),
    ...(text(input.sermonId, 60) ? { sermonId: text(input.sermonId, 60) } : {}),
    at: typeof input.at === "string" ? input.at : new Date(0).toISOString(),
    players: count(input.players),
    questions,
    top: people(input.top),
    ...(Array.isArray(input.teams) ? { teams: people(input.teams) } : {}),
  };
}

/** How many answered a question, and what share of them were right (0–1; null in a poll or with no answers). */
export function questionStats(question: ReportQuestion): { answered: number; right: number | null } {
  const answered = question.counts.reduce((sum, n) => sum + n, 0);
  if (question.correct === null || !answered) return { answered, right: null };
  return { answered, right: (question.counts[question.correct] ?? 0) / answered };
}

/**
 * The report at a glance: the share right over the whole quiz, the hardest and easiest questions
 * (by share right), and how many answered on average (who was still listening by the end).
 */
export function reportSummary(report: GameReport): { right: number | null; hardest: number | null; easiest: number | null; answered: number } {
  const stats = report.questions.map(questionStats);
  const marked = stats.map((stat, index) => ({ index, right: stat.right })).filter((entry): entry is { index: number; right: number } => entry.right !== null);
  const right = marked.length ? marked.reduce((sum, entry) => sum + entry.right, 0) / marked.length : null;
  const byShare = [...marked].sort((a, b) => a.right - b.right || a.index - b.index);
  return {
    right,
    hardest: byShare.length > 1 ? byShare[0]!.index : null,
    easiest: byShare.length > 1 ? byShare.at(-1)!.index : null,
    answered: stats.length ? Math.round(stats.reduce((sum, stat) => sum + stat.answered, 0) / stats.length) : 0,
  };
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** The report as plain text, to paste into a message, a newsletter or notes. */
export function reportText(report: GameReport, date = (iso: string) => new Date(iso).toLocaleDateString()): string {
  const summary = reportSummary(report);
  const lines = [`${report.title} · ${date(report.at)}`];
  lines.push(t("{n} played. {right} right on average; about {answered} answered each question.", { n: report.players, right: summary.right === null ? "–" : percent(summary.right), answered: summary.answered }));
  lines.push("");
  report.questions.forEach((question, index) => {
    const stat = questionStats(question);
    const mark = index === summary.hardest ? ` (${t("hardest")})` : index === summary.easiest ? ` (${t("easiest")})` : "";
    lines.push(`${index + 1}. ${question.prompt} · ${stat.right === null ? t("{n} answered", { n: stat.answered }) : t("{right} right of {n}", { right: percent(stat.right), n: stat.answered })}${mark}`);
    if (question.correct !== null && question.choices[question.correct]) lines.push(`   ${t("Answer: {answer}", { answer: question.choices[question.correct]! })}`);
  });
  if (report.teams?.length) {
    lines.push("", t("Teams"));
    report.teams.forEach((team, index) => lines.push(`${index + 1}. ${team.name} · ${team.score}`));
  }
  if (report.top.length) {
    lines.push("", t("Top players"));
    report.top.forEach((player, index) => lines.push(`${index + 1}. ${player.name} · ${player.score}`));
  }
  return lines.join("\n");
}
