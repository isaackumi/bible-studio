// Songs line by line: a part (Verse 1, Chorus) shown a few lines at a time instead of all at once,
// the way ProPresenter, EasyWorship and FreeShow split lyrics into slides. "Whole part" keeps the
// old behaviour. A blank line in the lyrics always starts a new screen, so a church can place
// breaks by hand; within a run of lines, screens hold the chosen number of lines.

/** Lines on the screen at once; 0 is the whole part. */
export type SongLines = 0 | 1 | 2 | 3 | 4;
export const SONG_LINE_CHOICES: readonly SongLines[] = [0, 1, 2, 3, 4];

/** One screen of a part: its lines are `lines.slice(from, to)` (blank lines inside are dropped when shown). */
export type SongScreen = { from: number; to: number };

export function sanitizeSongLines(value: unknown): SongLines {
  return SONG_LINE_CHOICES.includes(value as SongLines) ? (value as SongLines) : 0;
}

/** The screens a part is shown in, in order. Always at least one. */
export function screensOf(lines: string[], perScreen: SongLines): SongScreen[] {
  if (perScreen === 0) return [{ from: 0, to: lines.length }];
  const screens: SongScreen[] = [];
  let run: number[] = [];
  const flush = () => {
    for (let at = 0; at < run.length; at += perScreen) {
      const chunk = run.slice(at, at + perScreen);
      screens.push({ from: chunk[0]!, to: chunk[chunk.length - 1]! + 1 });
    }
    run = [];
  };
  lines.forEach((line, n) => {
    if (line.trim()) run.push(n);
    else flush();
  });
  flush();
  return screens.length ? screens : [{ from: 0, to: lines.length }];
}

/** Keep a screen number inside a part's screens. */
export function clampScreen(screen: number | undefined, count: number): number {
  if (!Number.isFinite(screen) || screen === undefined) return 0;
  return Math.min(Math.max(0, Math.trunc(screen)), Math.max(0, count - 1));
}
