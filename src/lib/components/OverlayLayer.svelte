<script lang="ts">
  import InlineRich from "./InlineRich.svelte";
  import type { RichDoc } from "../domain/rich-text";
  import type { PaintedOverlay } from "../domain/screen-overlays";
  import { formatCountdown } from "../domain/timer";

  // Overlays painted over Program, in frame pixels (1080 tall), so they scale with every screen.
  let { overlays, still = false }: { overlays: PaintedOverlay[]; still?: boolean } = $props();

  let now = $state(new Date());
  const hasClock = $derived(overlays.some((overlay) => overlay.kind === "clock" || overlay.kind === "countdown"));
  $effect(() => {
    if (!hasClock || still) return;
    const timer = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(timer);
  });
  const time = $derived(now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));

  /** Time left as 00:12:04; it stops at 00:00:00 and flashes there. */
  function left(endsAt: number): { text: string; over: boolean; short: boolean } {
    const ms = endsAt - now.getTime();
    return { text: formatCountdown(ms), over: ms <= 0, short: ms > 0 && ms <= 5 * 60_000 };
  }
  const SPEED: Record<1 | 2 | 3, number> = { 1: 40, 2: 26, 3: 16 };
  // Corner overlays move clear of a ticker or banner on the same edge.
  const barTop = $derived(overlays.some((overlay) => (overlay.kind === "ticker" || overlay.kind === "banner") && overlay.edge === "top"));
  const barBottom = $derived(overlays.some((overlay) => (overlay.kind === "ticker" || overlay.kind === "banner") && overlay.edge === "bottom"));
</script>

