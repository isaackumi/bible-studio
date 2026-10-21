// Words the speech recognizer mishears, put right before anything else reads them: the transcript,
// captions, voice commands and verse finding all see "Ephesians 4" instead of "efficient 4".
//
// A Bible book is put right only where a book makes sense: followed by a chapter number ("efficient
// 4", "efficient chapter 4") or after words that lead to one ("turn to efficient"). So a pastor who
// says "an efficient church" keeps the word. Common English words that sound like a book ("some" for
// Psalms) need more: a cue before, or a chapter and verse after ("some 23 verse 1").
//
// Three lists, in this order: the church's own words (added in Settings › Voice, or learned when the
// operator puts up the passage that was misheard), then the built-in list of common mishearings
// across accents (Ghana, Nigeria and elsewhere).

import { CANON } from "../bible/reference";

export type WordFix = {
  /** What the recognizer writes, lower case ("efficient"). */
  heard: string;
  /** What was said ("Ephesians", or a name such as "Pastor Quaye"). */
  means: string;
  /** Added by someone at the church, or learned from the operator. */
  source: "yours" | "learned";
  /** Times it was put right. */
  uses?: number;
  /** When it was added (ms). */
  at?: number;
};

export type Applied = { heard: string; means: string };

/**
 * Common mishearings of book names. [heard, book, loose]: `loose` marks ordinary English words
 * ("some", "look") that need a stronger sign that a book was meant.
 */
