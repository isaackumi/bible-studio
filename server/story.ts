// The story page at /story: Church Studio told as a brief to present from or hand out. The problem
// a church faces on a Sunday, then each part of the app and the problem it solves, with questions
// to ask a room. It reads like a document on screen (sheets of paper) and prints to PDF a sheet a
// page, in ink on white, with the app's mark at the top.

import { TRIAL_DAYS } from "../src/lib/domain/plans.ts";
import { escape } from "./landing.ts";
import type { Site } from "./site.ts";
import { FONT_CSS, seoHead, SITE_URL } from "./seo.ts";

/** The app's mark, drawn for paper: ink where the app shows white, the orange kept. */
const MARK = (size: number) =>
  `<svg class="mark" viewBox="0 0 256 256" width="${size}" height="${size}" aria-hidden="true"><path fill="var(--ink)" d="M52 32 H108 A8 8 0 0 1 116 40 V80 A8 8 0 0 1 108 88 H40 A8 8 0 0 1 32 80 V52 A20 20 0 0 1 52 32 Z"/><path fill="#fa4f00" d="M148 32 H204 A20 20 0 0 1 224 52 V80 A8 8 0 0 1 216 88 H148 A8 8 0 0 1 140 80 V40 A8 8 0 0 1 148 32 Z"/><path fill="var(--ink)" d="M40 112 H108 A8 8 0 0 1 116 120 V216 A8 8 0 0 1 108 224 H52 A20 20 0 0 1 32 204 V120 A8 8 0 0 1 40 112 Z"/><path fill="var(--ink)" d="M148 112 H216 A8 8 0 0 1 224 120 V204 A20 20 0 0 1 204 224 H148 A8 8 0 0 1 140 216 V120 A8 8 0 0 1 148 112 Z"/></svg>`;

type Solve = { area: string; problem: string; answer: string; points: string[]; ask: string };

