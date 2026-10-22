import { tickClock, type SermonClock } from "../domain/sermon-clock";

// The sermon clock lives outside the page, so it keeps counting while the operator looks elsewhere
// and is still right when they come back to the Sermon page.
export const sermonClock = $state<{ value: SermonClock | null; now: number }>({ value: null, now: Date.now() });

/** Program shows `source` now (or nothing of a sermon). */
export function trackProgram(source: string) {
  sermonClock.value = tickClock(sermonClock.value, source, Date.now());
}

/** Start the sermon's clock again from zero. */
export function resetSermonClock() {
  sermonClock.value = null;
}

let ticking: ReturnType<typeof setInterval> | undefined;
let watchers = 0;
/** Keep `now` moving once a second while anyone is watching. */
export function watchClock(): () => void {
  sermonClock.now = Date.now();
  watchers += 1;
  ticking ??= setInterval(() => (sermonClock.now = Date.now()), 1000);
  return () => {
    watchers -= 1;
    if (watchers > 0) return;
    clearInterval(ticking);
    ticking = undefined;
  };
}
