<script lang="ts">
  import { session } from "../app/session.svelte";
  import { findItem } from "../domain/service";
  import type { PresentationItem, TextStyle } from "../domain/types";
  import DeckEditor from "./decks/DeckEditor.svelte";
  import DeckLibrary from "./decks/DeckLibrary.svelte";
  import Icon from "./Icon.svelte";
  import TextStyleEditor from "./TextStyleEditor.svelte";

  // Slide decks plus the service's quick slides. Pages and slides go to Preview; LIVE or TAKE sends Program.
  let note = $state("");
  let slideQuery = $state("");
  let slideImport = $state<HTMLInputElement | null>(null);
  let editingDeckId = $state<string | null>(null);
  const editingDeck = $derived(session.decks.find((deck) => deck.id === editingDeckId) ?? null);

  const queue = $derived(session.service?.sections.flatMap((section) => section.items) ?? []);
  const slides = $derived(queue.filter((item) => item.kind === "slide" || item.kind === "announcement"));
  const visibleSlides = $derived(slides.filter((item) => item.title.toLowerCase().includes(slideQuery.trim().toLowerCase())));
  const editingSlide = $derived.by(() => {
    const id = session.cursor.itemId;
    if (!session.service || !id) return null;
    const item = findItem(session.service, id)?.item;
    return item && (item.kind === "slide" || item.kind === "announcement") ? item : null;
  });

  function patchSlide(patch: { heading?: string; body?: string; style?: TextStyle }) {
    const item = editingSlide;
    if (!item) return;
    const text = item.slide ?? item.announcement ?? { heading: "", body: "" };
    const heading = patch.heading ?? text.heading;
    const body = patch.body ?? text.body;
    const style = patch.style ?? item.style;
    const next: PresentationItem = {
      ...item,
      title: heading.trim() || item.title,
      ...(item.kind === "slide" ? { slide: { heading, body, imageId: item.slide?.imageId ?? null } } : { announcement: { heading, body } }),
      ...(style && Object.keys(style).length ? { style } : { style: undefined }),
    };
    session.updateItem(next);
  }

  async function ensureService() {
    if (!session.service) await session.createService("Sunday Service");
    if (!session.service?.sections.length) session.addSection("Service");
  }

  async function createSlide() {
    await ensureService();
    session.addSlide("slide");
  }

  async function importSlides(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") await session.importPdf(file);
      else await session.importDocument(file.name, await file.text());
      note = session.message;
    } catch (error) {
      note = error instanceof Error ? error.message : "The file was not imported.";
    }
  }
</script>

<section class="slides">
  <DeckLibrary onedit={(id) => (editingDeckId = id)} />
  <div class="slide-bar">
    <span class="service-slides">Service slides</span>
    <button type="button" class="new-slide" onclick={() => void createSlide()}><Icon name="plus" size={14} /> Slide</button>
    <button type="button" class="new-slide" onclick={() => slideImport?.click()}>Import text</button>
    <input
      bind:this={slideImport}
      type="file"
      accept=".txt,.md,.markdown,.text,.pdf,text/plain,text/markdown,application/pdf"
      hidden
      aria-label="Import text or Markdown"
      onchange={(event) => void importSlides(event)}
    />
    <input placeholder="Search for slide title or content" aria-label="Search slides" bind:value={slideQuery} />
  </div>
  {#if note}<p class="note">{note}</p>{/if}
  <div class="slide-row">
    {#each visibleSlides as item, index (item.id)}
      <button type="button" class="card" class:hot={index % 3 !== 2} class:cool={index % 3 === 2} onclick={(event) => { event.currentTarget.blur(); void session.selectItem(item.id); }}>
        <strong>{item.title}</strong>
        <span>{item.kind === "announcement" ? "Announcement" : "Slide"}</span>
      </button>
    {/each}
  </div>
  {#if editingSlide}
    {@const slideText = editingSlide.slide ?? editingSlide.announcement ?? { heading: "", body: "" }}
    <div class="slide-editor">
      <input aria-label="Slide heading" placeholder="Heading" value={slideText.heading} oninput={(event) => patchSlide({ heading: event.currentTarget.value })} />
      <textarea aria-label="Slide body" rows="4" placeholder="Body text" value={slideText.body} oninput={(event) => patchSlide({ body: event.currentTarget.value })}></textarea>
      <TextStyleEditor style={editingSlide.style ?? {}} onchange={(style) => patchSlide({ style })} />
      <p class="note">Edits show on Preview. LIVE sends Program.</p>
    </div>
  {/if}
</section>

{#if editingDeck}
  {#key editingDeck.id}
    <DeckEditor deck={editingDeck} onclose={() => (editingDeckId = null)} />
  {/key}
{/if}

<style>
  .slides { display: flex; flex-direction: column; min-height: 0; overflow: auto; }
  /* Scroll as a whole; never squash rows into each other. */
  .slides > :global(*) { flex: none; }
  .slide-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 8px 8px; border-top: 1px solid var(--line); }
  .slide-bar input:not([hidden]) {
    flex: 1 1 200px;
    min-width: 0;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    padding: 0 10px;
  }
  .service-slides { color: var(--muted); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
  .new-slide { display: inline-flex; align-items: center; gap: 4px; height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); }
  .new-slide:hover { border-color: color-mix(in srgb, var(--ink) 35%, var(--line)); }
  .note { margin: 0; padding: 0 10px 8px; font-size: 12px; color: var(--muted); }
  .slide-row { display: flex; gap: 10px; overflow: auto; padding: 4px 10px 12px; }
  .card {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 6px;
    width: 180px;
    flex: none;
    min-height: 108px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: white;
    font-weight: 600;
    text-align: left;
  }
  .card span { font-size: 12px; font-weight: 500; opacity: 0.85; }
  .hot { background: linear-gradient(160deg, #ff8a3d, #ff5a1f); border-color: transparent; }
  .cool { background: linear-gradient(160deg, #1aa8a0, #0e6e74); border-color: transparent; }
  .slide-editor { display: flex; flex-direction: column; gap: 8px; padding: 4px 10px 12px; }
  .slide-editor input, .slide-editor textarea {
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    background: var(--field);
    color: var(--ink);
    padding: 8px 10px;
    font: inherit;
  }
</style>
