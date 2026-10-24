<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../../app/session.svelte";
  import { t } from "../../i18n/core";
  import Icon from "../Icon.svelte";

  // The show bar: a glass island floating over the studio that drives this deck on the screens.
  // It says which page is live and which is on Preview, steps pages, starts and paces the
  // slideshow, and takes the deck off. It can be dragged anywhere and folded to a dot.

  /** `onbefore`: the studio saves its draft first, so what goes to the screen is what is on the canvas. */
  let { deckId, pages, pageIndex, onselect, onbefore }: { deckId: string; pages: number; pageIndex: number; onselect: (index: number) => void; onbefore: () => void } = $props();

  const PLACE_KEY = "cs-showbar";
  let bar: HTMLDivElement | undefined = $state();
  let x = $state<number | null>(null);
  let y = $state<number | null>(null);
  let folded = $state(false);
  let dragging = $state(false);
  let now = $state(Date.now());

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null") as { x?: number; y?: number; folded?: boolean } | null;
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
        x = saved.x;
        y = saved.y;
      }
      folded = saved?.folded === true;
    } catch {
      // Storage blocked: the bar sits where it starts.
    }
    requestAnimationFrame(keepInside);
    const tick = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(tick);
  });

  const remember = () => {
    try {
      localStorage.setItem(PLACE_KEY, JSON.stringify({ x, y, folded }));
    } catch {
      // Not remembered between opens.
    }
  };

  /** The page of this deck on Program and on Preview, from what the screens show. */
  const indexOn = (sourceId: string | null) => {
    const match = sourceId && new RegExp(`^deck:${deckId}:(\\d+)$`).exec(sourceId);
    return match ? Number(match[1]) : null;
  };
  const liveIndex = $derived(indexOn(session.live.program.sourceId));
  const previewIndex = $derived(indexOn(session.live.preview.sourceId));
  const loop = $derived(session.deckLoop?.deckId === deckId ? session.deckLoop : null);
  const left = $derived(loop ? Math.max(0, loop.seconds - (now - loop.at) / 1000) : 0);
  const progress = $derived(loop ? Math.min(1, (now - loop.at) / (loop.seconds * 1000)) : 0);
  const PACES = [3, 5, 8, 12, 20, 30, 60];

  const show = (index: number) => {
    onbefore();
    void session.showDeck(deckId, "live", { page: index });
  };
  const preview = (index: number) => {
    onbefore();
    void session.showDeck(deckId, "preview", { page: index });
  };
  const step = (delta: number) => {
    const from = liveIndex ?? pageIndex;
    const next = (from + delta + pages) % pages;
    onselect(next);
    if (loop) {
      onbefore();
      session.jumpDeckLoop(next);
    } else show(next);
  };
  const playPause = () => {
    if (loop) return session.stopDeckLoop();
    onbefore();
    void session.startDeckLoop(deckId, 8, liveIndex ?? pageIndex);
  };
  const pace = (seconds: number) => {
    onbefore();
    if (loop) session.setDeckLoopSeconds(seconds);
    else void session.startDeckLoop(deckId, seconds, liveIndex ?? pageIndex);
  };

  // Dragged by its handle anywhere in the window (the studio fills it, so the bar can sit over the
  // side panels too); kept inside the window; remembered. The grip captures the pointer, so a fast
  // drag that leaves the handle still follows the hand.
  function startDrag(event: PointerEvent) {
    if (!bar || event.button !== 0) return;
    event.preventDefault();
    const grip = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const place = (ev: PointerEvent) => {
      x = Math.round(Math.min(Math.max(8, ev.clientX - offsetX), window.innerWidth - rect.width - 8));
      y = Math.round(Math.min(Math.max(8, ev.clientY - offsetY), window.innerHeight - rect.height - 8));
    };
    const move = (ev: PointerEvent) => {
      // The first real move starts the drag; a plain click on the grip moves nothing.
      if (!dragging && Math.hypot(ev.clientX - event.clientX, ev.clientY - event.clientY) < 3) return;
      dragging = true;
      place(ev);
    };
    const stop = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", stop);
      grip.removeEventListener("pointercancel", stop);
      if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
      if (!dragging) return;
      dragging = false;
      remember();
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("pointercancel", stop);
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser will not hand over: the drag still works while the hand stays on the grip.
    }
  }

  /** Where the bar starts: centred over the canvas column, above the page strip. */
  let centre = $state(typeof window === "undefined" ? 0 : window.innerWidth / 2);
  /** A bar left where it no longer fits (the window shrank) comes back inside. */
  function keepInside() {
    if (!bar) return;
    const column = bar.parentElement?.getBoundingClientRect();
    if (column) centre = column.left + column.width / 2;
    if (x === null || y === null) return;
    x = Math.max(8, Math.min(x, window.innerWidth - bar.offsetWidth - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - bar.offsetHeight - 8));
  }
  const toggleFold = () => {
    folded = !folded;
    remember();
    requestAnimationFrame(keepInside);
  };
