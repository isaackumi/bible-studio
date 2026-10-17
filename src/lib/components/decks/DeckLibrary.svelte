<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { createDeck, duplicateDeck } from "../../domain/decks";
  import DeckThumb from "./DeckThumb.svelte";

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

  function createNew() {
    const deck = createDeck(`Slides ${session.decks.length + 1}`);
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

<div class="decks">
  <div class="bar">
    <button type="button" class="new-deck" onclick={createNew}>+ Create new</button>
    <button type="button" class="new-deck ghost" title="Bring in a PowerPoint (.pptx) as an editable deck" onclick={() => pptxInput?.click()}>Import PowerPoint</button>
    <input
      bind:this={pptxInput}
      type="file"
      accept=".pptx,.ppt,.key,application/vnd.openxmlformats-officedocument.presentationml.presentation"
      hidden
      aria-label="Import PowerPoint"
      onchange={async (event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        const id = await session.importPowerPoint(file);
        if (id) onedit(id);
      }}
    />
    <input class="search" placeholder="Search for slide title or content" aria-label="Search decks" bind:value={query} />
    <div class="views" role="radiogroup" aria-label="Deck view">
      {#each [["list", "List"], ["grid", "Grid"], ["large", "Large grid"]] as [id, label] (id)}
        <button type="button" role="radio" aria-checked={view === id} aria-label={label} title={label} class:on={view === id} onclick={() => (view = id as typeof view)}>
          <span class="glyph {id}" aria-hidden="true"></span>
        </button>
      {/each}
    </div>
  </div>

  {#if decks.length === 0}
    <p class="empty">{session.decks.length ? "No deck matches." : "No slide decks yet. Create one to design announcement and song slides."}</p>
  {/if}

  <ul class="cards {view}">
    {#each decks as deck (deck.id)}
      <li class:on={openDeckId === deck.id}>
        <button
          type="button"
          class="card"
          aria-label={`${deck.name}, ${deck.pages.length} page${deck.pages.length === 1 ? "" : "s"}`}
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
            <small>{deck.pages.length} page{deck.pages.length === 1 ? "" : "s"}</small>
          </span>
        </button>
        <button type="button" class="more" aria-label={`More for ${deck.name}`} aria-haspopup="menu" aria-expanded={menuFor === deck.id} onclick={() => (menuFor = menuFor === deck.id ? null : deck.id)}>⋯</button>
        {#if menuFor === deck.id}
          <div class="menu" role="menu">
            <button type="button" role="menuitem" onclick={() => { menuFor = null; onedit(deck.id); }}>Edit</button>
            <button type="button" role="menuitem" onclick={() => { menuFor = null; void session.addDeckToService(deck.id); }}>Add to queue</button>
            <button type="button" role="menuitem" onclick={() => { menuFor = null; session.saveDeck(duplicateDeck(deck)); }}>Duplicate</button>
            <button type="button" role="menuitem" class="danger" onclick={() => remove(deck.id)}>{armedDelete === deck.id ? "Delete? Click again" : "Delete"}</button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  {#if open}
    <div class="pages-head"><strong>{open.name}</strong><span>Click a page for Preview · LIVE sends it</span></div>
    <ol class="pages">
      {#each open.pages as page, index (page.id)}
        <li>
          <button
            type="button"
            class="page"
            class:on={session.deckFocus?.deckId === open.id && session.deckFocus.index === index}
            aria-label={`Preview page ${index + 1}`}
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
  .bar { display: flex; gap: 8px; align-items: center; }
  .new-deck { min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font-weight: 600; cursor: pointer; white-space: nowrap; }
  .search { flex: 1; min-width: 0; height: 38px; border-radius: 10px; border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 0 12px; font: inherit; }
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
