<script lang="ts">
  import { onMount, tick } from "svelte";
  import { session } from "../../app/session.svelte";
  import {
    bestPerRow,
    cardHeight,
    connector,
    fitView,
    ITEMS_SHOWN,
    midpoint,
    NODE_W,
    PILL_H,
    PILL_W,
    pills,
    placesFor,
    PORT_Y,
    snap,
    toCanvas,
    wireTo,
    zoomAt,
    type Point,
    type View,
  } from "../../domain/flow-canvas";
  import { clockLabel, lengthLabel, planSchedule } from "../../domain/schedule";
  import type { PresentationItem, Service } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import PartLeader from "./PartLeader.svelte";
  import { t, tn } from "../../i18n/core";
  import { keys } from "../../platform/os";

  // The service as a flow: each part a card on a big dotted canvas, joined in running order by
  // connectors. Drag a card to arrange it; drag from a card's out port onto another card to make that
  // one come next; + on a connector puts a new part there. Nothing here changes Program.
  let {
    service,
    kindOf,
    onadd,
    onedit,
  }: {
    service: Service;
    kindOf: (item: PresentationItem) => { icon: string; label: string };
    onadd: (sectionId: string) => void;
    onedit: (itemId: string) => void;
  } = $props();

  let viewport = $state<HTMLDivElement | undefined>();
  let view = $state<View>({ x: 48, y: 48, zoom: 1 });
  let size = $state({ w: 0, h: 0 });

  /** A card being dragged: its place follows the pointer until it is let go. */
  let moving = $state<{ id: string; place: Point; grab: Point; moved: boolean } | null>(null);
  /** A connector being drawn from a part's out port (or Start) to the pointer. */
  let wiring = $state<{ from: string; to: Point; over: string | null } | null>(null);
  let panning = $state<{ from: Point; view: View } | null>(null);
  let dragItem = $state<string | null>(null);
  let dropOn = $state<string | null>(null);
  let armedRemove = $state<string | null>(null);

  const plan = $derived(planSchedule(service));
  // Room kept clear when fitting: the tip along the top, the controls and the map along the bottom.
  const TOP_INSET = 36;
  const BOTTOM_INSET = 124;
  const room = $derived({ w: size.w, h: Math.max(120, size.h - TOP_INSET - BOTTOM_INSET) });
  /** Cards per row in the tidy layout, chosen for the canvas's shape. */
  const perRow = $derived(bestPerRow(service.sections, room));
  const saved = $derived(placesFor(service.sections, perRow));
  const places = $derived.by(() => {
    if (!moving) return saved;
    const next = new Map(saved);
    next.set(moving.id, moving.place);
    return next;
  });
  const ends = $derived(pills(service.sections, places));
  const runningIndex = $derived(service.sections.findIndex((section) => section.id === session.runningSectionId));
  const order = $derived(service.sections.map((section) => section.id));

  const outPort = (id: string): Point => {
    const place = places.get(id)!;
    return { x: place.x + NODE_W, y: place.y + PORT_Y };
  };
  const inPort = (id: string): Point => {
    const place = places.get(id)!;
    return { x: place.x, y: place.y + PORT_Y };
  };
  const startPort = $derived({ x: ends.start.x + PILL_W, y: ends.start.y + PILL_H / 2 });
  const endPort = $derived({ x: ends.end.x, y: ends.end.y + PILL_H / 2 });

  /** Every connector in running order: Start → parts → End, with its state on the day. */
  const wires = $derived.by(() => {
    const ids = order;
    const list: Array<{ key: string; from: Point; to: Point; state: "done" | "next" | "plan"; after: number }> = [];
    if (ids.length === 0) return list;
    const stateOf = (index: number) => (runningIndex < 0 ? "plan" : index < runningIndex ? "done" : index === runningIndex ? "next" : "plan");
    list.push({ key: "start", from: startPort, to: inPort(ids[0]!), state: runningIndex >= 0 ? "done" : "plan", after: -1 });
    ids.forEach((id, index) => {
      const next = ids[index + 1];
      list.push({ key: id, from: outPort(id), to: next ? inPort(next) : endPort, state: stateOf(index), after: index });
    });
    return list;
  });

  /** Every card and pill as boxes, for fitting the view and the map. */
  const boxes = $derived([
    { x: ends.start.x, y: ends.start.y, w: PILL_W, h: PILL_H },
    { x: ends.end.x, y: ends.end.y, w: PILL_W, h: PILL_H },
    ...service.sections.map((section) => ({ ...places.get(section.id)!, w: NODE_W, h: cardHeight(section.items.length) })),
  ]);

  function fit() {
    const fitted = fitView(boxes, room);
    view = { ...fitted, y: fitted.y + TOP_INSET };
  }

  // Fit when the canvas opens, when another service opens, and while the canvas settles into its
  // size, until the operator pans or zooms it themselves.
  let fittedFor = "";
  let touched = false;
  $effect(() => {
    const id = service.id;
    if (size.w === 0) return;
    if (fittedFor !== id) {
      fittedFor = id;
      touched = false;
    }
    if (!touched) void tick().then(fit);
  });

  onMount(() => {
    const node = viewport!;
    const measure = () => (size = { w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    // Scroll pans; pinch or Ctrl/⌘ + scroll zooms around the pointer (the page must not scroll).
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      touched = true;
      const box = node.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        view = zoomAt(view, Math.exp(-event.deltaY * 0.01), { x: event.clientX - box.left, y: event.clientY - box.top });
      } else {
        view = { ...view, x: view.x - event.deltaX, y: view.y - event.deltaY };
      }
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      node.removeEventListener("wheel", wheel);
    };
  });

  function pointer(event: PointerEvent): Point {
    const box = viewport!.getBoundingClientRect();
    return toCanvas(view, { x: event.clientX - box.left, y: event.clientY - box.top });
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-node], [data-pill], button, input, select, .controls, .map")) return;
    panning = { from: { x: event.clientX, y: event.clientY }, view };
    touched = true;
    viewport!.setPointerCapture(event.pointerId);
  }

  function grabCard(event: PointerEvent, id: string) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("input, button")) return;
    event.preventDefault();
    const at = pointer(event);
    const place = places.get(id)!;
    moving = { id, place, grab: { x: at.x - place.x, y: at.y - place.y }, moved: false };
    viewport!.setPointerCapture(event.pointerId);
  }

  function startWire(event: PointerEvent, from: string) {
    event.preventDefault();
    event.stopPropagation();
    wiring = { from, to: pointer(event), over: null };
    viewport!.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (moving) {
      const at = pointer(event);
      const place = { x: at.x - moving.grab.x, y: at.y - moving.grab.y };
      moving = { ...moving, place, moved: moving.moved || Math.hypot(place.x - moving.place.x, place.y - moving.place.y) > 2 };
    } else if (wiring) {
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-node]");
      const over = hit?.dataset.node ?? null;
      wiring = { ...wiring, to: pointer(event), over: over && over !== wiring.from ? over : null };
    } else if (panning) {
      view = { ...panning.view, x: panning.view.x + event.clientX - panning.from.x, y: panning.view.y + event.clientY - panning.from.y };
    }
  }

  function onPointerUp() {
    if (moving) {
      if (moving.moved) session.setSectionCanvas(moving.id, snap(moving.place));
      else session.cursor = { sectionId: moving.id, itemId: session.cursor.itemId };
      moving = null;
    } else if (wiring) {
      const { from, over } = wiring;
      wiring = null;
      if (over) {
        const at = from === "start" ? (order.indexOf(over) === 0 ? null : 0) : wireTo(order, from, over);
        if (at !== null) {
          session.moveSectionTo(over, at);
          const name = service.sections.find((section) => section.id === over)?.name ?? "";
          session.message = from === "start" ? t("{name} now opens the service.", { name }) : t("{name} now comes after {after}.", { name, after: service.sections.find((section) => section.id === from)?.name ?? "" });
        }
      }
    }
    panning = null;
  }

  function zoomBy(factor: number) {
    touched = true;
    view = zoomAt(view, factor, { x: size.w / 2, y: size.h / 2 });
  }

  /** A new part on a connector: in the running order there, and on the canvas near the + button. */
  function insertAt(after: number, at: Point) {
    const placed = service.sections.some((section) => section.canvas);
    const id = session.insertSection(t("New part"), after + 1, placed ? snap({ x: at.x - NODE_W / 2, y: at.y + 60 }) : undefined);
    if (id) session.message = t("New part added. Name it on its card.");
  }

  function addPart() {
    const last = service.sections.at(-1);
    const lastPlace = last ? places.get(last.id) : null;
    const placed = service.sections.some((section) => section.canvas);
    session.insertSection(t("New part"), service.sections.length, placed && lastPlace ? snap({ x: lastPlace.x + NODE_W + 96, y: lastPlace.y }) : undefined);
  }

  function removePart(id: string) {
    if (armedRemove !== id) {
      armedRemove = id;
      setTimeout(() => (armedRemove = armedRemove === id ? null : armedRemove), 3000);
      return;
    }
    armedRemove = null;
    session.removeSection(id);
  }

  const live = (item: PresentationItem) => session.live.program.sourceId === item.id;

  // The map in the corner: every card as a block, and the part of the canvas in view.
  const MAP_W = 168;
  const MAP_H = 104;
  const bounds = $derived.by(() => {
    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.w));
    const maxY = Math.max(...boxes.map((box) => box.y + box.h));
    const scale = Math.min(MAP_W / Math.max(1, maxX - minX), MAP_H / Math.max(1, maxY - minY)) * 0.9;
    return { minX, minY, scale };
  });
  const mapBox = (box: { x: number; y: number; w: number; h: number }) => ({
    x: (box.x - bounds.minX) * bounds.scale + MAP_W * 0.05,
    y: (box.y - bounds.minY) * bounds.scale + MAP_H * 0.05,
    w: Math.max(2, box.w * bounds.scale),
    h: Math.max(2, box.h * bounds.scale),
  });
  /** The part of the canvas in view, clipped to the map. */
  const seen = $derived.by(() => {
    const box = mapBox({ ...toCanvas(view, { x: 0, y: 0 }), w: size.w / view.zoom, h: size.h / view.zoom });
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    return { x, y, w: Math.max(0, Math.min(MAP_W, box.x + box.w) - x), h: Math.max(0, Math.min(MAP_H, box.y + box.h) - y) };
  });

  function jump(event: MouseEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (event.clientX - box.left - MAP_W * 0.05) / bounds.scale + bounds.minX;
    const y = (event.clientY - box.top - MAP_H * 0.05) / bounds.scale + bounds.minY;
    touched = true;
    view = { ...view, x: size.w / 2 - x * view.zoom, y: size.h / 2 - y * view.zoom };
  }
