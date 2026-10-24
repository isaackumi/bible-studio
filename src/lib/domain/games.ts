// Games for the congregation's phones: a game is a list of questions, each with answers, the right
// one (none for a poll), a time limit and points. Every kind of game (Bible quiz, who said it, which
// book, finish the verse, youth trivia, a church's own) is this one shape, so the room runs them
// all the same way and new kinds need no new machinery. Some are made fresh from the Bible text
// installed on this computer each time (generators below).

export type GameQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  /** The right answer's index; null in a poll. */
  correct: number | null;
  seconds: number;
  points: number;
};

export type Game = {
  id: string;
  title: string;
  description: string;
  kind: "quiz" | "poll";
  questions: GameQuestion[];
  updatedAt: string;
  /**
   * A poll that never shows who answered what: the screen shows no names, phones say their answer is
   * anonymous, and nothing ties a vote to a person. Only polls; a quiz needs names for its scores.
   */
  anonymous?: boolean;
  /** The sermon series it belongs to (the quiz bank groups by it), and the sermon it came from. */
  series?: string;
  sermonId?: string;
};

export const MOST_CHOICES = 6;
export const MOST_QUESTIONS = 100;

const uid = (prefix: string) => `${prefix}:${Math.random().toString(36).slice(2, 10)}`;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function sanitizeGame(value: unknown): Game | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const kind = input.kind === "poll" ? "poll" : "quiz";
  const questions = (Array.isArray(input.questions) ? input.questions : [])
    .slice(0, MOST_QUESTIONS)
    .map((raw): GameQuestion | null => {
      if (!raw || typeof raw !== "object") return null;
      const q = raw as Record<string, unknown>;
      const choices = (Array.isArray(q.choices) ? q.choices : []).map((choice) => text(choice, 120)).slice(0, MOST_CHOICES);
      const correct = Number.isInteger(q.correct) && Number(q.correct) >= 0 && Number(q.correct) < choices.length ? Number(q.correct) : null;
      return {
        id: text(q.id, 40) || uid("q"),
        prompt: text(q.prompt, 300),
        choices,
        correct: kind === "poll" ? null : correct,
        seconds: Math.min(120, Math.max(0, Math.round(Number(q.seconds) || 0))),
        points: Math.min(5000, Math.max(0, Math.round(Number(q.points ?? 1000)))),
      };
    })
    .filter((q): q is GameQuestion => q !== null);
  return {
    id: text(input.id, 60) || uid("game"),
    title: text(input.title, 80) || "Untitled game",
    description: text(input.description, 300),
    kind,
    questions,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date(0).toISOString(),
    ...(kind === "poll" && input.anonymous === true ? { anonymous: true } : {}),
    ...(text(input.series, 80) ? { series: text(input.series, 80) } : {}),
    ...(text(input.sermonId, 60) ? { sermonId: text(input.sermonId, 60) } : {}),
  };
}

/**
 * A series final: questions from every quiz in a series, a few from each in turn (so each week is
 * there), up to `most`, answers mixed when played. Null when the series has fewer than two quizzes.
 */
export function seriesFinal(games: Game[], series: string, most = 15, random = Math.random): Game | null {
  const quizzes = games.filter((game) => game.kind === "quiz" && game.series === series && game.questions.some((question) => ready(question, "quiz")));
  if (quizzes.length < 2) return null;
  const pools = quizzes.map((game) => game.questions.filter((question) => ready(question, "quiz")).sort(() => random() - 0.5));
  const picked: GameQuestion[] = [];
  for (let round = 0; picked.length < most && pools.some((pool) => pool.length > round); round++) {
    for (const pool of pools) if (pool[round] && picked.length < most) picked.push({ ...pool[round]!, id: uid("q") });
  }
  return { id: uid("game"), title: series, description: "", kind: "quiz", questions: picked, updatedAt: new Date().toISOString(), series };
}

/** A question the room can run: words, two or more answers, and (in a quiz) the right one. */
export function ready(question: GameQuestion, kind: Game["kind"]): boolean {
  const choices = question.choices.filter((choice) => choice.trim());
  return question.prompt.trim().length > 0 && choices.length >= 2 && (kind === "poll" || (question.correct !== null && !!question.choices[question.correct]?.trim()));
}

