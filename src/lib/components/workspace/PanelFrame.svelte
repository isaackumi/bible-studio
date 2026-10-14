<script lang="ts">
  import type { Snippet } from "svelte";
  import type { PanelPlacement } from "../../domain/types";
  import { PANEL_TITLES } from "../../workspace/layout";

  let {
    panel,
    floating = false,
    onHide,
    onCollapse,
    onFloat,
    onDock,
    onTitleDown,
    children,
  }: {
    panel: PanelPlacement;
    floating?: boolean;
    onHide: () => void;
    onCollapse: () => void;
    onFloat: () => void;
    onDock: () => void;
    onTitleDown?: (event: PointerEvent) => void;
    children: Snippet;
  } = $props();

  function dragStart(event: DragEvent) {
    event.dataTransfer?.setData("text/plain", panel.panelId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }
</script>

<section class="panel-frame" class:collapsed={panel.collapsed} data-panel={panel.panelId} aria-label={PANEL_TITLES[panel.panelId]}>
  <header class="panel-head">
    <span class="grip" role="button" tabindex="0" draggable="true" ondragstart={dragStart} aria-label="Drag {PANEL_TITLES[panel.panelId]}">⋮⋮</span>
    <button type="button" class="panel-title" onpointerdown={onTitleDown}>{PANEL_TITLES[panel.panelId]}</button>
    <span class="panel-actions">
      {#if floating}
        <button type="button" class="ghost" onclick={onDock}>Dock</button>
      {:else}
        <button type="button" class="ghost" onclick={onFloat}>Float</button>
      {/if}
      <button type="button" class="ghost" onclick={onCollapse} aria-label={panel.collapsed ? "Expand panel" : "Collapse panel"}>
        {panel.collapsed ? "+" : "–"}
      </button>
      <button type="button" class="ghost" onclick={onHide} aria-label="Hide {PANEL_TITLES[panel.panelId]}">✕</button>
    </span>
  </header>
  <div class="panel-body" hidden={panel.collapsed}>
    {@render children()}
  </div>
</section>
