// Smoothness of a screen window: frames a second and hiccups, from the gaps between frames. Kept
// apart from the Performance page so the audience window loads only this.

export type Frames = { fps: number; hiccups: number; worstMs: number };

/** Frame gaps (ms): frames a second, and hiccups (a gap over 50 ms, a visible stutter). */
export function frameStats(gaps: number[]): Frames {
  const usable = gaps.filter((gap) => gap > 0 && gap < 1000);
  if (!usable.length) return { fps: 0, hiccups: 0, worstMs: 0 };
  const total = usable.reduce((sum, gap) => sum + gap, 0);
  return { fps: Math.round((usable.length * 1000) / total), hiccups: usable.filter((gap) => gap > 50).length, worstMs: Math.round(Math.max(...usable)) };
}

/** Watch frames for `ms`, then report them. */
export function measureFrames(ms: number): Promise<Frames> {
  return new Promise((resolve) => {
    const gaps: number[] = [];
    let last = 0;
    const end = performance.now() + Math.min(10_000, Math.max(1000, ms));
    const tick = (now: number) => {
      if (last) gaps.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else resolve(frameStats(gaps));
    };
    requestAnimationFrame(tick);
  });
}
