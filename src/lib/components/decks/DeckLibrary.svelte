<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { createDeck, duplicateDeck } from "../../domain/decks";
  import AiSlidesDialog from "./AiSlidesDialog.svelte";
  import DeckThumb from "./DeckThumb.svelte";
  import { t, tn } from "../../i18n/core";

  // Slides tab: decks as thumbnails (list / grid / large), their pages one click from Preview.
  let { onedit }: { onedit: (deckId: string) => void } = $props();

  let query = $state("");
  let pptxInput: HTMLInputElement | undefined = $state();
  let view = $state<"list" | "grid" | "large">("grid");
  let openDeckId = $state<string | null>(null);
  let menuFor = $state<string | null>(null);
  let armedDelete = $state<string | null>(null);
  let armTimer: ReturnType<typeof setTimeout> | undefined;

  const decks = $derived(
    session.decks.filter((deck) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return (
        deck.name.toLowerCase().includes(needle) ||
        deck.pages.some((page) => page.layers.some((layer) => (layer.source.payload.body ?? "").toLowerCase().includes(needle)))
      );
    }),
  );
  const open = $derived(session.decks.find((deck) => deck.id === openDeckId) ?? null);

  let aiOpen = $state(false);

  function createNew() {
    const deck = createDeck(t("Slides {n}", { n: session.decks.length + 1 }));
    session.saveDeck(deck);
    openDeckId = deck.id;
    onedit(deck.id);
  }

  function remove(id: string) {
    clearTimeout(armTimer);
    if (armedDelete !== id) {
      armedDelete = id;
      armTimer = setTimeout(() => (armedDelete = null), 3000);
      return;
    }
    armedDelete = null;
    menuFor = null;
    if (openDeckId === id) openDeckId = null;
    session.deleteDeck(id);
  }
</script>

