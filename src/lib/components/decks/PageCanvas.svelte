<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { applyLayerDrag, layerOrder, presentComposition, resizeLayer, setLayerRotation, type Composition, type LayerDragHandle } from "../../domain/composition";
  import { snapBounds, type Guide } from "../../domain/snap";
  import { withMediaUrls } from "../../domain/sources";
  import { mediaUrl } from "../../db/api";
  import FrameView from "../FrameView.svelte";
  import { canvasFor } from "../../display/shape";
  import { outputShape } from "../../display/output-shape.svelte";
  import { t } from "../../i18n/core";

  // The editable page: the real frame underneath, selection boxes and handles on top.
  let {
    page,
    selectedId,
    also = [],
    zoom,
    onselect,
    onpreview,
    oncommit,
    onedittext,
  }: {
    page: Composition;
    selectedId: string | null;
    /** Picked with it (Shift-click, or the rest of its group): they move together. */
    also?: string[];
    zoom: number;
    /** `add`: Shift-click, adding to (or taking from) what is picked. */
    onselect: (id: string | null, add?: boolean) => void;
    /** Live update while dragging (no history entry). */
    onpreview: (page: Composition) => void;
    /** A finished change (one history entry). */
    oncommit: (page: Composition) => void;
    onedittext: (id: string) => void;
  } = $props();

  let canvas = $state<HTMLDivElement | undefined>();
  let scale = $state(0.4);
  // Pages are edited at the audience screen's shape, so what you lay out is what the room sees.
  const size = $derived(canvasFor(outputShape.aspect));
  $effect(() => {
    const node = canvas;
    if (!node) return;
    const measure = () => (scale = node.clientWidth / size.width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  });
  const model = $derived(
    presentComposition(
      withMediaUrls(page, (id) => mediaUrl(session.media.find((asset) => asset.id === id) ?? null)),
      { theme: session.theme(), now: Date.now(), canvas: session.outputCanvas() },
    ),
  );
  const boxes = $derived(layerOrder(page).filter((layer) => layer.visible));

  let drag: { id: string; handle: LayerDragHandle | "rotate"; x: number; y: number; start: Composition; moved: boolean; with: string[] } | null = null;
  const picked = $derived(new Set([selectedId, ...also].filter((id): id is string => !!id)));

  function down(event: PointerEvent, id: string, handle: LayerDragHandle | "rotate") {
    event.stopPropagation();
    // Shift-click adds or takes away; a plain click on something already picked keeps the group to move it.
    if (event.shiftKey && handle === "move") {
      onselect(id, true);
      return;
    }
    if (!picked.has(id) || handle !== "move") onselect(id);
    const layer = page.layers.find((entry) => entry.id === id);
    if (!layer || layer.locked || page.locked) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const together = handle === "move" && picked.has(id) ? [...picked].filter((other) => other !== id) : [];
    drag = { id, handle, x: event.clientX, y: event.clientY, start: page, moved: false, with: together };
  }

  /** Turning: the angle from the element's centre to the pointer; it catches on every 45° (Shift: 15° steps). */
  function turn(event: PointerEvent) {
    if (!drag || !canvas) return;
    const layer = drag.start.layers.find((entry) => entry.id === drag!.id);
    if (!layer) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + ((layer.bounds.x + layer.bounds.w / 2) / 100) * rect.width;
    const cy = rect.top + ((layer.bounds.y + layer.bounds.h / 2) / 100) * rect.height;
    let degrees = (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI + 90;
    if (event.shiftKey) degrees = Math.round(degrees / 15) * 15;
    else {
      const nearest = Math.round(degrees / 45) * 45;
      if (Math.abs(degrees - nearest) < 4) degrees = nearest;
    }
    drag.moved = true;
    onpreview(setLayerRotation(drag.start, drag.id, degrees));
  }

  /** The lines a dragged element caught on, shown while dragging. */
  let guides = $state<Guide[]>([]);

  function move(event: PointerEvent) {
    if (!drag || !canvas) return;
    if (drag.handle === "rotate") return turn(event);
    const rect = canvas.getBoundingClientRect();
    const dx = ((event.clientX - drag.x) / rect.width) * 100;
    const dy = ((event.clientY - drag.y) / rect.height) * 100;
    if (Math.abs(dx) + Math.abs(dy) < 0.2) return;
    drag.moved = true;
    const dragged = applyLayerDrag(drag.start, drag.id, drag.handle, { dx, dy });
    const layer = dragged.layers.find((entry) => entry.id === drag!.id);
    // Edges and centres catch on the page and on other elements; hold Alt (Option) to place freely.
    if (!layer || event.altKey) {
      guides = [];
      onpreview(dragged);
      return;
    }
    const moving = new Set([layer.id, ...drag.with]);
    const others = dragged.layers.filter((entry) => !moving.has(entry.id) && entry.visible).map((entry) => entry.bounds);
    const snapped = snapBounds(layer.bounds, others, drag.handle);
    guides = snapped.guides;
    let next = resizeLayer(dragged, layer.id, snapped.bounds);
    // Everything picked with it moves by the same amount (snapping included).
    const sx = snapped.bounds.x - (drag.start.layers.find((entry) => entry.id === layer.id)?.bounds.x ?? 0);
    const sy = snapped.bounds.y - (drag.start.layers.find((entry) => entry.id === layer.id)?.bounds.y ?? 0);
    for (const id of drag.with) {
      const start = drag.start.layers.find((entry) => entry.id === id);
      if (start && !start.locked) next = resizeLayer(next, id, { ...start.bounds, x: start.bounds.x + sx, y: start.bounds.y + sy });
    }
    onpreview(next);
  }

  function up() {
    if (drag?.moved) oncommit(page);
    drag = null;
    guides = [];
  }

  const handles: LayerDragHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
</script>

<div class="stage-wrap" style:width="{zoom}%">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="page-canvas" style:--aspect={outputShape.aspect} style:--canvas-w="{size.width}px" style:--canvas-h="{size.height}px" bind:this={canvas} onpointerdown={() => onselect(null)} onpointermove={move} onpointerup={up} onpointercancel={up}>
    <div class="paint" style:transform="scale({scale})">
      <FrameView {model} />
    </div>
    {#each boxes as layer (layer.id)}
      <div
        class="box"
        class:selected={selectedId === layer.id}
        class:also={selectedId !== layer.id && picked.has(layer.id)}
        class:locked={layer.locked}
        role="button"
        tabindex="-1"
        aria-label={t("Select {name}", { name: layer.name })}
        style:left="{layer.bounds.x}%"
        style:top="{layer.bounds.y}%"
        style:width="{layer.bounds.w}%"
        style:height="{layer.bounds.h}%"
        style:rotate={layer.rotation ? `${layer.rotation}deg` : undefined}
        onpointerdown={(event) => down(event, layer.id, "move")}
        ondblclick={() => layer.source.type === "text" && onedittext(layer.id)}
      >
        {#if selectedId === layer.id && !layer.locked && !page.locked}
          {#each handles as handle (handle)}
            <span class="handle {handle}" role="presentation" onpointerdown={(event) => down(event, layer.id, handle)}></span>
          {/each}
          <span class="handle rotate" role="presentation" title={t("Drag to turn (Shift: 15° steps)")} onpointerdown={(event) => down(event, layer.id, "rotate")}></span>
        {/if}
      </div>
    {/each}
    {#each guides as guide (`${guide.axis}${guide.at}`)}
      <span class="guide {guide.axis}" style:left={guide.axis === "x" ? `${guide.at}%` : undefined} style:top={guide.axis === "y" ? `${guide.at}%` : undefined} aria-hidden="true"></span>
    {/each}
  </div>
</div>

<style>
  .stage-wrap { max-width: 100%; margin: 0 auto; }
  .page-canvas { position: relative; aspect-ratio: var(--aspect, var(--output-aspect, 16 / 9)); width: 100%; background: #000; overflow: hidden; border-radius: 6px; touch-action: none; user-select: none; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45); }
  .paint { position: absolute; left: 0; top: 0; width: var(--canvas-w, 1920px); height: var(--canvas-h, 1080px); transform-origin: top left; pointer-events: none; }
  .box { position: absolute; outline: 1px dashed transparent; cursor: move; }
  .box:hover { outline-color: color-mix(in srgb, #fff 45%, transparent); }
  .box.selected { outline: 2px solid var(--accent); }
  .box.locked { cursor: default; }
  .handle { position: absolute; width: 12px; height: 12px; background: #fff; border: 2px solid var(--accent); border-radius: 3px; transform: translate(-50%, -50%); }
  .nw { left: 0; top: 0; cursor: nwse-resize; }
  .n { left: 50%; top: 0; cursor: ns-resize; }
  .ne { left: 100%; top: 0; cursor: nesw-resize; }
  .e { left: 100%; top: 50%; cursor: ew-resize; }
  .se { left: 100%; top: 100%; cursor: nwse-resize; }
  .s { left: 50%; top: 100%; cursor: ns-resize; }
  .sw { left: 0; top: 100%; cursor: nesw-resize; }
  .w { left: 0; top: 50%; cursor: ew-resize; }
  /* Where a dragged element caught: thin lines across the page, gone when it is let go. */
  .guide { position: absolute; z-index: 5; pointer-events: none; background: #ff3d8b; }
  .guide.x { top: 0; bottom: 0; width: 1px; transform: translateX(-0.5px); }
  .guide.y { left: 0; right: 0; height: 1px; transform: translateY(-0.5px); }
  /* Turning: a round handle above the element, on a short stem. */
  .handle.rotate { left: 50%; top: -22px; width: 14px; height: 14px; border-radius: 50%; cursor: grab; }
  .handle.rotate::after { content: ""; position: absolute; left: 50%; top: 100%; width: 1px; height: 14px; background: var(--accent); }
  .box.also { outline: 1.5px dashed var(--accent); outline-offset: 1px; }
</style>
