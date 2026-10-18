<script lang="ts">
  import { session } from "../app/session.svelte";
  import { formatReference, parseReference } from "../bible/reference";
  import { api } from "../db/api";
  import type { BibleItem, SearchHit, VerseText } from "../domain/types";
  import { t } from "../i18n/core";

  let translationId = $state("kjv");
  let bookOrd = $state(43);
  let chapter = $state(3);
  let verses = $state<VerseText[]>([]);
  let start = $state<number | null>(null);
  let end = $state<number | null>(null);
  let query = $state("");
  let hits = $state<SearchHit[]>([]);

  const book = $derived(session.books.find((entry) => entry.ord === bookOrd) ?? session.books[42]);

  $effect(() => {
    if (!translationId && session.translations[0]) translationId = session.translations[0].id;
  });

  $effect(() => {
    const id = translationId;
    const ord = bookOrd;
    const ch = chapter;
    if (!id) return;
    void api.verses(id, ord, ch).then((rows) => {
      verses = rows;
    }).catch(() => {
      verses = [];
    });
  });

  function currentPassage(): BibleItem | null {
    if (!book || start === null) return null;
    const last = end ?? start;
    return {
      translationId,
      bookOrd,
      chapter,
      startVerse: start,
      endVerse: last,
      reference: formatReference(book.name, chapter, start, last, book.chapters),
    };
  }

  function pick(verse: number, shift: boolean) {
    if (shift && start !== null) {
      end = verse;
      if (end < start) {
        const swap = start;
        start = end;
        end = swap;
      }
    } else {
      start = verse;
      end = verse;
    }
    const passage = currentPassage();
    if (passage) void session.previewPassage(passage);
  }

  async function lookup(event: Event) {
    event.preventDefault();
    const parsed = parseReference(query, session.books);
    if (parsed && parsed.startVerse) {
      bookOrd = parsed.bookOrd;
      chapter = parsed.chapter;
      start = parsed.startVerse;
      end = parsed.endVerse ?? parsed.startVerse;
      hits = [];
      const passage = currentPassage();
      if (passage) await session.previewPassage(passage);
      return;
    }
    if (parsed && parsed.startVerse === null) {
      bookOrd = parsed.bookOrd;
      chapter = parsed.chapter;
      hits = [];
      return;
    }
    hits = await api.search(translationId, query);
  }
</script>

<div class="pane">
  <form onsubmit={lookup}>
    <input class="field" placeholder={t("John 3:16 or a phrase")} bind:value={query} aria-label={t("Bible search")} />
  </form>
  <select bind:value={translationId} aria-label={t("Translation")}>
    {#each session.translations as translation}
      <option value={translation.id}>{translation.abbreviation} — {translation.name}</option>
    {/each}
  </select>
  <div class="books">
    {#each session.books as entry}
      <button type="button" onclick={() => (bookOrd = entry.ord)}>{entry.abbr}</button>
    {/each}
  </div>
  {#if book}
    <div class="chapters">
      {#each Array.from({ length: book.chapters }, (_, index) => index + 1) as number}
        <button type="button" onclick={() => (chapter = number)}>{number}</button>
      {/each}
    </div>
  {/if}
  <div class="actions">
    <button type="button" class="primary" onclick={() => { const passage = currentPassage(); if (passage) void session.previewPassage(passage); }}>{t("Preview")}</button>
    <button type="button" class="primary" onclick={() => { const passage = currentPassage(); if (passage) void session.addPassage(passage); }}>{t("Add to section")}</button>
  </div>
  {#if hits.length > 0}
    {#each hits as hit}
      <button
        type="button"
        class="hit"
        onclick={() => {
          bookOrd = hit.bookOrd;
          chapter = hit.chapter;
          start = hit.verse;
          end = hit.verse;
          const passage = currentPassage();
          if (passage) void session.previewPassage(passage);
        }}
      >
        <strong>{hit.bookName} {hit.chapter}:{hit.verse}</strong>
        <span class="hint">{hit.text}</span>
      </button>
    {/each}
  {:else}
    {#each verses as verse}
      <button
        type="button"
        class="verse"
        class:picked={start !== null && verse.verse >= start && verse.verse <= (end ?? start)}
        onclick={(event) => pick(verse.verse, event.shiftKey)}
      >
        <span>{verse.verse}</span>
        <span>{verse.text}</span>
      </button>
    {/each}
  {/if}
  {#if session.workspace.recent.length > 0}
    <p class="hint">{t("Recent")}</p>
    {#each session.workspace.recent as recent}
      <button type="button" class="hit" onclick={() => session.previewPassage(recent)}>{recent.reference}</button>
    {/each}
  {/if}
</div>