export function blankQuestion(): GameQuestion {
  return { id: uid("q"), prompt: "", choices: ["", "", "", ""], correct: 0, seconds: 20, points: 1000 };
}

export function newGame(title = "New game"): Game {
  return { id: uid("game"), title, description: "", kind: "quiz", questions: [blankQuestion()], updatedAt: new Date().toISOString() };
}

/** Mix the answers (the right one keeps being right). */
/** A fair shuffle (Fisher–Yates): every order equally likely. */
export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** How a game is played each time: how many of its questions (0, all), and in a new order or as written. */
export type PlaySettings = { count: number; mix: boolean };

/** A quiz mixes its questions each time; a poll keeps the order it was written in. */
export const defaultPlay = (game: Game): PlaySettings => ({ count: 0, mix: game.kind === "quiz" });

/**
 * The questions for one play: the ready ones, mixed when the settings say, and only `count` of them
 * when the pool has more. Questions asked last time (`asked`, by their words) come last, so a
 * replay asks ones the room has not just seen, until the pool runs out.
 */
export function drawQuestions(game: Game, settings: PlaySettings, asked: readonly string[] = [], random = Math.random): GameQuestion[] {
  const pool = game.questions.filter((question) => ready(question, game.kind));
  const ordered = settings.mix ? shuffle(pool, random) : pool;
  const count = settings.count > 0 ? Math.min(settings.count, pool.length) : pool.length;
  if (count >= pool.length || !asked.length) return ordered.slice(0, count);
  const seen = new Set(asked);
  const fresh = ordered.filter((question) => !seen.has(question.prompt));
  const again = ordered.filter((question) => seen.has(question.prompt));
  return [...fresh, ...again].slice(0, count);
}

export function shuffled(question: GameQuestion, random = Math.random): GameQuestion {
  const order = shuffle(question.choices.map((_, index) => index), random);
  return { ...question, choices: order.map((index) => question.choices[index]!), correct: question.correct === null ? null : order.indexOf(question.correct) };
}

const q = (prompt: string, choices: string[], correct: number | null = 0, seconds = 20, points = 1000): GameQuestion => ({ id: uid("q"), prompt, choices, correct, seconds, points });
const game = (id: string, title: string, description: string, questions: GameQuestion[], kind: Game["kind"] = "quiz", anonymous = false): Game => ({ id: `builtin:${id}`, title, description, kind, questions, updatedAt: "2026-10-22T00:00:00.000Z", ...(anonymous ? { anonymous: true } : {}) });
const poll = (prompt: string, choices: string[], seconds = 30) => q(prompt, choices, null, seconds, 0);

