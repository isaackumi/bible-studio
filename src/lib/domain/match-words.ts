// Forgiving word search for the song and sermon libraries: a typed word matches a library word
// exactly, as its start ("amaz" → "amazing"), or with a spelling slip ("grase" → "grace").

export function searchWords(text: string): string[] {
  return text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

/** Edits between two words; swapping two neighbouring letters ("trails"/"trials") is one. */
function editDistance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}

export function wordMatches(typed: string, word: string): boolean {
  if (word === typed) return true;
  if (typed.length >= 3 && word.startsWith(typed)) return true;
  if (typed.length < 4 || Math.abs(word.length - typed.length) > 2) return false;
  return editDistance(typed, word) <= (typed.length >= 7 ? 2 : 1);
}

/** How many typed words a set of library words holds. */
export function wordsFound(typed: string[], words: string[]): number {
  return typed.filter((word) => words.some((candidate) => wordMatches(word, candidate))).length;
}

/** Enough of the typed words to count as a match: all of one or two, all but one of more. */
export function wordsNeeded(typed: string[]): number {
  return typed.length <= 2 ? typed.length : typed.length - 1;
}
