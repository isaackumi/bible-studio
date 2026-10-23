// For AI assistants and their search crawlers: /llms.txt (a short Markdown guide to the site, as
// llmstxt.org describes) and /llms-full.txt (the facts in full: what Church Studio does, on which
// computers, for how much, and the answers to common questions). Built from the same tables as the
// site and the app (plans, prices, release notes, the FAQ), so an assistant never quotes a stale price.

import { published } from "../src/lib/domain/changelog.ts";

const current = (released: string | null) => published(released, new Date().toISOString().slice(0, 10))[0];
import { FEATURE_LABELS, PLANS, TRIAL_DAYS } from "../src/lib/domain/plans.ts";
import { FAQ } from "./landing.ts";
import { PRICES } from "./pricing.ts";
import type { Site } from "./site.ts";

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

const SUMMARY =
  "Church Studio is church presentation software for Mac, Windows and Linux. It puts scripture, song lyrics, sermons, slides and pictures on a church's screens, finds Bible verses by listening to the preacher, and runs the whole service on time. Free to start.";

function plans(): string {
  return PLANS.map((plan) => {
    const price = plan.id === "free" ? "free forever" : `${dollars(PRICES[plan.id].monthly)} a month or ${dollars(PRICES[plan.id].yearly)} a year`;
    const computers = plan.computers === 1 ? "1 computer" : `${plan.computers} computers`;
    const features = plan.features.map((id) => `${FEATURE_LABELS[id].label}${FEATURE_LABELS[id].soon ? " (coming soon)" : ""}`).join("; ");
    return `- **${plan.name}** (${price}, ${computers}): ${plan.tagline} Includes: ${features}.`;
  }).join("\n");
}

export function llmsTxt(origin: string, released: string | null = null): string {
  const latest = current(released);
  return `# Church Studio

> ${SUMMARY}

Made by HeiTech. Current version ${latest?.version ?? ""} (${latest?.date ?? ""}).

## Pages

- [Home](${origin}/): what Church Studio is, downloads for Mac, Windows and Linux, plans and prices, questions
- [Features](${origin}/features): every feature, chapter by chapter, with which plan includes it
- [What's new](${origin}/whats-new): release notes, newest first
- [Full facts for AI assistants](${origin}/llms-full.txt): features, platforms, prices and answers in one file

## Try it

- [Download](${origin}/#download): Mac (Apple silicon and Intel, macOS 13+), Windows 10 and 11, Linux (AppImage, .deb, .rpm)
- [Use it in a browser](${origin}/app/): no install

## Policies

- [Privacy](${origin}/privacy)
- [Terms](${origin}/terms)
- [Refunds and cancellation](${origin}/refunds)
`;
}

export function llmsFullTxt(origin: string, site: Site, released: string | null = null): string {
  const latest = current(released);
  return `# Church Studio: the facts

> ${SUMMARY}

- Maker: ${site.company} (${site.contact})
- Website: ${origin}/
- Current version: ${latest?.version ?? ""}, released ${latest?.date ?? ""}
- Platforms: macOS 13 Ventura or later (Apple silicon and Intel, one download), Windows 10 and 11 (64-bit), Linux (AppImage, .deb, .rpm); also runs in a web browser at ${origin}/app/
- Interface languages: English, French, Spanish
- Works offline: scripture, songs, services and screens need no internet
- Trial: Premium free for ${TRIAL_DAYS} days, no card

## Plans and prices (US dollars)

${plans()}

## What it does

### Scripture
- Finds Bible verses by listening: references and close quotes go to Preview; LIVE shows them. About 250 common mishearings of book names are corrected, and it learns a church's own words.
- Accurate listening (Whisper) runs on the computer itself (Mac and Windows); audio does not leave the building.
- Quick find with shorthand (jn316, 1co13), phrase search, two translations side by side.
- Bibles included offline: KJV, ASV, WEB, BBE, Akuapem Twi; free downloads: Asante Twi, Ewe, Yorùbá, Igbo, Hausa. Import Zefania, OSIS or OpenSong files; NIV, ESV and others online with the church's own API.Bible key.

### Songs
- Library with folders, arrangements (verse, chorus, bridge, repeats), chords for the band on the stage screen, transposing, two languages line by line, backing tracks, CCLI usage reporting.
- Imports ProPresenter 5, 6 and 7 (.pro, .pro6, .proBundle), EasyWorship 6 and 7 libraries, SongSelect, OpenLyrics, ChordPro and plain text.
- Follows the singing: finds the song part being sung.

### The service
- Running order with songs, scripture, slides, pictures, video and looks; templates; timings per part with late warnings; timers; Planning Center import; a printable run sheet.
- Sermon notes for the desk and stage, a sermon clock, and a planned-against-used report after the service.
- Readiness check before the service (screens, missing files, recording space, backups) and a performance page.

### Screens
- Any screen shape (16:9, 4:3, ultra-wide LED, portrait); up to eight extra screens, each with a job (program, scripture, lyrics, timer, stage); a stage display with now, next, clock, notes and chords; screens over the internet in any browser.
- Overlays (logo, ticker, banner, clock, lower third) and alerts such as a nursery call.

### Slides and pictures
- A design studio for slide decks, 33 themes, PowerPoint import as editable slides, PDF import.
- Picture slideshows straight from a folder or cloud drive (Google Drive, iCloud, Dropbox, OneDrive), with Fade, Push, Zoom, Dip or Mix transitions, slow zoom, captions, a countdown and looping music.

### Production
- A production desk with cameras, scenes and lower thirds; control of OBS and vMix.
- Streaming to YouTube, Facebook or any RTMP server, recording, and NDI output and input (on Mac today).

### Phones and the congregation
- A phone remote (Wi-Fi or internet), live captions on phones translated into up to four languages, and rooms where the congregation asks questions, votes and plays Bible games, with no app to install.

### AI (with the church's own key: Claude, ChatGPT, Gemini, or a local model through Ollama or LM Studio)
- Sermon summaries, slide decks from notes or a passage, songs suggested for a sermon, song lookup (public-domain hymn words; SongSelect for copyrighted songs), caption translation, and naming a verse the preacher paraphrases. Each can be switched off.

### Not built in
- Broadcast hardware control: SDI input and output, MIDI, DMX lighting, timecode. Cloud sync across computers is coming.

## Questions and answers

${FAQ.map(([question, answer]) => `### ${question}\n\n${answer}`).join("\n\n")}
`;
}
