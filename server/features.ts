// The features page at /features: everything Church Studio does, chapter by chapter, each shown
// working in a small live demo (plain CSS and a little script, every motion stopped for people who
// ask their computer for less). Plan tags come from the same table the app and checkout use, and
// what runs only on a Mac today says so.

import { TRIAL_DAYS } from "../src/lib/domain/plans.ts";
import { escape, icon, SITE_CSS, siteFooter, siteHeader } from "./landing.ts";
import type { Site } from "./site.ts";
import { application, FONT_CSS, seoHead, SITE_URL } from "./seo.ts";

type Plan = "free" | "premium" | "church";
const PLAN_NAME: Record<Plan, string> = { free: "Free", premium: "Premium", church: "Church" };
const tag = (plan: Plan) => `<span class="tag tag-${plan}">${PLAN_NAME[plan]}</span>`;
const mac = '<span class="tag tag-os">Mac today</span>';

const CHAPTERS: Array<[string, string]> = [
  ["listen", "Listening & AI"],
  ["scripture", "Scripture"],
  ["songs", "Songs"],
  ["service", "The service"],
  ["screens", "Screens"],
  ["pictures", "Slides & pictures"],
  ["production", "Production"],
  ["people", "Phones & people"],
  ["control", "Control"],
  ["calm", "Peace of mind"],
];

/** One feature in a chapter's list: a name, a line, and its plan. */
const item = (name: string, text: string, plan: Plan, extra = "") => `<li><b>${escape(name)} ${tag(plan)}${extra}</b><span>${escape(text)}</span></li>`;