{#if aiOpen}<AiSlidesDialog onclose={() => (aiOpen = false)} onmade={(deck) => (openDeckId = deck.id)} />{/if}

<div class="decks">
  <div class="bar">
    <button type="button" class="new-deck" onclick={createNew}>{t("+ Create new")}</button>
    <button type="button" class="new-deck ghost" title={t("Write a deck from notes, a passage or a topic with your AI service")} onclick={() => (aiOpen = true)}>✦ {t("Make with AI")}</button>
    <button type="button" class="new-deck ghost" title={t("Bring in a PowerPoint (.pptx) as an editable deck, or a PDF as a deck of pages")} onclick={() => pptxInput?.click()}>{t("Import PowerPoint or PDF")}</button>
    <input
      bind:this={pptxInput}
      type="file"
      accept=".pptx,.ppt,.key,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
      hidden
      aria-label={t("Import PowerPoint")}
      onchange={async (event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        const id = /\.pdf$/i.test(file.name) || file.type === "application/pdf" ? await session.importPdf(file, undefined, false) : await session.importPowerPoint(file);
        if (id) onedit(id);
      }}
    />
    <input class="search" placeholder={t("Search for slide title or content")} aria-label={t("Search decks")} bind:value={query} />
    <div class="views" role="radiogroup" aria-label={t("Deck view")}>
      {#each [["list", "List"], ["grid", "Grid"], ["large", "Large grid"]] as [id, label] (id)}
        <button type="button" role="radio" aria-checked={view === id} aria-label={label} title={label} class:on={view === id} onclick={() => (view = id as typeof view)}>
          <span class="glyph {id}" aria-hidden="true"></span>
        </button>
      {/each}
    </div>
  </div>

  {#if decks.length === 0}
    <p class="empty">{session.decks.length ? t("No deck matches.") : t("No slide decks yet. Create one to design announcement and song slides.")}</p>
  {/if}

  <ul class="cards {view}">
    {#each decks as deck (deck.id)}
      <li class:on={openDeckId === deck.id}>
        <button
          type="button"
          class="card"
          aria-label={`${deck.name}, ${tn(deck.pages.length, "{n} page", "{n} pages")}`}
          aria-pressed={openDeckId === deck.id}
          onclick={() => {
            openDeckId = deck.id;
            session.previewDeckPage(deck.id, 0);
          }}
          ondblclick={() => onedit(deck.id)}
        >
          <span class="art"><DeckThumb page={deck.pages[0]!} /></span>
          <span class="meta">
            <strong>{deck.name}</strong>
            <small>{tn(deck.pages.length, "{n} page", "{n} pages")}</small>
          </span>
        </button>
        <button type="button" class="more" aria-label={t("More for {name}", { name: deck.name })} aria-haspopup="menu" aria-expanded={menuFor === deck.id} onclick={() => (menuFor = menuFor === deck.id ? null : deck.id)}>⋯</button>
        {#if menuFor === deck.id}
          <div class="menu" role="menu">
            <button type="button" role="menuitem" onclick={() => { menuFor = null; onedit(deck.id); }}>{t("Edit")}</button>
            <button type="button" role="menuitem" onclick={() => { menuFor = null; void session.addDeckToService(deck.id); }}>{t("Add to queue")}</button>
            <button type="button" role="menuitem" onclick={() => { menuFor = null; void session.startDeckLoop(deck.id, 8); }}>{t("Loop on Program (8 s a page)")}</button>
            <button type="button" role="menuitem" onclick={() => { menuFor = null; session.saveDeck(duplicateDeck(deck)); }}>{t("Duplicate")}</button>
            <button type="button" role="menuitem" class="danger" onclick={() => remove(deck.id)}>{armedDelete === deck.id ? t("Delete? Click again") : t("Delete")}</button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  {#if open}
    <div class="pages-head"><strong>{open.name}</strong><span>{t("Click a page for Preview · LIVE sends it")}</span></div>
    <ol class="pages">
      {#each open.pages as page, index (page.id)}
        <li>
          <button
            type="button"
            class="page"
            class:on={session.deckFocus?.deckId === open.id && session.deckFocus.index === index}
            aria-label={t("Preview page {index}", { index: index + 1 })}
            onclick={() => session.previewDeckPage(open.id, index)}
          >
            <DeckThumb {page} />
            <small>{index + 1}</small>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .decks { display: flex; flex-direction: column; gap: 10px; padding: 10px; min-height: 0; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .new-deck { min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font-weight: 600; cursor: pointer; white-space: nowrap; }
  .search { flex: 1 1 200px; min-width: 160px; height: 38px; border-radius: 10px; border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 0 12px; font: inherit; }
  .views { display: flex; gap: 2px; padding: 2px; border-radius: 10px; border: 1px solid var(--line); }
  .views button { width: 34px; height: 32px; border-radius: 8px; border: 0; background: transparent; cursor: pointer; display: grid; place-items: center; }
  .views button.on { background: var(--field); }
  .glyph { width: 14px; height: 12px; border: 2px solid var(--muted); border-radius: 2px; }
  .glyph.list { border-width: 2px 0; height: 8px; }
  .glyph.grid { background: linear-gradient(var(--muted), var(--muted)) center / 2px 100% no-repeat; }
  .glyph.large { width: 16px; height: 14px; }
  .views button.on .glyph { border-color: var(--ink); }
  .empty { margin: 8px 2px; color: var(--muted); }
  .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .cards.grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
  .cards.large { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .cards.list { grid-template-columns: 1fr; }
  .cards li { position: relative; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); }
  .cards li.on { border-color: var(--accent); }
  .card { display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 10px; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; border-radius: 12px; }
  .cards.list .card { flex-direction: row; align-items: center; }
  .cards.list .art { width: 120px; flex: none; }
  .meta { display: flex; flex-direction: column; gap: 2px; padding-right: 26px; min-width: 0; }
  .meta strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta small { color: var(--muted); }
  .more { position: absolute; right: 6px; bottom: 8px; width: 30px; height: 30px; border-radius: 8px; border: 0; background: transparent; color: var(--ink); font-size: 18px; cursor: pointer; }
  .more:hover { background: var(--field); }
  .menu { position: absolute; right: 6px; bottom: 42px; z-index: 4; min-width: 170px; padding: 6px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); display: flex; flex-direction: column; gap: 2px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); }
  .menu button { text-align: left; min-height: 32px; padding: 0 10px; border-radius: 6px; border: 0; background: transparent; color: var(--ink); cursor: pointer; }
  .menu button:hover { background: var(--field); }
  .menu .danger { color: #ff8a8a; }
  .pages-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-top: 4px; }
  .pages-head span { color: var(--muted); font-size: 12px; }
  .pages { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .page { width: 100%; display: flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 10px; border: 2px solid transparent; background: var(--panel); color: var(--muted); cursor: pointer; }
  .page.on { border-color: var(--accent); }
  :is(button, input):focus-visible { outline: 2px solid var(--focus, var(--accent)); outline-offset: 2px; }
</style>
