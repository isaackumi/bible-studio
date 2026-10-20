// What changed in each version, written once for people, not developers. It feeds the What's new
// card (shown once after an update), the update note on the desk, and the GitHub release notes
// (scripts/release-notes.ts). Add the new version at the top before tagging a release: three to five
// highlights, each one line a volunteer would understand.

import { msg } from "../i18n/core";

export type Highlight = { icon: string; title: string; text: string };
export type Release = { version: string; date: string; highlights: Highlight[] };

export const CHANGELOG: Release[] = [
  {
    version: "0.2.0",
    date: "2026-10-20",
    highlights: [
      { icon: "user", title: msg("Sign in, and your plan follows you"), text: msg("Optional. Sign in with an email link in your browser, and another computer only needs you to sign in. No key to copy.") },
      { icon: "key", title: msg("Plans and a free trial"), text: msg("Try Premium free for 14 days, then choose monthly or yearly from Settings › Account.") },
      { icon: "screens", title: msg("The audience screen waits for you"), text: msg("It opens when you first put something on Program, not as soon as Church Studio starts.") },
      { icon: "mic", title: msg("The microphone is asked for once"), text: msg("On a Mac, Church Studio now remembers your answer instead of asking again each time you listen.") },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-10-19",
    highlights: [{ icon: "sparkles", title: msg("Church Studio is here"), text: msg("Scripture, songs and sermons on screen, from one desk.") }],
  },
];

const parts = (version: string) => version.split(".").map((part) => Number.parseInt(part, 10) || 0);
/** -1, 0 or 1, comparing "0.10.0" after "0.9.0". */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

export function releaseFor(version: string, changelog = CHANGELOG): Release | null {
  return changelog.find((release) => compareVersions(release.version, version) === 0) ?? null;
}

/**
 * The card to show after an update: this version's highlights, once. A first install shows none
 * (setup already introduces the app), and neither does a version with nothing written for it.
 */
export function whatsNewFor(current: string, lastSeen: string | null, changelog = CHANGELOG): Release | null {
  if (!lastSeen || compareVersions(current, lastSeen) <= 0) return null;
  return releaseFor(current, changelog);
}

/** Markdown for a GitHub release. */
export function releaseNotes(version: string, changelog = CHANGELOG): string {
  const release = releaseFor(version, changelog);
  if (!release) return "Installed copies update from Settings › Updates.";
  return [
    "## What's new",
    "",
    ...release.highlights.map((highlight) => `- **${highlight.title}.** ${highlight.text}`),
    "",
    "Installed copies offer this update on the desk, or from Settings › Updates.",
  ].join("\n");
}
