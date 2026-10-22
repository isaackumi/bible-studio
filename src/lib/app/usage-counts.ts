// What this computer did since its last check-in: services run, scripture and songs shown. Counts
// only, kept in this window's storage so a quit before the next check-in loses nothing; sent with
// the check-in (unless usage sharing is off) and cleared once the server has them.

export type UsageCounts = { services: number; scripture: number; songs: number };

const KEY = "church-studio.usage-counts";

function read(): UsageCounts {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<UsageCounts>;
    const n = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
    return { services: n(saved.services), scripture: n(saved.scripture), songs: n(saved.songs) };
  } catch {
    return { services: 0, scripture: 0, songs: 0 };
  }
}

function write(counts: UsageCounts) {
  try {
    localStorage.setItem(KEY, JSON.stringify(counts));
  } catch {
    // Storage refused (private window): counts are simply not kept.
  }
}

export function countUse(kind: keyof UsageCounts) {
  if (typeof localStorage === "undefined") return;
  const counts = read();
  counts[kind] += 1;
  write(counts);
}

export const usageCounts = (): UsageCounts => (typeof localStorage === "undefined" ? { services: 0, scripture: 0, songs: 0 } : read());

/** The server has these: keep only what was counted while they were on their way. */
export function usageSent(sent: UsageCounts) {
  if (typeof localStorage === "undefined") return;
  const now = read();
  write({ services: Math.max(0, now.services - sent.services), scripture: Math.max(0, now.scripture - sent.scripture), songs: Math.max(0, now.songs - sent.songs) });
}
