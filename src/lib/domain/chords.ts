// Chords for the band: kept from ChordPro files ("[G]Amazing [C]grace"), never on the audience
// screen, shown above the words on the stage screen, and transposed there per song.

/** A chord placed at a character position in its lyric line. */
export type PlacedChord = { at: number; chord: string };
export type ChordLine = { lyric: string; chords: PlacedChord[] };

const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE = /^([A-G])([#b]?)/;

/** A ChordPro line read into its words and where each chord sits. */
export function readChordLine(line: string): ChordLine {
  const chords: PlacedChord[] = [];
  let lyric = "";
  for (const part of line.split(/(\[[^\]]*\])/)) {
    const chord = /^\[([^\]]*)\]$/.exec(part)?.[1]?.trim();
    if (chord !== undefined) {
      if (chord) chords.push({ at: lyric.length, chord });
    } else lyric += part;
  }
  return { lyric: lyric.replace(/\s{2,}/g, " "), chords };
}

/** Whether a line holds any chord. */
export const hasChords = (line: string) => /\[[^\]]+\]/.test(line);

function moveNote(note: string, semitones: number, flats: boolean): string {
  const match = NOTE.exec(note);
  if (!match) return note;
  const name = match[1]! + match[2]!;
  const index = SHARPS.indexOf(name) >= 0 ? SHARPS.indexOf(name) : FLATS.indexOf(name);
  if (index < 0) return note;
  const moved = (((index + semitones) % 12) + 12) % 12;
  return (flats ? FLATS : SHARPS)[moved]! + note.slice(name.length);
}

/** One chord moved by `semitones` ("F#m7/C#" +2 → "G#m7/D#"); a slash bass moves too. */
export function transposeChord(chord: string, semitones: number, flats = false): string {
  if (!semitones) return chord;
  return chord
    .split("/")
    .map((part) => moveNote(part, semitones, flats))
    .join("/");
}

/** Flats read better in flat keys (F, Bb, Eb…): the transposed song uses them when its first chord does. */
export function prefersFlats(firstChord: string | undefined, semitones: number): boolean {
  if (!firstChord) return false;
  const key = transposeChord(firstChord.split("/")[0]!.replace(/m(?!aj).*$/, ""), semitones, true);
  return /^(F|Bb|Eb|Ab|Db|Gb)$/.test(key.replace(/[^A-Gb#]/g, "")) || (firstChord.includes("b") && !firstChord.includes("#"));
}

/** A line's chords transposed. */
export function transposeLine(line: ChordLine, semitones: number, flats = false): ChordLine {
  return semitones ? { lyric: line.lyric, chords: line.chords.map((placed) => ({ at: placed.at, chord: transposeChord(placed.chord, semitones, flats) })) } : line;
}

/**
 * The stage's chord lines for one song part: the chord lines in `range` (one screen, line by line),
 * blank lines left out, transposed by the song's setting. Empty when the part has no chords.
 */
export function stageChords(section: { lines: string[]; chords?: string[] }, transpose = 0, range?: { from: number; to: number }, allChordLines: string[] = section.chords ?? []): ChordLine[] {
  if (!section.chords) return [];
  const flats = prefersFlats(firstChord(allChordLines), transpose);
  const out: ChordLine[] = [];
  section.lines.forEach((line, n) => {
    if (range && (n < range.from || n >= range.to)) return;
    if (!line.trim()) return;
    const chordLine = section.chords![n];
    out.push(chordLine ? transposeLine(readChordLine(chordLine), transpose, flats) : { lyric: line, chords: [] });
  });
  return out;
}

/** The first chord of a song's chord lines (its likely key). */
export function firstChord(lines: string[]): string | undefined {
  for (const line of lines) {
    const found = readChordLine(line).chords[0];
    if (found) return found.chord;
  }
  return undefined;
}
