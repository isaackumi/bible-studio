// The programme outline: the service on one page, for the team (a run sheet with times and
// every item) or for the congregation (an order of service). It prints, saves as PDF through the
// print window, and copies as plain text for a message.

import { clockLabel, lengthLabel, planSchedule } from "./schedule";
import { sectionShort } from "./song";
import { songSlots } from "./song-order";
import type { PresentationItem, Service, Song } from "./types";

export type OutlineStyle = "run-sheet" | "order";

export type OutlineOptions = {
  style: OutlineStyle;
  /** Times beside each part. */
  times: boolean;
  /** Songs, readings and slides under each part. */
  items: boolean;
};

export type OutlineItem = { kind: string; title: string; detail: string };
export type OutlinePart = { name: string; start: string; end: string; length: string; timed: boolean; items: OutlineItem[] };
export type Outline = { title: string; church: string; date: string; span: string; parts: OutlinePart[] };

const KIND_LABEL: Record<string, string> = {
  bible: "Scripture",
  lyric: "Song",
  slide: "Slide",
  announcement: "Announcement",
  image: "Picture",
  video: "Video",
  deck: "Slides",
  composition: "Look",
  text: "Text",
};

function itemOf(item: PresentationItem, songs: Song[]): OutlineItem {
  const kind = KIND_LABEL[item.kind] ?? "Item";
  if (item.kind === "lyric" && item.lyric) {
    const song = songs.find((entry) => entry.id === item.lyric?.songId);
    const order = song ? songSlots(song).map(sectionShort).join(" ") : "";
    return { kind, title: song?.title ?? item.title, detail: [song?.author, order].filter(Boolean).join(" · ") };
  }
  if (item.kind === "bible" && item.bible) return { kind, title: item.bible.reference, detail: item.bible.translationId.toUpperCase() };
  if (item.kind === "announcement" && item.announcement) return { kind, title: item.announcement.heading || item.title, detail: item.announcement.body.split("\n")[0] ?? "" };
  if (item.kind === "slide" && item.slide) return { kind, title: item.slide.heading || item.title, detail: "" };
  return { kind, title: item.title, detail: "" };
}

export function buildOutline(service: Service, songs: Song[], church: string, date: Date): Outline {
  const plan = planSchedule(service);
  const timed = plan.slots.some((slot) => !slot.untimed);
  return {
    title: service.name,
    church,
    date: date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    span: timed ? `${clockLabel(plan.start)} – ${clockLabel(plan.end)}` : "",
    parts: service.sections.map((section, index) => {
      const slot = plan.slots[index]!;
      return {
        name: section.name,
        start: clockLabel(slot.start),
        end: clockLabel(slot.end),
        length: slot.untimed ? "" : lengthLabel(slot.minutes),
        timed: !slot.untimed,
        items: section.items.map((item) => itemOf(item, songs)),
      };
    }),
  };
}

/** Plain text, for a message or an email. */
export function outlineText(outline: Outline, options: OutlineOptions): string {
  const lines: string[] = [];
  lines.push(outline.title);
  lines.push([outline.church, outline.date, outline.span].filter(Boolean).join(" · "));
  lines.push("");
  for (const part of outline.parts) {
    const when = options.times && part.timed ? `${part.start}  ` : "";
    const length = options.style === "run-sheet" && options.times && part.length ? `  (${part.length})` : "";
    lines.push(`${when}${part.name}${length}`);
    if (options.items) {
      for (const item of part.items) {
        if (options.style === "order" && !["Song", "Scripture"].includes(item.kind)) continue;
        const detail = options.style === "run-sheet" && item.detail ? ` — ${item.detail}` : "";
        lines.push(`   ${options.style === "run-sheet" ? `${item.kind}: ` : ""}${item.title}${detail}`);
      }
    }
  }
  return lines.join("\n").trim() + "\n";
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

/** A whole page to print or save as PDF (A4 or Letter, black on white). */
export function outlineHtml(outline: Outline, options: OutlineOptions): string {
  const parts = outline.parts
    .map((part) => {
      const items = options.items
        ? part.items
            .filter((item) => options.style === "run-sheet" || ["Song", "Scripture"].includes(item.kind))
            .map(
              (item) =>
                `<li><span class="k">${escape(item.kind)}</span><span class="t">${escape(item.title)}</span>${options.style === "run-sheet" && item.detail ? `<span class="d">${escape(item.detail)}</span>` : ""}</li>`,
            )
            .join("")
        : "";
      return `<section class="part">
  ${options.times ? `<div class="when">${part.timed ? escape(part.start) : ""}${options.style === "run-sheet" && part.length ? `<small>${escape(part.length)}</small>` : ""}</div>` : ""}
  <div class="body"><h2>${escape(part.name)}</h2>${items ? `<ul>${items}</ul>` : ""}</div>
</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(outline.title)}</title>
<style>
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Inter", -apple-system, "Segoe UI", sans-serif; color: #15171b; font-size: 11pt; line-height: 1.4; }
  /* On screen the page shows its margins; on paper the printer's page margins apply. */
  @media screen { body { padding: 44px 52px; } }
  header { padding-bottom: 10pt; margin-bottom: 14pt; border-bottom: 1.5pt solid #15171b; }
  .church { font-size: 9pt; letter-spacing: 0.04em; color: #5b616e; }
  h1 { margin: 2pt 0 4pt; font-size: 20pt; line-height: 1.15; }
  .meta { color: #5b616e; font-size: 10pt; }
  .part { display: grid; grid-template-columns: ${options.times ? "72pt 1fr" : "1fr"}; gap: 10pt; padding: 8pt 0; border-bottom: 0.5pt solid #d8dbe0; break-inside: avoid; }
  .when { font-variant-numeric: tabular-nums; font-weight: 650; }
  .when small { display: block; font-weight: 400; color: #5b616e; font-size: 9pt; }
  h2 { margin: 0; font-size: 12.5pt; }
  ul { list-style: none; margin: 4pt 0 0; padding: 0; }
  li { display: flex; gap: 8pt; padding: 1.5pt 0; }
  .k { width: 70pt; flex: none; color: #5b616e; font-size: 9pt; padding-top: 1pt; }
  .t { font-weight: 550; }
  .d { color: #5b616e; }
  .d::before { content: "·"; margin: 0 5pt; }
</style></head>
<body>
<header>
  ${outline.church ? `<div class="church">${escape(outline.church)}</div>` : ""}
  <h1>${escape(outline.title)}</h1>
  <div class="meta">${escape([outline.date, outline.span].filter(Boolean).join(" · "))}</div>
</header>
${parts}
</body></html>`;
}
