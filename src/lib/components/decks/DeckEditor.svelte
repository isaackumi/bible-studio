<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { mediaUrl } from "../../db/api";
  import { addLayer, duplicateLayer, moveLayerTo, removeLayer, reorderLayers, resizeLayer, sanitizeBackground, setCompositionBackground, setLayerGroup, type Composition, type CompositionLayer, type PageBackground } from "../../domain/composition";
  import { alignTogether } from "../../domain/snap";
  import {
    addIconElement,
    addImageElement,
    addPage,
    createDeck,
    addQrElement,
    addShapeElement,
    addTextElement,
    duplicatePage,
    insertPage,
    isUntouchedPage,
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
  import type { StudioActions, StudioPanel } from "./StudioPanels.svelte";
  import { assignLayerSource } from "../../domain/composition";
  import { encodeFill, sanitizeFill, type Fill } from "../../domain/fill";
  import type { IconNode } from "../../domain/icon";
  import { t, tn } from "../../i18n/core";
  import { keys } from "../../platform/os";

  // Full-screen deck editor. Edits stay in a draft until "Save changes"; Program never changes here.
  let { deck, onclose, startWith = null }: { deck: SlideDeck; onclose: () => void; startWith?: "templates" | null } = $props();

  // The editor works on a copy taken when it opens.
  let draft = $state<SlideDeck>(untrack(() => JSON.parse(JSON.stringify(deck))));
  let pageIndex = $state(0);
  let selectedId = $state<string | null>(null);
  /** Picked with the selected element (Shift-click, or the rest of its group); cleared whenever the selection changes elsewhere. */
  let alsoFor = $state<{ primary: string | null; ids: string[] }>({ primary: null, ids: [] });
  const also = $derived(alsoFor.primary === selectedId && selectedId ? alsoFor.ids.filter((id) => id !== selectedId && page.layers.some((layer) => layer.id === id)) : []);
  /** Everything picked: the selected element first. */
  const pickedIds = $derived(selectedId ? [selectedId, ...also] : []);

  function pickLayer(id: string | null, add = false) {
    imageMenu = false;
    if (!id) {
      selectedId = null;
      return;
    }
    if (add && selectedId) {
      const rest = pickedIds.filter((entry) => entry !== id);
      if (rest.length === pickedIds.length) {
        alsoFor = { primary: id, ids: pickedIds };
        selectedId = id;
      } else {
        // Taking one away: what is left stays picked.
        const [first = null, ...others] = rest;
        alsoFor = { primary: first, ids: others };
        selectedId = first;
      }
      return;
    }
    // A grouped element brings its whole group.
    const group = page.layers.find((layer) => layer.id === id)?.group;
    alsoFor = { primary: id, ids: group ? page.layers.filter((layer) => layer.group === group && layer.id !== id).map((layer) => layer.id) : [] };
    selectedId = id;
  }

  function alignPicked(where: "left" | "center" | "right" | "top" | "middle" | "bottom") {
    const layers = pickedIds.map((id) => page.layers.find((layer) => layer.id === id)!).filter((layer) => !layer.locked);
    const lined = alignTogether(layers.map((layer) => layer.bounds), where);
    commitPage(layers.reduce((next, layer, index) => resizeLayer(next, layer.id, lined[index]!), page));
  }
  function groupPicked() {
    if (pickedIds.length < 2) return;
    commitPage(setLayerGroup(page, pickedIds, `group:${Math.random().toString(36).slice(2, 8)}`));
  }
  function ungroupPicked() {
    commitPage(setLayerGroup(page, pickedIds, null));
    alsoFor = { primary: null, ids: [] };
  }
  const grouped = $derived(pickedIds.length > 1 && pickedIds.every((id) => { const group = page.layers.find((layer) => layer.id === id)?.group; return !!group && group === page.layers.find((layer) => layer.id === selectedId)?.group; }));
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
  // A field's change arrives on blur, after the click elsewhere has already cleared the selection:
  // the inspector still commits to the element it was editing, not to nothing.
  let lastSelectedId = $state<string | null>(null);
  $effect.pre(() => {
    if (selectedId) lastSelectedId = selectedId;
  });
  const inspected = $derived(selected ?? page.layers.find((layer) => layer.id === lastSelectedId) ?? null);
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
  let showMenu = $state(false);
  let designsMenu = $state(false);
  let loopSeconds = $state(8);
  /**
   * Saves and puts the deck on the screens the way chosen. The studio stays open, so the pages can
   * be driven from here (the show bar); only adding to the service goes to the running order.
   */
  function present(how: "preview" | "live" | "slideshow" | "service") {
    showMenu = false;
    save();
    if (how === "service") onclose();
    void session.showDeck(draft.id, how, { page: pageIndex, seconds: loopSeconds });
  }
  /** The page of this deck on Program and on Preview, from what the screens show. */
  const indexOn = (sourceId: string | null) => {
    const match = sourceId && new RegExp(`^deck:${draft.id}:(\\d+)$`).exec(sourceId);
    return match ? Number(match[1]) : null;
  };
  const liveIndex = $derived(indexOn(session.live.program.sourceId));
  const previewIndex = $derived(indexOn(session.live.preview.sourceId));
  /** Another design (or a new one) in the studio; this one is saved first. */
  function openDesign(id: string | null) {
    designsMenu = false;
    if (id === draft.id) return;
    if (dirty) save();
    onclose();
    if (id) session.openStudio(id);
    else {
      const deck = createDeck(t("New design"));
      session.saveDeck(deck);
      session.openStudio(deck.id, "templates");
    }
  }
  /** The full-size template gallery, over the studio. */
  let templates = $state(false);
  /** The panel open beside the canvas; Templates first, so a church sees them straight away. */
  let panel = $state<StudioPanel | null>("templates");
  /** The template browser, loaded with the panel (it carries every template). */
  const browser = import("./TemplateBrowser.svelte");
  /** The other panels (ready-made text, shapes, icons, backgrounds), loaded with the first one opened. */
  let panels = $state<Promise<typeof import("./StudioPanels.svelte")> | null>(null);
  $effect(() => {
    if (panel && panel !== "templates" && !panels) panels = import("./StudioPanels.svelte");
  });
  /** Where a chosen template goes: a new page after this one, or in place of this one. */
  let placeTemplate = $state<"new" | "replace">(untrack(() => (startWith !== "templates" && (draft.pages[0]?.layers.length ?? 0) === 0 && draft.pages.length === 1 ? "replace" : "new")));
  /** An element copied with ⌘C / Ctrl+C, pasted with ⌘V on any page of this deck. */
  let clipboard: CompositionLayer | null = null;
  /** The church's screen shape, so templates are laid out for it. */
  const screenAspect = $derived.by(() => {
    const canvas = session.outputCanvas();
    return canvas.width / canvas.height;
  });
  function addTemplatePage(next: Composition) {
    templates = false;
    selectedId = null;
    // A new deck's first page, still as it came, gives way to the template.
    if (placeTemplate === "replace" || isUntouchedPage(page)) {
      commitPage({ ...next, id: page.id });
      return;
    }
    commitDeck(insertPage(draft, next, pageIndex));
    pageIndex = pageIndex + 1;
  }
  const actions: StudioActions = {
    addText: (pieces) => {
      let next = page;
      for (const piece of pieces) next = addTextElement(next, piece.words, piece.bounds, piece.style, piece.name);
      const added = next.layers.slice(page.layers.length).map((layer) => layer.id);
      if (added.length > 1) next = setLayerGroup(next, added, `group:${Math.random().toString(36).slice(2, 8)}`);
      commitPage(next);
      pickLayer(added[0] ?? null);
    },
    addShape: (kind, fill, bounds, extra = {}) => {
      let next = addShapeElement(page, kind, encodeFill(fill), bounds);
      const layer = next.layers.at(-1)!;
      if (Object.keys(extra).length) next = assignLayerSource(next, layer.id, { ...layer.source, payload: { ...layer.source.payload, ...extra } });
      commitPage(next);
      selectedId = layer.id;
    },
    addIcon: (icon) => addIcon(icon),
    openIcons: () => void openIcons(),
    addQr: () => addQr(),
    addImage: (asset) => addImage(asset),
    setImageBackground: (asset) => setBackground({ type: "image", assetId: asset.id, imageUrl: mediaUrl(session.media.find((entry) => entry.id === asset.id) ?? null) ?? "" }),
    setFill: (fill) => setPageFill(fill),
    setClear: () => setClear(),
  };
  const RAIL: Array<{ id: StudioPanel; label: string; icon: string }> = [
    { id: "templates", label: "Templates", icon: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" },
    { id: "text", label: "Text", icon: "M4 7V4h16v3M9 20h6M12 4v16" },
    { id: "elements", label: "Elements", icon: "M8.3 10a.7.7 0 0 1-.6-1L11.4 3a.7.7 0 0 1 1.2 0L16.3 9a.7.7 0 0 1-.6 1zM3 14h7v7H3zM17.5 21a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" },
    { id: "pictures", label: "Pictures", icon: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" },
    { id: "background", label: "Background", icon: "M12 22a10 10 0 1 1 0-20c5.5 0 10 4 10 9a5 5 0 0 1-5 5h-1.8a1.5 1.5 0 0 0-1.1 2.5A1.5 1.5 0 0 1 12 22zM7.5 10.5h.01M12 7.5h.01M16.5 10.5h.01" },
  ];

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
    if (command && event.key.toLowerCase() === "g" && selected) {
      event.preventDefault();
      if (event.shiftKey) ungroupPicked();
      else groupPicked();
      return;
    }
    if (command && (event.key === "]" || event.key === "[") && selected) {
      event.preventDefault();
      const forward = event.key === "]";
      commitPage(event.shiftKey ? moveLayerTo(page, selected.id, forward ? 0 : page.layers.length - 1) : reorderLayers(page, selected.id, forward ? 1 : -1));
      return;
    }
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (nudge && selected) {
      event.preventDefault();
      const step = event.shiftKey ? 5 : 0.5;
      let next = page;
      for (const id of pickedIds) {
        const layer = next.layers.find((entry) => entry.id === id);
        if (layer && !layer.locked) next = resizeLayer(next, id, { ...layer.bounds, x: layer.bounds.x + nudge[0]! * step, y: layer.bounds.y + nudge[1]! * step });
      }
      commitPage(next);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selected && !selected.locked) {
      event.preventDefault();
      event.stopPropagation();
      commitPage(pickedIds.reduce((next, id) => (next.layers.find((layer) => layer.id === id)?.locked ? next : removeLayer(next, id)), page));
      selectedId = null;
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (showMenu || designsMenu) {
        showMenu = designsMenu = false;
        return;
      }
      // A window over the studio closes first; the studio only on the next Escape.
      if (templates) templates = false;
      else if (panel && !selectedId && !editingText && !iconPicker) panel = null;
      else if (iconPicker) iconPicker = null;
      else if (editingText) editingText = null;
      else if (selectedId) selectedId = null;
      else close();
    }
  }

  const editing = $derived(editingText ? page.layers.find((layer) => layer.id === editingText) ?? null : null);
</script>

<svelte:window onkeydowncapture={onkeydown} />

<div class="deck-editor" role="dialog" aria-modal="true" aria-label={t("Edit {name}", { name: draft.name })}>
  <header>
    <span class="menu-wrap">
      <button type="button" class="designs-btn" aria-haspopup="menu" aria-expanded={designsMenu} onclick={() => { designsMenu = !designsMenu; showMenu = false; }}>{t("My designs")} <span aria-hidden="true">▾</span></button>
      {#if designsMenu}
        <div class="menu designs-menu" role="menu">
          <button type="button" role="menuitem" class="new-design" onclick={() => openDesign(null)}>+ {t("New design")}</button>
          {#each session.recentDecks.slice(0, 40) as entry (entry.id)}
            <button type="button" role="menuitem" class="design" class:on={entry.id === draft.id} onclick={() => openDesign(entry.id)}>
              <span class="mini" style:--aspect={screenAspect}>{#if entry.pages[0]}<DeckThumb page={entry.pages[0]} />{/if}</span>
              <span class="design-name">{entry.name}<small>{tn(entry.pages.length, "{n} page", "{n} pages")}{entry.id === draft.id ? ` · ${t("Open now")}` : ""}</small></span>
            </button>
          {/each}
        </div>
      {/if}
    </span>
    <input class="deck-name" aria-label={t("Deck name")} value={draft.name} onchange={(event) => commitDeck({ ...draft, name: event.currentTarget.value.trim() || draft.name })} />
    <div class="history">
      <button type="button" aria-label={t("Undo")} title={keys(t("Undo (⌘Z)"))} disabled={!undoStack.length} onclick={undo}>↶</button>
      <button type="button" aria-label={t("Redo")} title={keys(t("Redo (⇧⌘Z)"))} disabled={!redoStack.length} onclick={redo}>↷</button>
    </div>
    <span class="status">{dirty ? t("Unsaved changes") : t("Saved")}</span>
    <span class="menu-wrap">
      <button type="button" class="show-btn" aria-haspopup="menu" aria-expanded={showMenu} onclick={() => { showMenu = !showMenu; designsMenu = false; }}>{t("Show")} <span aria-hidden="true">▾</span></button>
      {#if showMenu}
        <div class="menu show-menu" role="menu">
          <button type="button" role="menuitem" onclick={() => present("preview")}><strong>{t("Put this page on Preview")}</strong><small>{t("Then press LIVE when you are ready.")}</small></button>
          <button type="button" role="menuitem" onclick={() => present("live")}><strong>{t("Show this page now")}</strong><small>{t("Straight to the screens.")}</small></button>
          <button type="button" role="menuitem" onclick={() => present("service")}><strong>{t("Add to the service")}</strong><small>{t("Its pages run in order with Next.")}</small></button>
          {#if draft.pages.length > 1}
            <button type="button" role="menuitem" onclick={() => present("slideshow")}><strong>{t("Play as a slideshow")}</strong><small>{tn(draft.pages.length, "{n} page, round and round", "{n} pages, round and round")}</small></button>
            <label class="loop-row">
              <span>{t("Seconds per page")}</span>
              <select bind:value={loopSeconds}>
                {#each [5, 8, 12, 20, 30] as seconds (seconds)}<option value={seconds}>{seconds}</option>{/each}
              </select>
            </label>
          {/if}
          <p class="menu-note">{t("Saves your changes first.")}</p>
        </div>
      {/if}
    </span>
    <button type="button" class="save" disabled={!dirty} onclick={save}>{t("Save changes")}</button>
    <button type="button" class="close" class:warn={confirmClose} onclick={close}>{confirmClose ? t("Discard changes?") : t("Close")}</button>
  </header>

  <div class="body" class:panel-open={!!panel}>
    <nav class="rail" aria-label={t("Studio tools")}>
      {#each RAIL as item (item.id)}
        <button type="button" class:on={panel === item.id} aria-pressed={panel === item.id} onclick={() => (panel = panel === item.id ? null : item.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
          <span>{t(item.label)}</span>
        </button>
      {/each}
    </nav>

    {#if panel}
      <aside class="side" aria-label={t(RAIL.find((item) => item.id === panel)?.label ?? "")}>
        <div class="side-head">
          <h2>{t(RAIL.find((item) => item.id === panel)?.label ?? "")}</h2>
          <button type="button" class="side-close" aria-label={t("Close panel")} onclick={() => (panel = null)}>‹</button>
        </div>
        {#if panel === "templates"}
          <div class="place" role="radiogroup" aria-label={t("Where a template goes")}>
            <button type="button" role="radio" aria-checked={placeTemplate === "new"} class:on={placeTemplate === "new"} onclick={() => (placeTemplate = "new")}>{t("Add as a new page")}</button>
            <button type="button" role="radio" aria-checked={placeTemplate === "replace"} class:on={placeTemplate === "replace"} onclick={() => (placeTemplate = "replace")}>{t("Replace this page")}</button>
          </div>
          {#await browser}
            <p class="loading">{t("Loading templates…")}</p>
          {:then module}
            <module.default aspect={screenAspect} onpick={addTemplatePage} onexpand={() => (templates = true)} />
          {/await}
        {:else}
          <div class="side-scroll">
            {#await panels then module}{#if module}<module.default {panel} {actions} />{/if}{/await}
          </div>
        {/if}
      </aside>
    {/if}

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
        <span class="divider"></span>
        <button type="button" class="tpl" onclick={() => (templates = true)}>{t("Templates")}</button>
      </div>
      <div class="canvas-area">
        <PageCanvas
          {page}
          {selectedId}
          {zoom}
          {also}
          onselect={pickLayer}
          onpreview={previewPage}
          oncommit={endDrag}
          onedittext={(id) => (editingText = id)}
        />
      </div>
      <div class="strip-bar">
        <label class="zoom">
          <span>{t("Zoom")}</span>
          <input type="range" min="40" max="100" step="5" aria-label={t("Zoom")} bind:value={zoom} />
          <span>{zoom}%</span>
        </label>
        <span class="page-of">{t("Page {index} of {count}", { index: pageIndex + 1, count: draft.pages.length })}</span>
        <span class="page-actions">
          <button type="button" onclick={() => commitDeck(duplicatePage(draft, pageIndex))}>{t("Duplicate page")}</button>
          <button type="button" disabled={draft.pages.length <= 1} onclick={() => { commitDeck(removePage(draft, pageIndex)); pageIndex = Math.max(0, Math.min(pageIndex, draft.pages.length - 1)); selectedId = null; }}>{t("Delete page")}</button>
        </span>
      </div>
      <ol class="pages" aria-label={t("Pages")}>
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
            {#if liveIndex === index}<em class="badge live">{t("LIVE")}</em>{:else if previewIndex === index}<em class="badge preview">{t("PREVIEW")}</em>{/if}
            <button type="button" class="page" class:is-live={liveIndex === index} style:--aspect={screenAspect} aria-label={t("Page {index}", { index: index + 1 })} aria-current={index === pageIndex} onclick={() => { pageIndex = index; selectedId = null; }}>
              <DeckThumb page={entry} />
            </button>
            <span class="num">{index + 1}</span>
          </li>
        {/each}
        <li class="add">
          <button type="button" class="add-page" aria-label={t("Add a blank page")} title={t("Add a blank page")} onclick={() => { commitDeck(addPage(draft, pageIndex)); pageIndex = pageIndex + 1; selectedId = null; }}>+</button>
        </li>
      </ol>
      {#await import("./ShowBar.svelte") then { default: ShowBar }}
        <ShowBar deckId={draft.id} pages={draft.pages.length} {pageIndex} onselect={(index) => (pageIndex = index)} onbefore={() => { if (dirty) save(); }} />
      {/await}
    </main>

    <aside class="inspect" aria-label={t("Inspector")}>
      {#if selected && also.length}
        <h3>{t("{n} elements picked", { n: pickedIds.length })}</h3>
        <div class="stack">
          <span>{t("Line them up")}</span>
          <div class="align-together" role="group" aria-label={t("Line them up")}>
            {#each [["left", t("Left")], ["center", t("Centre")], ["right", t("Right")], ["top", t("Top")], ["middle", t("Middle")], ["bottom", t("Bottom")]] as [where, label] (where)}
              <button type="button" onclick={() => alignPicked(where as "left")}>{label}</button>
            {/each}
          </div>
        </div>
        <div class="sign-row">
          {#if grouped}
            <button type="button" class="btn" onclick={ungroupPicked}>{t("Ungroup")}</button>
          {:else}
            <button type="button" class="btn" onclick={groupPicked}>{t("Group")}</button>
          {/if}
          <button type="button" class="btn danger" onclick={() => { commitPage(pickedIds.reduce((next, id) => removeLayer(next, id), page)); selectedId = null; }}>{t("Delete")}</button>
        </div>
        <p class="note">{keys(t("Drag any of them to move them together. Shift-click to add or take one away. ⌘G groups them, ⌘⇧G ungroups."))}</p>
      {:else if selected && inspected}
        <ElementInspector {page} layer={inspected} oncommit={commitPage} />
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
  header { position: relative; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  .deck-name { flex: 0 1 360px; height: 36px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--ink); font: 600 18px/1 var(--font-ui); padding: 0 8px; }
  .deck-name:hover, .deck-name:focus { border-color: var(--line); background: var(--field); }
  .history { display: flex; gap: 4px; }
  .history button { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font-size: 16px; cursor: pointer; }
  .history button:disabled { opacity: 0.4; cursor: default; }
  .status { flex: 1; color: var(--muted); font-size: 12px; text-align: right; }
  .menu-wrap > .designs-btn, .menu-wrap > .show-btn { height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .menu-wrap > .show-btn { border-color: var(--accent); color: var(--accent); }
  .menu-wrap > .show-btn:hover, .menu-wrap > .designs-btn:hover { background: color-mix(in srgb, var(--accent) 12%, var(--field)); }
  .menu.designs-menu { width: 320px; max-height: 70vh; }
  .new-design { font-weight: 700; color: var(--accent) !important; }
  .menu .design { display: flex; align-items: center; gap: 10px; min-height: 52px; }
  .menu .design.on { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .mini { flex: none; width: 72px; aspect-ratio: var(--aspect, 16 / 9); max-height: 48px; border-radius: 5px; overflow: hidden; background: #000; }
  .design-name { display: grid; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .design-name small, .show-menu small { color: var(--muted); font-size: 11px; font-weight: 400; }
  .menu.show-menu { left: auto; right: 0; width: 290px; max-height: none; }
  .menu.show-menu button { display: grid; gap: 2px; padding: 8px 10px; min-height: 0; }
  .loop-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 10px 4px; font-size: 11.5px; color: var(--muted); }
  .loop-row span { white-space: nowrap; }
  .loop-row select { flex: none; width: 64px; height: 28px; padding: 0 6px; border-radius: 7px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font: inherit; font-size: 12px; }
  .menu-note { margin: 4px 10px 2px; font-size: 11px; color: var(--muted); }
  .save { height: 36px; padding: 0 16px; border-radius: 8px; border: 0; background: var(--accent); color: var(--on-accent); font-weight: 700; cursor: pointer; }
  .save:disabled { opacity: 0.45; cursor: default; }
  .close { height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; }
  .close.warn { background: #c8102e; border-color: #c8102e; color: #fff; }
  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 72px minmax(0, 1fr) 300px; }
  .body.panel-open { grid-template-columns: 72px 340px minmax(0, 1fr) 300px; }
  .rail { display: flex; flex-direction: column; gap: 4px; padding: 10px 6px; border-right: 1px solid var(--line); background: var(--panel); }
  .rail button { display: grid; justify-items: center; gap: 4px; padding: 9px 2px; border: 0; border-radius: 10px; background: transparent; color: var(--muted); font: inherit; font-size: 10.5px; font-weight: 600; cursor: pointer; }
  .rail button svg { width: 22px; height: 22px; }
  .rail button:hover { color: var(--ink); background: var(--field); }
  .rail button.on { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .side { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); background: var(--panel); }
  .side-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 0; }
  .side-head h2 { margin: 0; font-size: 15px; font-weight: 700; }
  .side-close { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font-size: 16px; cursor: pointer; }
  .side-scroll { flex: 1; min-height: 0; overflow: auto; }
  .place { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 10px 14px 0; padding: 3px; border-radius: 10px; background: var(--field); }
  .place button { height: 28px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; }
  .place button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / 0.25); }
  .loading { margin: 14px; color: var(--muted); font-size: 12px; }
  .pages { list-style: none; margin: 0; padding: 4px 2px 2px; display: flex; gap: 10px; overflow-x: auto; flex: none; align-items: flex-end; }
  .pages li { position: relative; flex: none; display: grid; justify-items: center; gap: 3px; }
  .pages li.drop .page { outline: 1px dashed var(--accent); }
  .page { display: block; width: 128px; aspect-ratio: var(--aspect, 16 / 9); max-height: 110px; padding: 0; border: 2px solid transparent; border-radius: 8px; overflow: hidden; background: none; cursor: pointer; }
  .pages li.on .page { border-color: var(--accent); }
  .pages .page.is-live { box-shadow: 0 0 0 2px #ff1414, 0 0 18px rgb(255 20 20 / 0.35); }
  .badge { position: absolute; top: -8px; left: 50%; transform: translateX(-50%); z-index: 1; padding: 1px 7px; border-radius: 999px; font-size: 9.5px; font-weight: 800; font-style: normal; letter-spacing: 0.08em; color: #fff; pointer-events: none; }
  .badge.live { background: #ff1414; }
  .badge.preview { background: var(--accent); }
  .num { font-size: 11px; color: var(--muted); }
  .add-page { width: 56px; height: 72px; border-radius: 8px; border: 1px dashed var(--line); background: transparent; color: var(--muted); font-size: 22px; cursor: pointer; margin-bottom: 18px; }
  .add-page:hover { color: var(--ink); border-color: var(--accent); }
  .strip-bar { display: flex; align-items: center; gap: 14px; flex: none; }
  .page-of { flex: 1; text-align: center; color: var(--muted); font-size: 12px; }
  .page-actions { display: flex; gap: 6px; }
  .page-actions button { font-size: 11.5px; min-height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line); background: var(--field); color: var(--muted); cursor: pointer; }
  .page-actions button:disabled { opacity: 0.45; cursor: default; }
  .divider { width: 1px; align-self: stretch; margin: 4px 2px; background: var(--line); }
  .toolbar > button.tpl { color: var(--accent); }
  .work { display: flex; flex-direction: column; min-height: 0; min-width: 0; padding: 12px 18px 10px; gap: 10px; background: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--ink) 10%, transparent) 1px, transparent 0) 0 0 / 22px 22px; }
  .toolbar { align-self: center; display: flex; gap: 6px; padding: 6px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); }
  .toolbar > button, .menu-wrap > button { min-height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--ink); cursor: pointer; font-weight: 600; }
  .toolbar > button:hover, .menu-wrap > button:hover { background: var(--field); }
  .menu-wrap { position: relative; }
  .menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 3; min-width: 200px; max-height: 260px; overflow: auto; padding: 6px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); display: flex; flex-direction: column; gap: 2px; }
  .menu button { text-align: left; min-height: 30px; padding: 0 8px; border-radius: 6px; border: 0; background: transparent; color: var(--ink); cursor: pointer; }
  .menu button:hover { background: var(--field); }
  .canvas-area { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: center; }
  main { position: relative; }
  .canvas-area > :global(*) { flex: 1; }
  .zoom { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
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
  @media (max-width: 1280px) { .body.panel-open { grid-template-columns: 72px 300px minmax(0, 1fr) 260px; } .body { grid-template-columns: 72px minmax(0, 1fr) 260px; } }
  .align-together { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .align-together button { height: 28px; border: 1px solid var(--line); border-radius: 7px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; cursor: pointer; }
  .align-together button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
  .sign-row { display: flex; gap: 8px; margin: 12px 0 8px; }
  .sign-row .btn { flex: 1; height: 32px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .sign-row .btn.danger { color: var(--danger, #ff6b5e); }
</style>
