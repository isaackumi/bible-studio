// A Pictures slideshow's choices, each one the church can turn on or off, and the small rules
// behind them: which order the pictures play in, and a picture's caption from its file name.

export type SlideOrder = "name" | "newest" | "shuffle";

export type SlideOptions = {
  seconds: number;
  loop: boolean;
  transition: "fade" | "cut";
  order: SlideOrder;
  /** Each picture slowly zooms and drifts (Ken Burns). */
  kenBurns: boolean;
  /** Each picture's file name as a lower third ("Youth Night – Friday 7pm"). */
  captions: boolean;
  /** A countdown over the pictures ("Service starts in 4:59"), gone at zero. */
  countdown: boolean;
  countdownMinutes: number;
  countdownLabel: string;
  /** A playlist plays while the slideshow runs and fades out when it stops. */
  music: boolean;
  playlistId: string | null;
  /** New pictures added to the folder (a shared Drive folder) join while it runs. */
  watch: boolean;
};

export const DEFAULT_SLIDE_OPTIONS: SlideOptions = {
  seconds: 6,
  loop: true,
  transition: "fade",
  order: "name",
  kenBurns: false,
  captions: false,
  countdown: false,
  countdownMinutes: 5,
  countdownLabel: "Service starts in",
  music: false,
  playlistId: null,
  watch: true,
};

/** Saved choices, cleaned: anything missing or out of range takes its default. */
export function cleanSlideOptions(value: unknown): SlideOptions {
  const input = value && typeof value === "object" ? (value as Partial<SlideOptions>) : {};
  const flag = (key: keyof SlideOptions) => (typeof input[key] === "boolean" ? (input[key] as boolean) : (DEFAULT_SLIDE_OPTIONS[key] as boolean));
  const number = (raw: unknown, fallback: number, min: number, max: number) => (typeof raw === "number" && Number.isFinite(raw) ? Math.min(max, Math.max(min, Math.round(raw))) : fallback);
  return {
    seconds: number(input.seconds, 6, 1, 30),
    loop: flag("loop"),
    transition: input.transition === "cut" ? "cut" : "fade",
    order: input.order === "newest" || input.order === "shuffle" ? input.order : "name",
    kenBurns: flag("kenBurns"),
    captions: flag("captions"),
    countdown: flag("countdown"),
    countdownMinutes: number(input.countdownMinutes, 5, 1, 120),
    countdownLabel: typeof input.countdownLabel === "string" && input.countdownLabel.trim() ? input.countdownLabel.trim().slice(0, 60) : DEFAULT_SLIDE_OPTIONS.countdownLabel,
    music: flag("music"),
    playlistId: typeof input.playlistId === "string" ? input.playlistId : null,
    watch: flag("watch"),
  };
}

/**
 * The order a slideshow plays: positions in the folder's list (sorted by name), starting with the
 * picture it starts from. Newest first by when each file changed; shuffle mixes the rest.
 */
export function slideOrder(entries: Array<{ modified: number }>, order: SlideOrder, from: number, random: () => number = Math.random): number[] {
  const all = entries.map((_, index) => index);
  if (order === "newest") all.sort((a, b) => entries[b]!.modified - entries[a]!.modified || a - b);
  if (order === "shuffle") {
    for (let index = all.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [all[index], all[swap]] = [all[swap]!, all[index]!];
    }
  }
  if (from < 0 || from >= entries.length) return all;
  // Start from the picture chosen; the others follow in the order above.
  return [from, ...all.filter((index) => index !== from)];
}

/** A file name as words: "Youth_Night-friday.JPG" → "Youth Night friday". */
export function captionOf(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s*-\s*(?=\S)/g, (match) => (match.trim() === "-" && !/\s/.test(match) ? " " : " – "))
    .replace(/\s+/g, " ")
    .trim();
}