/** Ready to play: each answer here checked against the Bible text (the right answer is listed first, and mixed when played). */
export const BUILT_IN_GAMES: Game[] = [
  game("bible-basics", "Bible basics", "Ten questions for everyone, young and old.", [
    q("Who built the ark?", ["Noah", "Moses", "Abraham", "David"]),
    q("How many days and nights did it rain in the flood?", ["Forty", "Seven", "Twelve", "Three"]),
    q("Who was swallowed by a great fish?", ["Jonah", "Peter", "Elijah", "Paul"]),
    q("What did David use to defeat Goliath?", ["A sling and a stone", "A sword", "A spear", "His bare hands"]),
    q("In which town was Jesus born?", ["Bethlehem", "Nazareth", "Jerusalem", "Capernaum"]),
    q("How many disciples did Jesus choose?", ["Twelve", "Seven", "Ten", "Seventy"]),
    q("Who denied Jesus three times?", ["Peter", "Judas", "Thomas", "John"]),
    q("What was Jesus' first miracle in John's gospel?", ["Water turned into wine", "Feeding the five thousand", "Walking on water", "Healing a blind man"]),
    q("Who led the Israelites out of Egypt?", ["Moses", "Joshua", "Aaron", "Joseph"]),
    q("What is the first book of the Bible?", ["Genesis", "Exodus", "Matthew", "Psalms"]),
  ]),
  game("who-said-it", "Who said it?", "Name the person who spoke these words.", [
    q("“Here am I; send me.”", ["Isaiah", "Jeremiah", "Moses", "Samuel"], 0, 25),
    q("“Speak; for thy servant heareth.”", ["Samuel", "Eli", "David", "Solomon"], 0, 25),
    q("“Whither thou goest, I will go.”", ["Ruth", "Naomi", "Esther", "Mary"], 0, 25),
    q("“Am I my brother's keeper?”", ["Cain", "Abel", "Esau", "Joseph"], 0, 25),
    q("“As for me and my house, we will serve the Lord.”", ["Joshua", "Moses", "Caleb", "Gideon"], 0, 25),
    q("“Be it unto me according to thy word.”", ["Mary", "Elizabeth", "Martha", "Hannah"], 0, 25),
    q("“My Lord and my God.”", ["Thomas", "Peter", "John", "Philip"], 0, 25),
    q("“I have fought a good fight, I have finished my course.”", ["Paul", "Peter", "Timothy", "Stephen"], 0, 25),
  ]),
  game("true-or-false", "True or false", "Quick questions: true or false?", [
    q("Moses received the Ten Commandments on Mount Sinai.", ["True", "False"], 0, 12, 500),
    q("Jesus was baptised by Peter.", ["True", "False"], 1, 12, 500),
    q("Paul wrote the letter to the Romans.", ["True", "False"], 0, 12, 500),
    q("Daniel was thrown into a den of lions.", ["True", "False"], 0, 12, 500),
    q("Jonah was swallowed by a whale in the Book of Jonah.", ["True", "False"], 1, 15, 500),
    q("Solomon built the temple in Jerusalem.", ["True", "False"], 0, 12, 500),
    q("There are 27 books in the New Testament.", ["True", "False"], 0, 12, 500),
    q("Elijah went up to heaven in a whirlwind.", ["True", "False"], 0, 12, 500),
  ]),
  game("bible-places", "Bible places", "Where did it happen?", [
    q("Where did Jesus turn water into wine?", ["Cana", "Bethany", "Jericho", "Nazareth"]),
    q("Which city's walls fell after the Israelites marched around it?", ["Jericho", "Jerusalem", "Babylon", "Nineveh"]),
    q("To which city was Jonah sent to preach?", ["Nineveh", "Tarshish", "Babylon", "Damascus"]),
    q("On the road to which city was Saul blinded by a light?", ["Damascus", "Jerusalem", "Antioch", "Rome"]),
    q("Where was Jesus crucified?", ["Golgotha", "Gethsemane", "Mount Sinai", "Mount Carmel"]),
    q("In which river was Jesus baptised?", ["Jordan", "Nile", "Euphrates", "Tigris"]),
    q("Where did Elijah call down fire from heaven against the prophets of Baal?", ["Mount Carmel", "Mount Sinai", "Mount of Olives", "Mount Zion"]),
  ]),
  game("bible-timeline", "Bible timeline", "Which came first?", [
    q("Which came first?", ["The flood", "The Exodus from Egypt", "King David's reign", "The exile to Babylon"]),
    q("Which came first?", ["Abraham's call", "Moses at the burning bush", "Samuel anointing Saul", "Nehemiah rebuilding the walls"]),
    q("Which came first?", ["The Ten Commandments", "The fall of Jericho", "Solomon's temple", "Daniel in the lions' den"]),
    q("Which came first?", ["Jesus' baptism", "The feeding of the five thousand", "The Last Supper", "Pentecost"]),
    q("Which came first?", ["Joseph sold into Egypt", "The Red Sea parting", "Ruth gleaning in Boaz's field", "Elijah on Mount Carmel"]),
    q("Which came first?", ["Pentecost", "Saul on the road to Damascus", "Paul's shipwreck on Malta", "The letter to the Romans written"]),
  ]),
  game("worship-poll", "Pick the closing song", "A poll: let the congregation choose.", [q("Which song shall we close with?", ["Amazing Grace", "How Great Thou Art", "Great Is Thy Faithfulness", "Blessed Assurance"], null, 30, 0)], "poll"),
  game("poll-feedback", "How was today?", "Anonymous feedback after the service.", [
    poll("How did today's service help you?", ["It encouraged me", "It challenged me", "I learned something new", "I'm still thinking about it"]),
    poll("How was the length of the service?", ["Too short", "Just right", "A little long", "Too long"]),
    poll("Would you invite a friend next Sunday?", ["Yes, already have one in mind", "Maybe", "Not yet"]),
  ], "poll", true),
  game("poll-icebreaker", "Get to know the room", "Light questions to warm everyone up.", [
    poll("How did you get to church today?", ["Walked", "Car", "Bus or train", "Watching online"], 20),
    poll("How long have you been coming here?", ["First visit!", "Less than a year", "1 to 5 years", "Longer than that"], 20),
    poll("Which Bible character would you have coffee with?", ["Peter", "Mary", "David", "Paul"], 20),
  ], "poll"),
  game("poll-prayer", "What shall we pray for?", "Let the room set this week's prayer focus. Anonymous.", [
    poll("What should we pray for together this week?", ["Families", "Health and healing", "Work and finances", "Our city and nation"]),
  ], "poll", true),
  game("poll-next-series", "Choose the next series", "Let the church pick what the preaching covers next.", [
    poll("Which book should we study next?", ["Psalms", "Acts", "Romans", "Revelation"]),
    poll("When suits you for a midweek group?", ["Tuesday evening", "Wednesday evening", "Saturday morning", "I can't join one"]),
  ], "poll"),
  game("poll-event", "Plan the church picnic", "Decide the details together.", [
    poll("Which date works best for the picnic?", ["First Saturday", "Second Saturday", "Last Saturday"]),
    poll("What should we eat?", ["Barbecue", "Bring and share", "Jollof and chicken", "Sandwiches"]),
    poll("Which activity would you join?", ["Football", "Tug of war", "Board games", "Just chatting"]),
  ], "poll"),
];