/** Each part of the app: the problem it meets, how, and a question for the room. */
const SOLVES: Solve[] = [
  {
    area: "Listening",
    problem: "The preacher says “turn with me to Romans eight”, and the screen stays blank while someone at the back types, scrolls and squints.",
    answer: "Church Studio listens. When a verse is read or quoted, it is on Preview before the sentence ends, in your translation, waiting for one press of LIVE.",
    points: [
      "References and close quotes, in any translation the church has",
      "About 250 common mishearings put right (“efficient 4” is Ephesians 4), and it learns the church's own words",
      "Accurate listening runs on the church's own computer: the audio never leaves the building",
      "Nothing goes to the screen by itself: matches wait on Preview",
    ],
    ask: "How many seconds does your congregation wait for a verse?",
  },
  {
    area: "Scripture",
    problem: "A congregation reads in more than one language, and the Bible the people hold is not the one on the screen.",
    answer: "Bibles that work offline, in the languages people pray in, found with shorthand anyone can type, two side by side when needed.",
    points: [
      "KJV, ASV, WEB, BBE and Akuapem Twi built in; Asante Twi, Ewe, Yorùbá, Igbo and Hausa a click away",
      "Type jn316 or 1co13 and it is there; forgiving spelling and phrase search",
      "Two translations on the screen together",
      "Every scripture shown is kept in a list; one click sends it back",
    ],
    ask: "Is the Bible on your screen the one your people read?",
  },
  {
    area: "Songs",
    problem: "Years of songs sit in another program, the band reads different chords from the words on the wall, and the copyright report is guesswork.",
    answer: "The library comes across, the band gets chords in their key on the stage screen only, and every song shown is counted for CCLI.",
    points: [
      "Imports from ProPresenter, EasyWorship, SongSelect, OpenLyrics, ChordPro and plain text",
      "Chords on the stage screen, transposed to the key you sing in",
      "A second language under each line",
      "Backing tracks that start when their song goes live",
    ],
    ask: "What would it take to move your church's songs today?",
  },
  {
    area: "The service",
    problem: "The order of service lives on paper, the timings live in the pastor's head, and nobody knows the service is running late until it has.",
    answer: "A running order with times, countdowns and warnings, built from last week's template in a minute, printed as a run sheet for the team.",
    points: [
      "Parts holding songs, scripture, slides, pictures, video and looks",
      "A start time, a length or an end time per part, and a warning when it runs late",
      "Plans brought in from Planning Center, with songs and their lyrics",
      "A sample Sunday ready to try on the first day",
    ],
    ask: "Who in your team can see, right now, how much time is left?",
  },
  {
    area: "Screens",
    problem: "Every church's wall is a different shape: a projector, a TV, a tall LED panel, an overflow room with a browser. Most software assumes one wide screen.",
    answer: "Church Studio lays everything out for the screen it is on, drives up to eight screens with a job each, and shows the service on any browser over the internet.",
    points: [
      "Preview and Program, LIVE, Clear, Black and Logo, and undo on Program",
      "A stage screen for the platform: now and next, a clock, notes and chords; a tablet can be it",
      "The screen on phones and TVs for an overflow room, with no extra hardware",
      "Overlays for a logo, a ticker or a nursery call over everything",
    ],
    ask: "What happens when your screen is not 16 by 9?",
  },
  {
    area: "Design studio",
    problem: "Announcements are made in whatever is at hand, so every week looks different, and the person who knew how to make them is away.",
    answer: "A design studio inside the app, with about 400 templates in sixteen kinds of page, each laid out for your screen, in twenty palettes and six font pairs.",
    points: [
      "Welcome, announcements, events, scripture, sermon series, giving, communion, baptism, Christmas, Easter and more",
      "More packs to download when you want them",
      "Show sends a page to Preview, to the screen, into the service, or round as a slideshow",
      "PowerPoint and PDF come in as slides",
    ],
    ask: "Does your Sunday look like your church?",
  },
  {
    area: "Sound for the room",
    problem: "The walk-in music and the video play out of the laptop speakers at the back, because the computer does not know where the church's sound system is.",
    answer: "Church Studio finds the sound system (an interface into the mixer, the audience screen's speakers) and sends the music and videos there, with the computer's speakers as the fallback.",
    points: [
      "Every sound output listed by name, with how it is connected",
      "A soundbar or interface the computer already uses is kept",
      "Plug one in mid-service and the sound moves, and the desk says where",
      "Preview is always silent: nothing reaches the room by accident",
    ],
    ask: "Where does your laptop think the congregation is?",
  },
  {
    area: "Phones and people",
    problem: "The congregation sits with phones in their hands and no way to take part; feedback, questions and fun need three paid apps and a password each.",
    answer: "Rooms for the congregation, over the internet with a code and a QR: questions with upvotes, polls, quizzes, a game show on the big screen, and a random picker.",
    points: [
      "Q&A with moderation: nothing reaches the screen until you put it there",
      "Quizzes written from today's sermon, new questions each replay, music in six styles",
      "Anonymous polls for honest feedback",
      "Pick someone at random, or split the room into groups, on the screen with a spin",
    ],
    ask: "When did your congregation last answer back?",
  },
  {
    area: "Production",
    problem: "Streaming means OBS, a capture card, a second computer and a volunteer who understands all three.",
    answer: "A production desk with cameras, scenes and lower thirds, streaming and recording from the same desk that runs the screen, and links to OBS and vMix for churches that already use them.",
    points: [
      "Scenes from cameras, scripture, songs, timers, pictures and web pages",
      "Stream to YouTube or Facebook and record to a file (on a Mac today)",
      "NDI in and out; words on transparency for keying",
      "A phone remote that works over mobile data",
    ],
    ask: "How many computers does it take to stream your service?",
  },
  {
    area: "Peace of mind",
    problem: "Volunteers change every week and a live service has no second take. One wrong click is seen by everyone.",
    answer: "Everything waits on Preview, Program has undo, the work is saved as it happens, and the app speaks in plain words a new volunteer understands.",
    points: [
      "Preview before Program, always; undo puts back what was showing",
      "Works without the internet: Bibles, songs and screens are on the computer",
      "Live captions on the screen and on phones, translated",
      "On a Mac and on Windows, in English, French and Spanish",
    ],
    ask: "Could a first-time volunteer run your Sunday?",
  },
];

