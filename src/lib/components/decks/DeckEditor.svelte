<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { mediaUrl } from "../../db/api";
  import { addLayer, duplicateLayer, moveLayerTo, removeLayer, reorderLayers, resizeLayer, sanitizeBackground, setCompositionBackground, type Composition, type CompositionLayer, type PageBackground } from "../../domain/composition";
  import {
    addIconElement,
    addImageElement,
    addPage,
    addQrElement,
    addShapeElement,
    addTextElement,
    duplicatePage,
    insertPage,
    movePage,
    removePage,
    replacePage,
    type SlideDeck,
  } from "../../domain/decks";
  import DeckThumb from "./DeckThumb.svelte";
  import ElementInspector from "./ElementInspector.svelte";
  import PageCanvas from "./PageCanvas.svelte";
  import GradientEditor from "./GradientEditor.svelte";
  import TemplateGallery from "./TemplateGallery.svelte";
  import { encodeFill, sanitizeFill, type Fill } from "../../domain/fill";
  import type { IconNode } from "../../domain/icon";
  import { t } from "../../i18n/core";

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
    const next = addTextElement(page, t("New text"), { x: 20, y: 40, w: 60, h: 18 }, { size: 72, color: "#ffffff" });
    commitPage(next);
    selectedId = next.layers.at(-1)?.id ?? null;
  }
  function addShape(kind: "rect" | "ellipse" | "line") {
    const bounds = kind === "rect" ? { x: 30, y: 30, w: 40, h: 40 } : kind === "line" ? { x: 30, y: 49, w: 40, h: 1.2 } : { x: 40, y: 32, w: 20, h: 36 };
    const next = addShapeElement(page, kind, "#ffffff", bounds);
    commitPage(next);
    selectedId = next.layers.at(-1)?.id ?? null;
  }
  function addImage(asset: { id: string; name: string }) {
    const next = addImageElement(page, { id: asset.id, name: asset.name, url: mediaUrl(session.media.find((entry) => entry.id === asset.id) ?? null) ?? "" });
    commitPage(next);
    selectedId = next.layers.at(-1)?.id ?? null;
    imageMenu = false;
  }
  let templates = $state(false);
  /** An element copied with ⌘C / Ctrl+C, pasted with ⌘V on any page of this deck. */
  let clipboard: CompositionLayer | null = null;
  /** The church's screen shape, so templates are laid out for it. */
  const screenAspect = $derived.by(() => {
    const canvas = session.outputCanvas();
    return canvas.width / canvas.height;
  });
  function addTemplatePage(next: Composition) {
    templates = false;
    commitDeck(insertPage(draft, next, pageIndex));
    pageIndex = pageIndex + 1;
    selectedId = null;
  }

  /** The icon picker, loaded only when opened (with the whole icon set). */
  let iconPicker = $state<null | typeof import("./IconPicker.svelte").default>(null);
  async function openIcons() {
    iconPicker = (await import("./IconPicker.svelte")).default;
  }
  function addIcon(icon: { name: string; nodes: IconNode[] }) {
    iconPicker = null;
    const next = addIconElement(page, icon);
    commitPage(next);
    selectedId = next.layers.at(-1)?.id ?? null;
  }
  /** The page's gradient: several colours when set, else its two older colours and angle. */
  const pageFill = $derived<Fill>(
    sanitizeFill(page.background?.fill, { kind: "linear", angle: page.background?.angle ?? 135, stops: [{ color: page.background?.color ?? "#1b1b1f", at: 0 }, { color: page.background?.to ?? "#3a2a1a", at: 100 }] }),
  );
  function setPageFill(fill: Fill) {
    if (fill.kind === "solid") setBackground({ type: "color", color: fill.color, fill: undefined });
    else setBackground({ type: "gradient", fill: encodeFill(fill), color: fill.stops[0]!.color, to: fill.stops.at(-1)!.color, ...(fill.kind === "linear" ? { angle: fill.angle } : {}) });
  }
  function addQr() {
    const next = addQrElement(page, "https://");
    commitPage(next);
    selectedId = next.layers.at(-1)?.id ?? null;
  }

  function setBackground(patch: Partial<PageBackground>) {
    const current = page.background ?? sanitizeBackground({ type: "color" })!;
    const { clear: _clear, ...rest } = setCompositionBackground(page, { ...current, ...patch });
    commitPage(rest);
  }
  /** Clear: no background, so the page shows what is behind it (a lower third over a camera). */
  function setClear() {
    commitPage({ ...setCompositionBackground(page, undefined), clear: true });
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
    const command = event.metaKey || event.ctrlKey;
    // Copy, paste and duplicate an element; arrows nudge it; brackets change what is in front.
    if (command && event.key.toLowerCase() === "c" && selected) {
      clipboard = $state.snapshot(selected) as CompositionLayer;
      return;
    }
    if (command && event.key.toLowerCase() === "v" && clipboard) {
      event.preventDefault();
      const copy = clipboard;
      const next = addLayer(page, { name: copy.name, bounds: { ...copy.bounds, x: Math.min(98, copy.bounds.x + 2), y: Math.min(98, copy.bounds.y + 2) }, source: copy.source, fit: copy.fit });
      const added = next.layers.at(-1)!;
      commitPage({ ...next, layers: next.layers.map((layer) => (layer.id === added.id ? { ...layer, animation: copy.animation, opacity: copy.opacity } : layer)) });
      selectedId = added.id;
      return;
    }
    if (command && event.key.toLowerCase() === "d" && selected) {
      event.preventDefault();
      const next = duplicateLayer(page, selected.id);
      commitPage(next);
      selectedId = next.layers.at(-1)?.id ?? selectedId;
      return;
    }
    if (command && (event.key === "]" || event.key === "[") && selected) {
      event.preventDefault();
      const forward = event.key === "]";
      commitPage(event.shiftKey ? moveLayerTo(page, selected.id, forward ? 0 : page.layers.length - 1) : reorderLayers(page, selected.id, forward ? 1 : -1));
      return;
    }
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (nudge && selected && !selected.locked) {
      event.preventDefault();
      const step = event.shiftKey ? 5 : 0.5;
      const { x, y, w, h } = selected.bounds;
      commitPage(resizeLayer(page, selected.id, { x: x + nudge[0]! * step, y: y + nudge[1]! * step, w, h }));
      return;
    }
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

<div class="deck-editor" role="dialog" aria-modal="true" aria-label={t("Edit {name}", { name: draft.name })}>
  <header>
    <input class="deck-name" aria-label={t("Deck name")} value={draft.name} onchange={(event) => commitDeck({ ...draft, name: event.currentTarget.value.trim() || draft.name })} />
    <div class="history">
      <button type="button" aria-label={t("Undo")} title={t("Undo (⌘Z)")} disabled={!undoStack.length} onclick={undo}>↶</button>
      <button type="button" aria-label={t("Redo")} title={t("Redo (⇧⌘Z)")} disabled={!redoStack.length} onclick={redo}>↷</button>
    </div>
    <span class="status">{dirty ? t("Unsaved changes") : t("Saved")}</span>
    <button type="button" class="save" disabled={!dirty} onclick={save}>{t("Save changes")}</button>
    <button type="button" class="close" class:warn={confirmClose} onclick={close}>{confirmClose ? t("Discard changes?") : t("Close")}</button>
  </header>

  <div class="body">
    <aside class="pages" aria-label={t("Pages")}>
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
            <button type="button" class="page" aria-label={t("Page {index}", { index: index + 1 })} aria-current={index === pageIndex} onclick={() => { pageIndex = index; selectedId = null; }}>
              <span class="num">{index + 1}</span>
              <DeckThumb page={entry} />
            </button>
            <div class="page-actions">
              <button type="button" aria-label={t("Duplicate page {index}", { index: index + 1 })} onclick={() => commitDeck(duplicatePage(draft, index))}>{t("Duplicate")}</button>
              <button type="button" aria-label={t("Delete page {index}", { index: index + 1 })} disabled={draft.pages.length <= 1} onclick={() => { commitDeck(removePage(draft, index)); pageIndex = Math.max(0, Math.min(pageIndex, draft.pages.length - 1)); }}>{t("Delete")}</button>
            </div>
          </li>
        {/each}
      </ol>
      <button type="button" class="add-page" onclick={() => { commitDeck(addPage(draft, pageIndex)); pageIndex = pageIndex + 1; selectedId = null; }}>{t("+ Add new page")}</button>
      <button type="button" class="add-page template" onclick={() => (templates = true)}>{t("From a template")}</button>
    </aside>

    <main class="work">
      <div class="toolbar" role="toolbar" aria-label={t("Add to page")}>
        <button type="button" onclick={addText}>{t("Text")}</button>
        <button type="button" onclick={() => addShape("rect")}>{t("Rectangle")}</button>
        <button type="button" onclick={() => addShape("ellipse")}>{t("Ellipse")}</button>
        <button type="button" onclick={() => addShape("line")}>{t("Line")}</button>
        <button type="button" onclick={openIcons}>{t("Icon")}</button>
        <span class="menu-wrap">
          <button type="button" aria-haspopup="menu" aria-expanded={imageMenu} onclick={() => (imageMenu = !imageMenu)}>{t("Image")}</button>
          {#if imageMenu}
            <div class="menu" role="menu">
              {#if images.length === 0}
                <p class="note">{t("Import pictures in Media first.")}</p>
              {/if}
              {#each images as asset (asset.id)}
                <button type="button" role="menuitem" onclick={() => addImage(asset)}>{asset.name}</button>
              {/each}
            </div>
          {/if}
        </span>
        <button type="button" onclick={addQr}>{t("QR code")}</button>
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
        <span>{t("Zoom")}</span>
        <input type="range" min="40" max="100" step="5" aria-label={t("Zoom")} bind:value={zoom} />
        <span>{zoom}%</span>
      </label>
    </main>

    <aside class="inspect" aria-label={t("Inspector")}>
      {#if selected}
        <ElementInspector {page} layer={selected} oncommit={commitPage} />
      {:else}
        <h3>{page.name}</h3>
        <label class="field-row">
          <span>{t("Name")}</span>
          <input class="field" aria-label={t("Page name")} value={page.name} onchange={(event) => commitPage({ ...page, name: event.currentTarget.value.trim() || page.name })} />
        </label>
        <label class="field-row">
          <span>{t("Background")}</span>
          <select class="field" aria-label={t("Background type")} value={page.clear ? "clear" : (page.background?.type ?? "color")} onchange={(event) => (event.currentTarget.value === "clear" ? setClear() : setBackground({ type: event.currentTarget.value as PageBackground["type"] }))}>
            <option value="clear">{t("Clear (shows what is behind)")}</option>
            <option value="color">{t("Color")}</option>
            <option value="gradient">{t("Gradient")}</option>
            <option value="image">{t("Picture")}</option>
          </select>
        </label>
        {#if page.clear}
          <p class="note">{t("Put this page over a camera in a Production look: add a Slide page layer and choose it.")}</p>
        {:else if (page.background?.type ?? "color") !== "image"}
          <GradientEditor label={t("Page background")} fill={page.background?.type === "gradient" ? pageFill : { kind: "solid", color: page.background?.color ?? "#1b1b1f" }} onchange={setPageFill} />
        {:else}
          <div class="stack">
            {#if images.length === 0}<p class="note">{t("Import pictures in Media first.")}</p>{/if}
            {#each images as asset (asset.id)}
              <button type="button" class="pick" class:on={page.background?.assetId === asset.id} onclick={() => setBackground({ assetId: asset.id, imageUrl: mediaUrl(asset) ?? "" })}>{asset.name}</button>
            {/each}
          </div>
        {/if}
        <div class="field-row">
          <span>{t("Overlay")}</span>
          <span class="inline">
            <input type="color" aria-label={t("Overlay color")} value={page.background?.overlay ?? "#000000"} oninput={(event) => setBackground({ overlay: event.currentTarget.value })} />
            <input type="range" min="0" max="1" step="0.05" aria-label={t("Overlay strength")} value={page.background?.overlayOpacity ?? 0} onchange={(event) => setBackground({ overlayOpacity: Number(event.currentTarget.value) })} />
          </span>
        </div>
        <p class="note">{t("Click an element to edit it. Double-click text to type. Drag to move, corners to resize.")}</p>
      {/if}
    </aside>
  </div>

  {#if editing}
    <div class="text-edit" role="dialog" aria-label={t("Edit text")}>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        autofocus
        aria-label={t("Text")}
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
      <button type="button" onclick={() => (editingText = null)}>{t("Done")}</button>
    </div>
  {/if}
</div>

{#if templates}
  <TemplateGallery aspect={screenAspect} onpick={addTemplatePage} onclose={() => (templates = false)} />
{/if}
{#if iconPicker}
  {@const Picker = iconPicker}
  <Picker onpick={addIcon} onclose={() => (iconPicker = null)} />
{/if}

<style>
  .deck-editor { position: fixed; inset: 0; z-index: 35; background: var(--desk, #111); color: var(--ink); display: flex; flex-direction: column; font-family: var(--font-ui); font-size: 13px; }
  header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  .deck-name { flex: 0 1 360px; height: 36px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--ink); font: 600 18px/1 var(--font-ui); padding: 0 8px; }
  .deck-name:hover, .deck-name:focus { border-color: var(--line); background: var(--field); }
  .history { display: flex; gap: 4px; }
  .history button { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font-size: 16px; cursor: pointer; }
  .history button:disabled { opacity: 0.4; cursor: default; }
  .status { flex: 1; color: var(--muted); font-size: 12px; text-align: right; }
  .save { height: 36px; padding: 0 16px; border-radius: 8px; border: 0; background: var(--accent); color: var(--on-accent); font-weight: 700; cursor: pointer; }
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
  .add-page.template { margin-top: 0; background: transparent; }
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
  .inline { display: flex; gap: 6px; align-items: center; }
  input[type="color"] { width: 40px; height: 30px; border: 1px solid var(--line); border-radius: 6px; background: none; padding: 0; }
  .stack { display: flex; flex-direction: column; gap: 2px; max-height: 180px; overflow: auto; }
  .pick { text-align: left; min-height: 30px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; }
  .pick.on { border-color: var(--accent); }
  .note { margin: 0; color: var(--muted); font-size: 12px; }
  .text-edit { position: fixed; left: 50%; top: 22%; transform: translateX(-50%); z-index: 40; width: min(560px, calc(100% - 40px)); display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; border: 1px solid var(--accent); background: var(--panel); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5); }
  .text-edit textarea { border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 8px; font: 16px/1.4 var(--font-ui); resize: vertical; }
  .text-edit button { align-self: flex-end; min-height: 32px; padding: 0 14px; border-radius: 8px; border: 0; background: var(--accent); color: var(--on-accent); font-weight: 600; cursor: pointer; }
  :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--focus, var(--accent)); outline-offset: 2px; }
  @media (max-width: 1100px) { .body { grid-template-columns: 180px minmax(0, 1fr) 260px; } }
</style>
