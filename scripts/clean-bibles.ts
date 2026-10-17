// Clean the bundled Bible files in place with the app's own rules (src/lib/bible/clean.ts).
// Run: node scripts/clean-bibles.ts   (Node 22.6+ runs TypeScript directly)
import { readFileSync, writeFileSync } from "node:fs";
import { cleanVerse } from "../src/lib/bible/clean.ts";

for (const id of ["kjv", "asv", "web", "bbe"]) {
  const path = new URL(`../src-tauri/resources/${id}.json`, import.meta.url);
  const books = JSON.parse(readFileSync(path, "utf8")) as { chapters: string[][] }[];
  let changed = 0;
  for (const book of books) {
    book.chapters = book.chapters.map((verses) =>
      verses.map((text) => {
        const next = cleanVerse(text);
        if (next !== text) changed += 1;
        return next;
      }),
    );
  }
  writeFileSync(path, JSON.stringify(books));
  console.log(`${id}: ${changed} verses tidied`);
}