const STORY_CSS = `
:root { --ink: #16151a; --soft: #55535e; --faint: #8b8994; --line: #e6e3dd; --paper: #fffdf9; --desk: #ecebe7; --accent: #fa4f00; --accent2: #c43d00; --tint: #fff1e8; }
* { box-sizing: border-box; }
html { background: var(--desk); }
body { margin: 0; color: var(--ink); font: 16px/1.6 "Inter", system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
.serif { font-family: "Instrument Serif", Georgia, serif; font-style: italic; font-weight: 400; }
/* The bar above the sheets: back to the site, and print. Not printed. */
.bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 12px max(16px, calc(50% - 400px)); background: rgba(236,235,231,.88); backdrop-filter: blur(10px); border-bottom: 1px solid #dcd9d2; }
.bar a.home { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; text-decoration: none; }
.bar .grow { flex: 1; }
.bar button { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border: 0; border-radius: 10px; background: var(--ink); color: #fff; font: inherit; font-size: 14px; font-weight: 650; cursor: pointer; }
.bar small { color: var(--soft); font-size: 13px; }
/* Each section is a sheet of paper on screen, and a page in print. */
.sheet { position: relative; max-width: 800px; margin: 28px auto; padding: 64px 72px 72px; background: var(--paper); border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 18px 50px rgba(0,0,0,.08); }
.folio { position: absolute; left: 72px; right: 72px; bottom: 28px; display: flex; justify-content: space-between; color: var(--faint); font-size: 11.5px; letter-spacing: .02em; }
.kicker { margin: 0 0 14px; color: var(--accent2); font-size: 12.5px; font-weight: 750; letter-spacing: .14em; text-transform: uppercase; }
h1 { margin: 0; font-size: 64px; line-height: 1; letter-spacing: -.04em; font-weight: 780; }
h2 { margin: 0 0 18px; font-size: 40px; line-height: 1.05; letter-spacing: -.035em; font-weight: 760; }
h3 { margin: 0 0 6px; font-size: 19px; letter-spacing: -.015em; }
p { margin: 0 0 14px; }
.lead { font-size: 20px; line-height: 1.55; color: var(--soft); }
.big-q { margin: 34px 0; padding: 4px 0 4px 26px; border-left: 4px solid var(--accent); font-family: "Instrument Serif", Georgia, serif; font-style: italic; font-size: 34px; line-height: 1.2; letter-spacing: -.01em; }
.big-q small { display: block; margin-top: 10px; font-family: "Inter", sans-serif; font-style: normal; font-size: 13px; color: var(--faint); letter-spacing: 0; }
/* The cover */
.cover { display: grid; align-content: space-between; min-height: 1060px; padding-top: 90px; background: radial-gradient(120% 70% at 100% 0%, #fff1e8 0, transparent 60%), var(--paper); }
.cover .mark { display: block; margin-bottom: 40px; }
.cover h1 { font-size: 82px; }
.cover h1 .serif { color: var(--accent); letter-spacing: -.02em; }
.cover .lead { max-width: 560px; margin-top: 26px; font-size: 22px; }
.cover dl { display: grid; grid-template-columns: repeat(3, auto); justify-content: start; gap: 6px 48px; margin: 0; font-size: 14px; }
.cover dt { color: var(--faint); font-size: 12px; text-transform: uppercase; letter-spacing: .1em; }
.cover dd { margin: 0 0 6px; font-weight: 650; }
/* Sunday morning */
.time { display: grid; grid-template-columns: 70px 1fr; gap: 6px 18px; margin: 26px 0; }
.time b { font-variant-numeric: tabular-nums; color: var(--accent2); font-size: 15px; }
.time span { color: var(--soft); }
/* The problem in numbers and lines */
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 26px 0; }
.cell { padding: 18px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
.cell b { display: block; font-size: 30px; letter-spacing: -.03em; line-height: 1.1; margin-bottom: 6px; }
.cell span { color: var(--soft); font-size: 14px; line-height: 1.45; }
ul.ticks { margin: 0; padding: 0; list-style: none; display: grid; gap: 9px; }
ul.ticks li { position: relative; padding-left: 26px; color: var(--soft); }
ul.ticks li::before { content: ""; position: absolute; left: 3px; top: .55em; width: 11px; height: 6px; border-left: 2.5px solid var(--accent); border-bottom: 2.5px solid var(--accent); transform: rotate(-45deg); }
ul.cross li::before { width: 12px; height: 2.5px; border: 0; background: #b4b1ab; transform: none; top: .8em; }
.principles { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 24px; }
.principles div { padding: 18px 20px; border-radius: 12px; background: var(--tint); }
.principles b { display: block; margin-bottom: 4px; }
.principles span { color: var(--soft); font-size: 14.5px; }
/* One feature: the problem, the answer, a question. */
.solve .num { display: inline-block; margin-bottom: 10px; font-family: "Instrument Serif", Georgia, serif; font-style: italic; font-size: 24px; color: var(--accent); }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 22px 0; }
.pair div { padding: 20px; border-radius: 12px; }
.pair .was { background: #f4f2ee; }
.pair .now { background: var(--tint); }
.pair small { display: block; margin-bottom: 8px; font-size: 11.5px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; color: var(--faint); }
.pair .now small { color: var(--accent2); }
.pair p { margin: 0; font-size: 16px; line-height: 1.55; }
.solve .big-q { font-size: 28px; margin-top: 30px; }
/* Who it is for, and a Sunday with it */
.who { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 22px; }
.who div { padding: 18px 20px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
.who span { color: var(--soft); font-size: 14.5px; }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 22px; }
.plans div { padding: 18px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
.plans div.hot { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.plans b { display: block; font-size: 18px; margin-bottom: 4px; }
.plans span { color: var(--soft); font-size: 14px; }
.close { text-align: center; padding-top: 110px; padding-bottom: 110px; }
.close .mark { margin: 0 auto 28px; display: block; }
.close h2 { font-size: 48px; }
.close .lead { max-width: 560px; margin: 0 auto 28px; }
.cta { display: inline-block; padding: 14px 24px; border-radius: 12px; background: var(--accent); color: #fff; font-weight: 750; text-decoration: none; }
.close .url { display: block; margin-top: 14px; color: var(--soft); font-size: 14px; }
.contents { margin: 28px 0 0; padding: 0; list-style: none; columns: 2; column-gap: 40px; }
.contents li { display: flex; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); break-inside: avoid; }
.contents li b { color: var(--accent2); font-variant-numeric: tabular-nums; width: 22px; }
@media (max-width: 760px) {
  .sheet { margin: 14px 10px; padding: 40px 22px 64px; }
  .folio { left: 22px; right: 22px; }
  h1, .cover h1 { font-size: 48px; } h2 { font-size: 30px; }
  .cover { min-height: 0; } .cover dl { grid-template-columns: 1fr 1fr; gap: 6px 24px; }
  .grid3, .pair, .principles, .who, .plans { grid-template-columns: 1fr; }
  .contents { columns: 1; } .big-q { font-size: 26px; }
}
/* Print: a sheet a page, ink on white, nothing but the document. */
@page { size: A4; margin: 0; }
@media print {
  html, body { background: #fff; }
  .bar { display: none; }
  .sheet { max-width: none; width: 210mm; min-height: 297mm; margin: 0; padding: 18mm 20mm 22mm; border-radius: 0; box-shadow: none; break-after: page; }
  .sheet:last-of-type { break-after: auto; }
  .cover { min-height: 297mm; }
  .folio { left: 20mm; right: 20mm; bottom: 10mm; }
  .cell, .pair div, .who div, .plans div, .principles div, .big-q { break-inside: avoid; }
  a.cta { box-shadow: none; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export function storyPage(site: Site, origin = SITE_URL): string {
  const total = SOLVES.length + 7;
  const folio = (n: number, label: string) => `<div class="folio"><span>Church Studio · ${escape(label)}</span><span>${n} / ${total}</span></div>`;
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const solves = SOLVES.map(
    (solve, index) => `<section class="sheet solve" id="${solve.area.toLowerCase().replace(/[^a-z]+/g, "-")}">
  <span class="num">${String(index + 1).padStart(2, "0")}</span>
  <p class="kicker">What it solves</p>
  <h2>${escape(solve.area)}</h2>
  <div class="pair">
    <div class="was"><small>The problem</small><p>${escape(solve.problem)}</p></div>
    <div class="now"><small>With Church Studio</small><p>${escape(solve.answer)}</p></div>
  </div>
  <ul class="ticks">${solve.points.map((point) => `<li>${escape(point)}</li>`).join("")}</ul>
  <p class="big-q">${escape(solve.ask)}</p>
  ${folio(index + 5, solve.area)}