// --- Made from the Bible on this computer ------------------------------------------------------

/** Verses people know, for games made from the installed Bible. */
export const WELL_KNOWN: Array<{ book: number; chapter: number; verse: number }> = [
  { book: 1, chapter: 1, verse: 1 }, { book: 19, chapter: 23, verse: 1 }, { book: 19, chapter: 46, verse: 1 }, { book: 19, chapter: 119, verse: 105 },
  { book: 20, chapter: 3, verse: 5 }, { book: 23, chapter: 40, verse: 31 }, { book: 24, chapter: 29, verse: 11 }, { book: 25, chapter: 3, verse: 23 },
  { book: 6, chapter: 1, verse: 9 }, { book: 33, chapter: 6, verse: 8 }, { book: 40, chapter: 5, verse: 14 }, { book: 40, chapter: 11, verse: 28 },
  { book: 40, chapter: 28, verse: 19 }, { book: 43, chapter: 3, verse: 16 }, { book: 43, chapter: 14, verse: 6 }, { book: 43, chapter: 11, verse: 35 },
  { book: 45, chapter: 8, verse: 28 }, { book: 45, chapter: 12, verse: 2 }, { book: 46, chapter: 13, verse: 4 }, { book: 48, chapter: 5, verse: 22 },
  { book: 49, chapter: 2, verse: 8 }, { book: 50, chapter: 4, verse: 13 }, { book: 58, chapter: 11, verse: 1 }, { book: 59, chapter: 1, verse: 22 },
  { book: 62, chapter: 4, verse: 8 }, { book: 66, chapter: 21, verse: 4 }, { book: 2, chapter: 20, verse: 3 }, { book: 4, chapter: 6, verse: 24 },
];

const pick = <T>(list: T[], count: number, random: () => number): T[] => [...list].sort(() => random() - 0.5).slice(0, count);

/**
 * "Which book is this from?": the verse's words, and its book among others near it in the Bible.
 * `verses` are the verses read from the installed translation; `books` its book names in order.
 */
export function whichBookGame(verses: Array<{ book: number; text: string }>, books: string[], random = Math.random, count = 8): Game {
  const questions = pick(verses.filter((verse) => verse.text && books[verse.book - 1]), count, random).map((verse) => {
    const right = books[verse.book - 1]!;
    const others = pick(books.filter((name) => name !== right), 3, random);
    return shuffled(q(`“${verse.text.trim()}”`, [right, ...others], 0, 25), random);
  });
  return { id: "made:which-book", title: "Which book?", description: "Name the book each verse comes from.", kind: "quiz", questions, updatedAt: new Date().toISOString() };
}

