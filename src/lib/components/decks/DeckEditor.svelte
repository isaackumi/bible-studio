<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { mediaUrl } from "../../db/api";
  import { removeLayer, sanitizeBackground, setCompositionBackground, type Composition, type PageBackground } from "../../domain/composition";
  import {
    addImageElement,
    addPage,
    addQrElement,
    addShapeElement,
    addTextElement,
    duplicatePage,
    movePage,
    removePage,
    replacePage,
    type SlideDeck,
  } from "../../domain/decks";
  import DeckThumb from "./DeckThumb.svelte";
  import ElementInspector from "./ElementInspector.svelte";
  import PageCanvas from "./PageCanvas.svelte";

  // Full-screen deck editor. Edits stay in a draft until "Save changes"; Program never changes here.
  let { deck, onclose }: { deck: SlideDeck; onclose: () => void } = $props();

  // The editor works on a copy taken when it opens.
  let draft = $state<SlideDeck>(untrack(() => JSON.parse(JSON.stringify(deck))));
  let pageIndex = $state(0);
  let selectedId = $state<string | null>(null);
  let zoom = $state(100);
  let undoStack = $state<string[]>([]);
  let redoStack = $state<string[]>([]);
  let savedJson = $state(untrack(() => JSON.stringify(deck)));
  let editingText = $state<string | null>(null);
  let confirmClose = $state(false);
  let dragFrom = $state<number | null>(null);
  let imageMenu = $state(false);

  const page = $derived(draft.pages[pageIndex] ?? draft.pages[0]!);
  const selected = $derived(page.layers.find((layer) => layer.id === selectedId) ?? null);
  const dirty = $derived(JSON.stringify(draft) !== savedJson);
  const images = $derived(session.media.filter((asset) => asset.kind === "image"));

  function snapshot() {
    undoStack = [...undoStack.slice(-79), JSON.stringify(draft)];
    redoStack = [];
  }
  /** One history step for a finished change to the current page. */
  function commitPage(next: Composition) {
    snapshot();
    draft = replacePage(draft, pageIndex, next);
  }
  /** Live update while dragging; the history step is taken when the drag starts. */
  let dragging = false;
  function previewPage(next: Composition) {
    if (!dragging) {
      snapshot();
      dragging = true;
    }
    draft = { ...draft, pages: draft.pages.map((entry, at) => (at === pageIndex ? next : entry)) };
  }
  function endDrag(next: Composition) {
    dragging = false;
    draft = replacePage(draft, pageIndex, next);
  }
  function commitDeck(next: SlideDeck) {
    snapshot();
    draft = next;
  }
  function undo() {
    const last = undoStack.at(-1);
    if (!last) return;
    redoStack = [...redoStack, JSON.stringify(draft)];
    undoStack = undoStack.slice(0, -1);
    draft = JSON.parse(last);
    pageIndex = Math.min(pageIndex, draft.pages.length - 1);
  }
  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    undoStack = [...undoStack, JSON.stringify(draft)];
    redoStack = redoStack.slice(0, -1);
    draft = JSON.parse(next);
  }

  function save() {
    session.saveDeck(draft);
    savedJson = JSON.stringify(draft);
  }
  function close() {
    if (dirty && !confirmClose) {
      confirmClose = true;
      return;
    }
    onclose();
  }

  function addText() {
    const next = addTextElement(page, "New text", { x: 20, y: 40, w: 60, h: 18 }, { size: 72, color: "#ffffff" });
    commitPage(next);
    selectedId = next.layers.at(-1)?.id ?? null;
  }
  function addShape(kind: "rect" | "ellipse") {
    const next = addShapeElement(page, kind, "#ffffff", kind === "rect" ? { x: 30, y: 30, w: 40, h: 40 } : { x: 40, y: 32, w: 20, h: 36 });
    commitPage(next);
    selectedId = next.layers.at(-1)?.id ?? null;
  }
  function addImage(asset: { id: string; name: string }) {
    const next = addImageElement(page, { id: asset.id, name: asset.name, url: mediaUrl(session.media.find((entry) => entry.id === asset.id) ?? null) ?? "" });
    commitPage(next);
    selectedId = next.layers.at(-1)?.id ?? null;
    imageMenu = false;
  }
  function addQr() {
    const next = addQrElement(page, "https://");
    commitPage(next);
    selectedId = next.layers.at(-1)?.id ?? null;
  }

  function setBackground(patch: Partial<PageBackground>) {
    const current = page.background ?? sanitizeBackground({ type: "color" })!;
    commitPage(setCompositionBackground(page, { ...current, ...patch }));
  }

  function onkeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      save();
      return;
    }
    if (typing) return;
    if ((event.key === "Delete" || event.key === "Backspace") && selected && !selected.locked) {
      event.preventDefault();
      event.stopPropagation();
      commitPage(removeLayer(page, selected.id));
      selectedId = null;
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (editingText) editingText = null;
      else if (selectedId) selectedId = null;
      else close();
    }
  }

  const editing = $derived(editingText ? page.layers.find((layer) => layer.id === editingText) ?? null : null);
