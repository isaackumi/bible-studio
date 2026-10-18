<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import type { SourceFields } from "../../domain/sources";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";

  // Find a verse for the scripture region of a look: read it first, then put it on Preview or
  // straight on Program. Favorites and recent passages are one click away.
  let { onclose }: { onclose: () => void } = $props();

  const start = untrack(() => session.lookVerse("preview") ?? session.lookVerse("program"));
  let query = $state(start?.reference ?? "");
  let translationId = $state(start?.translationId ?? untrack(() => session.translations[0]?.id ?? ""));
  let found = $state<Extract<SourceFields, { type: "scripture" }> | null>(null);
  let note = $state("");
  let busy = $state(false);

  const canPreview = $derived(!!session.lookVerse("preview"));
  const canLive = $derived(!!session.lookVerse("program"));
  const recent = $derived(session.workspace.recent.slice(0, 8));

  async function look(reference = query, translation = translationId) {
    if (!reference.trim()) return;
    busy = true;
    note = "";
    try {
      const fields = await session.scriptureFields(reference, translation);
      if (!fields || fields.type !== "scripture") {
        found = null;
        note = t("Nothing found for “{reference}”. Try John 3:16, 1 Cor 13:4-7 or Psalm 23.", { reference: reference.trim() });
        return;
      }
      found = fields;
      query = fields.reference;
      translationId = translation;
    } finally {
      busy = false;
    }
  }

  async function send(target: "preview" | "program") {
    if (!found) await look();
    if (!found) return;
    if (await session.setLookVerse(target, found.reference, translationId)) onclose();
  }

  // Show the starting verse straight away.
  $effect(() => {
    if (untrack(() => query)) void untrack(() => look());
  });
</script>

<DeskDialog title={t("Find a verse")} {onclose}>
  <form class="finder" onsubmit={(event) => { event.preventDefault(); void look(); }}>
    <label class="field">
      <Icon name="search" size={15} />
      <!-- svelte-ignore a11y_autofocus -->
      <input aria-label={t("Verse")} placeholder={t("John 3:16, 1 Cor 13:4-7, Psalm 23")} bind:value={query} autofocus />
    </label>
    <select aria-label={t("Translation")} bind:value={translationId} onchange={() => found && void look(found.reference, translationId)}>
      {#each session.translations as translation (translation.id)}<option value={translation.id}>{translation.abbreviation}</option>{/each}
    </select>
    <button type="submit" class="desk-btn" disabled={busy || !query.trim()}>{busy ? t("Finding…") : t("Find")}</button>
  </form>

  {#if session.workspace.favorites.passages.length || recent.length}
    <div class="quick">
      {#each session.workspace.favorites.passages.slice(0, 8) as item (`f:${item.bookOrd}:${item.chapter}:${item.startVerse}-${item.endVerse}`)}
        <button type="button" class="pick fav" onclick={() => void look(item.reference, item.translationId)}><span aria-hidden="true">★</span>{item.reference}</button>
      {/each}
      {#each recent as item (`r:${item.translationId}:${item.reference}`)}
        <button type="button" class="pick" onclick={() => void look(item.reference, item.translationId)}>{item.reference}</button>
      {/each}
    </div>
  {/if}

  {#if note}<p class="note">{note}</p>{/if}
  {#if found}
    <blockquote class="vf-verse">
      <cite>{found.reference} · {found.attribution}</cite>
      <p>{found.body}</p>
    </blockquote>
  {/if}

  {#snippet footer()}
    <button type="button" class="desk-btn" onclick={onclose}>{t("Cancel")}</button>
    <button type="button" class="desk-btn primary-soft" disabled={!canPreview || busy} title={canPreview ? t("Put it in the look on Preview") : t("No look with scripture on Preview")} onclick={() => void send("preview")}>{t("Put on Preview")}</button>
    <button type="button" class="desk-btn live" disabled={!canLive || busy} title={canLive ? t("Change the verse on Program now") : t("No look with scripture on Program")} onclick={() => void send("program")}>{t("Send live")}</button>
  {/snippet}
</DeskDialog>

<style>
  .finder { display: flex; gap: 8px; margin: 0; }
  .field { flex: 1; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); color: var(--muted); }
  .field:focus-within { border-color: var(--accent); }
  .field input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 15px; outline: none; }
  select { height: 38px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); color: var(--ink); font: inherit; }
  .quick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .pick { height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--ink); font: inherit; font-size: 12px; cursor: pointer; }
  .pick:hover { background: var(--field); }
  .pick.fav { border-color: color-mix(in srgb, #f5b301 45%, var(--line)); }
  .pick.fav span { margin-right: 4px; color: #f5b301; }
  .note { margin: 12px 0 0; font-size: 13px; color: var(--muted); }
  .vf-verse { margin: 14px 0 0; padding: 14px 16px; border-left: 4px solid var(--accent); border-radius: 8px; background: var(--field); }
  .vf-verse cite { display: block; margin-bottom: 6px; font-style: normal; font-size: 12px; font-weight: 650; color: var(--muted); }
  .vf-verse p { margin: 0; font-size: 15px; line-height: 1.5; max-height: 220px; overflow: auto; }
</style>