</script>

<svelte:window onresize={keepInside} />

<div
  bind:this={bar}
  class="showbar"
  class:folded
  class:dragging
  class:has-live={liveIndex !== null}
  role="toolbar"
  aria-label={t("Show controls")}
  style:left={x === null ? `${centre}px` : `${x}px`}
  style:top={y === null ? "auto" : `${y}px`}
  style:bottom={y === null ? "182px" : "auto"}
  style:transform={x === null ? "translateX(-50%)" : "none"}
>
  <button type="button" class="grip" aria-label={t("Move the show controls")} title={t("Drag to move")} onpointerdown={startDrag}><Icon name="grip" size={14} /></button>
  {#if folded}
    <button type="button" class="state small" onclick={toggleFold} title={t("Show controls")}>
      <span class="dot" class:on={liveIndex !== null}></span>
      <span>{liveIndex !== null ? t("Live: page {n}", { n: liveIndex + 1 }) : t("Show controls")}</span>
    </button>
  {:else}
    <div class="state" aria-live="polite">
      <span class="dot" class:on={liveIndex !== null}></span>
      <span class="words">
        {#if liveIndex !== null}
          <strong>{t("Live: page {n} of {total}", { n: liveIndex + 1, total: pages })}</strong>
          <small>{loop ? t("Next in {s} s", { s: Math.ceil(left) }) : previewIndex !== null ? t("Page {n} on Preview", { n: previewIndex + 1 }) : t("Holding")}</small>
        {:else if previewIndex !== null}
          <strong>{t("Page {n} on Preview", { n: previewIndex + 1 })}</strong>
          <small>{t("Nothing from this design is live")}</small>
        {:else}
          <strong>{t("Not on the screen")}</strong>
          <small>{t("Page {n} is selected", { n: pageIndex + 1 })}</small>
        {/if}
      </span>
    </div>
    <span class="group">
      <button type="button" class="round" aria-label={t("Previous page live")} title={t("Previous page, live")} disabled={pages < 2} onclick={() => step(-1)}><Icon name="chevron-left" size={16} /></button>
      <button type="button" class="round" aria-label={t("Next page live")} title={t("Next page, live")} disabled={pages < 2} onclick={() => step(1)}><Icon name="chevron-right" size={16} /></button>
    </span>
    <button type="button" class="pill live-btn" disabled={liveIndex === pageIndex} onclick={() => show(pageIndex)} title={t("Send the selected page to the screen")}>{t("Show page {n}", { n: pageIndex + 1 })}</button>
    <button type="button" class="pill" disabled={previewIndex === pageIndex} onclick={() => preview(pageIndex)} title={t("Put the selected page on Preview")}>{t("Preview")}</button>
    <span class="group loop" class:running={!!loop}>
      <button type="button" class="round play" aria-label={loop ? t("Pause the slideshow") : t("Play as a slideshow")} title={loop ? t("Pause the slideshow") : t("Play as a slideshow")} disabled={pages < 2} onclick={playPause}><Icon name={loop ? "pause" : "play"} size={15} /></button>
      <label class="pace" title={t("Seconds per page")}>
        <select value={loop?.seconds ?? 8} onchange={(event) => pace(Number(event.currentTarget.value))} disabled={pages < 2}>
          {#each PACES as seconds (seconds)}<option value={seconds}>{t("{s} s", { s: seconds })}</option>{/each}
        </select>
      </label>
      {#if loop}<i class="ring" style:--p={progress}></i>{/if}
    </span>
    <button type="button" class="round off" aria-label={t("Take it off the screen")} title={t("Take it off the screen")} disabled={liveIndex === null && !loop} onclick={() => { if (loop) session.stopDeckLoop(); session.clear(); }}><Icon name="close" size={15} /></button>
    <button type="button" class="round fold" aria-label={t("Hide the show controls")} title={t("Hide (a dot stays)")} onclick={toggleFold}><Icon name="chevron-down" size={15} /></button>
  {/if}
</div>

<style>
  /* Glass: the canvas shows through, the edge catches the light, the shadow lifts it. */
  .showbar {
    position: fixed;
    z-index: 38;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 8px 6px;
    border-radius: 22px;
    color: #fff;
    background: color-mix(in srgb, #0c0c12 58%, transparent);
    -webkit-backdrop-filter: blur(24px) saturate(170%);
    backdrop-filter: blur(24px) saturate(170%);
    box-shadow: 0 24px 60px rgb(0 0 0 / 0.5), 0 2px 8px rgb(0 0 0 / 0.3), inset 0 1px 0 rgb(255 255 255 / 0.14), 0 0 0 1px rgb(255 255 255 / 0.1);
    font-size: 12.5px;
    user-select: none;
    transition: box-shadow 0.2s ease;
  }
  .showbar.dragging { box-shadow: 0 32px 80px rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.18), 0 0 0 1px rgb(255 255 255 / 0.16); cursor: grabbing; }
  .showbar.has-live { box-shadow: 0 24px 60px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 60 60 / 0.35), inset 0 1px 0 rgb(255 255 255 / 0.14); }
  .showbar.folded { padding: 6px 12px 6px 6px; border-radius: 999px; }
  .grip { display: grid; place-items: center; width: 22px; height: 34px; border: 0; border-radius: 10px; background: none; color: rgb(255 255 255 / 0.45); cursor: grab; touch-action: none; }
  .grip:hover { color: #fff; background: rgb(255 255 255 / 0.08); }
  .showbar.dragging, .showbar.dragging .grip { cursor: grabbing; }
  .state { display: flex; align-items: center; gap: 9px; min-width: 150px; padding: 0 6px; border: 0; background: none; color: inherit; font: inherit; text-align: left; }
  .state.small { min-width: 0; cursor: pointer; }
  .dot { flex: none; width: 9px; height: 9px; border-radius: 50%; background: rgb(255 255 255 / 0.28); }
  .dot.on { background: #ff2d2d; box-shadow: 0 0 0 0 rgb(255 45 45 / 0.6); animation: beat 1.6s ease-out infinite; }
  @keyframes beat { 70% { box-shadow: 0 0 0 7px rgb(255 45 45 / 0); } 100% { box-shadow: 0 0 0 0 rgb(255 45 45 / 0); } }
  .words { display: grid; line-height: 1.2; }
  .words strong { font-size: 12.5px; font-weight: 700; white-space: nowrap; }
  .words small { font-size: 11px; color: rgb(255 255 255 / 0.62); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .group { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 999px; background: rgb(255 255 255 / 0.08); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08); }
  .round { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: #fff; cursor: pointer; transition: background 0.15s ease, transform 0.15s ease; }
  .round:hover:not(:disabled) { background: rgb(255 255 255 / 0.16); }
  .round:active:not(:disabled) { transform: scale(0.94); }
  .round:disabled { color: rgb(255 255 255 / 0.3); cursor: default; }
  .pill { height: 34px; padding: 0 14px; border: 0; border-radius: 999px; background: rgb(255 255 255 / 0.1); color: #fff; font: inherit; font-size: 12.5px; font-weight: 650; white-space: nowrap; cursor: pointer; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1); transition: background 0.15s ease, transform 0.15s ease; }
  .pill:hover:not(:disabled) { background: rgb(255 255 255 / 0.18); }
  .pill:active:not(:disabled) { transform: scale(0.97); }
  .pill:disabled { opacity: 0.45; cursor: default; }
  .live-btn { background: linear-gradient(180deg, #ff3c3c, #e01010); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.25), 0 6px 18px rgb(255 30 30 / 0.35); font-weight: 750; letter-spacing: 0.01em; }
  .live-btn:hover:not(:disabled) { background: linear-gradient(180deg, #ff5050, #f01818); }
  .loop { position: relative; padding-right: 6px; }
  .loop.running { background: rgb(255 255 255 / 0.14); }
  .play { background: rgb(255 255 255 / 0.1); }
  .pace select { height: 26px; padding: 0 26px 0 10px; border: 0; border-radius: 999px; background: transparent; color: #fff; font: inherit; font-size: 12px; font-weight: 650; appearance: none; -webkit-appearance: none; background-image: linear-gradient(45deg, transparent 50%, rgb(255 255 255 / 0.7) 50%), linear-gradient(135deg, rgb(255 255 255 / 0.7) 50%, transparent 50%); background-position: right 13px top 11px, right 9px top 11px; background-size: 4px 4px, 4px 4px; background-repeat: no-repeat; cursor: pointer; }
  .pace select option { color: #111; }
  .ring { position: absolute; left: 4px; right: 4px; bottom: -3px; height: 2px; border-radius: 2px; background: rgb(255 255 255 / 0.14); overflow: hidden; }
  .ring::after { content: ""; position: absolute; inset: 0; width: calc(var(--p) * 100%); background: #ff6a3d; }
  .off:not(:disabled) { color: #ff8a8a; }
  .fold { color: rgb(255 255 255 / 0.6); }
  :is(.round, .pill, .grip, .state.small):focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .dot.on { animation: none; } }
</style>
