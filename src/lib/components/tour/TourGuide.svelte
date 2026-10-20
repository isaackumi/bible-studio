<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { session } from "../../app/session.svelte";
  import { placeCard, TOURS, type Rect, type TourStep } from "../../tour/steps";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";

  // A spotlight walk through the screen: the room dims, one part lights up, and a card says
  // what it is for. Steps whose target is not on screen are skipped.
  const tour = $derived(session.tour ? TOURS[session.tour] : null);
  let index = $state(0);
  let rect = $state<Rect | null>(null);
  let card: HTMLDivElement | undefined = $state();
  let cardSize = $state({ width: 340, height: 180 });
  let view = $state({ width: 1280, height: 800 });
  const PAD = 8;

  function find(step: TourStep): Element | null {
    for (const selector of step.target ?? []) {
      const element = document.querySelector(selector);
      if (element) {
        const box = element.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) return element;
      }
    }
    return null;
  }

  /** Steps that can be shown right now: centered cards, and targets that are on screen. */
  const entries = $derived.by(() => {
    void session.tour;
    return (tour?.steps ?? []).map((step, at) => ({ step, at })).filter(({ step }) => !step.target || find(step));
  });
  const steps = $derived(entries.map((entry) => entry.step));
  const step = $derived(steps[Math.min(index, steps.length - 1)] ?? null);
  /** This step's place in the tour's full list (what progress is saved against). */
  const at = $derived(entries[Math.min(index, entries.length - 1)]?.at ?? 0);

  $effect(() => {
    const id = session.tour;
    const place = at;
    if (id && step) untrack(() => session.noteTourStep(id, place));
  });

  function measure() {
    view = { width: window.innerWidth, height: window.innerHeight };
    const element = step ? find(step) : null;
    if (!element) {
      rect = null;
    } else {
      const box = element.getBoundingClientRect();
      rect = { left: box.left - PAD, top: box.top - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
    }
    if (card) cardSize = { width: card.offsetWidth, height: card.offsetHeight };
  }

  $effect(() => {
    void step;
    requestAnimationFrame(measure);
  });

  onMount(() => {
    // Start at the chosen step, or the next one on screen after it.
    const from = entries.findIndex((entry) => entry.at >= session.tourFrom);
    index = from < 0 ? 0 : from;
    // Panels can move (resizing, a menu closing): keep the spotlight on its target.
    const timer = setInterval(measure, 400);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  });

  const spot = $derived(rect ? placeCard(rect, cardSize, view) : placeCard(null, cardSize, view));

  function go(delta: number) {
    const next = index + delta;
    if (next < 0) return;
    if (next >= steps.length) {
      if (session.tour) session.noteTourStep(session.tour, (tour?.steps.length ?? 1) - 1, true);
      return close();
    }
    index = next;
  }

  function close() {
    session.endTour();
  }

  function onKey(event: KeyboardEvent) {
    // While the tour is open no desk shortcut runs (Space would otherwise go live).
    if (event.key === "Tab" || event.metaKey || event.ctrlKey) return;
    // Enter or Space on one of the tour's own buttons (Skip, All tours) presses that button; it
    // still never reaches the desk, where Space would go live.
    const target = event.target instanceof HTMLElement ? event.target : null;
    if ((event.key === " " || event.key === "Enter") && target?.closest(".card button")) {
      event.stopPropagation();
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      go(1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      go(-1);
    } else {
      event.stopPropagation();
    }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

{#if tour && step}
  <div class="tour" transition:fade={{ duration: 160 }} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
    <!-- Clicks on the dimmed room are caught so nothing changes by accident during the tour. -->
    <button type="button" class="catch" aria-label={t("End tour")} tabindex="-1" onclick={close}></button>
    {#if rect}
      <div class="spot" style:left="{rect.left}px" style:top="{rect.top}px" style:width="{rect.width}px" style:height="{rect.height}px"></div>
    {:else}
      <div class="dim"></div>
    {/if}
    <div class="card" bind:this={card} style:left="{spot.left}px" style:top="{spot.top}px">
      <p class="count">{t("{name} tour · {index} of {length}", { name: t(tour.name), index: index + 1, length: steps.length })}
        <button type="button" class="all-tours" onclick={() => { close(); session.tourHubOpen = true; }}>{t("All tours")}</button>
      </p>
      <h2 id="tour-title">{t(step.title)}</h2>
      <p id="tour-body" class="body">{t(step.body)}</p>
      <div class="bar">
        <div class="dots" aria-hidden="true">
          {#each steps as _, n (n)}<i class:on={n === index} class:done={n < index}></i>{/each}
        </div>
        <button type="button" class="ghost" onclick={close}>{index === steps.length - 1 ? t("Close") : t("Skip")}</button>
        {#if index > 0}<button type="button" class="ghost" onclick={() => go(-1)} aria-label={t("Previous step")}><Icon name="chevron-left" size={16} /></button>{/if}
        <button type="button" class="next" onclick={() => go(1)}>{index === steps.length - 1 ? t("Done") : t("Next")}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tour { position: fixed; inset: 0; z-index: 80; font-family: var(--font-ui); }
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
  .count { display: flex; align-items: center; margin: 0 0 6px; font-size: 11px; font-weight: 650; color: var(--accent); }
  .all-tours { margin-left: auto; padding: 0; border: 0; background: none; color: var(--muted); font: inherit; font-size: 11px; font-weight: 650; text-transform: none; letter-spacing: normal; cursor: pointer; }
  .all-tours:hover { color: var(--ink); }
  h2 { margin: 0 0 6px; font-size: 17px; font-weight: 750; letter-spacing: -0.01em; }
  .body { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--muted); }
  .bar { display: flex; align-items: center; gap: 6px; margin-top: 14px; }
  .dots { display: flex; gap: 4px; margin-right: auto; }
  .dots i { width: 6px; height: 6px; border-radius: 50%; background: color-mix(in srgb, var(--ink) 18%, transparent); }
  .dots i.done { background: color-mix(in srgb, var(--accent) 50%, transparent); }
  .dots i.on { width: 16px; border-radius: 6px; background: var(--accent); }
  .bar button { display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 12px; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; text-transform: none; letter-spacing: normal; }
  .ghost { border: 0; background: none; color: var(--muted); }
  .ghost:hover { color: var(--ink); }
  .next { min-width: 72px; border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); }
  .bar button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    .spot, .card { transition: none; }
  }
</style>