/**
 * "Finish the verse": the start of a verse, and its true ending among the endings of other verses.
 */
export function finishTheVerseGame(verses: Array<{ reference: string; text: string }>, random = Math.random, count = 8): Game {
  const split = (text: string) => {
    const words = text.trim().split(/\s+/);
    const cut = Math.max(3, Math.floor(words.length * 0.55));
    return { start: words.slice(0, cut).join(" "), end: words.slice(cut).join(" ") };
  };
  const usable = verses.filter((verse) => verse.text.trim().split(/\s+/).length >= 8);
  const questions = pick(usable, count, random).map((verse) => {
    const { start, end } = split(verse.text);
    const others = pick(usable.filter((other) => other !== verse), 3, random).map((other) => split(other.text).end);
    return shuffled(q(`${verse.reference}: “${start} …”`, [`… ${end}`, ...others.map((ending) => `… ${ending}`)], 0, 30), random);
  });
  return { id: "made:finish-verse", title: "Finish the verse", description: "Choose how each verse ends.", kind: "quiz", questions, updatedAt: new Date().toISOString() };
}

/**
 * Questions typed or pasted as plain text, one block per question with a blank line between:
 *
 *   Who built the ark?
 *   * Noah
 *   Moses
 *   Abraham
 *
 * The first line is the question and each line after it an answer. The right one is marked with a
 * star (or ✓, or "(right)") or named on an "Answer: B" line; without a mark the first answer is
 * right. Numbers and letters in front ("1.", "a)", "- ") are left out. In a poll nothing is right.
 */
export function questionsFromText(text: string, kind: Game["kind"] = "quiz"): GameQuestion[] {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  const questions: GameQuestion[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length < 3) continue;
    const prompt = lines[0]!.replace(/^(?:q(?:uestion)?\s*)?\d+\s*[.):-]\s*/i, "").trim();
    let correct: number | null = null;
    let answerLine = "";
    const choices: string[] = [];
    for (const raw of lines.slice(1)) {
      const answer = raw.match(/^(?:answer|right answer|correct)\s*[:=-]\s*(.+)$/i);
      if (answer) {
        answerLine = answer[1]!.trim();
        continue;
      }
      let line = raw;
      let marked = false;
      if (/^[*✓✔]/.test(line)) {
        marked = true;
        line = line.replace(/^[*✓✔]\s*/, "");
      }
      if (/(?:\s[*✓✔]|\((?:right|correct)\))$/i.test(line)) {
        marked = true;
        line = line.replace(/\s*(?:[*✓✔]|\((?:right|correct)\))$/i, "");
      }
      line = line.replace(/^(?:[a-f]\s*[.)]|[-•]|\d+\s*[.)])\s*/i, "").trim();
      if (!line || choices.length >= MOST_CHOICES) continue;
      if (marked && correct === null) correct = choices.length;
      choices.push(line.slice(0, 120));
    }
    if (choices.length < 2 || !prompt) continue;
    if (correct === null && answerLine) {
      const letter = answerLine.match(/^([a-f])\W*$/i);
      const byLetter = letter ? letter[1]!.toLowerCase().charCodeAt(0) - 97 : -1;
      const byText = choices.findIndex((choice) => choice.toLowerCase() === answerLine.toLowerCase());
      correct = byLetter >= 0 && byLetter < choices.length ? byLetter : byText >= 0 ? byText : null;
    }
    questions.push({ id: uid("q"), prompt: prompt.slice(0, 300), choices, correct: kind === "poll" ? null : (correct ?? 0), seconds: 20, points: 1000 });
    if (questions.length >= MOST_QUESTIONS) break;
  }
  return questions;
}

/** A question as text in the same shape questionsFromText reads, for copying a game out. */
export function questionsAsText(game: Game): string {
  return game.questions
    .map((question) => [question.prompt, ...question.choices.filter((choice) => choice.trim()).map((choice, index) => (game.kind === "quiz" && question.correct === index ? `* ${choice}` : choice))].join("\n"))
    .join("\n\n");
}
