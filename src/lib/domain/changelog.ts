// What changed in each version, written once for people, not developers. It feeds the What's new
// card (shown once after an update), the update note on the desk, and the GitHub release notes
// (scripts/release-notes.ts). Add the new version at the top before tagging a release: three to five
// highlights, each one line a volunteer would understand.

import { msg } from "../i18n/core";

export type Highlight = { icon: string; title: string; text: string };
export type Release = { version: string; date: string; highlights: Highlight[] };

export const CHANGELOG: Release[] = [
  {
    version: "0.3.0",
    date: "2026-10-22",
    highlights: [
      { icon: "user", title: msg("Sign in once, in your browser"), text: msg("Sign in comes back to Church Studio by itself, with no number to tap. From a phone or another computer, type the short code instead.") },
      { icon: "key", title: msg("Your plan goes with you"), text: msg("The free trial and license keys now belong to your account. Add your team by email in Settings › Account, and see every computer you are signed in on.") },
      { icon: "screens", title: msg("Steadier on Sunday"), text: msg("Installing a Bible, importing a video or starting to listen no longer freezes the desk or the projector, and quick clicks through verses always land on the right one.") },
      { icon: "layout", title: msg("Every screen shape"), text: msg("Looks with gaps or frames, theme previews and slide pages follow your screen's real shape, 4:3 and portrait included.") },
      { icon: "globe", title: msg("Clearer in French and Spanish"), text: msg("Desk messages are translated, and problems stand out as warnings in every language.") },
    ],
  },
  {
    version: "0.2.9",
    date: "2026-10-21",
    highlights: [
      { icon: "screens", title: msg("Two identical projectors work together"), text: msg("Two monitors of the same model are kept apart in Settings, the audience choice and Screens.") },
      { icon: "audio", title: msg("A steady Accurate listening download"), text: msg("Settings no longer flickers while the speech model downloads, and Cancel stops it at once.") },
      { icon: "folder", title: msg("Storage is easier to find"), text: msg("Space on this computer is now in Settings › Storage & backup.") },
    ],
  },
  {
    version: "0.2.8",
    date: "2026-10-21",
    highlights: [
      { icon: "bible", title: msg("Bibles in Ewe, Yorùbá, Igbo, Hausa and Asante Twi"), text: msg("Five more openly licensed Bibles in Settings › Bible, downloaded only when you choose one, then offline.") },
      { icon: "folder", title: msg("Space on this computer"), text: msg("Settings › Storage shows what Church Studio uses, finds pictures and videos nothing uses, and clears the cache or compacts the library.") },
      { icon: "audio", title: msg("Lighter Accurate listening"), text: msg("The speech model leaves memory a few minutes after you stop listening.") },
    ],
  },
  {
    version: "0.2.7",
    date: "2026-10-21",
    highlights: [
      { icon: "screens", title: msg("Screens with their own job"), text: msg("Give each extra monitor a job in Settings › Screens: a timer for the preacher, only scripture, only lyrics, or the stage view. Lock a screen so nothing changes it, or let each part of the service switch it.") },
      { icon: "check", title: msg("A start that never hangs"), text: msg("If Church Studio takes too long to start, it says why and lets you send the details to support.") },
    ],
  },
  {
    version: "0.2.6",
    date: "2026-10-21",
    highlights: [
      { icon: "mic", title: msg("Accurate listening"), text: msg("Choose Accurate in Settings › Sound & voice to listen with Whisper on this computer. It hears accents and Bible names better, and audio never leaves the computer. A one-time 60 MB download.") },
      { icon: "audio", title: msg("More accents understood"), text: msg("Nearly 250 common mishearings of book names are put right, including “fast Corinthians”, “Tessalonians” and “chapta”.") },
    ],
  },
  {
    version: "0.2.5",
    date: "2026-10-21",
    highlights: [
      { icon: "audio", title: msg("Verses heard right, in your accent"), text: msg("Words the recognizer mishears, like “efficient 4” for Ephesians 4, are put right before verses are found. It learns from what you put up, and Settings › Sound & voice › Words has a Practice to teach it.") },
      { icon: "list", title: msg("Each part runs where you choose"), text: msg("On the Service page, a part can use the running order, the Presenter desk, the Production desk or any mix, skip this week, and show a countdown or the leader’s name your way.") },
      { icon: "search", title: msg("Go to anything"), text: msg("Press Command-K (Ctrl+K on Windows) on any page to jump to a part, a song, a verse or a setting.") },
      { icon: "globe", title: msg("Church Studio in Spanish"), text: msg("The whole desk in Spanish, chosen in Settings or from the computer’s language.") },
      { icon: "layout", title: msg("Cleaner looks on Production"), text: msg("Choose how regions meet (none, line, gap or framed panels) and the line’s colour, with more room for the picture.") },
      { icon: "check", title: msg("Fixes"), text: msg("Stronger borders and other settings are kept, the Privacy switch sits beside its text, long names fit, and Settings › Updates links the terms and privacy policy.") },
    ],
  },
  {
    version: "0.2.4",
    date: "2026-10-20",
    highlights: [
      { icon: "download", title: msg("Bring your songs from ProPresenter and EasyWorship"), text: msg("Import ProPresenter files or a whole EasyWorship library from Songs › Import, with parts, order and CCLI details.") },
      { icon: "bible", title: msg("Your own Bible, offline"), text: msg("Import a Bible file in your church's language (Zefania, OSIS or OpenSong) in Settings › Bible.") },
      { icon: "lyrics", title: msg("Chords for the band"), text: msg("Songs from ChordPro files show chords on the stage screen, and the song desk can change their key.") },
      { icon: "check", title: msg("Smoother setup"), text: msg("Setup ends with a verse ready to show, and the desk says when a trial ends or the plan needs to check in.") },
    ],
  },
  {
    version: "0.2.3",
    date: "2026-10-20",
    highlights: [
      { icon: "reset", title: msg("Undo on Program"), text: msg("Cleared or blacked the screen by mistake? Press Undo, or Command-Z (Ctrl+Z on Windows), and it comes back.") },
      { icon: "lyrics", title: msg("Keys for song parts"), text: msg("Press 1 to 9 for a part, or Shift with V, C or B for the next verse, chorus or bridge.") },
      { icon: "alerts", title: msg("The desk tells you what happened"), text: msg("A short line at the bottom explains when something could not be done, in amber when it matters.") },
      { icon: "check", title: msg("Safer by default"), text: msg("Clearing the queue takes two clicks and can be undone, unsaved song edits ask first, and Preview buttons stay on Preview.") },
    ],
  },
  {
    version: "0.2.2",
    date: "2026-10-20",
    highlights: [
      { icon: "timer", title: msg("Walk-in with a countdown"), text: msg("Start walk-in from Audio: the countdown goes on the screen, the music plays, and it fades by itself when the service starts.") },
      { icon: "audio", title: msg("Music that sounds right"), text: msg("Tracks play at an even volume and fade into each other, and playlists can shuffle.") },
      { icon: "keys", title: msg("A sound pad"), text: msg("Play an offering bell or an intro sting with one click, over everything else.") },
      { icon: "lyrics", title: msg("Backing tracks for songs"), text: msg("Give a song a backing track in the song editor, and it plays when the song goes live.") },
      { icon: "phone", title: msg("Music from your phone"), text: msg("The phone remote can play, skip and fade the music.") },
    ],
  },
  {
    version: "0.2.1",
    date: "2026-10-20",
    highlights: [
      { icon: "lyrics", title: msg("Songs line by line"), text: msg("Choose how many lines show at once with Lines on the song desk. The arrows step through them, and listening follows the line being sung.") },
      { icon: "speed", title: msg("Faster verse and song detection"), text: msg("What is read or sung reaches Preview much sooner, even with a large song library.") },
      { icon: "audio", title: msg("Your playlists stay as you left them"), text: msg("Church Studio now opens only once, so a second copy can no longer save over your music.") },
      { icon: "refresh", title: msg("Updates come to you"), text: msg("When a new version is ready, a note on the desk offers it, to install after the service.") },
    ],
  },
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
