// Which desk messages the status line shows, and how. The desk says so where it makes the message
// (warn() for a problem, quiet() for the main buttons' own confirmations, which the Program monitor
// already shows). A message without a tone falls back to a guess from English wording (could not,
// blocked, missing, first…), so lines set elsewhere keep working.

export type MessageTone = "info" | "warn" | "quiet";

const ROUTINE = new Set(["", "Live.", "Cut to program.", "Program is black.", "Logo is on program.", "Program cleared.", "Opening workspace"]);

const PROBLEM = /\b(could ?not|cannot|can't|couldn't|isn't|is not|are not|was not|no longer|not found|failed|blocked|denied|missing|unavailable|error|first\b|needs?\b|nothing (?:on|to)|no \w+ (?:yet|on)|too long|wrong|offline|turned off)/i;

export function messageTone(text: string | null | undefined, tone?: MessageTone | null): "info" | "warn" | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  if (tone) return tone === "quiet" ? null : tone;
  if (ROUTINE.has(trimmed)) return null;
  return PROBLEM.test(trimmed) ? "warn" : "info";
}