export const BUILT_IN_FIXES: ReadonlyArray<readonly [string, string, boolean?]> = [
  ["jenna says", "Genesis"], ["genisis", "Genesis"], ["genesys", "Genesis"],
  ["exodos", "Exodus"], ["exorbus", "Exodus"],
  ["leviticas", "Leviticus"], ["levi ticus", "Leviticus"], ["leave a ticket", "Leviticus"],
  ["due to run me", "Deuteronomy"], ["deutronomy", "Deuteronomy"], ["duteronomy", "Deuteronomy"], ["dueteronomy", "Deuteronomy"], ["deuteronomi", "Deuteronomy"],
  ["josh where", "Joshua"], ["joshwa", "Joshua"],
  ["root", "Ruth", true], ["roof", "Ruth", true], ["truth", "Ruth", true],
  ["sam well", "Samuel"], ["samwell", "Samuel"], ["samual", "Samuel"],
  ["chronicle", "Chronicles"], ["chronical", "Chronicles"], ["chronicals", "Chronicles"],
  ["nehemaya", "Nehemiah"], ["knee a maya", "Nehemiah"], ["nehimiah", "Nehemiah"],
  ["easter", "Esther", true], ["ester", "Esther"],
  ["jobs", "Job", true],
  ["sams", "Psalms"], ["salms", "Psalms"], ["salm", "Psalms"], ["palms", "Psalms", true], ["some", "Psalms", true], ["sum", "Psalms", true],
  ["prover's", "Proverbs"], ["proverbes", "Proverbs"],
  ["ecclesiastic", "Ecclesiastes"], ["ecclesiastics", "Ecclesiastes"], ["eclesiastes", "Ecclesiastes"], ["ecclesiastis", "Ecclesiastes"],
  ["i sayer", "Isaiah"], ["isaya", "Isaiah"], ["is aya", "Isaiah"], ["isiah", "Isaiah"], ["i say a", "Isaiah"],
  ["jerry maya", "Jeremiah"], ["jeremaya", "Jeremiah"], ["jeremia", "Jeremiah"],
  ["lamentation", "Lamentations"],
  ["is a kiel", "Ezekiel"], ["easy kill", "Ezekiel"], ["ezekeil", "Ezekiel"], ["ezekial", "Ezekiel"],
  ["daniels", "Daniel"],
  ["hosaya", "Hosea"], ["ho say a", "Hosea"], ["hozier", "Hosea"],
  ["a moss", "Amos"], ["amose", "Amos"],
  ["obadaya", "Obadiah"], ["oba diah", "Obadiah"],
  ["jona", "Jonah"],
  ["mica", "Micah"], ["mika", "Micah"],
  ["nahoom", "Nahum"],
  ["have a cook", "Habakkuk"], ["habakuk", "Habakkuk"], ["harbor cook", "Habakkuk"], ["habbakuk", "Habakkuk"],
  ["zephania", "Zephaniah"], ["stephanie a", "Zephaniah"],
  ["hag eye", "Haggai"], ["haggay", "Haggai"],
  ["zachariah", "Zechariah"], ["zacharia", "Zechariah"], ["zecharia", "Zechariah"],
  ["malaki", "Malachi"], ["malakai", "Malachi"],
  ["mathew", "Matthew"], ["matthews", "Matthew"], ["math you", "Matthew"],
  ["look", "Luke", true], ["luck", "Luke", true],
  ["johns", "John"],
  ["ax", "Acts", true], ["axe", "Acts", true],
  ["roman", "Romans"], ["romance", "Romans"],
  ["corinthian", "Corinthians"], ["carinthians", "Corinthians"], ["karen thians", "Corinthians"], ["corinthias", "Corinthians"], ["korintians", "Corinthians"],
  ["galatian", "Galatians"], ["gallations", "Galatians"], ["glacians", "Galatians"], ["collations", "Galatians"], ["galations", "Galatians"],
  ["efficient", "Ephesians"], ["efficiency", "Ephesians"], ["ephesian", "Ephesians"], ["a fee shans", "Ephesians"], ["he feasions", "Ephesians"], ["efesians", "Ephesians"], ["ephesus", "Ephesians"],
  ["philippines", "Philippians"], ["philippine", "Philippians"], ["filipino", "Philippians"], ["filipinos", "Philippians"], ["philipina", "Philippians"], ["philippina", "Philippians"], ["filipina", "Philippians"], ["philipians", "Philippians"], ["fill a pians", "Philippians"], ["philippian", "Philippians"],
  ["colossian", "Colossians"], ["collisions", "Colossians"], ["colossus", "Colossians"], ["colosians", "Colossians"],
  ["thessalonian", "Thessalonians"], ["tesla nians", "Thessalonians"], ["thessalonica", "Thessalonians"], ["thesalonians", "Thessalonians"],
  ["timoty", "Timothy"], ["tim a thee", "Timothy"],
  ["tight us", "Titus"], ["tightest", "Titus"],
  ["fill a mon", "Philemon"], ["philamon", "Philemon"], ["filemon", "Philemon"],
  ["he brews", "Hebrews"], ["hebrew", "Hebrews"],
  ["pita", "Peter"], ["peta", "Peter"],
  ["dude", "Jude", true],
  ["revolution", "Revelation"], ["revelation's", "Revelation"],
  // West African English: "th" said as "t" or "d", "v" as "b", endings shortened, vowels moved.
  ["levitikus", "Leviticus"], ["numba", "Numbers"], ["numbas", "Numbers"], ["jodges", "Judges"], ["samwel", "Samuel"],
  ["kronicles", "Chronicles"], ["cronicles", "Chronicles"], ["estah", "Esther"], ["psams", "Psalms"], ["provabs", "Proverbs"],
  ["eklesiastes", "Ecclesiastes"], ["ecclesiates", "Ecclesiastes"], ["aizaya", "Isaiah"], ["izaya", "Isaiah"], ["jeremiar", "Jeremiah"],
  ["lamentashons", "Lamentations"], ["ezikiel", "Ezekiel"], ["ezekeel", "Ezekiel"], ["hosia", "Hosea"], ["jowel", "Joel"], ["obadia", "Obadiah"],
  ["maika", "Micah"], ["nehum", "Nahum"], ["habakook", "Habakkuk"], ["sefaniah", "Zephaniah"], ["sephaniah", "Zephaniah"], ["hagai", "Haggai"],
  ["zakaria", "Zechariah"], ["sakaria", "Zechariah"], ["malakay", "Malachi"], ["matiu", "Matthew"], ["mattew", "Matthew"], ["jon", "John"],
  ["rumans", "Romans"], ["korinthians", "Corinthians"], ["corintians", "Corinthians"], ["galeshians", "Galatians"], ["galasians", "Galatians"],
  ["efesian", "Ephesians"], ["efizians", "Ephesians"], ["ifeshans", "Ephesians"], ["filipians", "Philippians"], ["pilipians", "Philippians"],
  ["kolosians", "Colossians"], ["colosseans", "Colossians"], ["tessalonians", "Thessalonians"], ["tesalonians", "Thessalonians"], ["dessalonians", "Thessalonians"],
  ["timoti", "Timothy"], ["timothi", "Timothy"], ["taitus", "Titus"], ["filimon", "Philemon"], ["hibrus", "Hebrews"], ["hebrus", "Hebrews"],
  ["jems", "James"], ["pitah", "Peter"], ["peeta", "Peter"], ["rebelation", "Revelation"], ["revalation", "Revelation"], ["revilation", "Revelation"],
  // Whisper (accurate listening) sometimes drops letters at the end of a long name.
  ["habakkk", "Habakkuk"], ["habakkah", "Habakkuk"], ["habak", "Habakkuk"], ["zeck and rive", "Zechariah"], ["zeck and riah", "Zechariah"], ["ecclesiast", "Ecclesiastes"], ["ecclesias", "Ecclesiastes"], ["deuteronom", "Deuteronomy"], ["thessalon", "Thessalonians"],
  // The words around a reference: "chapta 4", "vas 16".
  ["chapta", "chapter"], ["chapto", "chapter"], ["chepter", "chapter"], ["vas", "verse"], ["veses", "verses"],
  // "First Corinthians" heard as "fast Corinthians", and so on for every numbered book.
  ...(["Samuel", "Kings", "Chronicles", "Corinthians", "Thessalonians", "Timothy", "Peter", "John"] as const).flatMap((book) =>
    ([["fast", 1], ["farst", 1], ["secon", 2], ["sekon", 2], ["tird", 3], ["thud", 3]] as const)
      .filter(([, volume]) => volume < 3 || book === "John")
      .map(([said, volume]) => [`${said} ${book.toLowerCase()}`, `${volume} ${book}`] as const),
  ),
];