</script>

<svelte:window onkeydowncapture={onkeydown} />

<div class="deck-editor" role="dialog" aria-modal="true" aria-label={`Edit ${draft.name}`}>
  <header>
    <input class="deck-name" aria-label="Deck name" value={draft.name} onchange={(event) => commitDeck({ ...draft, name: event.currentTarget.value.trim() || draft.name })} />
    <div class="history">
      <button type="button" aria-label="Undo" title="Undo (⌘Z)" disabled={!undoStack.length} onclick={undo}>↶</button>
      <button type="button" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!redoStack.length} onclick={redo}>↷</button>
    </div>
    <span class="status">{dirty ? "Unsaved changes" : "Saved"}</span>
    <button type="button" class="save" disabled={!dirty} onclick={save}>Save changes</button>
    <button type="button" class="close" class:warn={confirmClose} onclick={close}>{confirmClose ? "Discard changes?" : "Close"}</button>
  </header>

  <div class="body">
    <aside class="pages" aria-label="Pages">
      <ol>
        {#each draft.pages as entry, index (entry.id)}
          <li
            class:on={index === pageIndex}
            class:drop={dragFrom !== null && dragFrom !== index}
            draggable="true"
            ondragstart={() => (dragFrom = index)}
            ondragover={(event) => event.preventDefault()}
            ondrop={(event) => {
              event.preventDefault();
              if (dragFrom !== null && dragFrom !== index) {
                commitDeck(movePage(draft, dragFrom, index));
                pageIndex = index;
              }
              dragFrom = null;
            }}
            ondragend={() => (dragFrom = null)}
          >
            <button type="button" class="page" aria-label={`Page ${index + 1}`} aria-current={index === pageIndex} onclick={() => { pageIndex = index; selectedId = null; }}>
              <span class="num">{index + 1}</span>
              <DeckThumb page={entry} />
            </button>
            <div class="page-actions">
              <button type="button" aria-label={`Duplicate page ${index + 1}`} onclick={() => commitDeck(duplicatePage(draft, index))}>Duplicate</button>
              <button type="button" aria-label={`Delete page ${index + 1}`} disabled={draft.pages.length <= 1} onclick={() => { commitDeck(removePage(draft, index)); pageIndex = Math.max(0, Math.min(pageIndex, draft.pages.length - 1)); }}>Delete</button>
            </div>
          </li>
        {/each}
      </ol>
      <button type="button" class="add-page" onclick={() => { commitDeck(addPage(draft, pageIndex)); pageIndex = pageIndex + 1; selectedId = null; }}>+ Add new page</button>
    </aside>

    <main class="work">
      <div class="toolbar" role="toolbar" aria-label="Add to page">
        <button type="button" onclick={addText}>Text</button>
        <button type="button" onclick={() => addShape("rect")}>Rectangle</button>
        <button type="button" onclick={() => addShape("ellipse")}>Ellipse</button>
        <span class="menu-wrap">
          <button type="button" aria-haspopup="menu" aria-expanded={imageMenu} onclick={() => (imageMenu = !imageMenu)}>Image</button>
          {#if imageMenu}
            <div class="menu" role="menu">
              {#if images.length === 0}
                <p class="note">Import pictures in Media first.</p>
              {/if}
              {#each images as asset (asset.id)}
                <button type="button" role="menuitem" onclick={() => addImage(asset)}>{asset.name}</button>
              {/each}
            </div>
          {/if}
        </span>
        <button type="button" onclick={addQr}>QR code</button>
      </div>
      <div class="canvas-area">
        <PageCanvas
          {page}
          {selectedId}
          {zoom}
          onselect={(id) => { selectedId = id; imageMenu = false; }}
          onpreview={previewPage}
          oncommit={endDrag}
          onedittext={(id) => (editingText = id)}
        />
      </div>
      <label class="zoom">
        <span>Zoom</span>
        <input type="range" min="40" max="100" step="5" aria-label="Zoom" bind:value={zoom} />
        <span>{zoom}%</span>
      </label>
    </main>

    <aside class="inspect" aria-label="Inspector">
      {#if selected}
        <ElementInspector {page} layer={selected} oncommit={commitPage} />
      {:else}
        <h3>{page.name}</h3>
        <label class="field-row">
          <span>Name</span>
          <input class="field" aria-label="Page name" value={page.name} onchange={(event) => commitPage({ ...page, name: event.currentTarget.value.trim() || page.name })} />
        </label>
        <label class="field-row">
          <span>Background</span>
          <select class="field" aria-label="Background type" value={page.background?.type ?? "color"} onchange={(event) => setBackground({ type: event.currentTarget.value as PageBackground["type"] })}>
            <option value="color">Color</option>
            <option value="gradient">Gradient</option>
            <option value="image">Picture</option>
          </select>
        </label>
        {#if (page.background?.type ?? "color") !== "image"}
          <div class="field-row">
            <span>{page.background?.type === "gradient" ? "Colors" : "Color"}</span>
            <span class="inline">
              <input type="color" aria-label="Background color" value={page.background?.color ?? "#1b1b1f"} oninput={(event) => setBackground({ color: event.currentTarget.value })} />
              {#if page.background?.type === "gradient"}
                <input type="color" aria-label="Gradient end color" value={page.background.to} oninput={(event) => setBackground({ to: event.currentTarget.value })} />
                <input class="field angle" type="number" min="0" max="359" aria-label="Gradient angle" value={page.background.angle} onchange={(event) => setBackground({ angle: Number(event.currentTarget.value) })} />
              {/if}
            </span>
          </div>
        {:else}
          <div class="stack">
            {#if images.length === 0}<p class="note">Import pictures in Media first.</p>{/if}
            {#each images as asset (asset.id)}
              <button type="button" class="pick" class:on={page.background?.assetId === asset.id} onclick={() => setBackground({ assetId: asset.id, imageUrl: mediaUrl(asset) ?? "" })}>{asset.name}</button>
            {/each}
          </div>
        {/if}
        <div class="field-row">
          <span>Overlay</span>
          <span class="inline">
            <input type="color" aria-label="Overlay color" value={page.background?.overlay ?? "#000000"} oninput={(event) => setBackground({ overlay: event.currentTarget.value })} />
            <input type="range" min="0" max="1" step="0.05" aria-label="Overlay strength" value={page.background?.overlayOpacity ?? 0} onchange={(event) => setBackground({ overlayOpacity: Number(event.currentTarget.value) })} />
          </span>
        </div>
        <p class="note">Click an element to edit it. Double-click text to type. Drag to move, corners to resize.</p>
      {/if}
    </aside>
  </div>

  {#if editing}
    <div class="text-edit" role="dialog" aria-label="Edit text">
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        autofocus
        aria-label="Text"
        rows="4"
        value={editing.source.payload.body ?? ""}
        onkeydown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") editingText = null;
        }}
        onchange={(event) => {
          const value = event.currentTarget.value;
          commitPage({
            ...page,
            layers: page.layers.map((layer) => (layer.id === editing.id ? { ...layer, source: { ...layer.source, payload: { ...layer.source.payload, body: value } } } : layer)),
          });
        }}
      ></textarea>
      <button type="button" onclick={() => (editingText = null)}>Done</button>
    </div>
  {/if}
</div>

<style>
  .deck-editor { position: fixed; inset: 0; z-index: 35; background: var(--desk, #111); color: var(--ink); display: flex; flex-direction: column; font-family: var(--font-ui); font-size: 13px; }
  header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  .deck-name { flex: 0 1 360px; height: 36px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--ink); font: 600 18px/1 var(--font-ui); padding: 0 8px; }
  .deck-name:hover, .deck-name:focus { border-color: var(--line); background: var(--field); }
  .history { display: flex; gap: 4px; }
  .history button { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font-size: 16px; cursor: pointer; }
  .history button:disabled { opacity: 0.4; cursor: default; }
  .status { flex: 1; color: var(--muted); font-size: 12px; text-align: right; }
  .save { height: 36px; padding: 0 16px; border-radius: 8px; border: 0; background: var(--accent); color: #fff; font-weight: 700; cursor: pointer; }
  .save:disabled { opacity: 0.45; cursor: default; }
  .close { height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; }
  .close.warn { background: #c8102e; border-color: #c8102e; color: #fff; }
  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 240px minmax(0, 1fr) 300px; }
  .pages { border-right: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; }
  .pages ol { list-style: none; margin: 0; padding: 10px; flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
  .pages li { border-radius: 10px; padding: 6px; border: 1px solid transparent; }
  .pages li.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .page { display: flex; gap: 6px; width: 100%; border: 0; background: none; color: var(--ink); cursor: pointer; padding: 0; text-align: left; }
  .num { width: 16px; color: var(--muted); }
  .page-actions { display: flex; gap: 4px; margin-top: 4px; padding-left: 22px; }
  .page-actions button { font-size: 11px; min-height: 24px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--field); color: var(--muted); cursor: pointer; }
  .add-page { margin: 10px; min-height: 36px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; }
  .work { display: flex; flex-direction: column; min-height: 0; min-width: 0; padding: 14px 20px; gap: 12px; background: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--ink) 10%, transparent) 1px, transparent 0) 0 0 / 22px 22px; }
  .toolbar { align-self: center; display: flex; gap: 6px; padding: 6px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); }
  .toolbar > button, .menu-wrap > button { min-height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--ink); cursor: pointer; font-weight: 600; }
  .toolbar > button:hover, .menu-wrap > button:hover { background: var(--field); }
  .menu-wrap { position: relative; }
  .menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 3; min-width: 200px; max-height: 260px; overflow: auto; padding: 6px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); display: flex; flex-direction: column; gap: 2px; }
  .menu button { text-align: left; min-height: 30px; padding: 0 8px; border-radius: 6px; border: 0; background: transparent; color: var(--ink); cursor: pointer; }
  .menu button:hover { background: var(--field); }
  .canvas-area { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: center; }
  .canvas-area > :global(*) { flex: 1; }
  .zoom { align-self: center; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
  .inspect { border-left: 1px solid var(--line); padding: 14px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
  .inspect h3 { margin: 0; font-size: 14px; }
  .field-row { display: grid; grid-template-columns: 80px minmax(0, 1fr); align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
  .field { height: 32px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 0 8px; font: inherit; min-width: 0; }
  .angle { width: 64px; }
  .inline { display: flex; gap: 6px; align-items: center; }
  input[type="color"] { width: 40px; height: 30px; border: 1px solid var(--line); border-radius: 6px; background: none; padding: 0; }
  .stack { display: flex; flex-direction: column; gap: 2px; max-height: 180px; overflow: auto; }
  .pick { text-align: left; min-height: 30px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; }
  .pick.on { border-color: var(--accent); }
  .note { margin: 0; color: var(--muted); font-size: 12px; }
  .text-edit { position: fixed; left: 50%; top: 22%; transform: translateX(-50%); z-index: 40; width: min(560px, calc(100% - 40px)); display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; border: 1px solid var(--accent); background: var(--panel); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5); }
  .text-edit textarea { border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 8px; font: 16px/1.4 var(--font-ui); resize: vertical; }
  .text-edit button { align-self: flex-end; min-height: 32px; padding: 0 14px; border-radius: 8px; border: 0; background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
  :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--focus, var(--accent)); outline-offset: 2px; }
  @media (max-width: 1100px) { .body { grid-template-columns: 180px minmax(0, 1fr) 260px; } }
</style>
