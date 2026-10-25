<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { formatReference, parseReference } from "../../bible/reference";
  import { api } from "../../db/api";
  import type { BibleItem } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";

  // A verse the preacher calls out that is not in the running order: typed here (or heard), it goes
  // on Preview without leaving the Service page, marked as outside the service, with one click back.
  let text = $state("");
  let problem = $state("");
  let busy = $state(false);
  let input = $state<HTMLInputElement | undefined>();
  /** The verse put on Preview from here (for Add to service). */
  let shown = $state<BibleItem | null>(null);
  const translationId = $derived(session.workspace.deskTranslationId ?? session.translations[0]?.id ?? "kjv");
  const free = $derived(session.previewFree && session.previewBible);

  async function show(event?: SubmitEvent) {
    event?.preventDefault();
    problem = "";
    const ref = parseReference(text);
    if (!ref) {
      problem = text.trim() ? t("Type a reference like John 3:16 or Psalm 23:1-4.") : "";
      return;
    }
    busy = true;
    try {
      const chapter = await api.verses(translationId, ref.bookOrd, ref.chapter);
      const count = chapter.length ? Math.max(...chapter.map((verse) => verse.verse)) : 0;
      const start = ref.startVerse ?? 1;
      if (!count || start > count) {
        problem = count ? t("{book} {chapter} has {n} verses.", { book: ref.bookName, chapter: ref.chapter, n: count }) : t("Nothing found for {reference} in this translation.", { reference: `${ref.bookName} ${ref.chapter}` });
        return;
      }
      const end = Math.min(count, ref.endVerse ?? start);
      const book = session.books.find((entry) => entry.ord === ref.bookOrd);
      const passage: BibleItem = { translationId, bookOrd: ref.bookOrd, chapter: ref.chapter, startVerse: start, endVerse: end, reference: formatReference(ref.bookName, ref.chapter, start, end, book?.chapters ?? 1) };
      await session.previewPassage(passage);
      shown = passage;
      text = "";
    } catch {
      problem = t("This translation could not be read. Check the connection or pick another.");
    } finally {
      busy = false;
    }
  }

  async function heard(passage: BibleItem) {
    await session.previewPassage(passage);
    shown = passage;
    session.dismissHeardVerse(passage.reference);
  }

  // Add asks which part first (the window says when the verse is already in the service). Once
  // added, the same button takes it out again.
  /** The item added from here, while that verse is still on Preview. */
  let added = $state<{ reference: string; itemId: string } | null>(null);
  const justAdded = $derived(added !== null && added.reference === session.previewBible?.reference && !!session.service?.sections.some((section) => section.items.some((item) => item.id === added!.itemId)));

  async function addToService() {
    const passage = session.previewBible;
    if (!passage) return;
    const part = await session.pickServicePart(passage.reference);
    if (!part) return;
    const itemId = await session.addPassageToService({ ...passage }, part);
    added = { reference: passage.reference, itemId };
  }

  function removeAdded() {
    if (!added) return;
    session.deleteItem(added.itemId);
    added = null;
  }

  // "/" finds a verse from anywhere on the Service page.
  function onKey(event: KeyboardEvent) {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    event.stopPropagation();
    input?.focus();
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="quick" class:free={!!free}>
  <form class="find" onsubmit={show}>
    <Icon name="search" size={14} />
    <input bind:this={input} bind:value={text} aria-label={t("Show a verse not in the service")} placeholder={t("Any verse: John 3:16")} title={t("A verse not in the running order goes on Preview. Press / to type here.")} oninput={() => (problem = "")} />
    {#if text.trim()}<button type="submit" class="go" disabled={busy}>{t("Preview")}</button>{:else}<kbd>/</kbd>{/if}
  </form>
  {#if problem}<p class="problem" role="alert">{problem}</p>{/if}

  {#if free}
    <div class="free-bar" role="status">
      <span class="free-copy"><strong>{session.previewBible?.reference}</strong><em>{t("On Preview, not in the service")}</em></span>
      <button type="button" class="act live" onclick={() => void session.take()} title={t("Send it to the screen (Space)")}>{t("LIVE")}</button>
      {#if justAdded}
        <button type="button" class="act" onclick={removeAdded} title={t("Take it out of the running order again")}><Icon name="check" size={12} /> {t("Added")} · {t("Remove")}</button>
      {:else}
        <button type="button" class="act" onclick={() => void addToService()} title={t("Add it to the running order: choose the part")}><Icon name="plus" size={12} /> {t("Add")}</button>
      {/if}
      <button type="button" class="act" onclick={() => void session.backToService()} title={t("The selected item of the service back on Preview")}><Icon name="list" size={12} /> {t("Back to the service")}</button>
    </div>
  {/if}

  {#if session.heardVerses.length}
    <div class="heard" aria-label={t("Verses heard")}>
      <span class="heard-label"><Icon name="mic" size={12} /> {t("Heard")}</span>
      {#each session.heardVerses as passage (passage.reference)}
        <span class="chip">
          <button type="button" class="chip-main" title={t("Put {reference} on Preview", { reference: passage.reference })} onclick={() => void heard(passage)}>{passage.reference}</button>
          <button type="button" class="chip-x" aria-label={t("Dismiss {reference}", { reference: passage.reference })} onclick={() => session.dismissHeardVerse(passage.reference)}><Icon name="close" size={11} /></button>
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .quick { display: grid; gap: 6px; }
  .find { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 6px 0 11px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--muted); }
  .find:focus-within { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }
  .find input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; color: var(--ink); font: inherit; font-size: 13px; outline: none; }
  .find kbd { padding: 1px 7px; border: 1px solid var(--line); border-radius: 5px; font: inherit; font-size: 11px; color: var(--muted); }
  .go { height: 26px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--accent); color: #fff; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  .problem { margin: 0; font-size: 12px; color: var(--warn-text); }
  .free-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 10px; border: 1px dashed color-mix(in srgb, #3b82f6 60%, var(--line)); border-radius: 10px; background: color-mix(in srgb, #3b82f6 10%, transparent); }
  .free-copy { flex: 1 1 140px; display: grid; gap: 1px; min-width: 0; }
  .free-copy strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .free-copy em { font-style: normal; font-size: 11px; color: var(--muted); }
  .act { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .act:hover { background: var(--field); }
  .act.live { border-color: transparent; background: var(--live, #e5484d); color: #fff; font-weight: 750; letter-spacing: 0.04em; }
  .heard { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .heard-label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: var(--muted); }
  .chip { display: inline-flex; align-items: center; border: 1px solid color-mix(in srgb, #30a46c 50%, var(--line)); border-radius: 14px; background: color-mix(in srgb, #30a46c 12%, transparent); overflow: hidden; }
  .chip-main { height: 26px; padding: 0 4px 0 10px; border: 0; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .chip-x { display: grid; place-items: center; width: 24px; height: 26px; border: 0; background: none; color: var(--muted); cursor: pointer; }
  .chip-x:hover { color: var(--ink); }
</style>