/** Ordinary words never learned as a book on their own, however often they come before a number. */
const NEVER_LEARN = new Set(["the", "to", "in", "of", "and", "at", "chapter", "verse", "verses", "turn", "open", "read", "from", "go", "page", "number", "hymn", "song", "step", "point", "minute", "minutes", "hour", "hours", "day", "days", "year", "years", "people", "times", "time"]);

const NUMBER = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)";
const CHAPTER_AFTER = new RegExp(`^\\s*(?:chapter\\s+)?${NUMBER}\\b`, "i");
const STRONG_AFTER = new RegExp(`^\\s*(?:chapter\\s+${NUMBER}\\b|${NUMBER}\\s*(?::\\s*\\d+|\\s+(?:verses?|vs)\\s+${NUMBER}\\b))`, "i");
const CUE_BEFORE = /(?:book of|turn (?:with me )?to|open (?:your bibles? )?to|read(?:ing)? from|go to|look at)\s+(?:the\s+)?(?:(?:first|second|third|1st|2nd|3rd|1|2|3)\s+)?$/i;

// Full names, and the shared name of numbered books ("Samuel" for 1 and 2 Samuel).
const BOOK_NAMES = new Map([...CANON.map((book) => [book.name.toLowerCase().replace(/^\d\s+/, ""), book.name.replace(/^\d\s+/, "")] as const), ...CANON.map((book) => [book.name.toLowerCase(), book.name] as const)]);
const BOOK_WORDS = new Set(CANON.flatMap((book) => book.aliases));
const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A book's name for "Ephesians", "ephesians" or "1 John"; null when it is not a book. */
export function bookNamed(value: string): string | null {
  const plain = clean(value).replace(/^(?:1|2|3|first|second|third)\s+/, "");
  return BOOK_NAMES.get(clean(value)) ?? BOOK_NAMES.get(plain) ?? (BOOK_WORDS.has(plain) ? (CANON.find((book) => book.aliases.includes(plain))?.name ?? null) : null);
}

type Rule = { heard: string; means: string; book: boolean; loose: boolean; pattern: RegExp };

const ruleCache = new WeakMap<readonly WordFix[], Rule[]>();
const NO_FIXES: WordFix[] = [];

