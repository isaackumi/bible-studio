import { msg } from "../i18n/core";
import type { PresentationModel, Theme } from "./types";

// The game show on the church's screen: a lobby while people join, each question with its colour
// tiles and clock, how the room answered, a leaderboard where people climb, and a podium at the end.
// One frame layout ("game") carries it; the desk sends a new frame as the room changes and the
// screen animates between them.

export type GameStage = "lobby" | "question" | "results" | "leaderboard" | "podium" | "pick" | "groups";

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
  /** The lobby and question music: only while a game is running (a frame left up after it is quiet). */
  music?: boolean;
  /** The music's style (game/sounds.ts). */
  musicStyle?: string;
  /** An anonymous poll: no names on the screen. */
  anonymous?: boolean;
  /** The random picker: everyone the reel flicks through, who it lands on, and which spin this is. */
  pick?: { names: string[]; winners: Array<{ n: number; name: string }>; spin: string };
  /** Random groups, each a list of people (their join number picks their colour). */
  groups?: Array<Array<{ n: number; name: string }>>;
  /** Changes with every new question or stage, so the screen knows to start its moves again. */
  key: string;
  /** Team standings, best first (team mode); null when everyone plays for themselves. */
  teams: GameTeam[] | null;
  /** The screen's words in the operator's language (GAME_WORDS → translated), and that language. */
  words: Record<string, string>;
  lang: "en" | "fr" | "es";
};

export type GameTeam = { team: number; name: string; color: string; players: number; score: number; gain: number };

/**
 * Every line the game screen shows. The audience window loads no language of its own, so the desk
 * sends these already translated with each frame (a line missing there shows in English).
 */
export const GAME_WORDS = [
  msg("Join the game"),
  msg("Picked at random"),
  msg("And it's…"),
  msg("Random groups"),
  msg("Group {n}"),
  msg("Go to {at} and enter"),
  msg("{n} player is in"),
  msg("{n} players are in"),
  msg("Waiting for the first player…"),
  msg("+{n} more"),
  msg("{n} player"),
  msg("{n} players"),
  msg("Question {n} of {total}"),
  msg("Seconds left"),
  msg("answer"),
  msg("answers"),
  msg("Get ready…"),
  msg("{n} vote"),
  msg("{n} votes"),
  msg("{right} of {total} got it right."),
  msg("Everyone got it!"),
  msg("Nobody got that one."),
  msg("Most of you got it."),
  msg("A tricky one."),
  msg("A hard one!"),
  msg("Fastest: {name} · {seconds}s"),
  msg("Leaderboard"),
  msg("Right answers in a row"),
  msg("Catching up"),
  msg("and {n} more player. Well played, everyone!"),
  msg("and {n} more players. Well played, everyone!"),
  msg("Team {name}"),
  msg("Team {name} wins!"),
  msg("Teams"),
  msg("Red"),
  msg("Blue"),
  msg("Gold"),
  msg("Green"),
];

/** A screen line in the operator's language, with {placeholders} filled. */
export function say(data: Pick<GameScreenData, "words">, text: string, values: Record<string, string | number> = {}): string {
  const line = data.words[text] || text;
  return line.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all));
}

/** A count: French uses the singular for 0 and 1; English and Spanish for 1 alone. */
export function sayCount(data: Pick<GameScreenData, "words" | "lang">, n: number, one: string, other: string, values: Record<string, string | number> = {}): string {
  return say(data, (data.lang === "fr" ? n < 2 : n === 1) ? one : other, { n, ...values });
}

export { CHOICE_PATHS, CHOICE_STYLES, PLAYER_COLORS, playerColor } from "./game-colors";

export function presentGame(theme: Theme, game: GameScreenData): PresentationModel {
  return { layout: "game", theme, reference: null, attribution: null, lines: [], imageUrl: null, backgroundImageUrl: null, game };
}

/** Places as words: 1st, 2nd, 3rd, 4th… (1er, 2e in French; 1.º in Spanish). */
export function ordinal(rank: number, lang: GameScreenData["lang"] = "en"): string {
  if (lang === "fr") return `${rank}${rank === 1 ? "er" : "e"}`;
  if (lang === "es") return `${rank}.º`;
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][rank % 10] ?? "th");
  return `${rank}${suffix}`;
}

/** Players in the order they stood before the last question, best first (to animate the climb). */
export function previousOrder(players: GamePlayer[]): GamePlayer[] {
  return [...players].sort((a, b) => a.was - b.was);
}