const FEATURES_CSS = `
.f-hero { padding: 96px 0 30px; text-align: center; }
.f-hero h1 { margin: 22px auto 20px; max-width: 980px; font-size: clamp(44px, 7vw, 92px); line-height: .98; letter-spacing: -.045em; font-weight: 750; }
.f-hero h1 .serif { background: linear-gradient(100deg, #ffd2b0, var(--accent2) 40%, var(--accent) 75%); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: .06em; }
.f-hero p { margin: 0 auto; max-width: 700px; color: var(--muted); font-size: clamp(17px, 2vw, 20px); }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; margin: 56px auto 0; max-width: 980px; border: 1px solid var(--line); border-radius: 22px; overflow: hidden; background: var(--line); }
.stat { padding: 26px 18px; background: var(--bg); text-align: center; }
.stat b { display: block; font-size: clamp(30px, 4vw, 46px); font-weight: 750; letter-spacing: -.03em; font-variant-numeric: tabular-nums; background: linear-gradient(180deg, #fff, #c9c9d1); -webkit-background-clip: text; background-clip: text; color: transparent; }
.stat span { color: var(--muted); font-size: 13.5px; }
/* The chapter bar sticks under the top bar and follows the reader. */
.chapters { position: sticky; top: 66px; z-index: 40; margin-top: 60px; padding: 10px 0; backdrop-filter: saturate(160%) blur(14px); background: rgba(7,7,10,.7); border-block: 1px solid var(--line); }
.chapters .wrap { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.chapters .wrap::-webkit-scrollbar { display: none; }
.chapters a { flex: none; padding: 7px 14px; border-radius: 999px; color: var(--muted); font-size: 14px; font-weight: 600; border: 1px solid transparent; transition: color .2s, background .2s, border-color .2s; }
.chapters a:hover { color: var(--ink); }
.chapters a.on { color: var(--ink); background: rgba(250,79,0,.14); border-color: rgba(250,79,0,.45); }
.chapter { padding-top: 120px; scroll-margin-top: 120px; }
.chapter-head { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: end; margin-bottom: 40px; }
.chapter-head h2 { margin: 0; font-size: clamp(34px, 4.6vw, 58px); line-height: 1.02; letter-spacing: -.035em; font-weight: 720; }
.chapter-head p { margin: 0; color: var(--muted); font-size: 18px; }
.num { display: block; margin-bottom: 14px; font-family: "Instrument Serif", serif; font-style: italic; font-size: 22px; color: var(--accent2); }
.duo { display: grid; grid-template-columns: 1.15fr .85fr; gap: 16px; }
.duo.flip { grid-template-columns: .85fr 1.15fr; }
.demo { position: relative; min-height: 320px; padding: 26px; border: 1px solid var(--line); border-radius: 24px; background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.012)); overflow: hidden; }
.demo h3 { margin: 0 0 6px; font-size: 20px; letter-spacing: -.02em; }
.demo > p { margin: 0 0 20px; color: var(--muted); font-size: 14.5px; }
.list { margin: 0; padding: 26px 28px; list-style: none; display: grid; gap: 18px; align-content: start; border: 1px solid var(--line); border-radius: 24px; background: rgba(255,255,255,.02); }
.list li { display: grid; gap: 3px; }
.list b { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 15.5px; letter-spacing: -.01em; }
.list span { color: var(--muted); font-size: 14px; }
.tag { padding: 1px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; letter-spacing: .02em; border: 1px solid var(--line); }
.tag-free { color: #b9b9c4; } .tag-premium { color: var(--accent2); border-color: rgba(250,79,0,.4); background: rgba(250,79,0,.08); } .tag-church { color: #b7a6ff; border-color: rgba(139,108,255,.45); background: rgba(139,108,255,.08); } .tag-os { color: var(--dim); }
.screen-box { position: relative; aspect-ratio: 16/9; border-radius: 14px; overflow: hidden; background: radial-gradient(120% 90% at 50% 120%, #4a1606, #13070a 60%, #050505); display: grid; place-items: center; text-align: center; padding: 6% 9%; border: 1px solid rgba(255,255,255,.08); }
.screen-box .ref { display: block; font-size: 11px; letter-spacing: .2em; color: #f2b88f; font-weight: 700; margin-bottom: 8px; }
.screen-box .words { margin: 0; color: #fff; font-size: clamp(13px, 1.6vw, 18px); line-height: 1.4; text-wrap: balance; }

/* Listening */
.transcript { min-height: 96px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 14px; background: rgba(0,0,0,.3); font-size: 16px; color: var(--muted); }
.transcript .typed { color: var(--ink); }
.transcript .caret { display: inline-block; width: 2px; height: 1.1em; margin-left: 2px; vertical-align: -2px; background: var(--accent); animation: blink 1s steps(1) infinite; }
.found { display: flex; align-items: center; gap: 10px; margin-top: 14px; min-height: 36px; opacity: 0; transform: translateY(6px); transition: opacity .5s, transform .5s; }
.found.in { opacity: 1; transform: none; }
.found .chip { background: rgba(52,200,138,.14); color: #7be3b4; }
.found .chip.ai { background: rgba(139,108,255,.16); color: #c4b5ff; }
.found small { color: var(--dim); font-size: 12.5px; }
.listen-screen { margin-top: 16px; aspect-ratio: auto; min-height: 150px; transition: opacity .5s; }
.listen-screen .pv-tag { position: absolute; top: 10px; left: 12px; font-size: 10px; letter-spacing: .16em; font-weight: 700; color: var(--accent2); }
.listen-screen.empty { opacity: .35; }
.ai-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
.ai-row span { padding: 7px 12px; border-radius: 10px; border: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.ai-row span b { color: var(--ink); font-weight: 650; }

/* Scripture */
.finder { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: rgba(0,0,0,.3); font-size: 16px; }
.finder .typed { font-family: ui-monospace, Menlo, monospace; color: var(--ink); }
.finder-result { margin-top: 12px; }
.bibles { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 18px; }
.bibles span { padding: 5px 10px; border-radius: 8px; background: rgba(255,255,255,.05); font-size: 12.5px; font-weight: 600; color: var(--muted); }
.bibles span.home { color: #ffd2b0; background: rgba(250,79,0,.1); }
.parallel { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.parallel div { padding: 12px; border-radius: 12px; border: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.parallel small { display: block; font-size: 10.5px; letter-spacing: .14em; color: var(--dim); font-weight: 700; margin-bottom: 4px; }

/* Songs */
.order { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
.order span { padding: 6px 11px; border-radius: 9px; font-weight: 700; font-size: 13px; border: 1px solid var(--line); color: var(--muted); transition: all .3s; }
.order span.v { --c: #4f8ff7; } .order span.c { --c: #c264f0; } .order span.b { --c: #e0a03a; }
.order span.on { color: #fff; background: var(--c); border-color: var(--c); box-shadow: 0 0 20px color-mix(in srgb, var(--c) 50%, transparent); }
.chords { font-size: 17px; display: grid; gap: 6px; }
.chords .chord { display: block; font-size: 11.5px; font-weight: 700; color: var(--accent2); letter-spacing: .05em; }

/* Service */
.checks { display: grid; gap: 8px; }
.check { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--line); background: rgba(0,0,0,.2); font-size: 14px; opacity: .35; transition: opacity .4s; }
.check.done { opacity: 1; }
.check i { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: rgba(255,255,255,.06); color: transparent; flex: none; transition: all .4s; font-style: normal; font-size: 12px; font-weight: 800; }
.check.done i { background: rgba(52,200,138,.18); color: var(--good); }
.check.warn.done i { background: rgba(245,165,36,.18); color: #f5a524; }
.check small { margin-left: auto; color: var(--dim); font-size: 12px; }
.verdict { margin-top: 14px; font-weight: 700; font-size: 15px; color: var(--good); opacity: 0; transition: opacity .5s; }
.verdict.in { opacity: 1; }
.report { display: grid; gap: 10px; }
.bar-row { display: grid; grid-template-columns: 82px 1fr 46px; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); }
.bars { display: grid; gap: 3px; }
.bars i { display: block; height: 7px; border-radius: 4px; width: 0; transition: width 1.2s cubic-bezier(.2,.8,.2,1); }
.bars i.b-plan { background: rgba(255,255,255,.18); } .bars i.b-used { background: linear-gradient(90deg, var(--accent), var(--accent2)); }
.bar-row b { text-align: right; font-variant-numeric: tabular-nums; color: var(--ink); font-size: 12.5px; }
.bar-row b.late { color: #ff8b6b; }

/* Screens */
.shape-stage { display: grid; place-items: center; height: 230px; }
.shape { display: grid; place-items: center; padding: 4%; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: radial-gradient(120% 90% at 50% 120%, #4a1606, #13070a 60%, #050505); color: #fff; text-align: center; font-size: 14px; line-height: 1.35; transition: width .9s cubic-bezier(.65,0,.35,1), height .9s cubic-bezier(.65,0,.35,1); overflow: hidden; }
.shape small { display: block; font-size: 10px; letter-spacing: .18em; color: #f2b88f; margin-bottom: 6px; font-weight: 700; }
.shape-label { text-align: center; color: var(--dim); font-size: 12.5px; letter-spacing: .1em; text-transform: uppercase; }
.jobs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.job { aspect-ratio: 16/10; border-radius: 10px; border: 1px solid var(--line); background: #08080b; display: grid; place-items: center; text-align: center; font-size: 11px; color: var(--muted); padding: 6px; }
.job b { display: block; color: var(--ink); font-size: 13px; }
.job.prog { border-color: rgba(255,59,59,.6); box-shadow: 0 0 0 1px rgba(255,59,59,.25); }
.job .t { font-size: 20px; font-weight: 750; color: var(--good); font-variant-numeric: tabular-nums; }

/* Pictures: the real slideshow moves, one after another */
.reel { position: relative; aspect-ratio: 16/9; border-radius: 14px; overflow: hidden; background: #000; }
.reel .ph { position: absolute; inset: 0; display: grid; place-items: end start; padding: 16px; color: #fff; font-weight: 700; font-size: 14px; text-shadow: 0 2px 10px rgba(0,0,0,.6); }
.reel .ph:nth-child(1) { background: radial-gradient(80% 60% at 30% 30%, #ffb36b, transparent 60%), linear-gradient(135deg, #b8471b, #3b1308); }
.reel .ph:nth-child(2) { background: radial-gradient(70% 60% at 70% 30%, #9fd3ff, transparent 60%), linear-gradient(135deg, #1d4ed8, #0b1640); }
.reel .ph:nth-child(3) { background: radial-gradient(70% 60% at 50% 70%, #b6f0c8, transparent 60%), linear-gradient(135deg, #15803d, #052e16); }
.reel .ph:nth-child(4) { background: radial-gradient(70% 60% at 40% 40%, #e9c6ff, transparent 60%), linear-gradient(135deg, #7e22ce, #2e0a4f); }
.reel-label { display: flex; justify-content: space-between; margin-top: 12px; font-size: 13px; color: var(--muted); }
.reel-label b { color: var(--accent2); }
.swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-top: 16px; }
.swatches i { aspect-ratio: 16/10; border-radius: 7px; border: 1px solid rgba(255,255,255,.08); }

/* Production */
.scene-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.scene-tile { position: relative; aspect-ratio: 16/10; border-radius: 10px; border: 1px solid var(--line); background: linear-gradient(135deg, #1d1d25, #101015); overflow: hidden; transition: box-shadow .3s, border-color .3s; }
.scene-tile.live { border-color: var(--live); box-shadow: 0 0 0 1px var(--live), 0 0 24px rgba(255,59,59,.3); }
.scene-tile em { position: absolute; left: 8px; bottom: 6px; font-style: normal; font-size: 10px; font-weight: 700; color: var(--muted); }
.scene-tile .cam { position: absolute; inset: 0; background: radial-gradient(40% 55% at 42% 45%, #4a4a5c, transparent 70%); }
.scene-tile .lt { position: absolute; left: 8px; right: 34%; bottom: 22px; height: 10px; border-radius: 3px; background: linear-gradient(90deg, var(--accent), transparent); }
.scene-tile .vs { position: absolute; right: 8px; top: 8px; bottom: 26px; width: 40%; border-radius: 4px; background: rgba(250,79,0,.25); }
.ticker { margin-top: 14px; overflow: hidden; border-radius: 10px; background: var(--accent); white-space: nowrap; }
.ticker span { display: inline-block; padding: 8px 0; font-size: 13px; font-weight: 650; color: #fff; animation: tick 18s linear infinite; }
@keyframes tick { from { transform: translateX(100%); } to { transform: translateX(-100%); } }
.outs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.outs span { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 10px; border: 1px solid var(--line); font-size: 13px; font-weight: 600; }
.outs i { width: 7px; height: 7px; border-radius: 50%; background: var(--live); box-shadow: 0 0 8px var(--live); animation: blink 1.6s infinite; }

/* People */
.people { display: grid; grid-template-columns: 150px 1fr; gap: 22px; align-items: center; }
.phone { width: 150px; aspect-ratio: 9/19; border: 2px solid #34343e; border-radius: 26px; background: #111010; padding: 10px 8px; display: grid; grid-template-rows: auto auto 1fr auto; gap: 8px; }
.phone .top { display: flex; align-items: center; gap: 5px; font-size: 9px; font-weight: 700; color: #ddd; }
.phone .top i { display: inline-grid; grid-template-columns: 1fr 1fr; gap: 1.5px; width: 12px; height: 12px; } .phone .top i::before, .phone .top i::after { content: ""; border-radius: 1.5px; background: #f5f5f5; }
.phone .mon { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.phone .mon div { aspect-ratio: 16/9; border-radius: 4px; background: #000; border: 1px solid #312f2d; font-size: 6px; color: #ddd; display: grid; place-items: center; text-align: center; padding: 2px; }
.phone .mon div:first-child { border-color: #f21b1b; }
.phone .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; align-content: start; }
.phone .tiles span { aspect-ratio: 1.3; border-radius: 5px; border: 1px solid #312f2d; background: #1b1b1b; font-size: 5.5px; font-weight: 700; color: #ddd; display: grid; place-items: center; letter-spacing: .04em; }
.phone .rows { grid-column: 1 / -1; display: grid; gap: 3px; margin-top: 4px; }
.phone .rows p { margin: 0; padding: 4px 6px; border-radius: 4px; background: #1b1b1b; border: 1px solid #312f2d; font-size: 6.5px; color: #ddd; }
.phone .rows p.cur { border-left: 2px solid var(--accent); background: rgba(250,79,0,.14); }
.phone .go { display: grid; grid-template-columns: 1fr 2.2fr 1fr; gap: 4px; }
.phone .go span { height: 24px; border-radius: 6px; border: 1px solid #312f2d; background: #1b1b1b; display: grid; place-items: center; font-size: 8px; color: #ddd; }
.phone .go span.live { background: #f21b1b; border-color: #f21b1b; color: #fff; font-weight: 800; letter-spacing: .08em; animation: tap 2.4s infinite; }
.qa { display: grid; gap: 8px; }
.q { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: rgba(0,0,0,.2); font-size: 13.5px; transition: transform .5s; }
.q b { display: grid; place-items: center; min-width: 38px; height: 30px; border-radius: 8px; background: rgba(250,79,0,.12); color: var(--accent2); font-variant-numeric: tabular-nums; }
.poll { display: grid; gap: 7px; margin-top: 14px; }
.poll div { position: relative; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line); font-size: 13px; overflow: hidden; }
.poll div i { position: absolute; inset: 0 auto 0 0; width: 0; background: rgba(139,108,255,.22); transition: width 1.4s cubic-bezier(.2,.8,.2,1); }
.poll div span { position: relative; display: flex; justify-content: space-between; }
.cap-langs { display: flex; gap: 6px; margin-top: 12px; }
.cap-langs span { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); font-size: 12px; color: var(--muted); transition: all .3s; }
.cap-langs span.on { color: #fff; background: var(--violet); border-color: var(--violet); }

/* Control */
.palette { border: 1px solid rgba(255,255,255,.14); border-radius: 16px; background: rgba(14,14,19,.9); box-shadow: 0 30px 80px rgba(0,0,0,.5); overflow: hidden; }
.palette .q-in { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--line); font-size: 16px; }
.palette .q-in kbd { margin-left: auto; padding: 2px 7px; border-radius: 6px; border: 1px solid var(--line); font: 600 11px Inter, sans-serif; color: var(--dim); }
.palette ul { margin: 0; padding: 6px; list-style: none; }
.palette li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; font-size: 14px; color: var(--muted); }
.palette li.on { background: rgba(250,79,0,.14); color: var(--ink); }
.palette li small { margin-left: auto; color: var(--dim); font-size: 12px; }
.deck { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 16px; }
.deck span { aspect-ratio: 1; border-radius: 9px; background: #18181d; border: 1px solid var(--line); display: grid; place-items: center; font-size: 9px; font-weight: 700; color: var(--muted); text-align: center; padding: 3px; transition: all .3s; }
.deck span.lit { background: var(--accent); color: #fff; border-color: var(--accent); box-shadow: 0 0 18px rgba(250,79,0,.5); }

/* Peace of mind */
.calm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.calm { padding: 26px; border: 1px solid var(--line); border-radius: 22px; background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01)); }
.calm .ic { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 16px; border-radius: 12px; background: rgba(52,200,138,.12); color: var(--good); }
.calm h3 { margin: 0 0 6px; font-size: 18px; letter-spacing: -.01em; } .calm p { margin: 0; color: var(--muted); font-size: 14.5px; }

@media (max-width: 960px) {
  .stats { grid-template-columns: 1fr 1fr; }
  .chapter-head, .duo, .duo.flip { grid-template-columns: 1fr; }
  .calm-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 600px) {
  .calm-grid { grid-template-columns: 1fr; }
  .people { grid-template-columns: 1fr; justify-items: center; }
  .chapter { padding-top: 90px; }
  .jobs { grid-template-columns: 1fr 1fr; }
  .demo { padding: 20px; }
}
`;

