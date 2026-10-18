<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../../app/session.svelte";
  import type { PanelId, PanelPlacement, RegionId } from "../../domain/types";
  import { gridPlan, isPanelId, PANEL_TITLES, presentLayout, splitTracks } from "../../workspace/layout";
  import BiblePane from "../BiblePane.svelte";
  import MediaPane from "../MediaPane.svelte";
  import Rundown from "../Rundown.svelte";
  import SlidePane from "../SlidePane.svelte";
  import SongPane from "../SongPane.svelte";
  import Stage from "../Stage.svelte";
  import ThemePane from "../ThemePane.svelte";
  import Transport from "../Transport.svelte";
  import PanelFrame from "./PanelFrame.svelte";
  import { t } from "../../i18n/core";

  let width = $state(1440);
  let host = $state<HTMLDivElement | null>(null);
  let over = $state<RegionId | null>(null);
  let drawer = $state<PanelId | null>(null);

  const layout = $derived(
    session.workspace.layouts.find((item) => item.id === session.workspace.activeLayoutId) ?? session.workspace.layouts[0],
  );
  const presented = $derived(presentLayout(layout, width, { live: session.liveMode }));
  const plan = $derived(gridPlan(presented));
  const primary = $derived(presented.center[0] ?? null);
  const secondary = $derived(presented.center.slice(1));
  const secondaryActive = $derived(
    secondary.some((panel) => panel.panelId === layout.activeTabs.center) ? (layout.activeTabs.center ?? null) : (secondary[0]?.panelId ?? null),
  );
  const tracks = $derived(
    primary && secondary.length
      ? splitTracks(presented.centerAxis, presented.regions.centerSplit, primary.collapsed, secondary.every((panel) => panel.collapsed))
      : null,
  );

  onMount(() => {
    const end = () => {
      over = null;
    };
    window.addEventListener("dragend", end);
    return () => window.removeEventListener("dragend", end);
  });

  $effect(() => {
    const node = host;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      width = node.clientWidth;
    });
    width = node.clientWidth;
    observer.observe(node);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (drawer && !presented.overflow.some((panel) => panel.panelId === drawer)) drawer = null;
  });

  function allowDrop(event: DragEvent) {
    if (event.dataTransfer?.types.includes("text/plain")) event.preventDefault();
  }

  function dropOn(region: RegionId, event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer?.getData("text/plain") ?? "";
    if (isPanelId(id)) session.movePanelTo(id, region);
    over = null;
  }

  function dragResize(event: PointerEvent, apply: (dx: number, dy: number) => void) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (pointer: PointerEvent) => apply(pointer.clientX - startX, pointer.clientY - startY);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function resizeLeft(event: PointerEvent) {
    const origin = layout.regions.left;
    dragResize(event, (dx) => session.resizeRegions({ left: origin + dx }));
  }

  function resizeRight(event: PointerEvent) {
    const origin = layout.regions.right;
    dragResize(event, (dx) => session.resizeRegions({ right: origin - dx }));
  }

  function resizeBottom(event: PointerEvent) {
    const origin = layout.regions.bottom;
    dragResize(event, (_dx, dy) => session.resizeRegions({ bottom: origin - dy }));
  }

  function resizeCenter(event: PointerEvent) {
    const bounds = (event.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
    if (!bounds) return;
    const axis = presented.centerAxis;
    const startX = event.clientX;
    const startY = event.clientY;
    dragResize(event, (dx, dy) => {
      const ratio = axis === "row" ? (startX + dx - bounds.left) / bounds.width : (startY + dy - bounds.top) / bounds.height;
      session.resizeRegions({ centerSplit: ratio });
    });
  }

  function moveFloat(panel: PanelPlacement, event: PointerEvent) {
    if (event.button !== 0) return;
    const origin = { x: panel.x, y: panel.y };
    dragResize(event, (dx, dy) => session.placePanel(panel.panelId, { x: origin.x + dx, y: origin.y + dy }));
  }

  function resizeFloat(panel: PanelPlacement, event: PointerEvent) {
    const origin = { width: panel.width, height: panel.height };
    dragResize(event, (dx, dy) => session.placePanel(panel.panelId, { width: origin.width + dx, height: origin.height + dy }));
  }

  function startDrag(panelId: PanelId, event: DragEvent) {
    event.dataTransfer?.setData("text/plain", panelId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }
</script>

<div class="workspace" bind:this={host}>
  {#if presented.mode === "compact"}
    <div class="compact-bar" aria-label={t("Collapsed panels")}>
      {#each presented.overflow as panel (panel.panelId)}
        <button type="button" class:active={drawer === panel.panelId} onclick={() => (drawer = drawer === panel.panelId ? null : panel.panelId)}>
          {t(PANEL_TITLES[panel.panelId])}
        </button>
      {/each}
    </div>
  {/if}

  <div class="workspace-grid" style:grid-template-columns={plan.columns} style:grid-template-rows={plan.rows}>
    {#if plan.left}
      <div
        class="cell"
        role="region"
        aria-label={t("Left dock")}
        class:drop={over === "left"}
        style:grid-column={plan.left}
        style:grid-row="1"
        ondragover={allowDrop}
        ondragenter={() => (over = "left")}
        ondrop={(event) => dropOn("left", event)}
      >
        {@render region("left", presented.left, presented.activeTabs.left)}
      </div>
      <div class="splitter vertical" style:grid-column={plan.leftSplitter} style:grid-row="1" onpointerdown={resizeLeft} aria-hidden="true"></div>
    {/if}

    <div
      class="cell center-cell"
      role="region"
      aria-label={t("Preview and program")}
      class:drop={over === "center"}
      style:grid-column={plan.center}
      style:grid-row="1"
      ondragover={allowDrop}
      ondragenter={() => (over = "center")}
      ondrop={(event) => dropOn("center", event)}
    >
      {#if primary && tracks && secondary.length}
        <div class="center-split" style:grid-template-columns={tracks.columns} style:grid-template-rows={tracks.rows}>
          {@render framed(primary)}
          <div class="splitter" class:vertical={presented.centerAxis === "row"} onpointerdown={resizeCenter} aria-hidden="true"></div>
          {@render region("center", secondary, secondaryActive)}
        </div>
      {:else if primary}
        {@render framed(primary)}
      {:else}
        <div class="workspace-empty">
          <p>{t("Preview is hidden.")}</p>
          <button type="button" class="primary" onclick={() => session.showPanelById("preview")}>{t("Show preview")}</button>
        </div>
      {/if}
    </div>

    {#if plan.right}
      <div class="splitter vertical" style:grid-column={plan.rightSplitter} style:grid-row="1" onpointerdown={resizeRight} aria-hidden="true"></div>
      <div
        class="cell"
        role="region"
        aria-label={t("Right dock")}
        class:drop={over === "right"}
        style:grid-column={plan.right}
        style:grid-row="1"
        ondragover={allowDrop}
        ondragenter={() => (over = "right")}
        ondrop={(event) => dropOn("right", event)}
      >
        {@render region("right", presented.right, presented.activeTabs.right)}
      </div>
    {/if}

    {#if presented.bottom.length}
      <div class="splitter" style:grid-column="1 / -1" style:grid-row="2" onpointerdown={resizeBottom} aria-hidden="true"></div>
      <div
        class="cell bottom-cell"
        role="region"
        aria-label={t("Bottom dock")}
        class:row={presented.bottomAxis === "row"}
        class:drop={over === "bottom"}
        style:grid-column="1 / -1"
        style:grid-row="3"
        ondragover={allowDrop}
        ondragenter={() => (over = "bottom")}
        ondrop={(event) => dropOn("bottom", event)}
      >
        {#if presented.bottomAxis === "row"}
          <div class="bottom-row">
            {#each presented.bottom as panel (panel.panelId)}
              {@render framed(panel)}
            {/each}
          </div>
        {:else}
          {@render region("bottom", presented.bottom, presented.activeTabs.bottom)}
        {/if}
      </div>
    {/if}
  </div>

  {#if drawer}
    {@const panel = presented.overflow.find((item) => item.panelId === drawer)}
    {#if panel}
      <div class="drawer">
        {@render framed(panel)}
      </div>
    {/if}
  {/if}

  {#each presented.floating as panel (panel.panelId)}
    <div class="float-panel" style:left="{panel.x}px" style:top="{panel.y}px" style:width="{panel.width}px" style:height="{panel.height}px">
      <PanelFrame
        {panel}
        floating
        onHide={() => session.hidePanelById(panel.panelId)}
        onCollapse={() => session.collapsePanelById(panel.panelId, !panel.collapsed)}
        onFloat={() => session.floatPanelById(panel.panelId)}
        onDock={() => session.dockPanelById(panel.panelId)}
        onTitleDown={(event) => moveFloat(panel, event)}
      >
        {@render body(panel.panelId)}
      </PanelFrame>
      <button type="button" class="float-resize" aria-label={t("Resize {title}", { title: t(PANEL_TITLES[panel.panelId]) })} onpointerdown={(event) => resizeFloat(panel, event)}></button>
    </div>
  {/each}
</div>

{#snippet region(id: RegionId, panels: PanelPlacement[], active: PanelId | null)}
  <div class="region">
    {#if panels.length > 1}
      <div class="panel-tabs" role="tablist" aria-label={t("{id} panels", { id })}>
        {#each panels as panel (panel.panelId)}
          <button
            type="button"
            role="tab"
            class:active={panel.panelId === active}
            aria-selected={panel.panelId === active}
            draggable="true"
            ondragstart={(event) => startDrag(panel.panelId, event)}
            onclick={() => session.activateTab(id, panel.panelId)}
          >
            {t(PANEL_TITLES[panel.panelId])}
          </button>
        {/each}
      </div>
    {/if}
    {#each panels as panel (panel.panelId)}
      <div class="panel-fill" hidden={panel.panelId !== active}>
        {@render framed(panel)}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet framed(panel: PanelPlacement)}
  <PanelFrame
    {panel}
    onHide={() => session.hidePanelById(panel.panelId)}
    onCollapse={() => session.collapsePanelById(panel.panelId, !panel.collapsed)}
    onFloat={() => session.floatPanelById(panel.panelId)}
    onDock={() => session.dockPanelById(panel.panelId)}
  >
    {@render body(panel.panelId)}
  </PanelFrame>
{/snippet}

{#snippet body(id: PanelId)}
  {#if id === "service"}
    <Rundown />
  {:else if id === "preview"}
    <Stage part="preview" />
  {:else if id === "program"}
    <Stage part="program" />
  {:else if id === "bible"}
    <BiblePane />
  {:else if id === "lyrics"}
    <SongPane />
  {:else if id === "slides"}
    <SlidePane />
  {:else if id === "media"}
    <MediaPane />
  {:else if id === "theme"}
    <ThemePane />
  {:else}
    <Transport />
  {/if}
{/snippet}
