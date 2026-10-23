import type { PresentationModel, Theme } from "./types";

// The game show on the church's screen: a lobby while people join, each question with its colour
// tiles and clock, how the room answered, a leaderboard where people climb, and a podium at the end.
// One frame layout ("game") carries it; the desk sends a new frame as the room changes and the
// screen animates between them.

export type GameStage = "lobby" | "question" | "results" | "leaderboard" | "podium";

/** A player as the screen shows them: their colour number, name and score, and where they were. */
export type GamePlayer = { n: number; name: string; score: number; before: number; gain: number; streak: number; rank: number; was: number };

export type GameScreenData = {
  stage: GameStage;
  title: string;
  round: number;
  total: number;
  prompt: string;
  choices: string[];
  /** The right answer, shown from the results on (null in a poll, or before). */
  correct: number | null;
  counts: number[];
  /** When answers close, on this computer's clock (ms); null: until the operator stops them. */
  endsAt: number | null;
  /** When answers open, after the reading time (ms); null: already open, or no reading time. */
  opensAt: number | null;
  /** The first right answer, once answers are closed: who, and how quickly. */
  fastest: { n: number; name: string; ms: number } | null;
  seconds: number;
  answered: number;
  players: number;
  top: GamePlayer[];
  bottom: GamePlayer[];
  /** Who joined, newest last (the lobby). */
  joined: Array<{ n: number; name: string }>;
  /** How to join, for the lobby: the code, the short address, and the link for the QR code. */
  join: { code: string; at: string; url: string } | null;
  /** Music and sound effects on the audience screen. */
  sounds: boolean;
  /** Changes with every new question or stage, so the screen knows to start its moves again. */
  key: string;
};

export { CHOICE_STYLES, PLAYER_COLORS, playerColor } from "./game-colors";

export function presentGame(theme: Theme, game: GameScreenData): PresentationModel {
  return { layout: "game", theme, reference: null, attribution: null, lines: [], imageUrl: null, backgroundImageUrl: null, game };
}

/** Places as words: 1st, 2nd, 3rd, 4th… */
export function ordinal(rank: number): string {
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][rank % 10] ?? "th");
  return `${rank}${suffix}`;
}

/** Players in the order they stood before the last question, best first (to animate the climb). */
export function previousOrder(players: GamePlayer[]): GamePlayer[] {
  return [...players].sort((a, b) => a.was - b.was);
}