export function featuresPage(site: Site, origin = SITE_URL): string {
  const chapter = (id: string, n: number, title: string, lede: string, body: string) => `<section class="chapter" id="${id}"><div class="wrap">
  <div class="chapter-head reveal"><h2><span class="num">${String(n).padStart(2, "0")}</span>${title}</h2><p>${lede}</p></div>
  ${body}
</div></section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${seoHead({
  title: "Features · Church Studio church presentation software",
  description: "Scripture found by listening, AI that names a paraphrased verse, songs with chords, any screen, slideshows, a production desk, a phone remote and live captions.",
  path: "/features",
  crumb: "Features",
  data: [application(origin)],
}, origin)}
<style>
${FONT_CSS}
${SITE_CSS}
${FEATURES_CSS}
</style>
</head>
<body>
<div class="sky" aria-hidden="true"></div>
${siteHeader("features")}

<main>
<section class="f-hero"><div class="wrap">
  <span class="eyebrow reveal">Features</span>
  <h1 class="reveal d1">Everything your church does on a screen, <span class="serif">in one place.</span></h1>
  <p class="reveal d2">From the verse the preacher reads aloud to the phones in the back row: here is all of it, working. Free to start, and Premium is free for ${TRIAL_DAYS} days.</p>
  <div class="stats reveal d3">
    <div class="stat"><b data-count="250">0</b><span>misheard book names put right</span></div>
    <div class="stat"><b data-count="10">0</b><span>Bibles offline, Twi to Yorùbá</span></div>
    <div class="stat"><b data-count="33">0</b><span>themes for verses, songs and slides</span></div>
    <div class="stat"><b data-count="8">0</b><span>extra screens, each with a job</span></div>
  </div>
</div></section>

<nav class="chapters" aria-label="Chapters"><div class="wrap">${CHAPTERS.map(([id, name]) => `<a href="#${id}" data-chapter="${id}">${name}</a>`).join("")}</div></nav>

${chapter("listen", 1, `It <span class="serif">listens</span>, so you don't have to type.`, "Press Listen. As the preacher reads, Church Studio finds the verse and puts it on Preview. When they paraphrase, your own AI names the passage.", `
  <div class="duo">
    <div class="demo reveal"><h3>Heard, found, waiting on Preview</h3><p>Nothing reaches the screen until you press LIVE.</p>
      <div class="transcript" aria-live="off"><span class="typed" id="said"></span><span class="caret"></span></div>
      <div class="found" id="found"><span class="chip" id="found-chip"></span><small id="found-note"></small></div>
      <div class="screen-box listen-screen empty" id="listen-screen"><div><span class="ref" id="listen-ref"></span><p class="words" id="listen-words"></p></div><span class="pv-tag">Preview</span></div>
      <div class="ai-row"><span><b>Claude</b></span><span><b>ChatGPT</b></span><span><b>Gemini</b></span><span><b>An AI on this computer</b> · Ollama, LM Studio</span></div>
    </div>
    <ul class="list reveal d1">
      ${item("Verses by voice", "References and close quotes, in any translation you have. Matches go to Preview only.", "premium")}
      ${item("Your accent, understood", "About 250 mishearings put right (“efficient 4” is Ephesians 4), and it learns your church's own words.", "premium")}
      ${item("Accurate listening", "Whisper running on your own computer: audio never leaves the building.", "premium", mac.replace("Mac today", "Mac & Windows"))}
      ${item("Verses by meaning", "When the preacher describes a verse, the AI names it. Off until you switch it on.", "free", '<span class="tag tag-os">your AI key</span>')}
      ${item("Follows the singing and the sermon", "Finds the song part being sung, and the sermon slide being preached.", "premium")}
      ${item("AI that helps you prepare", "Sermon summaries, slide decks from notes or a passage, songs suggested for the sermon.", "free", '<span class="tag tag-os">your AI key</span>')}
    </ul>
  </div>`)}

${chapter("scripture", 2, `Every verse, <span class="serif">in a moment.</span>`, "Type “jn316”, say it, or pick it from today's service. Two translations side by side when you want them.", `
  <div class="duo flip">
    <ul class="list reveal">
      ${item("Quick find", "Shorthand like jn316 or 1co13, phrase search, forgiving spelling.", "free")}
      ${item("Side by side", "Two translations on the screen together.", "free")}
      ${item("Offline Bibles", "KJV, ASV, WEB, BBE and Akuapem Twi built in; Asante Twi, Ewe, Yorùbá, Igbo and Hausa a click away.", "free")}
      ${item("Your church's Bible", "Import Zefania, OSIS or OpenSong files; NIV, ESV and more online with your API.Bible key.", "free")}
      ${item("Gone live, kept", "Every scripture shown is listed; one click sends it back.", "free")}
    </ul>
    <div class="demo reveal d1"><h3>Shorthand, understood</h3><p>Type a few letters; the passage is on Preview.</p>
      <div class="finder">${icon("arrow", 16)}<span class="typed" id="find-typed"></span><span class="caret"></span></div>
      <div class="finder-result"><div class="screen-box"><div><span class="ref" id="find-ref">JOHN 3:16</span><p class="words" id="find-words">For God so loved the world, that he gave his only begotten Son.</p></div></div></div>
      <div class="bibles"><span>KJV</span><span>ASV</span><span>WEB</span><span>BBE</span><span class="home">Akuapem Twi</span><span class="home">Asante Twi</span><span class="home">Ewe</span><span class="home">Yorùbá</span><span class="home">Igbo</span><span class="home">Hausa</span></div>
    </div>
  </div>`)}

${chapter("songs", 3, `Songs, <span class="serif">the way they're sung.</span>`, "Arrangements with repeats, chords for the band, two languages line by line, and CCLI reporting that counts itself.", `
  <div class="duo">
    <div class="demo reveal"><h3>The arrangement, as sung</h3><p>Verse, chorus, bridge, repeats: one key each, or let it follow the singing.</p>
      <div class="order" id="order"><span class="v">V1</span><span class="c">C</span><span class="v">V2</span><span class="c">C</span><span class="b">B</span><span class="c">C</span><span class="c">C</span></div>
      <div class="chords"><div><span class="chord">G &nbsp; &nbsp; &nbsp; &nbsp; C</span>Great is Thy faithfulness</div><div><span class="chord">D &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; G</span>O God my Father</div></div>
    </div>
    <ul class="list reveal d1">
      ${item("Imports", "ProPresenter (5–7), EasyWorship 6 and 7, SongSelect, OpenLyrics, ChordPro and plain text.", "free")}
      ${item("Chords for the band", "On the stage screen only, transposed to the key you sing in.", "premium")}
      ${item("Two languages", "A second language under each line, or either on its own.", "free")}
      ${item("Backing tracks", "A track that starts when its song goes live.", "free")}
      ${item("CCLI reporting", "Each song counts once a day it's shown; export the report.", "free")}
      ${item("Look up a song", "Old hymns written out for you to check; SongSelect for the rest.", "free", '<span class="tag tag-os">your AI key</span>')}
    </ul>
  </div>`)}

${chapter("service", 4, `The whole service, <span class="serif">on time.</span>`, "Plan it, check it before you start, run it part by part, and see afterwards where the time went.", `
  <div class="duo flip">
    <div class="demo reveal"><h3>Readiness check</h3><p>One press before the service. Worst first, each with its fix.</p>
      <div class="checks" id="checks">
        <div class="check"><i>✓</i>The audience screen is on<small>Projector</small></div>
        <div class="check"><i>✓</i>Everything in Sunday Service is here</div>
        <div class="check"><i>✓</i>Room for about 14 hours of recording</div>
        <div class="check warn"><i>!</i>Last backup was 9 days ago<small>Back up now</small></div>
        <div class="check"><i>✓</i>Your library is in good shape</div>
      </div>
      <p class="verdict" id="verdict">Ready, with 1 thing to look at</p>
    </div>
    <div class="demo reveal d1"><h3>Planned against used</h3><p>The service report, ready for next week's plan.</p>
      <div class="report" id="report">
        <div class="bar-row"><span>Welcome</span><div class="bars"><i class="b-plan" data-w="20"></i><i class="b-used" data-w="18"></i></div><b>3:40</b></div>
        <div class="bar-row"><span>Worship</span><div class="bars"><i class="b-plan" data-w="55"></i><i class="b-used" data-w="62"></i></div><b class="late">+2:10</b></div>
        <div class="bar-row"><span>Reading</span><div class="bars"><i class="b-plan" data-w="15"></i><i class="b-used" data-w="14"></i></div><b>2:55</b></div>
        <div class="bar-row"><span>Sermon</span><div class="bars"><i class="b-plan" data-w="80"></i><i class="b-used" data-w="78"></i></div><b>34:20</b></div>
        <div class="bar-row"><span>Closing</span><div class="bars"><i class="b-plan" data-w="18"></i><i class="b-used" data-w="16"></i></div><b>3:05</b></div>
      </div>
    </div>
  </div>
  <ul class="list reveal" style="margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
    ${item("Running order", "Parts holding songs, scripture, slides, pictures, video and looks. Templates bring last week back.", "free")}
    ${item("Timings", "A start time, a length or an end time per part, and a warning when it runs late.", "free")}
    ${item("Planning Center", "Bring upcoming plans in, with songs and their lyrics.", "free")}
    ${item("Timers", "Countdown, count-up, clock or to a time, with warning beeps on the desk only.", "free")}
    ${item("Sermons", "Notes only the desk and stage see, a sermon clock, and outlines made from your notes.", "free")}
    ${item("Run sheet", "Print or save the order of service as a PDF.", "free")}
  </ul>`)}

${chapter("screens", 5, `Any screen, <span class="serif">any shape.</span>`, "Projectors, TVs and LED walls. The words always fit, and each extra screen can have its own job.", `
  <div class="duo">
    <div class="demo reveal"><h3>The shape follows your screen</h3><p>16:9, 4:3, an ultra-wide LED wall or a portrait TV: laid out for each, never stretched.</p>
      <div class="shape-stage"><div class="shape" id="shape"><div><small>JOHN 3:16</small>For God so loved the world</div></div></div>
      <p class="shape-label" id="shape-label">16:9 projector</p>
    </div>
    <div class="demo reveal d1"><h3>Screens with jobs</h3><p>Up to eight, each fixed to a job or changing with the service.</p>
      <div class="jobs">
        <div class="job prog"><div><b>Program</b>What the room sees</div></div>
        <div class="job"><div><b>Lyrics only</b>For the balcony</div></div>
        <div class="job"><div><span class="t" id="job-timer">4:59</span>Timer</div></div>
        <div class="job"><div><b>Stage</b>Now, next, chords</div></div>
        <div class="job"><div><b>Scripture</b>Lobby TV</div></div>
        <div class="job"><div><b>Phones</b>Over the internet</div></div>
      </div>
    </div>
  </div>
  <ul class="list reveal" style="margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
    ${item("Audience output", "Preview and Program, LIVE, Clear, Black and Logo, and undo on Program.", "free")}
    ${item("Stage display", "Now and next, a clock, timers, notes and chords for the platform; a phone or tablet can be the stage screen.", "premium")}
    ${item("Extra screens", "Up to eight, each with a job: Program, scripture, lyrics, timer, stage or blank.", "premium")}
    ${item("Screens anywhere", "Any browser shows what your screen shows, over the internet.", "free")}
    ${item("Overlays and alerts", "A logo bug, ticker, banner, clock or lower third over anything; a nursery call over everything.", "free")}
  </ul>`)}

${chapter("pictures", 6, `Slides and pictures, <span class="serif">beautifully.</span>`, "A design studio for slides, 33 themes, and picture slideshows straight from a folder, with music and real transitions.", `
  <div class="duo flip">
    <ul class="list reveal">
      ${item("Design studio", "Layered pages with text, shapes, icons, pictures and QR codes, 13 templates laid out for every screen shape.", "free")}
      ${item("Themes", "33 to choose from: animated scenes, photos, video and full editing.", "free", '<span class="tag tag-premium">22 Premium</span>')}
      ${item("PowerPoint and PDF", "PowerPoint as editable slides with notes; PDF pages as pictures.", "free")}
      ${item("Pictures from a folder", "Any folder, Google Drive, iCloud, Dropbox or OneDrive, with videos played to the end.", "free")}
      ${item("Slideshow", "Fade, Push, Zoom, Dip or a Mix, slow zoom, captions, a countdown, music that loops, new pictures joining.", "free")}
    </ul>
    <div class="demo reveal d1"><h3>Real transitions, picture to picture</h3><p>The slideshow keeps the old picture on screen while the new one moves in.</p>
      <div class="reel" id="reel"><div class="ph">Youth night</div><div class="ph">Baptisms</div><div class="ph">Harvest</div><div class="ph">Choir</div></div>
      <div class="reel-label"><span>Change: <b id="reel-kind">Fade</b></span><span id="reel-n">1 / 4</span></div>
      <div class="swatches"><i style="background:linear-gradient(135deg,#4a1606,#050505)"></i><i style="background:linear-gradient(135deg,#0f2a4a,#03070d)"></i><i style="background:radial-gradient(circle at 30% 30%,#ffd27a,#7a3b00)"></i><i style="background:linear-gradient(160deg,#1f3b2b,#071009)"></i><i style="background:linear-gradient(135deg,#3b2b5c,#0b0716)"></i><i style="background:linear-gradient(135deg,#f5f0e6,#d9cfbd)"></i></div>
    </div>
  </div>`)}

${chapter("production", 7, `A production desk, <span class="serif">built in.</span>`, "Cameras, scenes and lower thirds, streamed or recorded, or sent to OBS, vMix and NDI.", `
  <div class="duo">
    <div class="demo reveal"><h3>Scenes, one click each</h3><p>Camera with a name, verse beside the preacher, wide shot: switch live.</p>
      <div class="scene-grid" id="scenes">
        <div class="scene-tile live"><div class="cam"></div><div class="lt"></div><em>Camera + name</em></div>
        <div class="scene-tile"><div class="cam"></div><div class="vs"></div><em>Verse + camera</em></div>
        <div class="scene-tile"><div class="cam"></div><em>Wide</em></div>
      </div>
      <div class="ticker"><span>Youth night is Friday at 7 pm · Baptisms after the service next Sunday · Prayer meeting Wednesday 6 pm ·</span></div>
      <div class="outs"><span><i></i>Streaming</span><span><i></i>Recording</span><span>NDI</span><span>OBS</span><span>vMix</span></div>
    </div>
    <ul class="list reveal d1">
      ${item("Production desk", "Scenes from cameras, scripture, songs, timers, pictures, video and web pages, in 13 ready layouts.", "premium")}
      ${item("Stream and record", "To YouTube, Facebook or any RTMP server, and to a file, with a test pattern first.", "church", mac)}
      ${item("NDI out and in", "Program with sound to other apps; NDI cameras into scenes; words on transparency for keying.", "church", mac)}
      ${item("OBS and vMix", "Switch scenes and start streaming or recording from the desk.", "premium")}
      ${item("Lower thirds for your stream", "A browser source with the words on Program, for OBS or vMix.", "premium")}
      ${item("Cameras", "Any camera the computer sees, phone-as-webcam apps included.", "premium")}
    </ul>
  </div>`)}

${chapter("people", 8, `The congregation's phones, <span class="serif">welcome.</span>`, "A remote in anyone's pocket, captions in each person's language, questions and polls, and quizzes played like a game show, with no app to install.", `
  <div class="duo flip">
    <div class="demo reveal"><h3>A remote that looks like the desk</h3><p>Pair with a QR code, over Wi-Fi or the internet; approved on the desk.</p>
      <div class="people">
        <div class="phone" aria-hidden="true">
          <div class="top"><i></i>Grace Chapel</div>
          <div class="mon"><div>Chorus</div><div>Verse 2</div></div>
          <div class="tiles"><span>CUT</span><span>CLEAR</span><span>WORDS</span><span>BLACK</span><span>LOGO</span><span>UNDO</span>
            <div class="rows"><p>Welcome loop</p><p class="cur">Way Maker</p><p>John 3:16–17</p><p>Offering</p></div></div>
          <div class="go"><span>‹</span><span class="live">GO LIVE</span><span>›</span></div>
        </div>
        <div>
          <ul class="list" style="border:0;padding:0;background:none">
            ${item("Phone remote", "Live and Preview arrows, GO LIVE, Undo, open or close the screen, music and timers; it stays awake.", "premium")}
            ${item("Over the internet", "A phone on mobile data controls the desk, with no router settings.", "premium")}
          </ul>
        </div>
      </div>
    </div>
    <div class="demo reveal d1"><h3>Questions, polls, captions</h3><p>Nothing from a phone reaches the screen until you put it there.</p>
      <div class="qa" id="qa">
        <div class="q"><b>24</b>How do we join a small group?</div>
        <div class="q"><b>17</b>Can you share the sermon notes?</div>
        <div class="q"><b>9</b>When is the next baptism?</div>
      </div>
      <div class="poll" id="poll"><div><i data-w="64"></i><span>Saturday morning <b>64%</b></span></div><div><i data-w="36"></i><span>Sunday evening <b>36%</b></span></div></div>
      <div class="cap-langs" id="caps"><span class="on">English</span><span>Français</span><span>Español</span><span>Twi</span></div>
    </div>
  </div>
  <ul class="list reveal" style="margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
    ${item("Live captions", "On the screen and on phones through a QR code, translated into up to four languages by your AI.", "free")}
    ${item("Rooms for the congregation", "Q&A with upvotes and moderation, polls, quizzes and Bible games from your Bible.", "free")}
    ${item("A game show on the screen", "Every player in their own colour: a lobby with the code and QR, a Get ready countdown, the clock, how the room answered and who was fastest, a leaderboard where people climb as points count up, a podium with confetti. Music and sounds. It can run by itself.", "free")}
    ${item("Quizzes written by your AI", "From today's sermon, so you see who was listening; from a book you read together, a passage, a topic, or anything pasted. You check every question first.", "free")}
    ${item("Phones in the game", "Each phone shows its colour, the answer shapes and the clock, then the points won, the streak and the place: 2nd of 23.", "free")}
  </ul>`)}

${chapter("control", 9, `Every action, <span class="serif">one key away.</span>`, "⌘K goes to anything. Macros run a sequence; a Stream Deck or a phone presses the buttons.", `
  <div class="duo">
    <div class="demo reveal"><h3>Go to anything</h3><p>Songs, scripture, settings and actions, from the keyboard.</p>
      <div class="palette"><div class="q-in">${icon("arrow", 16)}<span class="typed" id="pal-typed"></span><span class="caret"></span><kbd>⌘K</kbd></div>
        <ul id="pal"><li class="on">Way Maker<small>Song</small></li><li>Walk-in music<small>Playlist</small></li><li>Go live<small>Action · Space</small></li></ul></div>
      <div class="deck" id="deck"><span>GO LIVE</span><span>NEXT</span><span>PREV</span><span>CLEAR</span><span>BLACK</span><span>LOGO</span><span>WALK-IN</span><span>TIMER</span><span>CUT</span><span>UNDO</span></div>
    </div>
    <ul class="list reveal d1">
      ${item("Macros", "Up to 24, each up to 20 steps: music, go live, timers, captions, stage messages, OBS and vMix.", "free")}
      ${item("Keyboard", "Every key can be changed; part keys jump to a verse, chorus or bridge.", "free")}
      ${item("Voice commands", "“Next verse”, “give me King James”, and phrases of your own.", "premium")}
      ${item("Stream Deck and Companion", "A link per action for any button that can open a web address.", "premium")}
    </ul>
  </div>`)}

${chapter("calm", 10, `Peace of mind, <span class="serif">built in.</span>`, "For the volunteer at the desk on a Sunday morning: nothing surprising, and help close at hand.", `
  <div class="calm-grid">
    <div class="calm reveal"><div class="ic">${icon("shield")}</div><h3>Preview first, undo after</h3><p>Everything waits on Preview; LIVE sends it. A mistake on the screen? ⌘Z puts back what was there.</p></div>
    <div class="calm reveal d1"><div class="ic">${icon("globe")}</div><h3>Works offline</h3><p>Scripture, songs, services and screens run with no internet. Your library stays on your computer.</p></div>
    <div class="calm reveal d2"><div class="ic">${icon("check")}</div><h3>Readiness check</h3><p>Screens, the service's files, recording space, backups and your plan, checked in one press.</p></div>
    <div class="calm reveal"><div class="ic">${icon("clock")}</div><h3>Performance page</h3><p>How fast it opens, any freezes, how smoothly the screen runs, memory and space, with what to do.</p></div>
    <div class="calm reveal d1"><div class="ic">${icon("download")}</div><h3>Backups and updates</h3><p>Backups every 30 minutes to a cloud folder, restored on a second computer; signed updates in the app.</p></div>
    <div class="calm reveal d2"><div class="ic">${icon("captions")}</div><h3>In your language</h3><p>The whole desk in English, French and Spanish, and Bibles in Twi, Ewe, Yorùbá, Igbo and Hausa.</p></div>
  </div>
  <div class="final reveal"><h2>See it on <span class="serif">your</span> screen.</h2><p>Download Church Studio free, or try it in your browser first. Premium is free for ${TRIAL_DAYS} days, no card.</p>
    <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap"><a class="btn hot" href="/#download" data-get-main>${icon("download", 18)}<span data-get-label>Download Church Studio</span></a><a class="btn glass" href="/app/" target="_blank" rel="noopener">${icon("globe", 18)}Try it in your browser</a></div></div>`)}
</main>

${siteFooter(site)}

<script>
(() => {
  const ua = navigator.userAgent;
  const os = /Windows/i.test(ua) ? "windows" : /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "mac" : /Linux/i.test(ua) && !/Android/i.test(ua) ? "linux" : null;
  const names = { mac: "Download for Mac", windows: "Download for Windows", linux: "Download for Linux" };
  if (os) {
    document.querySelectorAll("[data-get-label]").forEach((el) => (el.textContent = names[os]));
    document.querySelectorAll("[data-get-main]").forEach((el) => el.setAttribute("href", "/download/" + os));
  }
  const nav = document.getElementById("nav");
  addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 8), { passive: true });
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));

  // Each demo starts when it comes into view, once.
  const starts = new Map();
  const seen = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("in");
    seen.unobserve(entry.target);
    const start = starts.get(entry.target);
    if (start) start();
  }), { threshold: 0.18 });
  document.querySelectorAll(".reveal").forEach((el) => seen.observe(el));
  const when = (selector, start) => { const el = document.querySelector(selector)?.closest(".reveal"); if (el) starts.set(el, start); };

  // The chapter bar follows the reader.
  const links = new Map([...document.querySelectorAll("[data-chapter]")].map((a) => [a.dataset.chapter, a]));
  const spy = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    links.forEach((a) => a.classList.remove("on"));
    const a = links.get(entry.target.id);
    if (a) { a.classList.add("on"); a.scrollIntoView({ block: "nearest", inline: "center", behavior: still ? "auto" : "smooth" }); }
  }), { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll(".chapter").forEach((el) => spy.observe(el));

  // Numbers count up.
  when(".stats", () => document.querySelectorAll("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count);
    if (still) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = (now) => { const p = Math.min(1, (now - t0) / 1400); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }));

  async function type(el, text, speed = 38) {
    if (still) { el.textContent = text; return; }
    el.textContent = "";
    for (const char of text) { el.textContent += char; await wait(speed); }
  }

  // 1. Listening: a reference, then a paraphrase named by the AI.
  const SAID = [
    ["“turn with me to John three sixteen”", "John 3:16 on Preview", "heard", false, "JOHN 3:16", "For God so loved the world, that he gave his only begotten Son."],
    ["“Paul tells us nothing in all creation can separate us from the love of God”", "Romans 8:38–39", "named by your AI", true, "ROMANS 8:38–39", "Nor height, nor depth, nor any other creature, shall be able to separate us from the love of God."],
    ["“the Lord is my shepherd, I lack nothing”", "Psalm 23:1 on Preview", "a close quote", false, "PSALM 23:1", "The Lord is my shepherd; I shall not want."],
  ];
  when("#said", async () => {
    const said = document.getElementById("said"), found = document.getElementById("found"), chip = document.getElementById("found-chip"), note = document.getElementById("found-note");
    for (let n = 0; ; n = (n + 1) % SAID.length) {
      const [text, ref, how, ai, verse, words] = SAID[n];
      const screen = document.getElementById("listen-screen");
      found.classList.remove("in");
      screen.classList.add("empty");
      await type(said, text, 32);
      await wait(400);
      chip.textContent = ref; chip.classList.toggle("ai", ai); note.textContent = how;
      found.classList.add("in");
      document.getElementById("listen-ref").textContent = verse;
      document.getElementById("listen-words").textContent = words;
      screen.classList.remove("empty");
      if (still) return;
      await wait(2600);
    }
  });

  // 2. Scripture: shorthand to a verse.
  const FIND = [["jn316", "JOHN 3:16", "For God so loved the world, that he gave his only begotten Son."], ["ps231", "PSALM 23:1", "The Lord is my shepherd; I shall not want."], ["1co134", "1 CORINTHIANS 13:4", "Charity suffereth long, and is kind."]];
  when("#find-typed", async () => {
    const typed = document.getElementById("find-typed"), ref = document.getElementById("find-ref"), words = document.getElementById("find-words");
    for (let n = 0; ; n = (n + 1) % FIND.length) {
      await type(typed, FIND[n][0], 120);
      ref.textContent = FIND[n][1]; words.textContent = FIND[n][2];
      if (still) return;
      await wait(2400);
    }
  });

  // 3. Songs: the arrangement plays through.
  when("#order", () => {
    const parts = [...document.querySelectorAll("#order span")];
    let at = 0;
    parts[0].classList.add("on");
    if (!still) setInterval(() => { parts[at].classList.remove("on"); at = (at + 1) % parts.length; parts[at].classList.add("on"); }, 1100);
  });

  // 4. Service: the checks tick through; the report bars grow.
  when("#checks", async () => {
    const checks = [...document.querySelectorAll("#checks .check")];
    for (const check of checks) { check.classList.add("done"); await wait(still ? 0 : 380); }
    document.getElementById("verdict").classList.add("in");
  });
  when("#report", () => document.querySelectorAll("#report i").forEach((bar) => (bar.style.width = bar.dataset.w + "%")));

  // 5. Screens: the same verse on every shape; a timer runs.
  const SHAPES = [[240, 135, "16:9 projector"], [200, 150, "4:3 projector"], [300, 84, "Ultra-wide LED wall"], [110, 196, "Portrait TV"]];
  when("#shape", () => {
    const shape = document.getElementById("shape"), label = document.getElementById("shape-label");
    let n = 0;
    const set = () => { const [w, h, name] = SHAPES[n]; shape.style.width = w + "px"; shape.style.height = h + "px"; label.textContent = name; };
    set();
    if (!still) setInterval(() => { n = (n + 1) % SHAPES.length; set(); }, 2200);
    let left = 299;
    const timer = document.getElementById("job-timer");
    if (!still) setInterval(() => { left = left > 0 ? left - 1 : 299; timer.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0"); }, 1000);
  });

  // 6. Pictures: the slideshow's real moves, one after another.
  const MOVES = [
    ["Fade", [{ opacity: 0 }, { opacity: 1 }], [{ opacity: 1 }, { opacity: 1 }]],
    ["Push", [{ transform: "translateX(100%)" }, { transform: "none" }], [{ transform: "none" }, { transform: "translateX(-100%)" }]],
    ["Zoom", [{ opacity: 0, transform: "scale(1.12)" }, { opacity: 1, transform: "none" }], [{ opacity: 1 }, { opacity: 0, transform: "scale(.96)" }]],
    ["Dip", [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], [{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }]],
  ];
  when("#reel", () => {
    const slides = [...document.querySelectorAll("#reel .ph")];
    slides.forEach((el, i) => (el.style.zIndex = i === 0 ? 2 : 0));
    let at = 0, move = 0;
    if (still) return;
    setInterval(() => {
      const next = (at + 1) % slides.length;
      const [name, inn, out] = MOVES[move];
      document.getElementById("reel-kind").textContent = name;
      document.getElementById("reel-n").textContent = next + 1 + " / " + slides.length;
      slides.forEach((el, i) => (el.style.zIndex = i === next ? 2 : i === at ? 1 : 0));
      const timing = { duration: 1100, easing: "cubic-bezier(.65,0,.35,1)", fill: "both" };
      slides[next].animate(inn, timing);
      slides[at].animate(out, timing);
      at = next; move = (move + 1) % MOVES.length;
    }, 2600);
  });

  // 7. Production: scenes switch.
  when("#scenes", () => {
    const tiles = [...document.querySelectorAll("#scenes .scene-tile")];
    let at = 0;
    if (!still) setInterval(() => { tiles[at].classList.remove("live"); at = (at + 1) % tiles.length; tiles[at].classList.add("live"); }, 2000);
  });

  // 8. People: questions rise with votes; the poll fills; captions change language.
  when("#qa", () => {
    document.querySelectorAll("#poll i").forEach((bar) => (bar.style.width = bar.dataset.w + "%"));
    const counts = [...document.querySelectorAll("#qa b")];
    if (!still) setInterval(() => { const i = Math.floor(Math.random() * counts.length); counts[i].textContent = String(Number(counts[i].textContent) + 1); }, 900);
    const langs = [...document.querySelectorAll("#caps span")];
    let at = 0;
    if (!still) setInterval(() => { langs[at].classList.remove("on"); at = (at + 1) % langs.length; langs[at].classList.add("on"); }, 1600);
  });

  // 9. Control: the palette finds a song; Stream Deck keys light up.
  when("#pal-typed", async () => {
    const keys = [...document.querySelectorAll("#deck span")];
    if (!still) setInterval(() => { keys.forEach((k) => k.classList.remove("lit")); keys[Math.floor(Math.random() * keys.length)].classList.add("lit"); }, 900);
    const typed = document.getElementById("pal-typed");
    const WORDS = ["way maker", "walk in", "go live"];
    const rows = [...document.querySelectorAll("#pal li")];
    for (let n = 0; ; n = (n + 1) % WORDS.length) {
      rows.forEach((row, i) => row.classList.toggle("on", i === n));
      await type(typed, WORDS[n], 90);
      if (still) return;
      await wait(1800);
    }
  });
})();
</script>
</body>
</html>`;
}
