<script lang="ts">
  import type { Snippet } from "svelte";

  // The welcome scene: a dark sanctuary, a projection screen, and the projector's beam rising
  // from the console below. Whatever is on `screen` is what the room would see.
  let {
    lit = true,
    ground = "#0b0f19",
    ink = "#f3ecdd",
    screen,
    console: consolePanel,
  }: { lit?: boolean; ground?: string; ink?: string; screen: Snippet; console?: Snippet } = $props();
</script>

<div class="sanctuary" class:lit>
  <div class="room" aria-hidden="true"></div>
  <div class="sc-stage">
    <div class="screen-frame">
      <div class="screen" style:--ground={ground} style:--ink={ink}>
        <div class="glow" aria-hidden="true"></div>
        <div class="projection">{@render screen()}</div>
      </div>
    </div>
    <div class="beam" aria-hidden="true"></div>
    <span class="lens" aria-hidden="true"></span>
  </div>
  {#if consolePanel}
    <div class="console">{@render consolePanel()}</div>
  {/if}
</div>

<style>
  .sanctuary {
    --night: #0d1321;
    --console: #151c2c;
    --gold: #f4c470;
    --parchment: #f3ecdd;
    --slate: #8c95a8;
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    background: var(--night);
    color: var(--parchment);
    font-family: "Figtree Variable", "Figtree", var(--font-ui);
    overflow: hidden;
  }
  /* The room: a faint vaulted shape and floor, lit only by what the projector throws. */
  .room {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 70% 55% at 50% 38%, rgba(244, 196, 112, 0.09), transparent 70%),
      radial-gradient(ellipse 120% 60% at 50% 120%, rgba(36, 48, 78, 0.7), transparent 60%),
      linear-gradient(180deg, #0a0f1b 0%, var(--night) 55%, #0f1626 100%);
    opacity: 0.35;
    transition: opacity 1600ms ease;
  }
  .lit .room { opacity: 1; }

  .sc-stage {
    /* Screen width; the beam and lens are placed from it. */
    --w: min(880px, 82vw, calc((100vh - 360px) * 16 / 9));
    --pad: clamp(24px, 6vh, 72px);
    position: relative;
    display: grid;
    place-items: center;
    padding: var(--pad) 24px 0;
    min-height: 0;
  }
  .screen-frame {
    position: relative;
    z-index: 2;
    width: var(--w);
    min-width: 280px;
    min-height: 0;
    aspect-ratio: 16 / 9;
    padding: 6px;
    border-radius: 6px;
    background: linear-gradient(180deg, #1c2335, #121827);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  }
  .screen {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 3px;
    background: var(--ground);
    color: var(--ink);
    filter: brightness(0.25);
    transition: filter 1800ms cubic-bezier(0.2, 0.7, 0.2, 1), background 500ms ease, color 500ms ease;
    container-type: inline-size;
  }
  .lit .screen { filter: brightness(1); }
  /* Hotspot where the beam lands: brighter in the middle, like a real projector. */
  .glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 60% 70% at 50% 60%, rgba(255, 236, 196, 0.12), transparent 70%);
    pointer-events: none;
  }
  .projection { position: relative; display: grid; place-items: center; width: 100%; height: 100%; padding: 6cqw 8cqw; text-align: center; overflow: hidden; }

  /* The beam: a wedge of light from the projector lens on the console up to the screen's bottom edge. */
  .beam {
    position: absolute;
    z-index: 1;
    left: 50%;
    width: calc(var(--w) * 0.96);
    top: calc(var(--pad) + (100% - var(--pad)) / 2 + var(--w) * 9 / 32 - 4px);
    bottom: 0;
    transform: translateX(-50%);
    clip-path: polygon(0 0, 100% 0, 50.6% 100%, 49.4% 100%);
    background:
      linear-gradient(0deg, rgba(255, 233, 190, 0.5), rgba(244, 196, 112, 0.16) 55%, rgba(244, 196, 112, 0.06)),
      radial-gradient(ellipse 30% 100% at 50% 100%, rgba(255, 240, 210, 0.35), transparent 70%);
    filter: blur(2px);
    opacity: 0;
    transition: opacity 1400ms ease 200ms;
    pointer-events: none;
  }
  .lit .beam { opacity: 1; animation: shimmer 7s ease-in-out infinite 1.6s; }
  @keyframes shimmer {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.8; }
  }
  /* The projector's lens, glowing at the console's edge. */
  .lens {
    position: absolute;
    z-index: 4;
    left: 50%;
    bottom: -5px;
    width: 10px;
    height: 10px;
    transform: translateX(-50%);
    border-radius: 50%;
    background: #fff4dc;
    box-shadow: 0 0 10px 3px rgba(255, 226, 170, 0.9), 0 0 36px 10px rgba(244, 196, 112, 0.45);
    opacity: 0.3;
    transition: opacity 900ms ease;
  }
  .lit .lens { opacity: 1; }

  .console {
    position: relative;
    z-index: 3;
    background: linear-gradient(180deg, rgba(21, 28, 44, 0.88), var(--console));
    border-top: 1px solid rgba(244, 196, 112, 0.18);
    backdrop-filter: blur(8px);
  }

  @media (prefers-reduced-motion: reduce) {
    .room, .screen, .beam, .lens { transition: none; }
    .lit .beam { animation: none; }
  }
</style>