</section>`,
  );
  return `<!doctype html>
<html lang="en">
<head>
${seoHead({ title: "The Church Studio story · the problem, and what it solves", description: "Why Church Studio exists: what a church faces on a Sunday, and how each part of the app meets it. Made to present, and to print.", path: "/story", crumb: "The story" }, origin)}
<style>
${FONT_CSS}
${STORY_CSS}
</style>
</head>
<body>
<div class="bar">
  <a class="home" href="/">${MARK(22)} Church Studio</a>
  <span class="grow"></span>
  <small>Present it from here, or keep it as a PDF.</small>
  <button type="button" onclick="window.print()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print or save as PDF</button>
</div>

<main>
<section class="sheet cover">
  <div>
    ${MARK(76)}
    <p class="kicker">The Church Studio story</p>
    <h1>Every word on the wall,<br><span class="serif">in time.</span></h1>
    <p class="lead">What a church faces each Sunday, and how one calm desk lets a volunteer put scripture, songs, slides, sound and the congregation's own voice on the screen, without the panic.</p>
  </div>
  <dl>
    <div><dt>Made by</dt><dd>${escape(site.company)}</dd></div>
    <div><dt>For</dt><dd>Churches of every size</dd></div>
    <div><dt>Edition</dt><dd>${escape(month)}</dd></div>
    <div><dt>Runs on</dt><dd>Mac and Windows</dd></div>
    <div><dt>Languages</dt><dd>English, French, Spanish</dd></div>
    <div><dt>Find it at</dt><dd>${escape(origin.replace(/^https?:\/\//, ""))}</dd></div>
  </dl>
</section>

<section class="sheet">
  <p class="kicker">Before we begin</p>
  <h2>Picture 9:58 on a Sunday morning.</h2>
  <p class="lead">The worship team is in place. The pastor checks their notes. And at the back, behind a laptop, sits the person nobody notices until something goes wrong.</p>
  <div class="time">
    <b>9:58</b><span>The words for the opening song are in one program; the Bible is in another; the announcements are a slide deck someone emailed at midnight.</span>
    <b>10:14</b><span>The pastor says “turn with me to Romans eight, verse twenty-eight”. The screen stays blank. Typing. Scrolling. A wrong chapter flashes up.</span>
    <b>10:31</b><span>The video for the offering plays, out of the laptop speakers at the back. The congregation can see it, but not hear it.</span>
    <b>11:05</b><span>The service runs twenty minutes over. Nobody knew until it had.</span>
  </div>
  <p class="big-q">Have you ever watched a congregation wait for a verse?<small>Most of us have. Some of us have been the one at the laptop.</small></p>
  <p>None of this is the volunteer's fault. They are doing a broadcaster's job with tools made for broadcasters, a few minutes of training, and the whole church watching.</p>
  ${folio(2, "Before we begin")}
</section>

<section class="sheet">
  <p class="kicker">The problem</p>
  <h2>Churches run live media every week, with volunteers, on tools that were never made for them.</h2>
  <div class="grid3">
    <div class="cell"><b>Three or more</b><span>separate programs for words, Bibles, slides, streaming and polls, each with its own way of working.</span></div>
    <div class="cell"><b>One person</b><span>at the back, often new, carrying the whole service on a laptop that may be years old.</span></div>
    <div class="cell"><b>Zero</b><span>second takes. Every mistake is seen by everyone, and remembered.</span></div>
  </div>
  <h3>What we hear from churches</h3>
  <ul class="ticks cross">
    <li>The software is expensive, and the good features sit in the top plan.</li>
    <li>It assumes a wide screen, a sound engineer and a fast internet connection.</li>
    <li>It does not speak the languages the congregation prays in.</li>
    <li>Only one person knows how it works, and they are on holiday.</li>
    <li>Engaging the congregation means paying for more apps and asking them to download more.</li>
  </ul>
  <p class="big-q">What if the technology simply kept up with the service?</p>
  ${folio(3, "The problem")}
</section>

<section class="sheet">
  <p class="kicker">Our answer</p>
  <h2>One calm desk for everything the church shows, hears and shares.</h2>
  <p class="lead">Church Studio puts scripture, songs, the order of service, slides, pictures, video, sound, screens, streaming and the congregation's phones in one app, built around four promises.</p>
  <div class="principles">
    <div><b>Nothing reaches the screen by accident</b><span>Everything waits on Preview. One press of LIVE sends it, and undo puts back what was showing.</span></div>
    <div><b>It keeps up with the service</b><span>It listens for scripture, follows the song being sung, and tells you when the service is running late.</span></div>
    <div><b>It fits the church you have</b><span>Any screen shape, any sound system, offline, on a Mac or a Windows laptop, in the church's languages.</span></div>
    <div><b>A first-time volunteer can run it</b><span>Plain words, one obvious next step, and samples ready on day one, so nobody starts from a blank page.</span></div>
  </div>
  <h3 style="margin-top:30px">In this brief</h3>
  <ol class="contents">${SOLVES.map((solve, index) => `<li><b>${String(index + 1).padStart(2, "0")}</b><a href="#${solve.area.toLowerCase().replace(/[^a-z]+/g, "-")}">${escape(solve.area)}</a></li>`).join("")}</ol>
  ${folio(4, "Our answer")}
</section>

${solves.join("\n")}

<section class="sheet">
  <p class="kicker">Who it is for</p>
  <h2>Built for the church as it is, not as a studio.</h2>
  <div class="who">
    <div><h3>The small church</h3><span>One volunteer, one laptop, a TV on the wall. Free to start, offline, with a sample Sunday ready to run.</span></div>
    <div><h3>The growing church</h3><span>A stage screen, an overflow room, streaming, a phone remote, and a team that changes every week.</span></div>
    <div><h3>The church of many languages</h3><span>Bibles in Twi, Ewe, Yorùbá, Igbo and Hausa beside English, songs in two languages, and live captions translated.</span></div>
    <div><h3>Youth and children's ministry</h3><span>Quizzes from the lesson, a game show on the screen, polls and a random picker, all from people's own phones.</span></div>
  </div>
  <h3 style="margin-top:30px">Plans</h3>
  <div class="plans">
    <div><b>Free</b><span>Scripture, songs, the service, the design studio, rooms, quizzes and polls. No time limit.</span></div>
    <div class="hot"><b>Premium</b><span>Listening for verses, the stage screen, extra screens, the production desk, the phone remote. ${TRIAL_DAYS} days free to try.</span></div>
    <div><b>Church</b><span>Streaming and recording, NDI, and priority help for churches that broadcast.</span></div>
  </div>
  ${folio(SOLVES.length + 5, "Who it is for")}
</section>

<section class="sheet">
  <p class="kicker">The same Sunday, again</p>
  <h2>9:58, with Church Studio.</h2>
  <div class="time">
    <b>9:58</b><span>The service was built last Tuesday from the template. Walk-in music plays through the church's speakers; the welcome slide loops on the screen.</span>
    <b>10:14</b><span>“Turn with me to Romans eight.” Romans 8:28 is on Preview before the pastor finishes the sentence. One press, and it is on the wall.</span>
    <b>10:31</b><span>The offering video plays through the sound system, because the app found it. Preview stayed silent.</span>
    <b>10:52</b><span>The congregation answers a quiz about this morning's sermon on their phones. The children cheer for the podium.</span>
    <b>11:00</b><span>The clock on the stage said “two minutes over” at 10:45. The service ends on time.</span>
  </div>
  <p class="big-q">What would your volunteers do with the hour they get back?</p>
  ${folio(SOLVES.length + 6, "The same Sunday, again")}
</section>

<section class="sheet close">
  ${MARK(64)}
  <h2>Let the technology serve the service.</h2>
  <p class="lead">Church Studio is free to download and free to start, on a Mac or a Windows computer. Try it with next Sunday's service.</p>
  <a class="cta" href="${origin}/#download">Download Church Studio</a>
  <span class="url">${escape(origin.replace(/^https?:\/\//, ""))} · ${escape(site.contact)}</span>
  ${folio(total, "Thank you")}
</section>
</main>
</body>
</html>`;
}
