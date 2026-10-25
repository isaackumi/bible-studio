<script lang="ts">
  import { session } from "../../app/session.svelte";
  import Icon from "../Icon.svelte";
  import VerseFinder from "./VerseFinder.svelte";
  import { t } from "../../i18n/core";

  // Live scripture inside a look (Scripture + Camera and the like): the verse on Program and on
  // Preview, each with back and next. Live steps change the audience screen at once; Preview
  // waits for GO LIVE. Shown only while a look with a scripture region is up.
  const live = $derived(session.lookVerse("program"));
  const preview = $derived(session.lookVerse("preview"));
  let finding = $state(false);
  let busy = $state(false);

  async function step(target: "preview" | "program", direction: 1 | -1) {
    if (busy) return;
    busy = true;
    try {
      await session.stepLookVerse(target, direction);
    } finally {
      busy = false;
    }
  }
</script>

{#if live || preview}
  <section class="look-verse" aria-label={t("Scripture in the look")}>
    <p class="title"><Icon name="bible" size={13} /> {t("Scripture")}</p>
    {#if live}
      <div class="row on-air">
        <span class="tag">{t("Live")}</span>
        <strong title={live.reference}>{live.reference}</strong>
        <button type="button" aria-label={t("Previous verse live")} title={t("Previous verse, live now")} disabled={busy} onclick={() => void step("program", -1)}><Icon name="chevron-left" size={15} /></button>
        <button type="button" aria-label={t("Next verse live")} title={t("Next verse, live now")} disabled={busy} onclick={() => void step("program", 1)}><Icon name="chevron-right" size={15} /></button>
      </div>
    {/if}
    {#if preview}
      <div class="row">
        <span class="tag">{t("Preview")}</span>
        <strong title={preview.reference}>{preview.reference}</strong>
        <button type="button" aria-label={t("Previous verse on Preview")} title={t("Previous verse on Preview (←)")} disabled={busy} onclick={() => void step("preview", -1)}><Icon name="chevron-left" size={15} /></button>
        <button type="button" aria-label={t("Next verse on Preview")} title={t("Next verse on Preview (→)")} disabled={busy} onclick={() => void step("preview", 1)}><Icon name="chevron-right" size={15} /></button>
      </div>
    {/if}
    <button type="button" class="find" onclick={() => (finding = true)}><Icon name="search" size={13} /> {t("Find a verse…")}</button>
  </section>
{/if}

{#if finding}
  <VerseFinder onclose={() => (finding = false)} />
{/if}

<style>
  .look-verse { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); }
  .title { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; font-weight: 650; color: var(--muted); }
  .row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 4px; padding: 4px 4px 4px 6px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); }
  .row.on-air { border-color: color-mix(in srgb, var(--live) 60%, var(--line)); }
  .tag { padding: 0 5px; border-radius: 4px; background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent-text); font-size: 10px; font-weight: 750; line-height: 16px; }
  .on-air .tag { background: var(--live); color: #fff; }
  .row strong { min-width: 0; font-size: 12px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row button { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: var(--field); color: var(--ink); cursor: pointer; }
  .row button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--ink) 35%, var(--line)); }
  .on-air button:hover:not(:disabled) { border-color: var(--live); }
  .row button:disabled { opacity: 0.5; cursor: default; }
  .find { display: flex; align-items: center; justify-content: center; gap: 6px; height: 30px; border: 1px dashed var(--line); border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .find:hover { background: var(--panel); }
</style>
