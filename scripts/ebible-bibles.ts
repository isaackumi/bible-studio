// Openly licensed Bibles from eBible.org (CC BY-SA 4.0), turned into the app's Bible files for the
// optional downloads in Settings › Bible. Run: node scripts/ebible-bibles.ts <out-dir>
// It downloads each Bible's verse-per-line file, puts the books in the app's order, tidies each verse
// with the app's own rules, and prints each file's size and SHA-256 for src/lib/bible/texts.ts.
// The text itself is unchanged: only stored by book, chapter and verse.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanVerse } from "../src/lib/bible/clean.ts";

const IDS = ["ewe", "yor", "ibo", "hausa", "twiasante"];

/** eBible's book codes, in the app's canon order (Genesis … Revelation). */
const ORDER = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SOL",
  "ISA", "JER", "LAM", "EZE", "DAN", "HOS", "JOE", "AMO", "OBA", "JON", "MIC", "NAH", "HAB", "ZEP", "HAG", "ZEC", "MAL",
  "MAT", "MAR", "LUK", "JOH", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHI", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAM", "1PE", "2PE", "1JO", "2JO", "3JO", "JUD", "REV",
];

const out = process.argv[2];
if (!out) throw new Error("Usage: node scripts/ebible-bibles.ts <out-dir>");
mkdirSync(out, { recursive: true });

for (const id of IDS) {
  const work = join(out, `${id}-src`);
  mkdirSync(work, { recursive: true });
  const zip = join(work, `${id}_vpl.zip`);
  execFileSync("curl", ["-sSL", "-o", zip, `https://ebible.org/Scriptures/${id}_vpl.zip`]);
  execFileSync("unzip", ["-o", "-q", zip, "-d", work]);
  const file = readdirSync(work).find((name) => name.endsWith("_vpl.txt"));
  if (!file) throw new Error(`${id}: no verse file`);
  const books = new Map<string, string[][]>(ORDER.map((code) => [code, []]));
  let verses = 0;
  for (const line of readFileSync(join(work, file), "utf8").split(/\r?\n/)) {
    const match = /^([0-9A-Z]{3}) (\d+):(\d+) (.*)$/.exec(line);
    if (!match) continue;
    const chapters = books.get(match[1]!);
    if (!chapters) continue; // Books outside the 66 (none in these Bibles) are left out.
    const chapter = Number(match[2]) - 1;
    const verse = Number(match[3]) - 1;
    chapters[chapter] ??= [];
    chapters[chapter]![verse] = cleanVerse(match[4]!.trim());
    verses += 1;
  }
  // A verse joined to the one before it in this translation stays empty rather than shifting the rest.
  let gaps = 0;
  const result = ORDER.map((code) => ({
    chapters: books.get(code)!.map((chapter) => Array.from({ length: chapter?.length ?? 0 }, (_, index) => {
      const text = chapter?.[index];
      if (text === undefined) gaps += 1;
      return text ?? "";
    })),
  }));
  const missing = ORDER.filter((code) => books.get(code)!.length === 0);
  const json = JSON.stringify(result);
  writeFileSync(join(out, `${id}.json`), json);
  const sha = createHash("sha256").update(json).digest("hex");
  console.log(`${id}: ${verses} verses, ${gaps} joined, ${missing.length ? `missing ${missing.join(" ")}` : "all 66 books"} · ${json.length} bytes · sha256 ${sha}`);
}
