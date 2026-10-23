<script lang="ts">
  import { session } from "../app/session.svelte";
  import { pageAt, pageStart, SCROLL_STEP } from "../domain/document-scroll";
  import Icon from "./Icon.svelte";
  import { t } from "../i18n/core";

  // A PDF scrolling on Program: up and down a step, to the top, or anywhere along it. Every screen
  // glides to the same place. The mouse wheel over the Program monitor scrolls it too.
  const doc = $derived(session.live.program.model.layout === "document" ? session.live.program.model.document : undefined);
  const shapes = $derived(doc ? doc.pages.map((page) => page.aspect) : []);
  const length = $derived(doc ? session.documentLength(session.live.program.model) : 0);
  const page = $derived(doc ? pageAt(doc.at, shapes, session.screenRatio()) : 0);
</script>

{#if doc}
  <div class="doc-controls" role="group" aria-label={t("Document on Program")}>
    <button type="button" class="dc" aria-label={t("To the top")} title={t("To the top")} disabled={doc.at <= 0} onclick={() => session.scrollProgramTo(0)}><Icon name="chevron-up" size={13} /><Icon name="chevron-up" size={13} /></button>
    <button type="button" class="dc" aria-label={t("Scroll up")} title={t("Scroll up")} disabled={doc.at <= 0} onclick={() => session.scrollProgramBy(-SCROLL_STEP)}><Icon name="chevron-up" size={14} /></button>
    <button type="button" class="dc" aria-label={t("Scroll down")} title={t("Scroll down")} disabled={doc.at >= length} onclick={() => session.scrollProgramBy(SCROLL_STEP)}><Icon name="chevron-down" size={14} /></button>
    <input class="track" type="range" min="0" max={Math.max(0.01, length)} step="0.01" value={doc.at} aria-label={t("Where the screen is in the document")} oninput={(event) => session.scrollProgramTo(Number(event.currentTarget.value))} />
    <select class="page" aria-label={t("Go to page")} value={page} onchange={(event) => session.scrollProgramTo(pageStart(Number(event.currentTarget.value), shapes, session.screenRatio()))}>
      {#each doc.pages as _page, index (index)}<option value={index}>{t("Page {n} of {total}", { n: index + 1, total: doc.pages.length })}</option>{/each}
    </select>
  </div>
{/if}

<style>
  .doc-controls { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--field) 70%, transparent); }
  .dc { display: flex; align-items: center; justify-content: center; flex: none; min-width: 28px; height: 28px; padding: 0 5px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--ink); cursor: pointer; }
  .dc :global(svg + svg) { margin-left: -9px; }
  .dc:disabled { opacity: 0.4; cursor: default; }
  .track { flex: 1; min-width: 60px; accent-color: var(--live); }
  .page { flex: none; width: auto; max-width: 40%; height: 28px; padding: 0 6px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--ink); font: inherit; font-size: 11.5px; font-weight: 650; }
</style>
