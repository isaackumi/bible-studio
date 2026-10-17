<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { applyLayerDrag, layerOrder, presentComposition, type Composition, type LayerDragHandle } from "../../domain/composition";
  import { withMediaUrls } from "../../domain/sources";
  import { mediaUrl } from "../../db/api";
  import FrameView from "../FrameView.svelte";
  import { canvasFor } from "../../display/shape";
  import { outputShape } from "../../display/output-shape.svelte";

  // The editable page: the real frame underneath, selection boxes and handles on top.
  let {
    page,
    selectedId,
    zoom,
    onselect,
    onpreview,
    oncommit,
    onedittext,
  }: {
    page: Composition;
    selectedId: string | null;
    zoom: number;
    onselect: (id: string | null) => void;
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
      { theme: session.theme(), now: Date.now() },
    ),
  );
  const boxes = $derived(layerOrder(page).filter((layer) => layer.visible));

  let drag: { id: string; handle: LayerDragHandle; x: number; y: number; start: Composition; moved: boolean } | null = null;

  function down(event: PointerEvent, id: string, handle: LayerDragHandle) {
    event.stopPropagation();
    onselect(id);
    const layer = page.layers.find((entry) => entry.id === id);
    if (!layer || layer.locked || page.locked) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag = { id, handle, x: event.clientX, y: event.clientY, start: page, moved: false };
  }

  function move(event: PointerEvent) {
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = ((event.clientX - drag.x) / rect.width) * 100;
    const dy = ((event.clientY - drag.y) / rect.height) * 100;
    if (Math.abs(dx) + Math.abs(dy) < 0.2) return;
    drag.moved = true;
    onpreview(applyLayerDrag(drag.start, drag.id, drag.handle, { dx, dy }));
  }

  function up() {
    if (drag?.moved) oncommit(page);
    drag = null;
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
        class:locked={layer.locked}
        role="button"
        tabindex="-1"
        aria-label={`Select ${layer.name}`}
        style:left="{layer.bounds.x}%"
        style:top="{layer.bounds.y}%"
        style:width="{layer.bounds.w}%"
        style:height="{layer.bounds.h}%"
        onpointerdown={(event) => down(event, layer.id, "move")}
        ondblclick={() => layer.source.type === "text" && onedittext(layer.id)}
      >
        {#if selectedId === layer.id && !layer.locked && !page.locked}
          {#each handles as handle (handle)}
            <span class="handle {handle}" role="presentation" onpointerdown={(event) => down(event, layer.id, handle)}></span>
          {/each}
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .stage-wrap { max-width: 100%; margin: 0 auto; }
  .page-canvas { position: relative; aspect-ratio: var(--aspect, 16 / 9); width: 100%; background: #000; overflow: hidden; border-radius: 6px; touch-action: none; user-select: none; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45); }
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
</style>