function rules(fixes: readonly WordFix[]): Rule[] {
  const cached = ruleCache.get(fixes);
  if (cached) return cached;
  const yours = fixes.map((fix) => ({ heard: clean(fix.heard), means: fix.means.trim(), loose: isLoose(clean(fix.heard)) }));
  const builtIn = BUILT_IN_FIXES.map(([heard, means, loose]) => ({ heard, means, loose: loose === true }));
  const seen = new Set<string>();
  const built = [...yours, ...builtIn]
    .filter((rule) => rule.heard && rule.means && !seen.has(rule.heard) && seen.add(rule.heard))
    // Longest first, so "philippines" is tried before "philippine".
    .sort((a, b) => b.heard.length - a.heard.length)
    .map((rule) => ({ ...rule, book: !!bookNamed(rule.means), pattern: new RegExp(`\\b${escapeRe(rule.heard).replace(/ /g, "\\s+")}\\b`, "gi") }));
  ruleCache.set(fixes, built);
  return built;
}

/** Short or everyday words learned as a book need the stronger sign, like the built-in "some". */
function isLoose(heard: string): boolean {
  return heard.length <= 4 || ["some", "look", "luck", "root", "roof", "truth", "easter", "dude", "jobs", "palms"].includes(heard);
}

/**
 * Put right what the recognizer misheard. Book names change only where a book makes sense; other
 * words the church added (names, places) change everywhere.
 */
export function fixHeard(text: string, fixes: readonly WordFix[] = NO_FIXES): { text: string; applied: Applied[] } {
  if (!text) return { text, applied: [] };
  let out = text;
  const applied: Applied[] = [];
  for (const rule of rules(fixes)) {
    rule.pattern.lastIndex = 0;
    if (!rule.pattern.test(out)) continue;
    rule.pattern.lastIndex = 0;
    out = out.replace(rule.pattern, (match: string, offset: number, all: string) => {
      if (rule.book) {
        const after = all.slice(offset + match.length);
        const before = all.slice(0, offset);
        const cue = CUE_BEFORE.test(before);
        if (!cue && !(rule.loose ? STRONG_AFTER : CHAPTER_AFTER).test(after)) return match;
      }
      applied.push({ heard: rule.heard, means: rule.means });
      return rule.means;
    });
  }
  return { text: out, applied };
}

export type NearMiss = { words: string; chapter: number };

const SPOKEN_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Words that sat where a book name should be: the one or two words before a chapter number, when
 * no book was found in the phrase. If the operator then puts up that chapter, they were the book.
 */
export function nearMisses(text: string): NearMiss[] {
  const tokens = clean(text).split(" ").filter(Boolean);
  const misses: NearMiss[] = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const number = /^\d+$/.test(token) ? Number(token) : SPOKEN_NUMBERS[token];
    if (!number || number > 150) continue;
    let end = index;
    if (tokens[end - 1] === "chapter") end -= 1;
    const last = tokens[end - 1];
    if (!last || NEVER_LEARN.has(last) || /\d/.test(last) || SPOKEN_NUMBERS[last] || BOOK_WORDS.has(last)) continue;
    const previous = tokens[end - 2];
    // A short word on either side ("a feesh", "fee shans") is likely part of what was heard: keep both.
    const pair = previous && !NEVER_LEARN.has(previous) && !/\d/.test(previous) && !SPOKEN_NUMBERS[previous] && (last.length < 4 || previous.length <= 3);
    const words = pair ? `${previous} ${last}` : last;
    misses.push({ words, chapter: number });
  }
  return misses;
}

/** A misheard phrase and the passage the operator put up: the fix to learn, or null. */
export function learnFix(misses: NearMiss[], shown: { bookOrd: number; chapter: number }, fixes: readonly WordFix[]): WordFix | null {
  const book = CANON.find((entry) => entry.ord === shown.bookOrd);
  if (!book) return null;
  const miss = misses.find((item) => item.chapter === shown.chapter && item.chapter <= book.chapters);
  if (!miss || fixes.some((fix) => clean(fix.heard) === miss.words)) return null;
  // The numbered books keep their number in the words that were said ("first efficient"), so learn the name only.
  const means = book.name.replace(/^\d\s+/, "");
  return { heard: miss.words, means, source: "learned", uses: 0, at: Date.now() };
}

/** Words to tell the recognizer to expect: the church's own, then nothing else (book names are built in). */
export function expectedWords(fixes: readonly WordFix[]): string[] {
  return [...new Set(fixes.map((fix) => fix.means.trim()).filter((means) => means && !bookNamed(means)))].slice(0, 80);
}