</script>

<div
  class="flow"
  class:panning={panning !== null}
  class:wiring={wiring !== null}
  bind:this={viewport}
  role="application"
  aria-label={t("Service flow")}
  style:--grid="{24 * view.zoom}px"
  style:--gx="{view.x}px"
  style:--gy="{view.y}px"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  <div class="world" style:transform="translate({view.x}px, {view.y}px) scale({view.zoom})">
    <svg class="wires" aria-hidden="true">
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>
      {#each wires as wire (wire.key)}
        <path class="wire {wire.state}" d={connector(wire.from, wire.to)} marker-end="url(#flow-arrow)" />
      {/each}
      {#if wiring}
        {@const from = wiring.from === "start" ? startPort : outPort(wiring.from)}
        <path class="wire drawing" d={connector(from, wiring.over ? inPort(wiring.over) : wiring.to)} />
      {/if}
    </svg>

    <div class="pill start" data-pill style:left="{ends.start.x}px" style:top="{ends.start.y}px">
      <Icon name="play" size={14} />
      <span><strong>{t("Start")}</strong><em>{clockLabel(plan.start)}</em></span>
      <button type="button" class="port out" aria-label={t("Drag to the part that opens the service")} title={t("Drag to the part that opens the service")} onpointerdown={(event) => startWire(event, "start")}></button>
    </div>
    <div class="pill end" data-pill style:left="{ends.end.x}px" style:top="{ends.end.y}px">
      <span class="port in" aria-hidden="true"></span>
      <Icon name="check" size={14} />
      <span><strong>{t("End")}</strong><em>{clockLabel(plan.end)}</em></span>
    </div>

    {#each wires as wire (wire.key)}
      {@const mid = midpoint(wire.from, wire.to)}
      <button type="button" class="insert" style:left="{mid.x}px" style:top="{mid.y}px" title={t("Add a part here")} aria-label={t("Add a part here")} onclick={() => insertAt(wire.after, mid)}><Icon name="plus" size={12} /></button>
    {/each}

    {#each service.sections as section, index (section.id)}
      {@const place = places.get(section.id)!}
      {@const slot = plan.slots[index]!}
      <div
        class="node"
        data-node={section.id}
        role="group"
        aria-label={section.name}
        class:selected={session.cursor.sectionId === section.id}
        class:running={section.id === session.runningSectionId}
        class:skipped={section.skip}
        class:past={runningIndex >= 0 && index < runningIndex}
        class:lifted={moving?.id === section.id}
        class:target={wiring?.over === section.id}
        class:drop={dropOn === section.id}
        style:left="{place.x}px"
        style:top="{place.y}px"
        style:width="{NODE_W}px"
        style:--tone="var(--slot-{index % 8})"
        ondragover={(event) => { if (dragItem) { event.preventDefault(); dropOn = section.id; } }}
        ondragleave={() => (dropOn = dropOn === section.id ? null : dropOn)}
        ondrop={(event) => { event.preventDefault(); if (dragItem) session.moveItemTo(dragItem, section.id, section.items.length); dragItem = null; dropOn = null; }}
      >
        <span class="port in" aria-hidden="true"></span>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <header class="node-head" onpointerdown={(event) => grabCard(event, section.id)}>
          <span class="step">{index + 1}</span>
          <input class="node-name" aria-label={t("Section name")} value={section.name} onchange={(event) => session.renameSection(section.id, event.currentTarget.value)} />
          {#if section.id === session.runningSectionId}<span class="now">{t("Now")}</span>{/if}
          <button type="button" class="tool" class:armed={armedRemove === section.id} aria-label={armedRemove === section.id ? t("Confirm delete {name}", { name: section.name }) : t("Delete {name}", { name: section.name })} title={armedRemove === section.id ? t("Click again to delete") : t("Delete this part")} onclick={() => removePart(section.id)}>{#if armedRemove === section.id}{t("Delete?")}{:else}<Icon name="trash" size={12} />{/if}</button>
        </header>
        <div class="meta">
          <span class="time"><Icon name="clock" size={11} /> {slot.untimed ? t("No time") : `${clockLabel(slot.start)} · ${lengthLabel(slot.minutes)}`}</span>
          <PartLeader {section} {slot} {plan} />
        </div>
        <ol class="items">
          {#each section.items.slice(0, ITEMS_SHOWN) as item (item.id)}
            {@const kind = kindOf(item)}
            <li>
              <button
                type="button"
                class="item"
                class:on={session.cursor.itemId === item.id}
                class:live={live(item)}
                draggable="true"
                title={t("Click for Preview; double-click to edit; drag to another part")}
                ondragstart={(event) => { dragItem = item.id; event.dataTransfer?.setData("text/plain", item.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; }}
                ondragend={() => { dragItem = null; dropOn = null; }}
                onclick={() => void session.chooseItem(item.id)}
                ondblclick={() => onedit(item.id)}
              >
                <Icon name={kind.icon} size={12} />
                <span class="item-title">{item.title}</span>
                {#if live(item)}<span class="badge live">{t("Live")}</span>{:else if session.cursor.itemId === item.id}<span class="badge">{t("Preview")}</span>{/if}
              </button>
            </li>
          {/each}
          {#if section.items.length > ITEMS_SHOWN}
            <li class="more">{tn(section.items.length - ITEMS_SHOWN, "{n} more", "{n} more")}</li>
          {/if}
          {#if section.items.length === 0}
            <li class="empty">{dragItem ? t("Drop here") : t("Nothing in this part yet")}</li>
          {/if}
        </ol>
        <footer class="node-foot">
          <button type="button" class="add" onclick={() => onadd(section.id)}><Icon name="plus" size={12} /> {t("Add")}</button>
          <span class="count">{tn(section.items.length, "{n} item", "{n} items")}</span>
        </footer>
        <button type="button" class="port out" aria-label={t("Drag to the part that comes after {name}", { name: section.name })} title={t("Drag to the part that comes next")} onpointerdown={(event) => startWire(event, section.id)}></button>
      </div>
    {/each}
  </div>

  {#if service.sections.length === 0}
    <div class="hello">
      <Icon name="layers" size={24} />
      <strong>{t("Plan the flow")}</strong>
      <p>{t("Add the parts of the service, then drag them into place. Connectors show the order.")}</p>
      <button type="button" class="desk-btn" onclick={addPart}><Icon name="plus" size={13} /> {t("Add a part")}</button>
    </div>
  {/if}

  <div class="controls" role="toolbar" aria-label={t("Canvas")}>
    <button type="button" title={t("Zoom out")} aria-label={t("Zoom out")} onclick={() => zoomBy(1 / 1.2)}><Icon name="minus" size={13} /></button>
    <button type="button" class="pct" title={t("Back to full size")} onclick={() => zoomBy(1 / view.zoom)}>{Math.round(view.zoom * 100)}%</button>
    <button type="button" title={t("Zoom in")} aria-label={t("Zoom in")} onclick={() => zoomBy(1.2)}><Icon name="plus" size={13} /></button>
    <span class="sep"></span>
    <button type="button" title={t("Show the whole service")} onclick={fit}><Icon name="expand" size={13} /> {t("Fit")}</button>
    <button type="button" title={t("Put every card back in tidy rows")} onclick={() => { session.tidyCanvas(); void tick().then(fit); }}><Icon name="layout" size={13} /> {t("Tidy")}</button>
    <button type="button" title={t("Add a part at the end")} onclick={addPart}><Icon name="plus" size={13} /> {t("Part")}</button>
  </div>

  <p class="tip">{keys(t("Drag a card to move it · drag from its ● to another card to change the order · scroll to pan, ⌘+scroll to zoom"))}</p>

  {#if service.sections.length > 0}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="map" style:width="{MAP_W}px" style:height="{MAP_H}px" onclick={jump} title={t("Click to go there")}>
      {#each service.sections as section, index (section.id)}
        {@const box = mapBox({ ...places.get(section.id)!, w: NODE_W, h: cardHeight(section.items.length) })}
        <i class:running={section.id === session.runningSectionId} style:left="{box.x}px" style:top="{box.y}px" style:width="{box.w}px" style:height="{box.h}px" style:--tone="var(--slot-{index % 8})"></i>
      {/each}
      <b style:left="{seen.x}px" style:top="{seen.y}px" style:width="{seen.w}px" style:height="{seen.h}px"></b>
    </div>
  {/if}
</div>

<style>
  .flow {
    --dot: color-mix(in srgb, var(--ink) 16%, transparent);
    position: relative;
    flex: 1;
    min-height: 420px;
    overflow: hidden;
    border-top: 1px solid var(--line);
    background-color: color-mix(in srgb, var(--ink) 3%, var(--bg, var(--panel)));
    background-image: radial-gradient(circle, var(--dot) 1.1px, transparent 1.4px);
    background-size: var(--grid) var(--grid);
    background-position: var(--gx) var(--gy);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .flow.panning { cursor: grabbing; }
  .flow.wiring { cursor: crosshair; }
  .world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  .wires { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
  .wire { fill: none; stroke: color-mix(in srgb, var(--ink) 30%, transparent); stroke-width: 2; }
  .wire.done { stroke: color-mix(in srgb, #30a46c 70%, transparent); }
  .wire.next { stroke: #30a46c; stroke-dasharray: 8 7; animation: flow 0.9s linear infinite; }
  .wire.drawing { stroke: var(--accent); stroke-dasharray: 6 6; stroke-width: 2.5; }
  @keyframes flow { to { stroke-dashoffset: -15; } }
  @media (prefers-reduced-motion: reduce) { .wire.next { animation: none; } }

  .pill { position: absolute; display: flex; align-items: center; gap: 10px; width: 132px; height: 60px; padding: 0 16px; border: 1px solid var(--line); border-radius: 30px; background: var(--panel); box-shadow: 0 6px 18px rgb(0 0 0 / 0.18); color: var(--ink); cursor: default; }
  .pill span { display: grid; line-height: 1.2; }
  .pill strong { font-size: 13px; }
  .pill em { font-style: normal; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .pill.start :global(svg) { color: #30a46c; }

  .port { position: absolute; width: 14px; height: 14px; padding: 0; border: 2px solid color-mix(in srgb, var(--ink) 40%, var(--line)); border-radius: 50%; background: var(--panel); }
  .port.in { left: -8px; top: 23px; }
  .port.out { right: -8px; top: 23px; cursor: crosshair; }
  .pill .port.in, .pill .port.out { top: 21px; }
  .port.out:hover { border-color: var(--accent); background: var(--accent); transform: scale(1.25); }

  .insert { position: absolute; display: grid; place-items: center; width: 22px; height: 22px; margin: -11px 0 0 -11px; padding: 0; border: 1px solid var(--line); border-radius: 50%; background: var(--panel); color: var(--muted); opacity: 0; transition: opacity 0.12s; }
  .flow:hover .insert { opacity: 0.7; }
  .insert:hover, .insert:focus-visible { opacity: 1 !important; color: var(--ink); border-color: var(--accent); }

  .node { position: absolute; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); box-shadow: 0 8px 24px rgb(0 0 0 / 0.2); cursor: default; transition: box-shadow 0.15s, border-color 0.15s; }
  .node.skipped { border-style: dashed; opacity: 0.5; box-shadow: none; }
  .node.skipped .node-name { text-decoration: line-through; }
  .node::before { content: ""; position: absolute; inset: 0 0 auto; height: 4px; border-radius: 14px 14px 0 0; background: var(--tone); }
  .node.selected { border-color: color-mix(in srgb, var(--accent) 70%, var(--line)); }
  .node.running { border-color: #30a46c; box-shadow: 0 0 0 3px color-mix(in srgb, #30a46c 30%, transparent), 0 10px 30px rgb(0 0 0 / 0.25); }
  .node.past { opacity: 0.62; }
  .node.lifted { box-shadow: 0 22px 50px rgb(0 0 0 / 0.35); z-index: 5; }
  .node.target, .node.drop { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent); }
  .node-head { display: flex; align-items: center; gap: 8px; height: 52px; padding: 6px 10px 0 12px; cursor: grab; }
  .node.lifted .node-head { cursor: grabbing; }
  .step { display: grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 7px; background: color-mix(in srgb, var(--tone) 24%, transparent); color: var(--ink); font-size: 11px; font-weight: 800; }
  .node-name { flex: 1; min-width: 0; height: 30px; padding: 0 6px; border: 1px solid transparent; border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 14px; font-weight: 750; cursor: text; }
  .node-name:hover, .node-name:focus { border-color: var(--line); background: var(--field); outline: none; }
  .node-name:focus-visible { border-color: var(--accent); }
  .now { padding: 2px 8px; border-radius: 9px; background: #30a46c; color: #fff; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
  .tool { display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 6px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 11px; }
  .tool:hover { background: var(--field); color: var(--ink); }
  .tool.armed { background: var(--danger, #e5484d); color: #fff; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 0 12px 8px; }
  .time { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .items { display: grid; gap: 2px; margin: 0; padding: 6px 8px; list-style: none; border-top: 1px solid var(--line); }
  .item { display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 8px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .item :global(svg) { flex: none; color: var(--muted); }
  .item:hover { background: var(--field); }
  .item.on { border-color: color-mix(in srgb, #30a46c 60%, transparent); background: color-mix(in srgb, #30a46c 10%, transparent); }
  .item.live { border-color: color-mix(in srgb, var(--live, #fa4f00) 60%, transparent); background: color-mix(in srgb, var(--live, #fa4f00) 12%, transparent); }
  .item-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { flex: none; padding: 1px 6px; border-radius: 6px; background: #30a46c; color: #fff; font-size: 10px; font-weight: 750; }
  .badge.live { background: var(--live, #fa4f00); }
  .more, .empty { padding: 6px 8px; font-size: 12px; color: var(--muted); }
  .node-foot { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px 10px; }
  .add { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border: 1px dashed var(--line); border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; }
  .add:hover { border-color: var(--accent); }
  .count { font-size: 11px; color: var(--muted); }

  .hello { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 8px; text-align: center; color: var(--muted); pointer-events: none; }
  .hello strong { color: var(--ink); font-size: 15px; }
  .hello p { margin: 0; max-width: 340px; font-size: 13px; line-height: 1.5; }
  .hello button { pointer-events: auto; }

  .controls { position: absolute; left: 14px; bottom: 14px; display: flex; align-items: center; gap: 2px; padding: 4px; border: 1px solid var(--line); border-radius: 11px; background: var(--panel); box-shadow: 0 8px 22px rgb(0 0 0 / 0.22); cursor: default; }
  .controls button { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px; border: 0; border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; }
  .controls button:hover { background: var(--field); }
  .controls .pct { min-width: 52px; justify-content: center; font-variant-numeric: tabular-nums; }
  .sep { width: 1px; height: 18px; margin: 0 4px; background: var(--line); }
  .tip { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); margin: 0; padding: 4px 10px; border-radius: 8px; background: color-mix(in srgb, var(--panel) 80%, transparent); font-size: 11px; color: var(--muted); white-space: nowrap; pointer-events: none; }
  .map { position: absolute; right: 14px; bottom: 14px; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--panel) 92%, transparent); box-shadow: 0 8px 22px rgb(0 0 0 / 0.22); cursor: pointer; }
  .map i { position: absolute; border-radius: 2px; background: color-mix(in srgb, var(--tone) 70%, transparent); }
  .map i.running { background: #30a46c; }
  .map b { position: absolute; border: 1.5px solid var(--accent); border-radius: 3px; background: color-mix(in srgb, var(--accent) 8%, transparent); pointer-events: none; }
  @media (max-width: 1100px) { .tip { display: none; } }
</style>
