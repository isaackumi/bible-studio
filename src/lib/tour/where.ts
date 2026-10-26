import { t } from "../i18n/core";
import { TOURS, type TourId, type TourStep } from "./steps";

// "Where is…?": the tour's steps already know where each part of the screen is and what it is for,
// so asking for one ("where do I turn the screen black?") opens its page and points at it. Nothing
// is sent anywhere and no screenshot is read: the app knows its own buttons.

export type Place = { tour: TourId; at: number; step: TourStep };

/** Words of the question that say nothing about the place. */
const SKIP = new Set(
  "where is are was the a an to how do does i can could find change show me my our of for in on at it this that what which who get go put make use see turn set up your all".split(" "),
);

/** Everyday words for what the tour calls by another name. */
const SAME: Record<string, string> = {
  verse: "scripture",
  bible: "scripture",
  passage: "scripture",
  projector: "audience",
  tv: "audience",
  output: "audience",
  display: "audience",
  lyric: "song",
  hymn: "song",
  mic: "microphone",
  voice: "listen",
  recogniser: "recognizer",
  photo: "picture",
  image: "picture",
  qr: "join",
  code: "join",
  phone: "phones",
  camera: "sources",
  quiz: "quizzes",
  poll: "polls",
  order: "running",
  plan: "running",
  preach: "sermon",
  notes: "notes",
  dark: "black",
};

/** One form for plurals: "songs" and "song" are the same word. */
const single = (word: string) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !SKIP.has(word))
    .map((word) => single(SAME[single(word)] ?? single(word)));
}

/** Every part of the screen a tour points at, once each (not the "come back here" step). */
export const PLACES: Place[] = (() => {
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const [tour, { steps }] of Object.entries(TOURS) as Array<[TourId, (typeof TOURS)[TourId]]>) {
    steps.forEach((step, at) => {
      if (!step.target || step.target.includes('[data-tour="more"]') || seen.has(step.title)) return;
      seen.add(step.title);
      places.push({ tour, at, step });
    });
  }
  return places;
})();

/** The places a question asks for, best first (in English or the operator's language). */
export function findPlaces(question: string, limit = 5): Place[] {
  const asked = [...new Set(terms(question))];
  if (!asked.length) return [];
  const scored = PLACES.map((place) => {
    const title = new Set(terms(`${place.step.title} ${t(place.step.title)}`));
    const body = new Set(terms(`${place.step.body} ${t(place.step.body)}`));
    let score = 0;
    let inTitle = 0;
    for (const word of asked) {
      if (title.has(word)) {
        score += 3;
        inTitle += 1;
      }
      else if (body.has(word)) score += 1;
      else if (word.length >= 4 && [...title].some((term) => term.startsWith(word))) score += 1;
    }
    // A tie goes to the place whose name the question covers most ("songs": Your song library).
    return { place, score: score > 0 ? score + inTitle / Math.max(1, title.size) / 2 : 0 };
  });
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.place);
}
