// What every public page tells search engines and link previews: a title and description of its
// own, its one true address, the picture shown when it is shared, and structured data Google can
// read (the organisation, the app and its prices, questions and answers, where a page sits). Also
// the site's own fonts, so a page needs nothing from another server to look right.

import { published } from "../src/lib/domain/changelog.ts";
import { PLANS } from "../src/lib/domain/plans.ts";
import { PRICES } from "./pricing.ts";
import { escape } from "./landing.ts";
import type { Site } from "./site.ts";

/** Where the site lives when no public address is configured. */
export const SITE_URL = "https://church-studio.heitechinc.com";

export const FONT_CSS = `@font-face { font-family: "Inter"; font-style: normal; font-weight: 100 900; font-display: swap; src: url("/fonts/inter.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Instrument Serif"; font-style: italic; font-weight: 400; font-display: swap; src: url("/fonts/instrument-serif-italic.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }`;

export type PageMeta = {
  /** Shown in the browser tab and as the search result's headline (about 60 characters). */
  title: string;
  /** The search result's snippet (about 155 characters). */
  description: string;
  /** This page's path ("/features"). */
  path: string;
  /** The page's place under the home page, for search results' trail; absent on the home page. */
  crumb?: string;
  /** More structured data for this page. */
  data?: object[];
  /** Pages set in the computer's own fonts (the policies) skip loading the site's. */
  systemFonts?: boolean;
};

/** The <head> tags for a public page: say what it is, where it lives, and how it looks when shared. */
export function seoHead(meta: PageMeta, origin = SITE_URL): string {
  const url = `${origin}${meta.path}`;
  const image = `${origin}/share.jpg`;
  const data = [...(meta.crumb ? [breadcrumbs(origin, meta.path, meta.crumb)] : []), ...(meta.data ?? [])];
  return `<title>${escape(meta.title)}</title>
<meta name="description" content="${escape(meta.description)}">
<link rel="canonical" href="${escape(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Church Studio">
<meta property="og:title" content="${escape(meta.title)}">
<meta property="og:description" content="${escape(meta.description)}">
<meta property="og:url" content="${escape(url)}">
<meta property="og:image" content="${escape(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Church Studio: every verse, song and sermon, beautifully on screen.">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(meta.title)}">
<meta name="twitter:description" content="${escape(meta.description)}">
<meta name="twitter:image" content="${escape(image)}">
<meta name="theme-color" content="#07070a">
<link rel="icon" href="/email/logo.png">
<link rel="apple-touch-icon" href="/email/logo.png">
${meta.systemFonts ? "" : `<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/instrument-serif-italic.woff2" as="font" type="font/woff2" crossorigin>
`}${data.map(jsonLd).join("\n")}`;
}

/** One block of structured data, safe inside the page whatever its text holds. */
export function jsonLd(value: object): string {
  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...value }).replace(/</g, "\\u003c")}</script>`;
}

function breadcrumbs(origin: string, path: string, name: string): object {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Church Studio", item: `${origin}/` },
      { "@type": "ListItem", position: 2, name, item: `${origin}${path}` },
    ],
  };
}

/** HeiTech, and the site as a whole. */
export function organisation(site: Site, origin = SITE_URL): object[] {
  return [
    { "@type": "Organization", "@id": `${origin}/#organization`, name: site.company, url: `${origin}/`, logo: `${origin}/email/logo.png`, email: site.contact },
    { "@type": "WebSite", "@id": `${origin}/#website`, name: "Church Studio", url: `${origin}/`, publisher: { "@id": `${origin}/#organization` }, inLanguage: "en" },
  ];
}

/** Church Studio itself: what it is, where it runs, and every plan's price. */
/** The app as structured data; `released` is the newest version on GitHub, so an unreleased entry is never named. */
export function application(origin = SITE_URL, released: string | null = null): object {
  const releases = published(released, new Date().toISOString().slice(0, 10));
  const offers = PLANS.map((plan) => ({
    "@type": "Offer",
    name: plan.name,
    price: plan.id === "free" ? "0" : (PRICES[plan.id].monthly / 100).toFixed(2),
    priceCurrency: "USD",
    ...(plan.id === "free" ? {} : { priceSpecification: { "@type": "UnitPriceSpecification", price: (PRICES[plan.id].monthly / 100).toFixed(2), priceCurrency: "USD", unitText: "MONTH" } }),
    url: `${origin}/#pricing`,
  }));
  return {
    "@type": "SoftwareApplication",
    "@id": `${origin}/#app`,
    name: "Church Studio",
    applicationCategory: "MultimediaApplication",
    applicationSubCategory: "Church presentation software",
    operatingSystem: "macOS 13 or later, Windows 10 and 11, Linux",
    softwareVersion: releases[0]?.version,
    datePublished: releases.at(-1)?.date,
    dateModified: releases[0]?.date,
    description: "Church presentation software that listens for the scripture being read and puts it on screen, with songs, sermons, slides, picture slideshows, a production desk and the whole service on time.",
    url: `${origin}/`,
    downloadUrl: `${origin}/#download`,
    image: `${origin}/share.jpg`,
    screenshot: `${origin}/share.jpg`,
    inLanguage: ["en", "fr", "es"],
    publisher: { "@id": `${origin}/#organization` },
    offers,
    featureList: [
      "Scripture found by listening to the preacher",
      "AI that names a paraphrased verse",
      "Song lyrics with chords and arrangements",
      "Any screen shape, up to eight extra screens",
      "Picture slideshows with transitions and music",
      "Production desk with streaming, recording and NDI",
      "Phone remote and live captions on phones",
      "Works offline",
    ],
  };
}

/** Questions and answers, as Google shows them under a result. */
export function questions(faq: Array<[string, string]>): object {
  return { "@type": "FAQPage", mainEntity: faq.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
}
