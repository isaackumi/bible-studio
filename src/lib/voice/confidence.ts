// How sure to be of a verse found in what was heard: a probability that it is the verse meant, from
// what spoke for it (voice/detect.ts MatchEvidence), and whether the recognizer's other hearings agree.
// The weights are fitted to real things said in church (voice/confidence-corpus.ts) by
// scripts/fit-confidence.ts; fit again after adding lines. A verse past the end of its chapter does
// not exist, so it is never sure, whatever else spoke for it.
//
// Tiers: sure (put it up), likely (put it up, mark it), maybe (offer it under Detections, change nothing).

import { chooseHeard, passageExists, type QuoteIndex, type SpokenMatch } from "./detect";

export type Via = "citation" | "phrase" | "quote";
export type ConfidenceTier = "sure" | "likely" | "maybe";
export type Confidence = { p: number; tier: ConfidenceTier; via: Via | "other" };

export const SURE = 0.9;
export const LIKELY = 0.6;

/**
 * Weights per way of finding: [bias, ...one per feature in `featuresOf`]. Citation and phrase are
 * fitted (scripts/fit-confidence.ts, 128 lines, 2026-10-27). Quote has no wrong finds in the corpus to
 * learn from yet, so it is set by hand to stay below "sure": scattered words alone are never certain.
 */
const WEIGHTS: Record<Via, number[]> = {
  citation: [0.39, 3.27, 1.85, -0.05],
  phrase: [-5.03, 2.9, 1.66, 0.93, 3.16],
  quote: [-1, 0.8, 1, 0.5],
};

/** Whether the verse found is in the Bible at all (null when the catalog cannot say). */
export const verseExists = (match: SpokenMatch, index: QuoteIndex) => passageExists(index, match.item);

/** Of the recognizer's hearings, the share that land on the same verse. */
function agreement(match: SpokenMatch, phrases: string[], index: QuoteIndex): number {
  if (phrases.length <= 1) return 1;
  const same = phrases.filter((phrase) => {
    const found = chooseHeard([phrase], index, match.item.translationId);
    return found && found.item.bookOrd === match.item.bookOrd && found.item.chapter === match.item.chapter && found.item.startVerse === match.item.startVerse;
  }).length;
  return same / phrases.length;
}

/**
 * The numbers the model weighs for this match (null when the detector said nothing about how).
 * citation: said with "chapter"/"verse"; the book heard by its name; a short phrase.
 * phrase: how long the run of words, how many telling words, how much of the verse.
 * quote: how many words matched, how close together, how far ahead of the next verse.
 */
export function featuresOf(match: SpokenMatch): { via: Via; x: number[] } | null {
  const evidence = match.evidence;
  if (!evidence) return null;
  if (evidence.via === "citation") return { via: "citation", x: [evidence.cued ? 1 : 0, evidence.named ? 1 : 0, evidence.words <= 10 ? 1 : 0] };
  if (evidence.via === "phrase") return { via: "phrase", x: [Math.min(evidence.run, 12) / 4, Math.min(evidence.telling, 6) / 2, evidence.share, evidence.edge ? 1 : 0] };
  return { via: "quote", x: [evidence.hits / 4, evidence.span ? evidence.hits / evidence.span : 0, Math.min(evidence.gap, 4) / 2] };
}

export const tierOf = (p: number): ConfidenceTier => (p >= SURE ? "sure" : p >= LIKELY ? "likely" : "maybe");

/** How sure to be that this is the verse meant. `phrases`: everything the recognizer heard for it. */
export function rateMatch(match: SpokenMatch, context: { phrases: string[]; index: QuoteIndex }): Confidence {
  const features = featuresOf(match);
  if (!features) return { p: 0.5, tier: "maybe", via: "other" };
  if (verseExists(match, context.index) === false) return { p: 0.02, tier: "maybe", via: features.via };
  const w = WEIGHTS[features.via];
  const z = w[0]! + features.x.reduce((total, value, i) => total + value * (w[i + 1] ?? 0), 0);
  // The recognizer's other hearings landing elsewhere make it as much less likely.
  const p = (1 / (1 + Math.exp(-z))) * agreement(match, context.phrases, context.index);
  return { p, tier: tierOf(p), via: features.via };
}
