<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "../../ui/motion";
  import { session } from "../../app/session.svelte";
  import { placeCard, type Rect } from "../../tour/steps";
  import { t } from "../../i18n/core";
  import Icon from "../Icon.svelte";

  // The walk through what changed: one stop per new thing, each on its own desk or page, the room
  // dimmed and that part lit, as the tours do. A stop with nothing to point at is a card.
  const stops = $derived(session.updateTour ?? []);
  let index = $state(0);
  const stop = $derived(stops[index] ?? null);
  let rect = $state<Rect | null>(null);
  let card: HTMLDivElement | undefined = $state();
  let cardSize = $state({ width: 360, height: 180 });
  let view = $state({ width: 1280, height: 800 });
  const PAD = 8;

  function find(target: string): Element | null {
    const element = document.querySelector(target);
    const box = element?.getBoundingClientRect();
    return element && box && box.width > 0 && box.height > 0 ? element : null;
  }

  function measure() {
    view = { width: window.innerWidth, height: window.innerHeight };
    if (card) cardSize = { width: card.offsetWidth, height: card.offsetHeight };
    const element = stop?.highlight.show ? find(stop.highlight.show.target) : null;
    if (!element) {
      rect = null;
      return false;
    }
    const box = element.getBoundingClientRect();
    rect = { left: box.left - PAD, top: box.top - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
    return true;
  }

  /** Open this stop's page, then look for its part for a moment while the page paints. */
  let looking: ReturnType<typeof setInterval> | undefined;
  $effect(() => {
    const show = stop?.highlight.show;
    clearInterval(looking);
    rect = null;
    if (!show) return;
    void session.openPlace(show.tour).then(() => {
      let tries = 0;
      looking = setInterval(() => {
        tries += 1;
        if (measure() || tries > 12) clearInterval(looking);
      }, 150);
    });
  });

  onMount(() => {
    const timer = setInterval(() => rect && measure(), 400);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(timer);
      clearInterval(looking);
      window.removeEventListener("resize", measure);
    };
  });

  const spot = $derived(placeCard(rect, cardSize, view));

  function go(delta: number) {
    const next = index + delta;
    if (next < 0) return;
    if (next >= stops.length) return session.endUpdateTour();
    index = next;
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Tab" || event.metaKey || event.ctrlKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if ((event.key === " " || event.key === "Enter") && target?.closest(".card button")) {
      event.stopPropagation();
      return;
    }
    // Nothing reaches the desk while the walk is open (Space would otherwise go live).
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") session.endUpdateTour();
    else if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") go(1);
    else if (event.key === "ArrowLeft") go(-1);
  }
</script>

<svelte:window onkeydowncapture={onKey} />

{#if stop}
  <div class="walk" transition:fade={{ duration: 160 }} role="dialog" aria-modal="true" aria-labelledby="walk-title" aria-describedby="walk-body">
    <button type="button" class="catch" aria-label={t("Close")} tabindex="-1" onclick={() => session.endUpdateTour()}></button>
    {#if rect}
      <div class="spot" style:left="{rect.left}px" style:top="{rect.top}px" style:width="{rect.width}px" style:height="{rect.height}px"></div>
    {:else}
      <div class="dim"></div>
    {/if}
    <div class="card" bind:this={card} style:left="{spot.left}px" style:top="{spot.top}px">
      <p class="count"><Icon name={stop.highlight.icon} size={14} /> {t("New in {version} · {index} of {length}", { version: stop.version, index: index + 1, length: stops.length })}</p>
      <h2 id="walk-title">{t(stop.highlight.title)}</h2>
      <p id="walk-body" class="body">{t(stop.highlight.text)}</p>
      <div class="bar">
        <button type="button" class="ghost" onclick={() => session.endUpdateTour()}>{index === stops.length - 1 ? t("Close") : t("Skip")}</button>
        {#if index > 0}<button type="button" class="ghost" onclick={() => go(-1)} aria-label={t("Previous")}><Icon name="chevron-left" size={16} /></button>{/if}
        <button type="button" class="next" onclick={() => go(1)}>{index === stops.length - 1 ? t("Done") : t("Next")}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .walk { position: fixed; inset: 0; z-index: 80; font-family: var(--font-ui); }
  .catch { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: default; }
  .dim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.62); pointer-events: none; }
  .spot {
    position: absolute;
    border-radius: 12px;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.62), 0 0 0 2px var(--accent), 0 0 30px color-mix(in srgb, var(--accent) 45%, transparent);
    pointer-events: none;
    transition: left 280ms cubic-bezier(0.2, 0.8, 0.2, 1), top 280ms cubic-bezier(0.2, 0.8, 0.2, 1), width 280ms cubic-bezier(0.2, 0.8, 0.2, 1), height 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .card {
    position: absolute;
    width: min(360px, calc(100vw - 24px));
    padding: 18px 18px 14px;
    border: 1px solid color-mix(in srgb, var(--ink) 14%, var(--line));
    border-radius: 14px;
    background: var(--panel);
    color: var(--ink);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    transition: left 280ms cubic-bezier(0.2, 0.8, 0.2, 1), top 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .count { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; font-size: 11px; font-weight: 650; color: var(--accent-text); }
  h2 { margin: 0 0 6px; font-size: 17px; font-weight: 750; letter-spacing: -0.01em; }
  .body { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--muted); }
  .bar { display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 14px; }
  .bar button { display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 12px; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
  .ghost { margin-right: auto; border: 0; background: none; color: var(--muted); }
  .ghost + .ghost { margin-right: 0; }
  .ghost:hover { color: var(--ink); }
  .next { min-width: 72px; border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); }
  .bar button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    .spot, .card { transition: none; }
  }
</style>
