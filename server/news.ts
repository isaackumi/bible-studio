// The What's new page at /whats-new: every release, newest first, from the same notes the app shows
// after an update (src/lib/domain/changelog.ts). Also the page for an address that is not there.

import { CHANGELOG } from "../src/lib/domain/changelog.ts";
import { escape, icon, SITE_CSS, siteFooter, siteHeader } from "./landing.ts";
import type { Site } from "./site.ts";
import { FONT_CSS, seoHead, SITE_URL, type PageMeta } from "./seo.ts";

const NEWS_CSS = `
.n-hero { padding: 96px 0 10px; text-align: center; }
.n-hero h1 { margin: 20px auto 16px; font-size: clamp(42px, 6.4vw, 84px); line-height: 1; letter-spacing: -.045em; font-weight: 750; }
.n-hero h1 .serif { background: linear-gradient(100deg, #ffd2b0, var(--accent2) 40%, var(--accent) 75%); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: .06em; }
.n-hero p { margin: 0 auto; max-width: 620px; color: var(--muted); font-size: 18px; }
.releases { position: relative; max-width: 860px; margin: 70px auto 0; padding-left: 34px; }
.releases::before { content: ""; position: absolute; left: 7px; top: 8px; bottom: 8px; width: 2px; background: linear-gradient(var(--accent), rgba(250,79,0,.1)); border-radius: 2px; }
.release { position: relative; padding-bottom: 54px; }
.release::before { content: ""; position: absolute; left: -33px; top: 8px; width: 14px; height: 14px; border-radius: 50%; background: var(--bg); border: 2px solid var(--accent); box-shadow: 0 0 0 5px rgba(250,79,0,.12); }
.release:first-child::before { background: var(--accent); }
.release h2 { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 0 0 18px; font-size: 28px; letter-spacing: -.02em; }
.release h2 small { color: var(--dim); font-size: 14px; font-weight: 500; letter-spacing: 0; }
.release h2 em { font-style: normal; padding: 2px 10px; border-radius: 999px; background: rgba(250,79,0,.16); color: var(--accent2); font-size: 12px; font-weight: 700; }
.highlights { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.highlight { padding: 18px 20px; border: 1px solid var(--line); border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01)); }
.highlight b { display: block; margin-bottom: 4px; font-size: 15.5px; letter-spacing: -.01em; }
.highlight span { color: var(--muted); font-size: 14px; }
.lost { min-height: 70vh; display: grid; place-items: center; text-align: center; padding: 80px 0; }
.lost h1 { margin: 0 0 14px; font-size: clamp(60px, 12vw, 140px); line-height: 1; letter-spacing: -.05em; }
.lost p { margin: 0 auto 30px; max-width: 520px; color: var(--muted); font-size: 18px; }
@media (max-width: 700px) { .highlights { grid-template-columns: 1fr; } }
`;

function page(meta: PageMeta, site: Site, current: "news" | "other", body: string, origin: string, noindex = false): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${noindex ? seoHead(meta, origin).replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex">').replace(/<link rel="canonical"[^>]*>\n/, "") : seoHead(meta, origin)}
<style>
${FONT_CSS}
${SITE_CSS}
${NEWS_CSS}
</style>
</head>
<body>
<div class="sky" aria-hidden="true"></div>
${siteHeader(current)}
<main>${body}</main>
${siteFooter(site)}
<script>
(() => {
  const nav = document.getElementById("nav");
  addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 8), { passive: true });
  const seen = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("in"); seen.unobserve(entry.target); } }), { threshold: 0.1 });
  document.querySelectorAll(".reveal").forEach((el) => seen.observe(el));
})();
</script>
</body>
</html>`;
}

const day = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function newsPage(site: Site, origin = SITE_URL): string {
  const releases = CHANGELOG.map(
    (release, index) => `<article class="release reveal" id="v${escape(release.version)}">
    <h2>Version ${escape(release.version)} <small>${escape(day(release.date))}</small>${index === 0 ? "<em>Latest</em>" : ""}</h2>
    <div class="highlights">${release.highlights.map((highlight) => `<div class="highlight"><b>${escape(highlight.title)}</b><span>${escape(highlight.text)}</span></div>`).join("")}</div>
  </article>`,
  ).join("");
  return page(
    { title: "What's new in Church Studio · Release notes", description: "Every Church Studio release, newest first: what changed for the church, in plain words.", path: "/whats-new", crumb: "What's new" },
    site,
    "news",
    `<section class="n-hero"><div class="wrap">
  <span class="eyebrow reveal">What's new</span>
  <h1 class="reveal d1">Better every <span class="serif">week.</span></h1>
  <p class="reveal d2">${CHANGELOG.length} releases so far. Church Studio updates itself; here is what each one brought.</p>
</div></section>
<div class="wrap"><div class="releases">${releases}</div></div>`,
    origin,
  );
}

export function lostPage(site: Site): string {
  return page(
    { title: "Not found · Church Studio", description: "This page is not here.", path: "/" },
    site,
    "other",
    `<div class="wrap lost"><div>
  <span class="eyebrow">404</span>
  <h1>Not <span class="serif">here.</span></h1>
  <p>This address leads nowhere. The verse you were looking for may be on another page.</p>
  <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap"><a class="btn hot" href="/">${icon("arrow", 18)}Home</a><a class="btn glass" href="/features">See every feature</a></div>
</div></div>`,
    SITE_URL,
    true,
  );
}
