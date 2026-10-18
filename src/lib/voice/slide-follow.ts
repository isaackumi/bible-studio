import { normalizeSpeech } from "./detect";

// Follow the sermon: match what the preacher says against the words on the slides, and name the
// slide being preached. Preaching paraphrases, so this looks for the slide's rarer words (not
// "the", "God" or "Jesus", which are on every slide) among the last few sentences, and answers
// only when one slide clearly leads. The slide on screen gets a head start, so a point that is
// still being preached does not flicker to a neighbour.

export type SlideText = { key: string; label: string; text: string };
export type SlideIndex = { slides: Array<SlideText & { words: Set<string> }>; weight: Map<string, number> };
export type SlideMatch = { key: string; label: string; score: number };

// Words a sermon says all the time, whatever the slide.
const COMMON = new Set(
  "a an the and or but so to of in on at for with by from as is are was were be been being it its this that these those there here i you he she we they me him her us them my your his our their what which who whom whose when where why how all any some no not do does did done have has had will would shall should can could may might must just also very then than too only even again now today god jesus christ lord holy spirit church amen hallelujah say says said tell told let lets know see come go one two three first next point people things thing like really".split(" "),
);

function stem(word: string): string {
  return word.replace(/(ings|ing|ed|es|s)$/, "");
}

export function slideWords(text: string): string[] {
  return normalizeSpeech(text)
    .split(" ")
    .filter((word) => word.length > 2 && !COMMON.has(word))
    .map(stem)
    .filter((word) => word.length > 2);
}

export function buildSlideIndex(slides: SlideText[]): SlideIndex {
  const entries = slides.map((slide) => ({ ...slide, words: new Set(slideWords(slide.text)) })).filter((slide) => slide.words.size >= 2);
  // Rarer words count for more: a word on one slide out of ten says more than one on all ten.
  const count = new Map<string, number>();
  for (const slide of entries) for (const word of slide.words) count.set(word, (count.get(word) ?? 0) + 1);
  const weight = new Map<string, number>();
  for (const [word, n] of count) weight.set(word, Math.log(1 + entries.length / n));
  return { slides: entries, weight };
}

/**
 * The slide being preached, or null when unsure. `heard` is the recent speech (a few sentences),
 * `current` the slide on screen.
 */
export function matchSlide(heard: string, index: SlideIndex, current: string | null = null): SlideMatch | null {
  const spoken = new Set(slideWords(heard).slice(-40));
  if (spoken.size < 2 || index.slides.length === 0) return null;
  let best: SlideMatch | null = null;
  let runner = 0;
  for (const slide of index.slides) {
    let score = 0;
    let hits = 0;
    for (const word of slide.words) {
      if (!spoken.has(word)) continue;
      score += index.weight.get(word) ?? 0;
      hits += 1;
    }
    if (hits < 2) continue;
    // Short slides should not win on two lucky words: scale by how much of the slide was heard.
    score *= Math.min(1, 0.5 + hits / Math.max(2, slide.words.size));
    if (slide.key === current) score *= 1.25;
    if (!best || score > best.score) {
      runner = best?.score ?? runner;
      best = { key: slide.key, label: slide.label, score };
    } else runner = Math.max(runner, score);
  }
  if (!best || best.score < 1.2 || best.score < runner * 1.35) return null;
  return best;
}
