<script lang="ts">
  import { session } from "../../app/session.svelte";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Icon from "../Icon.svelte";
  import { t, tn } from "../../i18n/core";

  // An order of service pasted in (the bulletin, an email, a message) becomes a service: the parts,
  // the library's songs, the readings and the announcements, shown here before anything is kept.
  let { onclose }: { onclose: () => void } = $props();

  let text = $state("");
  let busy = $state(false);
  const draft = $derived(text.trim() ? session.draftServiceFrom(text) : null);
  const kindIcon = { lyric: "lyrics", bible: "bible", announcement: "note" } as Record<string, string>;

  async function create() {
    if (!draft?.service.sections.length) return;
    busy = true;
    await session.createServiceFromDraft(draft);
    busy = false;
    onclose();
  }
</script>

<DeskDialog title={t("Paste an order of service")} wide {onclose}>
  <div class="paste">
    <label class="source">
      <span>{t("The running order, as you have it")}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        bind:value={text}
        autofocus
        spellcheck="false"
        placeholder={"Call to Worship – Elder Mensah\nPraise & Worship (20 min)\n  Amazing Grace\n  How Great Thou Art\nScripture Reading: John 3:16-18\nAnnouncements\n  Youth camp closes Friday\nSermon – Pastor Kojo (Hebrews 11:1-6)\nOffering\nBenediction"}
      ></textarea>
      <em>{t("One part per line. Songs and readings go under their part; names after a dash become the leader, and \"20 min\" the part's time.")}</em>
    </label>

    <section class="review" aria-live="polite">
      {#if !draft}
        <p class="empty">{t("Paste from the bulletin, an email or a message. The parts, songs and readings show here before anything is kept.")}</p>
      {:else if !draft.service.sections.length}
        <p class="empty">{t("No parts found yet. Put each part of the service on its own line.")}</p>
      {:else}
        <p class="sum">
          <strong>{draft.service.name}</strong>
          {tn(draft.counts.parts, "{n} part", "{n} parts")} · {tn(draft.counts.songs, "{n} song", "{n} songs")} · {tn(draft.counts.readings, "{n} reading", "{n} readings")}
        </p>
        <ol class="parts">
          {#each draft.service.sections as section (section.id)}
            <li>
              <div class="part">
                <strong>{section.name}</strong>
                {#if section.leader}<span>{section.leader}</span>{/if}
                {#if section.minutes}<span class="time">{t("{n} min", { n: section.minutes })}</span>{/if}
              </div>
              {#if section.items.length}
                <ul>
                  {#each section.items as item (item.id)}
                    <li><Icon name={kindIcon[item.kind] ?? "list"} size={12} /> {item.title}</li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ol>
        {#if draft.missingSongs.length}
          <div class="missing" role="note">
            <strong>{tn(draft.missingSongs.length, "{n} song is not in your library", "{n} songs are not in your library")}</strong>
            <span>{draft.missingSongs.map((entry) => entry.title).join(" · ")}</span>
            <em>{t("They are left out. Add them to Songs, then add them to the service.")}</em>
          </div>
        {/if}
      {/if}
    </section>
  </div>
  {#snippet footer()}
    <span class="grow"></span>
    <button type="button" class="btn" onclick={onclose}>{t("Cancel")}</button>
    <button type="button" class="btn primary" disabled={busy || !draft?.service.sections.length} onclick={() => void create()}>{busy ? t("Making the service…") : t("Make this service")}</button>
  {/snippet}
</DeskDialog>

<style>
  .paste { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; min-height: min(60vh, 520px); }
  @media (max-width: 720px) { .paste { grid-template-columns: minmax(0, 1fr); } }
  .source { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .source > span { font-size: 12px; font-weight: 650; color: var(--muted); }
  .source em { font-style: normal; font-size: 11.5px; line-height: 1.4; color: var(--muted); }
  textarea { flex: 1; min-height: 280px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; line-height: 1.55; resize: vertical; }
  .review { min-width: 0; overflow: auto; max-height: min(64vh, 560px); padding-left: 16px; border-left: 1px solid var(--line); }
  @media (max-width: 720px) { .review { padding-left: 0; border-left: 0; } }
  .empty { margin: 4px 0; font-size: 12.5px; line-height: 1.5; color: var(--muted); }
  .sum { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0 0 10px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .sum strong { font-size: 15px; color: var(--ink); }
  .parts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .parts > li { padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--field) 50%, transparent); }
  .part { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font-size: 13px; }
  .part span { font-size: 12px; color: var(--muted); }
  .part .time { margin-left: auto; font-variant-numeric: tabular-nums; }
  .parts ul { list-style: none; margin: 5px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .parts ul li { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink); }
  .parts ul li :global(svg) { color: var(--muted); flex: none; }
  .missing { display: grid; gap: 3px; margin-top: 10px; padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--warn, #d9a33b) 50%, var(--line)); border-radius: 8px; background: color-mix(in srgb, var(--warn, #d9a33b) 8%, transparent); font-size: 12px; }
  .missing span { color: var(--ink); }
  .missing em { font-style: normal; color: var(--muted); }
  .grow { flex: 1; }
</style>
