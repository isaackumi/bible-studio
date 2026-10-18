// How much quieter the background is after the Noise filter, from the mic check's levels.
// The background is the quiet moments between words: the lowest fifth of each meter.

function floor(levels: number[]): number {
  const sorted = [...levels].filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const quiet = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 5)));
  return quiet.reduce((total, value) => total + value, 0) / quiet.length;
}

/** Decibels of background removed (0 or more), or null until there is enough to judge. */
export function noiseCut(room: number[], cleaned: number[]): number | null {
  if (room.length < 12 || cleaned.length < 12) return null;
  const before = floor(room);
  const after = floor(cleaned);
  if (before < 1e-4) return null;
  return Math.max(0, Math.round(20 * Math.log10(before / Math.max(after, 1e-5))));
}
