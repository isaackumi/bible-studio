// The home page at church-studio.heitechinc.com: what Church Studio is, shown working (a live,
// animated desk), what it does, which computers it runs on (with the real downloads), prices and
// answers. One self-contained page: no framework, a little script for the animations, and every
// motion stopped for people who ask their computer for less of it.

import { FEATURE_LABELS, PLANS, TRIAL_DAYS } from "../src/lib/domain/plans.ts";
import { published } from "../src/lib/domain/changelog.ts";
import { megabytes, RELEASES_PAGE, type Platform, type Release } from "./downloads.ts";
import { PRICES } from "./pricing.ts";
import type { Site } from "./site.ts";
import { application, FONT_CSS, organisation, questions, seoHead, SITE_URL } from "./seo.ts";

export const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export const ICON = {
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  camera: '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  captions: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>',
  screens: '<rect x="2" y="4" width="14" height="10" rx="1.5"/><rect x="11" y="10" width="11" height="10" rx="1.5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  windows: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
};
export const icon = (name: keyof typeof ICON, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

/** A download button for one platform: the real file's size and version when known. */
function getButton(release: Release | null, platform: Platform, label: string, primary = false): string {
  const asset = release?.assets[platform];
  const meta = asset ? `<small>${escape(megabytes(asset.size))}</small>` : "";
  return `<a class="get${primary ? " primary" : ""}" href="/download/${platform}" data-platform="${platform}">${icon("download", 16)}<span>${escape(label)}</span>${meta}</a>`;
}

function planCards(): string {
  return PLANS.map((plan) => {
    const prices = plan.id === "free" ? null : PRICES[plan.id];
    const price = prices
      ? `<div class="price"><span class="amount" data-monthly="${dollars(prices.monthly)}" data-yearly="${dollars(Math.round(prices.yearly / 12))}">${dollars(prices.monthly)}</span><small>/ month</small></div>
         <p class="billing" data-monthly="Billed monthly · ${plan.computers === 1 ? "1 computer" : `${plan.computers} computers`}" data-yearly="${dollars(prices.yearly)} billed yearly · ${plan.computers === 1 ? "1 computer" : `${plan.computers} computers`}">Billed monthly · ${plan.computers === 1 ? "1 computer" : `${plan.computers} computers`}</p>`
      : `<div class="price"><span class="amount">$0</span><small>forever</small></div><p class="billing">1 computer · no card, no time limit</p>`;
    const items = plan.features
      .map((id) => `<li>${icon("check", 15)}<span>${escape(FEATURE_LABELS[id].label)}${FEATURE_LABELS[id].soon ? ' <em>soon</em>' : ""}</span></li>`)
      .join("");
    const cta = plan.id === "free" ? `<a class="plan-cta" href="#download">Download free</a>` : `<a class="plan-cta${plan.popular ? " hot" : ""}" href="#download">Try ${escape(plan.name)} free</a>`;
    return `<article class="plan plan-${plan.id}${plan.popular ? " popular" : ""} reveal">
      ${plan.popular ? '<span class="ribbon">Most churches</span>' : ""}
      <h3>${escape(plan.name)}</h3><p class="tagline">${escape(plan.tagline)}</p>${price}${cta}<ul>${items}</ul></article>`;
  }).join("");
}

/** The answers people (and AI assistants) look for, said plainly; the home page and llms.txt share them. */
export const FAQ: Array<[string, string]> = [
  ["What is Church Studio?", `Church Studio is church presentation software for Mac, Windows and Linux, made by HeiTech. It puts scripture, song lyrics, sermons, slides and pictures on a church's screens, listens for Bible verses as they are read aloud, and runs the whole service on time. It is free to start; Premium is ${"$"}${PRICES.premium.monthly / 100} a month and Church is ${"$"}${PRICES.church.monthly / 100} a month for three computers.`],
  ["Is it an alternative to ProPresenter or EasyWorship?", "Yes, for most churches. It imports ProPresenter (5, 6 and 7) and EasyWorship (6 and 7) song libraries, has a free plan, and adds what they do not have built in: scripture found by listening, AI help with sermons and songs, live captions translated for phones, and questions and polls from the congregation's phones. Broadcast hardware control such as SDI, MIDI, DMX and timecode is not built in."],
  ["Can it find Bible verses automatically?", "Yes. Press Listen and Church Studio finds the verse the preacher reads or quotes, in any translation you have, and puts it on Preview; LIVE sends it to the screen. With your own AI key it can also name a verse the preacher only paraphrases or describes."],
  ["Does it work without the internet?", "Yes. Scripture, songs, services and the screens all run offline. The internet is needed only to start a trial or add a plan, for updates, and for online extras like streaming."],
  ["Which computers does it run on?", "Macs with Apple silicon (M1, M2, M3, M4) and Intel Macs, from one download, on macOS 13 Ventura or later. Windows 10 and 11 (64-bit). And Linux: AppImage, .deb and .rpm."],
  ["Can we bring our songs from ProPresenter or EasyWorship?", "Yes. Import ProPresenter and EasyWorship libraries, OpenLyrics, ChordPro (chords kept for the band), plain text, and PowerPoint or PDF slides."],
  ["Will it understand our pastor's accent?", "It is made to. Nearly 250 common mishearings of book names are put right before verses are found (\u201cefficient 4\u201d becomes Ephesians 4), it learns your church's own words as you use it, and Accurate listening (Whisper, a one-time 60 MB download) hears Ghanaian, Nigerian and other accents better. A Practice mode lets you test it with your own readers."],
  ["Is our audio sent anywhere?", "Not with Accurate listening: it runs entirely on your computer. The system recognizer is Apple's or Windows' own; Apple's may use its servers, under Apple's privacy policy. We never receive your audio or the words."],
  ["Which Bible translations are included?", "KJV, ASV, WEB, BBE and Akuapem Twi come built in, and Asante Twi, Ewe, Yorùbá, Igbo and Hausa are a free download; all work offline. You can add your church's Bible from a Zefania, OSIS or OpenSong file, and NIV, ESV and others online with your own API.Bible key."],
  ["Is our data ours?", "Yes. Your songs, services and notes stay on your computer. An account is optional; it only carries your plan to another computer."],
  ["What does streaming need?", "The Church plan and your YouTube or Facebook stream key. Church Studio streams and records the audience screen itself, or works alongside OBS and vMix."],
];

const PARTNERS = ["OBS Studio", "vMix", "NDI", "YouTube Live", "Facebook Live", "ProPresenter import", "EasyWorship import", "Planning Center", "ChordPro", "OpenLyrics", "PowerPoint & PDF", "CCLI reporting"];

/** The look every marketing page shares: colours, type, the night sky, the bar, buttons, cards and sections. */
export const SITE_CSS = `:root { --bg: #07070a; --bg2: #0c0c11; --panel: rgba(255,255,255,.035); --panel2: rgba(255,255,255,.06); --line: rgba(255,255,255,.09); --ink: #f5f5f7; --muted: #9b9ba8; --dim: #6e6e7a; --accent: #fa4f00; --accent2: #ff9a4d; --violet: #8b6cff; --good: #34c88a; --live: #ff3b3b; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
a { color: inherit; text-decoration: none; }
.serif { font-family: "Instrument Serif", Georgia, serif; font-style: italic; font-weight: 400; letter-spacing: -.01em; }
.wrap { width: min(1180px, calc(100% - 40px)); margin: 0 auto; }
/* The night sky behind it all: warm glows, a fine grid, and grain. */
.sky { position: fixed; inset: 0; z-index: -1; pointer-events: none; background:
  radial-gradient(900px 500px at 15% -10%, rgba(250,79,0,.22), transparent 60%),
  radial-gradient(800px 600px at 95% 10%, rgba(139,108,255,.16), transparent 60%),
  radial-gradient(1200px 700px at 50% 120%, rgba(250,79,0,.10), transparent 60%), var(--bg); }
.sky::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 64px 64px; mask-image: radial-gradient(ellipse 70% 55% at 50% 30%, #000 30%, transparent 75%); }
.sky::after { content: ""; position: absolute; inset: -50%; opacity: .05; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); animation: grain 8s steps(6) infinite; }
@keyframes grain { 50% { transform: translate(-3%, 2%); } }

/* Navigation */
.nav { position: sticky; top: 0; z-index: 50; backdrop-filter: saturate(160%) blur(14px); background: rgba(7,7,10,.62); border-bottom: 1px solid transparent; transition: border-color .3s; }
.nav.scrolled { border-bottom-color: var(--line); }
.nav .wrap { display: flex; align-items: center; gap: 28px; height: 66px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: -.01em; }
.brand img { width: 30px; height: 30px; border-radius: 8px; }
.nav .links { display: flex; gap: 26px; margin-left: 8px; font-size: 14.5px; color: var(--muted); }
.nav .links a:hover { color: var(--ink); }
.nav .grow { flex: 1; }
.btn { display: inline-flex; align-items: center; gap: 9px; height: 44px; padding: 0 20px; border-radius: 12px; font-weight: 650; font-size: 15px; transition: transform .2s, box-shadow .2s, background .2s; white-space: nowrap; }
.btn:active { transform: scale(.98); }
.btn.hot { background: linear-gradient(180deg, #ff6a1f, var(--accent)); color: #fff; box-shadow: 0 8px 30px rgba(250,79,0,.35), inset 0 1px 0 rgba(255,255,255,.25); }
.btn.hot:hover { box-shadow: 0 12px 40px rgba(250,79,0,.5), inset 0 1px 0 rgba(255,255,255,.25); transform: translateY(-1px); }
.btn.glass { border: 1px solid var(--line); background: var(--panel); }
.btn.glass:hover { background: var(--panel2); }
.btn.small { height: 38px; padding: 0 16px; font-size: 14px; border-radius: 10px; }

/* Hero */
.hero { position: relative; padding: 84px 0 40px; text-align: center; }
.pill { display: inline-flex; align-items: center; gap: 10px; padding: 6px 14px 6px 6px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); font-size: 13.5px; color: var(--muted); }
.pill b { padding: 3px 9px; border-radius: 999px; background: rgba(250,79,0,.16); color: var(--accent2); font-weight: 650; font-size: 12px; }
.hero h1 { margin: 26px auto 22px; max-width: 980px; font-size: clamp(44px, 7.4vw, 96px); line-height: .98; letter-spacing: -.045em; font-weight: 750; }
.hero h1 .serif { font-size: 1.08em; background: linear-gradient(100deg, #ffd2b0, var(--accent2) 40%, var(--accent) 75%); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: .06em; }
.hero p.lede { margin: 0 auto 34px; max-width: 680px; font-size: clamp(17px, 2vw, 20px); color: var(--muted); }
.hero .ctas { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
.hero .fine { margin-top: 18px; font-size: 13.5px; color: var(--dim); }
.hero .fine b { color: var(--muted); font-weight: 600; }
.oses { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 18px; margin-top: 26px; color: var(--dim); font-size: 13px; }
.pill-short { display: none; }
.oses span { display: inline-flex; align-items: center; gap: 6px; }

/* The desk, alive */
.stage { position: relative; margin: 64px auto 0; width: min(1080px, 100%); perspective: 1800px; }
.device { position: relative; border: 1px solid rgba(255,255,255,.12); border-radius: 18px; background: linear-gradient(180deg, #15151b, #0d0d12); box-shadow: 0 60px 140px -30px rgba(250,79,0,.35), 0 30px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06); overflow: hidden; transform: rotateX(8deg); transform-origin: 50% 0; transition: transform 1.2s cubic-bezier(.2,.8,.2,1); }
.stage.in .device { transform: rotateX(0); }
.chrome { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.02); font-size: 12px; color: var(--dim); }
.chrome i { width: 11px; height: 11px; border-radius: 50%; background: #3a3a42; } .chrome i:nth-child(1) { background: #ff5f57; } .chrome i:nth-child(2) { background: #febc2e; } .chrome i:nth-child(3) { background: #28c840; }
.chrome .title { margin-left: 10px; font-weight: 600; color: var(--muted); }
.chrome .tabs { display: flex; gap: 4px; margin-left: 18px; } .chrome .tabs span { padding: 3px 10px; border-radius: 7px; } .chrome .tabs .on { background: var(--accent); color: #fff; font-weight: 650; }
.chrome .golive { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 8px; background: var(--live); color: #fff; font-weight: 800; letter-spacing: .04em; font-size: 11px; transition: box-shadow .3s, transform .3s; }
.chrome .golive.flash { box-shadow: 0 0 0 6px rgba(255,59,59,.25), 0 0 30px rgba(255,59,59,.6); transform: scale(1.06); }
.chrome .golive i { width: 6px; height: 6px; background: #fff; border-radius: 50%; }
.desk { display: grid; grid-template-columns: 0.9fr 2.1fr; gap: 12px; padding: 12px; text-align: left; }
.pane { border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,.02); overflow: hidden; }
.pane h6 { margin: 0; padding: 10px 12px; border-bottom: 1px solid var(--line); font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); font-weight: 700; display: flex; justify-content: space-between; }
.search { margin: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; font-size: 12px; color: var(--muted); display: flex; gap: 8px; align-items: center; }
.verses { display: grid; gap: 6px; padding: 0 10px 10px; }
.verse { display: flex; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; font-size: 12px; color: var(--muted); transition: all .45s cubic-bezier(.2,.8,.2,1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.verse b { color: var(--accent); font-weight: 700; min-width: 16px; }
.verse.on { border-color: rgba(250,79,0,.7); background: rgba(250,79,0,.1); color: var(--ink); transform: translateX(4px); }
.monitors { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-content: start; }
.desk .bible .verses .verse:nth-child(n+5) { display: none; }
.mon .screen { container-type: inline-size; position: relative; aspect-ratio: 16 / 9; margin: 10px; border-radius: 8px; overflow: hidden; background: radial-gradient(120% 90% at 50% 120%, #4a1606, #13070a 60%, #050505); display: grid; place-items: center; text-align: center; padding: 6% 9%; }
.mon .screen::after { content: ""; position: absolute; inset: 0; background: radial-gradient(60% 40% at 50% 100%, rgba(250,79,0,.25), transparent); pointer-events: none; }
.mon .ref { display: block; font-size: clamp(7px, 2.6cqw, 11px); letter-spacing: .2em; color: #f2b88f; margin-bottom: 8px; font-weight: 700; }
.mon .words { margin: 0; font-size: clamp(9px, 4.4cqw, 19px); line-height: 1.4; color: #fff; font-weight: 500; text-wrap: balance; }
.mon .content { position: relative; z-index: 1; transition: opacity .6s, filter .6s, transform .6s; }
.mon .content.out { opacity: 0; filter: blur(6px); transform: translateY(6px); }
.mon.program { border-color: rgba(255,59,59,.45); box-shadow: 0 0 0 1px rgba(255,59,59,.2), 0 0 40px rgba(255,59,59,.12); }
.mon.program h6 { color: #ff8b8b; } .mon.preview h6 { color: var(--accent2); }
.mon h6 .onair { display: inline-flex; align-items: center; gap: 6px; color: #ff6b6b; } .mon h6 .onair i { width: 6px; height: 6px; border-radius: 50%; background: var(--live); box-shadow: 0 0 8px var(--live); animation: blink 1.6s infinite; }
@keyframes blink { 50% { opacity: .3; } }
/* Floating cards around the desk */
.float { position: absolute; z-index: 3; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; background: rgba(18,18,24,.82); backdrop-filter: blur(16px); box-shadow: 0 20px 50px rgba(0,0,0,.5); font-size: 13px; text-align: left; animation: bob 6s ease-in-out infinite; }
.float small { display: block; color: var(--dim); font-size: 11px; }
.float.voice { left: -54px; top: 58%; }
.float.timer { right: -36px; top: -30px; animation-delay: -2s; }
.float.remote { right: 8%; bottom: -30px; animation-delay: -4s; }
@keyframes bob { 50% { transform: translateY(-10px); } }
.wave { display: flex; align-items: center; gap: 3px; height: 26px; }
.wave i { width: 3px; border-radius: 3px; background: linear-gradient(var(--accent2), var(--accent)); animation: wave 1.1s ease-in-out infinite; }
.wave i:nth-child(odd) { animation-duration: .9s; } .wave i:nth-child(3n) { animation-duration: 1.3s; }
@keyframes wave { 0%, 100% { height: 5px; } 50% { height: 24px; } }
.ring { position: relative; width: 40px; height: 40px; } .ring svg { transform: rotate(-90deg); } .ring b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 10px; font-weight: 700; }
.mini-phone { width: 34px; height: 54px; border: 2px solid #3a3a44; border-radius: 9px; display: grid; place-items: center; background: #0b0b0f; } .mini-phone i { width: 18px; height: 18px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 14px var(--accent); animation: tap 2.4s infinite; }
@keyframes tap { 0%, 70%, 100% { transform: scale(1); } 80% { transform: scale(.82); } }

/* Works with */
.marquee { margin: 120px 0 0; padding: 26px 0; border-block: 1px solid var(--line); overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
.marquee .track { display: flex; gap: 52px; width: max-content; animation: slide 40s linear infinite; }
.marquee span { color: var(--dim); font-weight: 600; font-size: 17px; letter-spacing: -.01em; white-space: nowrap; }
.marquee span::before { content: "✦"; margin-right: 52px; color: rgba(250,79,0,.6); font-size: 12px; }
@keyframes slide { to { transform: translateX(-50%); } }
.marquee-label { text-align: center; margin: 0 0 18px; font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: var(--dim); }

/* Sections */
section { padding: 130px 0 0; }
.eyebrow { display: inline-block; margin-bottom: 16px; font-size: 12.5px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--accent2); }
.section-head { max-width: 760px; margin: 0 auto 56px; text-align: center; }
.section-head h2 { margin: 0 0 16px; font-size: clamp(34px, 4.6vw, 58px); line-height: 1.04; letter-spacing: -.035em; font-weight: 720; }
.section-head p { margin: 0; color: var(--muted); font-size: 18px; }

/* Bento */
.bento { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; }
.card { position: relative; padding: 28px; border: 1px solid var(--line); border-radius: 22px; background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.015)); overflow: hidden; transition: border-color .3s, transform .3s; }
.card:hover { border-color: rgba(255,255,255,.18); transform: translateY(-3px); }
.card::before { content: ""; position: absolute; inset: 0; background: radial-gradient(400px 200px at var(--mx, 50%) var(--my, 0%), rgba(250,79,0,.12), transparent 70%); opacity: 0; transition: opacity .3s; pointer-events: none; }
.card:hover::before { opacity: 1; }
.card .ic { display: grid; place-items: center; width: 42px; height: 42px; margin-bottom: 18px; border-radius: 12px; background: rgba(250,79,0,.12); color: var(--accent2); }
.card h3 { margin: 0 0 8px; font-size: 21px; letter-spacing: -.02em; }
.card p { margin: 0; color: var(--muted); font-size: 15px; }
.span-4 { grid-column: span 4; } .span-3 { grid-column: span 3; } .span-2 { grid-column: span 2; }
.viz { margin-top: 24px; }
.listen { display: flex; align-items: center; gap: 18px; padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: rgba(0,0,0,.25); }
.listen .wave { height: 40px; } .listen .wave i { width: 4px; }
.listen .quote { flex: 1; font-size: 15px; color: var(--muted); } .listen .quote em { color: var(--ink); font-style: normal; }
.chip { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 10px; background: rgba(52,200,138,.14); color: #7be3b4; font-weight: 650; font-size: 13px; white-space: nowrap; }
.lyrics { display: grid; gap: 4px; font-size: 16px; }
.lyrics .line { color: var(--dim); transition: color .5s; } .lyrics .line.on { color: var(--ink); }
.lyrics .chord { display: block; font-size: 11px; font-weight: 700; color: var(--accent2); letter-spacing: .04em; }
.timeline { display: flex; gap: 4px; height: 44px; position: relative; }
.timeline span { border-radius: 8px; padding: 6px 8px; font-size: 11px; font-weight: 650; overflow: hidden; white-space: nowrap; border-left: 3px solid; background: rgba(255,255,255,.05); }
.timeline .now { position: absolute; top: -6px; bottom: -6px; width: 2px; background: var(--live); box-shadow: 0 0 10px var(--live); animation: now 14s linear infinite; }
@keyframes now { from { left: 0; } to { left: 100%; } }
.count { display: flex; align-items: baseline; gap: 10px; margin-top: 16px; } .count b { font-size: 34px; font-weight: 750; letter-spacing: -.02em; font-variant-numeric: tabular-nums; } .count span { color: var(--dim); font-size: 13px; }
.scenes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.scene { aspect-ratio: 16/10; border-radius: 10px; border: 1px solid var(--line); background: linear-gradient(135deg, #1d1d25, #101015); position: relative; overflow: hidden; }
.scene.live { border-color: var(--live); box-shadow: 0 0 0 1px var(--live); }
.scene em { position: absolute; left: 8px; bottom: 6px; font-style: normal; font-size: 10px; font-weight: 700; color: var(--muted); }
.scene .lt { position: absolute; left: 8px; right: 30%; bottom: 22px; height: 12px; border-radius: 3px; background: linear-gradient(90deg, var(--accent), transparent); }
.scene .cam { position: absolute; inset: 0; background: radial-gradient(40% 50% at 40% 45%, #3b3b4a, transparent 70%); }
.caps { display: grid; gap: 8px; font-size: 15px; }
.caps p { margin: 0; padding: 10px 14px; border-radius: 12px; background: rgba(0,0,0,.3); border: 1px solid var(--line); }
.caps small { display: block; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); margin-bottom: 2px; }
.shapes { display: flex; align-items: flex-end; gap: 10px; height: 76px; }
.shapes span { border: 1.5px solid rgba(255,255,255,.25); border-radius: 6px; display: grid; place-items: center; font-size: 10px; color: var(--muted); font-weight: 700; }
.stagephone { display: flex; gap: 12px; align-items: stretch; }
.stagebox { position: relative; flex: 1; padding: 12px 14px; border-radius: 12px; background: #000; border: 1px solid var(--line); display: grid; gap: 2px; }
.stagebox small { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); } .stagebox b { font-size: 14px; } .stagebox .next { color: var(--accent2); margin-top: 6px; }
.stagebox .clock { position: absolute; top: 10px; right: 12px; font-weight: 700; font-size: 12px; color: var(--good); font-variant-numeric: tabular-nums; }
.phonebox { width: 64px; border: 2px solid #34343e; border-radius: 14px; background: #0b0b0f; display: grid; place-items: center; align-content: center; gap: 8px; padding: 10px 6px; }
.phonebox span { color: var(--dim); font-size: 18px; line-height: 1; } .phonebox b { width: 100%; padding: 8px 0; border-radius: 9px; background: var(--accent); color: #fff; font-size: 11px; text-align: center; animation: tap 2.4s infinite; }
.langs { display: flex; gap: 8px; flex-wrap: wrap; } .langs span { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line); font-weight: 600; font-size: 14px; }

/* A Sunday */
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; counter-reset: step; }
.step { position: relative; padding: 26px 22px; border-top: 1px solid var(--line); }
.step::before { counter-increment: step; content: "0" counter(step); display: block; margin-bottom: 16px; font-family: "Instrument Serif", serif; font-style: italic; font-size: 40px; color: var(--accent2); line-height: 1; }
.step h4 { margin: 0 0 6px; font-size: 18px; letter-spacing: -.01em; } .step p { margin: 0; color: var(--muted); font-size: 14.5px; }

/* Platforms */
.platforms { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.os { position: relative; display: flex; flex-direction: column; padding: 30px; border: 1px solid var(--line); border-radius: 24px; background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.01)); transition: border-color .3s, box-shadow .3s; }
.os.yours { border-color: rgba(250,79,0,.6); box-shadow: 0 0 0 1px rgba(250,79,0,.3), 0 30px 80px -30px rgba(250,79,0,.45); }
.os .yours-tag { position: absolute; top: 18px; right: 18px; display: none; padding: 4px 10px; border-radius: 999px; background: rgba(250,79,0,.16); color: var(--accent2); font-size: 11.5px; font-weight: 700; }
.os.yours .yours-tag { display: inline-block; }
.os .glyph { display: grid; place-items: center; width: 56px; height: 56px; margin-bottom: 22px; border-radius: 16px; background: var(--panel2); color: var(--ink); }
.os h3 { margin: 0 0 4px; font-size: 26px; letter-spacing: -.02em; }
.os .req { margin: 0 0 18px; color: var(--muted); font-size: 14.5px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
.chips span { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 10px; border: 1px solid var(--line); background: rgba(0,0,0,.2); font-size: 12.5px; font-weight: 600; color: var(--ink); }
.chips span i { width: 7px; height: 7px; border-radius: 50%; background: var(--good); }
.os .gets { display: grid; gap: 8px; margin-top: auto; }
.get { display: flex; align-items: center; gap: 10px; height: 46px; white-space: nowrap; padding: 0 16px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); font-weight: 600; font-size: 14.5px; transition: background .2s, border-color .2s; }
.get:hover { background: var(--panel2); border-color: rgba(255,255,255,.2); }
.get small { margin-left: auto; color: var(--dim); font-weight: 500; font-size: 12.5px; }
.get.primary { background: linear-gradient(180deg, #ff6a1f, var(--accent)); border-color: transparent; color: #fff; box-shadow: 0 10px 30px -8px rgba(250,79,0,.6); }
.get.primary small { color: rgba(255,255,255,.75); }
.howto { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px; font-size: 13.5px; color: var(--muted); }
.howto summary { cursor: pointer; list-style: none; font-weight: 600; color: var(--ink); display: flex; justify-content: space-between; }
.howto summary::-webkit-details-marker { display: none; }
.howto summary::after { content: "+"; color: var(--dim); font-size: 18px; line-height: 1; transition: transform .25s; }
.howto[open] summary::after { transform: rotate(45deg); }
.howto ol { margin: 10px 0 6px; padding-left: 18px; display: grid; gap: 6px; }
.howto b { color: var(--ink); font-weight: 600; } .howto code { padding: 1px 5px; border-radius: 5px; background: rgba(255,255,255,.08); font-size: 12px; }
.howto p { margin: 6px 0 0; font-size: 12.5px; color: var(--dim); }
.release-note { margin-top: 22px; text-align: center; color: var(--dim); font-size: 13.5px; } .release-note a { color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }

/* Pricing */
.toggle { display: inline-flex; gap: 4px; padding: 4px; margin: 0 auto 40px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); }
.toggle button { height: 36px; padding: 0 18px; border: 0; border-radius: 999px; background: none; color: var(--muted); font: inherit; font-weight: 600; font-size: 14px; cursor: pointer; }
.toggle button[aria-pressed="true"] { background: var(--ink); color: #0a0a0d; }
.toggle button em { font-style: normal; color: var(--good); font-size: 12px; margin-left: 4px; }
.center { text-align: center; }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; align-items: stretch; }
.plan { position: relative; display: flex; flex-direction: column; padding: 32px 28px; border: 1px solid var(--line); border-radius: 24px; background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01)); }
.plan.popular { border-color: rgba(250,79,0,.55); background: linear-gradient(180deg, rgba(250,79,0,.12), rgba(255,255,255,.01) 45%); box-shadow: 0 40px 100px -40px rgba(250,79,0,.5); }
.plan-church { border-color: rgba(139,108,255,.35); }
.ribbon { position: absolute; top: -12px; left: 28px; padding: 4px 12px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 12px; font-weight: 700; }
.plan h3 { margin: 0; font-size: 22px; letter-spacing: -.02em; }
.plan .tagline { min-height: 48px; margin: 6px 0 22px; color: var(--muted); font-size: 14.5px; }
.price { display: flex; align-items: baseline; gap: 8px; } .price .amount { font-size: 50px; font-weight: 750; letter-spacing: -.04em; line-height: 1; } .price small { color: var(--dim); font-size: 15px; }
.billing { margin: 8px 0 22px; color: var(--dim); font-size: 13.5px; min-height: 20px; }
.plan-cta { display: grid; place-items: center; height: 46px; margin-bottom: 24px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); font-weight: 650; transition: background .2s; }
.plan-cta:hover { background: var(--panel2); }
.plan-cta.hot { border: 0; background: linear-gradient(180deg, #ff6a1f, var(--accent)); color: #fff; }
.plan ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; font-size: 14.5px; }
.plan li { display: flex; gap: 10px; color: var(--muted); } .plan li svg { flex: none; margin-top: 3px; color: var(--good); }
.plan-church li svg { color: var(--violet); }
.plan li em { font-style: normal; font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--line); color: var(--dim); }
.price-note { max-width: 760px; margin: 28px auto 0; text-align: center; color: var(--dim); font-size: 13px; }

/* FAQ */
.faq { max-width: 820px; margin: 0 auto; }
.faq details { border-bottom: 1px solid var(--line); }
.faq summary { display: flex; justify-content: space-between; gap: 20px; padding: 24px 0; cursor: pointer; list-style: none; font-size: 18px; font-weight: 600; letter-spacing: -.01em; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary::after { content: "+"; font-size: 26px; font-weight: 300; color: var(--muted); line-height: 1; transition: transform .3s; }
.faq details[open] summary::after { transform: rotate(45deg); }
.faq details p { margin: 0 0 24px; color: var(--muted); max-width: 680px; }

/* Final call */
.final { position: relative; margin: 140px 0 0; padding: 90px 30px; border: 1px solid rgba(250,79,0,.3); border-radius: 32px; text-align: center; overflow: hidden; background: radial-gradient(700px 300px at 50% 0%, rgba(250,79,0,.28), transparent 70%), linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01)); }
.final h2 { margin: 0 auto 18px; max-width: 760px; font-size: clamp(36px, 5vw, 64px); line-height: 1.02; letter-spacing: -.04em; }
.final p { margin: 0 auto 32px; max-width: 560px; color: var(--muted); font-size: 18px; }

footer { margin-top: 110px; padding: 40px 0 56px; border-top: 1px solid var(--line); color: var(--dim); font-size: 14px; }
footer .wrap { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; align-items: center; }
footer nav { display: flex; gap: 22px; flex-wrap: wrap; } footer a:hover { color: var(--ink); }

/* Entrances */
.reveal { opacity: 0; transform: translateY(26px); transition: opacity .9s cubic-bezier(.2,.8,.2,1), transform .9s cubic-bezier(.2,.8,.2,1); }
.reveal.in { opacity: 1; transform: none; }
.d1 { transition-delay: .08s; } .d2 { transition-delay: .16s; } .d3 { transition-delay: .24s; }

@media (max-width: 1100px) { .float.voice { left: 10px; top: auto; bottom: -30px; } .float.timer { right: 10px; top: -26px; } .float.remote { display: none; } }
@media (max-width: 900px) {
  .nav .links { display: none; }
  .bento { grid-template-columns: 1fr 1fr; } .span-4, .span-3, .span-2 { grid-column: span 2; }
  .steps { grid-template-columns: 1fr 1fr; } .platforms, .plans { grid-template-columns: 1fr; }
  .desk { grid-template-columns: 1fr; } .desk .pane.bible { display: none; }
}
@media (max-width: 700px) {
  .monitors { grid-template-columns: 1fr; }
  .chrome .title, .chrome .tabs span:not(.on) { display: none; }
  .mon h6 .onair { font-size: 0; gap: 0; } .mon h6 .onair i { width: 7px; height: 7px; }
  .device { transform: none; }
  .stage { margin-top: 44px; }
  .marquee { margin-top: 64px; }
  section { padding-top: 90px; }
}
@media (max-width: 560px) { .pill-long { display: none; } .pill-short { display: inline; } .hero { padding-top: 56px; } .float { display: none !important; } .steps { grid-template-columns: 1fr; } .final { padding: 60px 20px; } .nav .btn.small span { display: none; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } .reveal { opacity: 1; transform: none; } .device { transform: none; } }
`;

/** The bar at the top. On the home page its links are anchors; elsewhere they lead home first. */
export function siteHeader(page: "home" | "features" | "news" | "other"): string {
  const at = (anchor: string) => (page === "home" ? `#${anchor}` : `/#${anchor}`);
  const link = (href: string, label: string, on: boolean) => `<a href="${href}"${on ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<header class="nav" id="nav"><div class="wrap">
  <a class="brand" href="/"><img src="/email/logo.png" alt="">Church Studio</a>
  <nav class="links" aria-label="Sections">${link("/features", "Features", page === "features")}${link(at("sunday"), "How it works", false)}${link(at("download"), "Download", false)}${link(at("pricing"), "Pricing", false)}${link("/whats-new", "What's new", page === "news")}${link(at("faq"), "FAQ", false)}</nav>
  <span class="grow"></span>
  <a class="btn hot small" href="${at("download")}" data-get-main>${icon("download", 16)}<span data-get-label>Download</span></a>
</div></header>`;
}

export function siteFooter(site: Site): string {
  const mail = escape(site.contact);
  return `<footer><div class="wrap">
  <span>© ${new Date().getFullYear()} ${escape(site.company)} · Church Studio is made by ${escape(site.company)} · <a href="mailto:${mail}">${mail}</a></span>
  <nav aria-label="Legal"><a href="/features">Features</a><a href="/whats-new">What's new</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refunds">Refunds &amp; cancellation</a><a href="/licenses">Open-source licenses</a><a href="/security">Security</a></nav>
</div></footer>`;
}

export function landingPage(site: Site, release: Release | null, origin = SITE_URL): string {
  const version = release?.version ? `v${escape(release.version)}` : "";
  const latest = published(release?.version ?? null, new Date().toISOString().slice(0, 10))[0];
  const mail = escape(site.contact);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${seoHead({
  title: "Church Studio · Free Church Presentation Software",
  description: "Put scripture, songs and sermons on your church's screens. Church Studio listens for the verse being read, runs the whole service on time, and is free to start.",
  path: "/",
  data: [...organisation(site, origin), application(origin, release?.version ?? null), questions(FAQ)],
}, origin)}
<style>
${FONT_CSS}
${SITE_CSS}</style>
</head>
<body>
<div class="sky" aria-hidden="true"></div>

${siteHeader("home")}

<main>
<section class="hero" style="padding-top:84px"><div class="wrap">
  <a class="pill reveal" href="/whats-new"><b>New${version ? ` · ${version}` : ""}</b><span class="pill-long">${escape((latest?.highlights ?? []).slice(0, 3).map((highlight) => highlight.title).join(", "))}</span><span class="pill-short">See what's new</span> ${icon("arrow", 14)}</a>
  <h1 class="reveal d1">Every verse, song and sermon, <span class="serif">beautifully</span> on screen.</h1>
  <p class="lede reveal d2">Church Studio listens for the scripture being read, puts the words on your screens in a moment, and runs the whole service on time, from one calm desk.</p>
  <div class="ctas reveal d3">
    <a class="btn hot" href="#download" data-get-main>${icon("download", 18)}<span data-get-label>Download Church Studio</span></a>
    <a class="btn glass" href="/app/" target="_blank" rel="noopener">${icon("globe", 18)}Try it in your browser</a>
  </div>
  <p class="fine reveal d3"><b>Free forever</b> to start · Premium free for ${TRIAL_DAYS} days · No card needed</p>
  <div class="oses reveal d3"><span>${icon("laptop", 15)} macOS · Apple silicon &amp; Intel</span><span>${icon("windows", 15)} Windows 10 &amp; 11</span><span>${icon("terminal", 15)} Linux</span></div>

  <div class="stage reveal" id="stage">
    <div class="float voice"><div class="wave">${"<i></i>".repeat(9)}</div><div><small>Heard</small><b id="heard">“John three sixteen”</b></div></div>
    <div class="float timer"><div class="ring"><svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" stroke="rgba(255,255,255,.12)" stroke-width="3" fill="none"/><circle id="ring" cx="20" cy="20" r="17" stroke="#34c88a" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="106.8" stroke-dashoffset="30"/></svg><b>⏱</b></div><div><small>Sermon · on time</small><b id="clock">24:31 left</b></div></div>
    <div class="float remote"><div class="mini-phone"><i></i></div><div><small>Phone remote</small><b>Next slide</b></div></div>
    <div class="device">
      <div class="chrome"><i></i><i></i><i></i><span class="title">Church Studio</span><span class="tabs"><span class="on">Scriptures</span><span>Songs</span><span>Sermon</span><span>Service</span></span><span class="golive" id="golive"><i></i>LIVE</span></div>
      <div class="desk">
        <div class="pane bible"><h6><span>Bible · KJV</span><span>John 3</span></h6>
          <div class="search">🔍 <span id="search">John 3:16</span></div>
          <div class="verses" id="verses"></div>
        </div>
        <div class="monitors">
          <div class="pane mon preview"><h6><span>Preview</span><span id="pv-label">John 3:16</span></h6><div class="screen"><div class="content" id="pv"><span class="ref"></span><p class="words"></p></div></div></div>
          <div class="pane mon program"><h6><span>Program</span><span class="onair"><i></i>Audience sees this</span></h6><div class="screen"><div class="content" id="pg"><span class="ref"></span><p class="words"></p></div></div></div>
        </div>
      </div>
    </div>
  </div>
</div></section>

<div class="marquee" aria-label="Works with"><p class="marquee-label">Works with what your church already uses</p><div class="track">${[...PARTNERS, ...PARTNERS].map((name) => `<span>${escape(name)}</span>`).join("")}</div></div>

<section id="features"><div class="wrap">
  <div class="section-head reveal"><span class="eyebrow">Features</span><h2>Built for the moment the preacher says <span class="serif">“turn with me to…”</span></h2><p>Everything a Sunday needs, from the first song to the last amen, without a training course.</p></div>
  <div class="bento">
    <article class="card span-4 reveal"><div class="ic">${icon("mic")}</div><h3>Scripture that listens</h3><p>Press Listen. As the verse is read aloud, Church Studio finds it and puts it on Preview. LIVE sends it to the screen, in any translation you have. It understands your accent: misheard book names are put right, and Accurate listening runs on your own computer.</p>
      <div class="viz listen"><div class="wave">${"<i></i>".repeat(12)}</div><div class="quote">“…for God so loved <em>the world</em>, that he gave…”</div><span class="chip">${icon("check", 14)} John 3:16 on Preview</span></div></article>
    <article class="card span-2 reveal d1"><div class="ic">${icon("music")}</div><h3>Songs, line by line</h3><p>Lyrics that fit, chords for the band on the stage screen.</p>
      <div class="viz lyrics" id="lyrics"><div class="line on"><span class="chord">G &nbsp; &nbsp; &nbsp; C</span>Great is Thy faithfulness</div><div class="line"><span class="chord">D &nbsp; &nbsp; &nbsp; &nbsp; G</span>Morning by morning</div><div class="line"><span class="chord">Em &nbsp; &nbsp; C</span>New mercies I see</div></div></article>
    <article class="card span-3 reveal"><div class="ic">${icon("clock")}</div><h3>The whole service, on time</h3><p>Plan every part, skip what you don't need today, and keep a countdown in front of the preacher. A report shows where the time went. Press ⌘K to go to anything.</p>
      <div class="viz"><div class="timeline"><span style="flex:2;border-color:#5aa0d6">Welcome</span><span style="flex:5;border-color:#b07cc6">Worship</span><span style="flex:2;border-color:#e0884e">Reading</span><span style="flex:7;border-color:#d9677a">Sermon</span><span style="flex:2;border-color:#58b3a4">Closing</span><i class="now"></i></div>
      <div class="count"><b id="count">24:31</b><span>left in the sermon · on time</span></div></div></article>
    <article class="card span-3 reveal d1"><div class="ic">${icon("camera")}</div><h3>A Production Desk</h3><p>Cameras, scenes, lower thirds and video, streamed to YouTube or recorded, or sent to OBS, vMix and NDI.</p>
      <div class="viz scenes"><div class="scene live"><div class="cam"></div><div class="lt"></div><em>Camera + name</em></div><div class="scene"><div class="cam"></div><em>Wide</em></div><div class="scene"><em>Verse + camera</em></div></div></article>
    <article class="card span-2 reveal"><div class="ic">${icon("captions")}</div><h3>Captions, translated</h3><p>Live words on the screen and on phones, in the language each person reads.</p>
      <div class="viz caps"><p><small>English</small>For God so loved the world</p><p><small>Español</small>Porque de tal manera amó Dios al mundo</p></div></article>
    <article class="card span-2 reveal d1"><div class="ic">${icon("screens")}</div><h3>Any screen</h3><p>Projectors, TVs and LED walls of any shape. Words always fit.</p>
      <div class="viz shapes"><span style="width:96px;height:54px">16:9</span><span style="width:64px;height:48px">4:3</span><span style="width:120px;height:32px">LED</span><span style="width:30px;height:54px">9:16</span></div></article>
    <article class="card span-2 reveal d2"><div class="ic">${icon("phone")}</div><h3>Stage &amp; phone</h3><p>A confidence screen for the platform and a phone remote for anyone. Pair with a QR code.</p>
      <div class="viz stagephone"><div class="stagebox"><small>Now</small><b>Great is Thy faithfulness</b><small class="next">Next · Chorus</small><span class="clock">9:42</span></div><div class="phonebox"><span>‹</span><b>Next</b></div></div></article>
    <article class="card span-3 reveal"><div class="ic">${icon("shield")}</div><h3>Yours, and it works offline</h3><p>Your songs, services and notes stay on your computer. Bring your own Bible translation and everything still runs when the Wi-Fi doesn't.</p></article>
    <article class="card span-3 reveal d1"><div class="ic">${icon("globe")}</div><h3>In your language</h3><p>The whole desk in English, French and Spanish, chosen from your computer's language.</p>
      <div class="viz langs"><span>English</span><span>Français</span><span>Español</span></div></article>
  </div>
</div></section>

<div class="wrap" style="text-align:center;margin-top:28px"><a class="btn glass" href="/features">See every feature ${icon("arrow", 16)}</a></div>

<section id="sunday"><div class="wrap">
  <div class="section-head reveal"><span class="eyebrow">How it works</span><h2>A Sunday, <span class="serif">start to finish</span></h2></div>
  <div class="steps">
    <div class="step reveal"><h4>Plan</h4><p>Build the running order with songs, readings and slides. Templates bring back last week in a click.</p></div>
    <div class="step reveal d1"><h4>Preview</h4><p>Everything waits on Preview first, so the screen never shows a mistake.</p></div>
    <div class="step reveal d2"><h4>Go live</h4><p>Space sends it to the screen. Next moves through verses, songs and parts, on time.</p></div>
    <div class="step reveal d3"><h4>Look back</h4><p>A report shows planned and used time for every part, ready for next week's plan.</p></div>
  </div>
</div></section>

<section id="download"><div class="wrap">
  <div class="section-head reveal"><span class="eyebrow">Download</span><h2>Runs on the computer <span class="serif">you already have</span></h2><p>Native apps for Mac, Windows and Linux. Free to download, free forever to start.</p></div>
  <div class="platforms">
    <article class="os reveal" data-os="mac"><span class="yours-tag">Your computer</span><div class="glyph">${icon("laptop", 28)}</div><h3>macOS</h3><p class="req">macOS 13 Ventura or later</p>
      <div class="chips"><span><i></i>Apple silicon · M1 to M4</span><span><i></i>Intel Macs</span><span>One universal download</span></div>
      <div class="gets">${getButton(release, "mac", "Download for Mac", true)}</div>
      <details class="howto"><summary>First time opening it?</summary><ol>
        <li>Open the .dmg and drag Church Studio into Applications.</li>
        <li>In Applications, Control-click Church Studio and choose <b>Open</b>, then <b>Open</b> again.</li>
        <li>On macOS 15 or later, if it still won't open: <b>System Settings › Privacy &amp; Security</b>, scroll down, and choose <b>Open Anyway</b>.</li>
      </ol><p>Only the first time. macOS asks because the app is not yet signed by Apple.</p></details></article>
    <article class="os reveal d1" data-os="windows"><span class="yours-tag">Your computer</span><div class="glyph">${icon("windows", 28)}</div><h3>Windows</h3><p class="req">Windows 10 and 11 · 64-bit</p>
      <div class="chips"><span><i></i>Installer</span><span><i></i>MSI for IT teams</span><span>Updates itself</span></div>
      <div class="gets">${getButton(release, "windows", "Download for Windows", true)}${getButton(release, "windows-msi", "MSI package")}</div>
      <details class="howto"><summary>First time opening it?</summary><ol>
        <li>Run the installer you downloaded.</li>
        <li>If Windows says it protected your PC, choose <b>More info</b>, then <b>Run anyway</b>.</li>
      </ol><p>Only the first time. Windows asks because the installer is not yet signed by Microsoft.</p></details></article>
    <article class="os reveal d2" data-os="linux"><span class="yours-tag">Your computer</span><div class="glyph">${icon("terminal", 28)}</div><h3>Linux</h3><p class="req">Ubuntu, Debian, Fedora and more · 64-bit</p>
      <div class="chips"><span><i></i>AppImage</span><span><i></i>.deb</span><span><i></i>.rpm</span></div>
      <div class="gets">${getButton(release, "linux", "Download AppImage", true)}${getButton(release, "linux-deb", "Ubuntu / Debian (.deb)")}${getButton(release, "linux-rpm", "Fedora (.rpm)")}</div>
      <details class="howto"><summary>First time opening it?</summary><ol>
        <li><b>AppImage:</b> right-click › Properties › Permissions › <b>Allow executing as a program</b>, or run <code>chmod +x</code> on it. Then open it.</li>
        <li><b>.deb / .rpm:</b> open it with your software installer, or <code>sudo apt install ./file.deb</code>.</li>
      </ol></details></article>
  </div>
  <p class="release-note reveal">${version ? `Version ${version}${release?.date ? ` · released ${escape(new Date(release.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}` : ""} · ` : ""}<a href="${RELEASES_PAGE}">Release notes</a></p>
</div></section>

<section id="pricing"><div class="wrap">
  <div class="section-head reveal"><span class="eyebrow">Pricing</span><h2>Start free. <span class="serif">Grow</span> when you're ready.</h2><p>Premium is free for ${TRIAL_DAYS} days on every computer, with no card.</p></div>
  <div class="center"><div class="toggle" role="group" aria-label="Billing"><button type="button" aria-pressed="true" data-bill="monthly">Monthly</button><button type="button" aria-pressed="false" data-bill="yearly">Yearly <em>2 months free</em></button></div></div>
  <div class="plans">${planCards()}</div>
  <p class="price-note">Prices in US dollars; local taxes are added at checkout where they apply. Subscriptions renew until cancelled and can be cancelled at any time. Orders are processed by Paddle.com, our reseller and Merchant of Record.</p>
</div></section>

<section id="faq"><div class="wrap">
  <div class="section-head reveal"><span class="eyebrow">Questions</span><h2>Good to <span class="serif">know</span></h2></div>
  <div class="faq reveal">${FAQ.map(([q, a]) => `<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join("")}
    <details><summary>How do we get help?</summary><p>Write to <a href="mailto:${mail}" style="color:var(--accent2)">${mail}</a>. We answer within two working days.</p></details></div>

  <div class="final reveal"><h2>Your next service, <span class="serif">on screen</span> in minutes.</h2><p>Download Church Studio, pick your Bible and your screen, and put John 3:16 up before the coffee is ready.</p>
    <div class="ctas" style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap"><a class="btn hot" href="#download" data-get-main>${icon("download", 18)}<span data-get-label>Download Church Studio</span></a><a class="btn glass" href="#pricing">Compare plans</a></div></div>
</div></section>
</main>

${siteFooter(site)}

<script>
(() => {
  // Which computer is reading: the download buttons and its card follow it.
  const ua = navigator.userAgent;
  const os = /Windows/i.test(ua) ? "windows" : /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "mac" : /Linux/i.test(ua) && !/Android/i.test(ua) ? "linux" : null;
  const names = { mac: "Download for Mac", windows: "Download for Windows", linux: "Download for Linux" };
  if (os) {
    document.querySelector('[data-os="' + os + '"]')?.classList.add("yours");
    document.querySelectorAll("[data-get-label]").forEach((el) => (el.textContent = names[os]));
    document.querySelectorAll("[data-get-main]").forEach((el) => el.setAttribute("href", "/download/" + os));
  }

  // The bar gains its line once the page moves.
  const nav = document.getElementById("nav");
  addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 8), { passive: true });

  // Things arrive as they come into view.
  const seen = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("in"); seen.unobserve(entry.target); } }), { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => seen.observe(el));

  // A soft light follows the pointer across the feature cards.
  document.querySelectorAll(".card").forEach((card) => card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", e.clientX - r.left + "px");
    card.style.setProperty("--my", e.clientY - r.top + "px");
  }));

  // Monthly or yearly prices.
  document.querySelectorAll("[data-bill]").forEach((button) => button.addEventListener("click", () => {
    const bill = button.dataset.bill;
    document.querySelectorAll("[data-bill]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    document.querySelectorAll("[data-monthly]").forEach((el) => (el.textContent = el.dataset[bill]));
  }));

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The desk at work: a verse is heard, waits on Preview, then goes LIVE.
  const VERSES = [
    ["14", "And as Moses lifted up the serpent in the wilderness, even so must the Son of man be lifted up:"],
    ["15", "That whosoever believeth in him should not perish, but have eternal life."],
    ["16", "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."],
    ["17", "For God sent not his Son into the world to condemn the world; but that the world through him might be saved."],
    ["18", "He that believeth on him is not condemned."],
  ];
  const SAID = ["“John three fourteen”", "“verse fifteen”", "“John three sixteen”", "“and verse seventeen”", "“eighteen”"];
  const list = document.getElementById("verses");
  list.innerHTML = VERSES.map(([n, text]) => '<div class="verse"><b>' + n + "</b>" + text + "</div>").join("");
  const rows = [...list.children];
  const pv = document.getElementById("pv"), pg = document.getElementById("pg");
  const paint = (el, i) => { el.querySelector(".ref").textContent = "JOHN 3:" + VERSES[i][0]; el.querySelector(".words").textContent = VERSES[i][1]; };
  const swap = (el, i) => { if (still) return paint(el, i); el.classList.add("out"); setTimeout(() => { paint(el, i); el.classList.remove("out"); }, 380); };
  let at = 2;
  paint(pv, at); paint(pg, 1); rows[at].classList.add("on");
  const golive = document.getElementById("golive");
  const step = () => {
    // LIVE: Preview goes up.
    golive.classList.add("flash"); setTimeout(() => golive.classList.remove("flash"), 500);
    swap(pg, at);
    // Then the next verse is heard and waits on Preview.
    setTimeout(() => {
      rows[at].classList.remove("on");
      at = (at + 1) % VERSES.length;
      rows[at].classList.add("on");
      document.getElementById("heard").textContent = SAID[at];
      document.getElementById("search").textContent = "John 3:" + VERSES[at][0];
      document.getElementById("pv-label").textContent = "John 3:" + VERSES[at][0];
      swap(pv, at);
    }, 1500);
  };
  if (!still) setInterval(step, 4200);

  // The countdowns tick down.
  let left = 24 * 60 + 31;
  const tick = () => {
    left = left > 0 ? left - 1 : 35 * 60;
    const text = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
    document.getElementById("clock").textContent = text + " left";
    document.getElementById("count").textContent = text;
    document.getElementById("ring").setAttribute("stroke-dashoffset", String(106.8 * (1 - left / (35 * 60))));
  };
  if (!still) setInterval(tick, 1000);

  // The song moves on, line by line.
  const lines = [...document.querySelectorAll("#lyrics .line")];
  let line = 0;
  if (!still) setInterval(() => { lines[line].classList.remove("on"); line = (line + 1) % lines.length; lines[line].classList.add("on"); }, 2200);
})();
</script>
</body>
</html>`;
}
