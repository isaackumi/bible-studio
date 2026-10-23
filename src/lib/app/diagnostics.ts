// Problem reports: the last errors this computer saw, kept in this browser profile only, so a
// church can save a report and send it when something goes wrong. Nothing is sent by itself.

export type Problem = { at: string; kind: "error" | "promise" | "crash"; message: string; where: string };

const KEY = "church-studio.problems";
const MAX = 50;

export function readProblems(store: Pick<Storage, "getItem"> = localStorage): Problem[] {
  try {
    const value = JSON.parse(store.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.message === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function recordProblem(problem: Omit<Problem, "at">, store: Pick<Storage, "getItem" | "setItem"> = localStorage, now = new Date()) {
  try {
    const entry: Problem = { ...problem, message: problem.message.slice(0, 600), where: problem.where.slice(0, 300), at: now.toISOString() };
    // The same problem repeating in a loop is kept once.
    const list = readProblems(store).filter((existing) => existing.message !== entry.message);
    store.setItem(KEY, JSON.stringify([entry, ...list].slice(0, MAX)));
  } catch {
    // Storage full or blocked: nothing to do.
  }
}

export function clearProblems(store: Pick<Storage, "removeItem"> = localStorage) {
  try {
    store.removeItem(KEY);
  } catch {
    // Ignore.
  }
}

/** Catch errors no code handled, from this window on. */
export function watchProblems(target: Window = window) {
  const onError = (event: ErrorEvent) =>
    recordProblem({ kind: "error", message: event.message || String(event.error), where: `${event.filename ?? ""}:${event.lineno ?? 0}` });
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    recordProblem({ kind: "promise", message: reason instanceof Error ? reason.message : String(reason), where: reason instanceof Error ? (reason.stack ?? "").split("\n")[1]?.trim() ?? "" : "" });
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}

/** A plain-text report: version, computer, a few counts (no church content), and the problems. */
export function problemReport(input: {
  version: string;
  platform: string;
  userAgent: string;
  counts: Record<string, number>;
  problems: Problem[];
  crashLog: string;
  /** Technical sections for support (titled blocks of text), after the problems. */
  sections?: Array<[string, string]>;
  now?: Date;
}): string {
  const lines = [
    "Church Studio support file",
    `Made: ${(input.now ?? new Date()).toISOString()}`,
    `Version: ${input.version}`,
    `Platform: ${input.platform}`,
    `Browser engine: ${input.userAgent}`,
    `Library: ${Object.entries(input.counts).map(([name, count]) => `${count} ${name}`).join(", ")}`,
    "",
    `Problems (${input.problems.length}):`,
    ...(input.problems.length ? input.problems.map((problem) => `- ${problem.at} [${problem.kind}] ${problem.message}${problem.where ? ` (${problem.where})` : ""}`) : ["- none"]),
  ];
  for (const [title, text] of input.sections ?? []) if (text.trim()) lines.push("", `${title}:`, text.trim());
  if (input.crashLog.trim()) lines.push("", "Desktop crash log:", input.crashLog.trim().slice(-8000));
  return lines.join("\n") + "\n";
}