{#snippet words(text: string, rich: RichDoc | undefined)}{#if rich}<InlineRich doc={rich} />{:else}{text}{/if}{/snippet}

<div class="overlay-layer" class:bar-top={barTop} class:bar-bottom={barBottom} aria-hidden="true">
  {#each overlays as overlay (overlay.id)}
    {#if overlay.kind === "logo"}
      <div class="ov-corner {overlay.corner}">
        {#if overlay.imageUrl}<img class="ov-logo-img" src={overlay.imageUrl} alt="" />
        {:else}<span class="ov-logo-text">{@render words(overlay.text, overlay.rich)}</span>{/if}
      </div>
    {:else if overlay.kind === "clock"}
      <div class="ov-corner {overlay.corner}"><span class="ov-clock">{time}</span></div>
    {:else if overlay.kind === "badge"}
      <div class="ov-corner {overlay.corner}"><span class="ov-badge" style:background={overlay.color}><i></i>{@render words(overlay.text, overlay.rich)}</span></div>
    {:else if overlay.kind === "ticker"}
      <div class="ov-bar ov-ticker {overlay.edge}" style:--accent-bar={overlay.color}>
        <span class="ov-track" class:still style:--dur="{SPEED[overlay.speed]}s"><span>{@render words(overlay.text, overlay.rich)}</span><span>{@render words(overlay.text, overlay.rich)}</span></span>
      </div>
    {:else if overlay.kind === "banner"}
      <div class="ov-bar ov-banner {overlay.edge}" style:--accent-bar={overlay.color}><span>{@render words(overlay.text, overlay.rich)}</span></div>
    {:else if overlay.kind === "countdown"}
      {#if overlay.endsAt}
        {@const view = left(overlay.endsAt)}
        <div class="ov-count {overlay.spot} size-{overlay.size}" class:over={view.over} class:short={view.short} style:--accent-bar={overlay.color}>
          <span class="ov-count-label">{#if overlay.rich}<InlineRich doc={overlay.rich} />{:else}{overlay.text || overlay.section}{/if}</span>
          <span class="ov-count-time">{view.text}</span>
        </div>
      {/if}
    {:else if overlay.kind === "lower-third"}
      <div class="ov-lower" style:--accent-bar={overlay.color}>
        <strong>{@render words(overlay.text, overlay.rich)}</strong>
        {#if overlay.subtitle || overlay.subtitleRich}<span>{@render words(overlay.subtitle, overlay.subtitleRich)}</span>{/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .overlay-layer { position: absolute; inset: 0; z-index: 8; pointer-events: none; font-family: var(--font-ui, Inter, sans-serif); }
  .ov-corner { position: absolute; display: flex; }
  .ov-corner.top-left { top: 44px; left: 52px; }
  .ov-corner.top-right { top: 44px; right: 52px; }
  .ov-corner.bottom-left { bottom: 44px; left: 52px; }
  .ov-corner.bottom-right { bottom: 44px; right: 52px; }
  .bar-top .ov-corner.top-left, .bar-top .ov-corner.top-right { top: 124px; }
  .bar-bottom .ov-corner.bottom-left, .bar-bottom .ov-corner.bottom-right { bottom: 124px; }
  .bar-bottom .ov-lower { bottom: 200px; }
  .ov-logo-img { max-width: 220px; max-height: 110px; object-fit: contain; opacity: 0.92; filter: drop-shadow(0 4px 18px rgba(0, 0, 0, 0.45)); }
  .ov-logo-text { font-size: 30px; font-weight: 700; color: #fff; opacity: 0.85; text-shadow: 0 2px 14px rgba(0, 0, 0, 0.6); }
  .ov-clock { padding: 10px 20px; border-radius: 12px; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 40px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .ov-badge { display: inline-flex; align-items: center; gap: 12px; padding: 8px 18px; border-radius: 8px; color: #fff; font-size: 28px; font-weight: 800; letter-spacing: 0.08em; }
  .ov-badge i { width: 14px; height: 14px; border-radius: 50%; background: #fff; animation: ov-blink 1.2s steps(1, end) infinite; }
  @keyframes ov-blink { 50% { opacity: 0.25; } }

  .ov-bar { position: absolute; left: 0; right: 0; display: flex; align-items: center; height: 84px; background: rgba(5, 5, 5, 0.86); color: #fff; font-size: 38px; font-weight: 600; overflow: hidden; }
  .ov-bar.top { top: 0; border-bottom: 6px solid var(--accent-bar); }
  .ov-bar.bottom { bottom: 0; border-top: 6px solid var(--accent-bar); }
  .ov-banner { justify-content: center; padding: 0 60px; text-align: center; }
  .ov-banner span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ov-track { display: inline-flex; gap: 160px; padding-left: 100%; white-space: nowrap; animation: ov-scroll var(--dur, 26s) linear infinite; }
  .ov-track.still { animation: none; padding-left: 60px; }
  @keyframes ov-scroll { from { transform: translateX(0); } to { transform: translateX(-100%); } }

  .ov-count { position: absolute; display: grid; justify-items: center; gap: 2px; padding: 0.35em 0.7em 0.4em; border-radius: 0.3em; background: rgba(5, 5, 5, 0.72); border-bottom: 0.12em solid var(--accent-bar); color: #fff; font-size: 56px; line-height: 1; }
  .ov-count.size-s { font-size: 40px; }
  .ov-count.size-l { font-size: 84px; }
  .ov-count.size-xl { font-size: 128px; }
  .ov-count.top-left { top: 44px; left: 52px; }
  .ov-count.top-right { top: 44px; right: 52px; }
  .ov-count.bottom-left { bottom: 44px; left: 52px; }
  .ov-count.bottom-right { bottom: 44px; right: 52px; }
  .ov-count.top { top: 44px; left: 50%; transform: translateX(-50%); }
  .ov-count.bottom { bottom: 44px; left: 50%; transform: translateX(-50%); }
  .ov-count.center { top: 50%; left: 50%; transform: translate(-50%, -50%); }
  .bar-top .ov-count.top, .bar-top .ov-count.top-left, .bar-top .ov-count.top-right { top: 124px; }
  .bar-bottom .ov-count.bottom, .bar-bottom .ov-count.bottom-left, .bar-bottom .ov-count.bottom-right { bottom: 124px; }
  .ov-count-label { font-size: 0.36em; font-weight: 650; opacity: 0.85; white-space: nowrap; max-width: 14em; overflow: hidden; text-overflow: ellipsis; }
  .ov-count-time { font-weight: 750; font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
  .ov-count.short { border-bottom-color: #f5a524; }
  .ov-count.short .ov-count-time { color: #ffd27a; }
  .ov-count.over { border-bottom-color: #e5484d; background: rgba(120, 10, 20, 0.82); }
  .ov-count.over .ov-count-time { animation: ov-done 1s steps(2, jump-none) infinite; }
  @keyframes ov-done { 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) { .ov-count.over .ov-count-time { animation: none; } }

  .ov-lower { position: absolute; left: 96px; bottom: 120px; display: grid; gap: 4px; padding: 22px 40px 24px 34px; border-left: 12px solid var(--accent-bar); border-radius: 6px; background: rgba(5, 5, 5, 0.85); color: #fff; max-width: 60%; }
  .ov-lower strong { font-size: 46px; font-weight: 700; line-height: 1.1; }
  .ov-lower span { font-size: 28px; opacity: 0.8; }

  @media (prefers-reduced-motion: reduce) {
    :global(.app) .ov-track { animation: none; padding-left: 60px; }
  }
</style>
