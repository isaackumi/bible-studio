<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "../../ui/motion";
  import { session } from "../../app/session.svelte";
  import { placeCard, TOURS, type Rect } from "../../tour/steps";
  import { t } from "../../i18n/core";

  // "Where is…?": a pointer flies to the part of the screen asked for, a ring marks it, and a card
  // says what it is for. Unlike the tour nothing dims and every click still works, since the
  // operator may be live; it goes by itself after a while, or with Esc or Got it.
  const place = $derived(session.where ? { tour: session.where.tour, step: TOURS[session.where.tour].steps[session.where.at] } : null);
  let rect = $state<Rect | null>(null);
  let card: HTMLDivElement | undefined = $state();
  let cardSize = $state({ width: 320, height: 140 });
  let view = $state({ width: 1280, height: 800 });
  /** The pointer has landed (it starts at the bottom of the window and flies in). */
  let landed = $state(false);
  const PAD = 6;
  const STAY_MS = 9000;

  function find(): Element | null {
    for (const selector of place?.step?.target ?? []) {
      const element = document.querySelector(selector);
      const box = element?.getBoundingClientRect();
      if (element && box && box.width > 0 && box.height > 0) return element;
    }
    return null;
  }

  function measure(): boolean {
    view = { width: window.innerWidth, height: window.innerHeight };
    const element = find();
    if (card) cardSize = { width: card.offsetWidth, height: card.offsetHeight };
    if (!element) return false;
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    const box = element.getBoundingClientRect();
    rect = { left: box.left - PAD, top: box.top - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
    return true;
  }

  onMount(() => {
    // The page may still be painting: look for the place for a moment before giving up on it.
    let tries = 0;
    const look = setInterval(() => {
      tries += 1;
      if (measure()) {
        clearInterval(look);
        requestAnimationFrame(() => (landed = true));
      } else if (tries > 8) {
        clearInterval(look);
        const where = session.where;
        session.endWhere();
        if (where) session.notify(t("That is not showing right now."), { actions: [{ label: t("Take the tour"), run: () => void session.startTour(where.tour, where.at) }] });
      }
    }, 150);
    const follow = setInterval(() => landed && measure(), 400);
    const leave = setTimeout(() => session.endWhere(), STAY_MS);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(look);
      clearInterval(follow);
      clearTimeout(leave);
      window.removeEventListener("resize", measure);
    };
  });

  const spot = $derived(placeCard(rect, cardSize, view));
  /** Where the pointer's tip sits: the middle of the place's lower edge. */
  const tip = $derived(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height } : { x: view.width / 2, y: view.height });

  function onKey(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    session.endWhere();
  }
</script>

<svelte:window onkeydowncapture={onKey} />

{#if place?.step}
  <div class="where" transition:fade={{ duration: 140 }}>
    {#if rect}
      <div class="ring" class:landed style:left="{rect.left}px" style:top="{rect.top}px" style:width="{rect.width}px" style:height="{rect.height}px"></div>
      <svg class="pointer" class:landed style:left="{landed ? tip.x : view.width / 2}px" style:top="{landed ? tip.y : view.height + 40}px" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <path d="M4 2 L4 22 L9.5 16.5 L13.5 25 L17 23.4 L13 15 L21 15 Z" />
      </svg>
    {/if}
    <div class="card" bind:this={card} role="status" aria-live="polite" style:left="{spot.left}px" style:top="{spot.top}px">
      <h2>{t(place.step.title)}</h2>
      <p>{t(place.step.body)}</p>
      <div class="bar">
        <button type="button" class="ghost" onclick={() => { const where = session.where; session.endWhere(); if (where) void session.startTour(where.tour, where.at); }}>{t("Show me more")}</button>
        <button type="button" class="ok" onclick={() => session.endWhere()}>{t("Got it")}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Nothing here catches clicks but the card: the desk keeps working underneath. */
  .where { position: fixed; inset: 0; z-index: 79; pointer-events: none; font-family: var(--font-ui); }
  .ring {
    position: absolute;
    border-radius: 12px;
    box-shadow: 0 0 0 2px var(--accent), 0 0 24px color-mix(in srgb, var(--accent) 50%, transparent);
    opacity: 0;
    transition: opacity 200ms 380ms;
  }
  .ring.landed { opacity: 1; animation: pulse 1.4s 600ms ease-in-out 3; }
  @keyframes pulse {
    50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 30px color-mix(in srgb, var(--accent) 50%, transparent); }
  }
  .pointer { position: absolute; margin: -2px 0 0 -4px; fill: var(--accent); stroke: var(--panel); stroke-width: 1.5; filter: drop-shadow(0 3px 6px rgb(0 0 0 / 0.4)); transition: left 520ms cubic-bezier(0.2, 0.8, 0.2, 1), top 520ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  .card {
    position: absolute;
    width: min(320px, calc(100vw - 24px));
    padding: 14px 16px 12px;
    border: 1px solid color-mix(in srgb, var(--ink) 14%, var(--line));
    border-radius: 14px;
    background: var(--panel);
    color: var(--ink);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.4);
    pointer-events: auto;
  }
  h2 { margin: 0 0 4px; font-size: 15px; font-weight: 750; }
  p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); }
  .bar { display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px; }
  .bar button { height: 30px; padding: 0 12px; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
  .ghost { border: 0; background: none; color: var(--muted); }
  .ghost:hover { color: var(--ink); }
  .ok { border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); }
  .bar button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    .pointer { transition: none; }
    .ring, .ring.landed { transition: none; animation: none; }
  }
</style>
