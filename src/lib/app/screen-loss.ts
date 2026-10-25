// The audience screen dropping out mid-service (a TV that blinks, a cable knocked): the desk says
// so plainly, and says when it is back. Lost means it was showing and went dark while the operator
// still wants it; closing it on purpose is never a loss.

type Status = { desired: boolean; online: boolean; displayName: string };

/** `lost`: the screen's name while it is gone; `back`: its name the moment it returns. */
export function screenLoss(lost: string | null, before: Status | null, now: Status): { lost: string | null; back?: string } {
  if (!now.desired) return { lost: null };
  if (now.online) return lost ? { lost: null, back: lost } : { lost: null };
  if (lost) return { lost };
  return before?.online ? { lost: before.displayName || "The audience screen" } : { lost: null };
}
