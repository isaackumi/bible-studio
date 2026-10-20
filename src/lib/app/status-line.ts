// Which desk messages the status line shows, and how. The main buttons' own confirmations are
// left out (the Program monitor already shows what happened); anything that reads as a problem
// (could not, blocked, missing, first…) is a warning.

const ROUTINE = new Set(["", "Live.", "Cut to program.", "Program is black.", "Logo is on program.", "Program cleared.", "Opening workspace"]);

const PROBLEM = /\b(could ?not|cannot|can't|couldn't|isn't|is not|are not|was not|no longer|not found|failed|blocked|denied|missing|unavailable|error|first\b|needs?\b|nothing (?:on|to)|no \w+ (?:yet|on)|too long|wrong|offline|turned off)/i;

export function messageTone(text: string | null | undefined): "info" | "warn" | null {
  const trimmed = (text ?? "").trim();
  if (ROUTINE.has(trimmed)) return null;
  return PROBLEM.test(trimmed) ? "warn" : "info";
}
