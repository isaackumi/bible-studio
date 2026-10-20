// Prints the GitHub release notes for the version in package.json, from src/lib/domain/changelog.ts
// (the same words as the app's What's new card). Used by .github/workflows/release.yml:
//   npx vite-node scripts/release-notes.ts
import { readFileSync } from "node:fs";
import { releaseNotes } from "../src/lib/domain/changelog";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
process.stdout.write(`${releaseNotes(version)}\n`);
