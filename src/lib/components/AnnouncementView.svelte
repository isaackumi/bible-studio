<script lang="ts">
  import type { AnnouncementPaint } from "../domain/announcement";

  // An announcement in its design. Sizes follow the frame (container units), so it lays out the
  // same on any screen shape; the theme's font size scales the words.
  let { paint, fontSize = 64, align = "center" }: { paint: AnnouncementPaint; fontSize?: number; align?: "left" | "center" | "right" } = $props();
  const k = $derived(Math.max(0.85, Math.min(1.5, fontSize / 64)));
</script>

<div
  class="ann ann-{paint.design}"
  style:--accent={paint.accent}
  style:--on-accent={paint.onAccent}
  style:--k={k}
  style:--align={paint.design === "classic" || paint.design === "banner" ? align : "left"}
>
  {#if paint.design === "split"}
    <div class="split-side"><span class="split-label">{paint.label}</span></div>
    <div class="split-main">
      <h2 class="ann-heading">{paint.heading}</h2>
      {#each paint.body as line, n (n)}<p class="ann-body">{line}</p>{/each}
    </div>
  {:else if paint.design === "banner"}
    <div class="banner-band">
      {#if paint.label}<span class="ann-label">{paint.label}</span>{/if}
      <h2 class="ann-heading">{paint.heading}</h2>
    </div>
    {#if paint.body.length}
      <div class="banner-body">{#each paint.body as line, n (n)}<p class="ann-body">{line}</p>{/each}</div>
    {/if}
  {:else}
    <div class="ann-box">
      {#if paint.label}<span class="ann-label">{paint.label}</span>{/if}
      <h2 class="ann-heading">{paint.heading}</h2>
      {#if paint.design === "classic" && paint.body.length}<span class="ann-rule" aria-hidden="true"></span>{/if}
      {#if paint.design === "bulletin"}
        <ul class="ann-list">{#each paint.body as line, n (n)}<li class="ann-body">{line}</li>{/each}</ul>
      {:else}
        {#each paint.body as line, n (n)}<p class="ann-body">{line}</p>{/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .ann {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: var(--align);
    z-index: 1;
  }
  .ann * { margin: 0; }
  .ann-label {
    display: inline-block;
    color: var(--accent);
    font-size: calc(4.4cqmin * var(--k));
    font-weight: 650;
    letter-spacing: 0.06em;
    margin-bottom: 1.6cqmin;
  }
  .ann-heading {
    font-size: calc(11cqmin * var(--k));
    font-weight: 700;
    line-height: 1.08;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  .ann-body {
    font-size: calc(5.6cqmin * var(--k));
    line-height: 1.35;
    opacity: 0.92;
    margin-top: 1.2cqmin;
  }

  /* Centered: words alone, a short accent rule between heading and details. */
  .ann-classic .ann-box { max-width: 84cqw; display: flex; flex-direction: column; align-items: center; }
  .ann-rule { display: block; width: 10cqmin; height: 0.7cqmin; border-radius: 1cqmin; background: var(--accent); margin: 3cqmin auto 1.6cqmin; }

  /* Card: a panel in the middle with an accent edge on top. */
  .ann-card .ann-box {
    width: min(82cqw, 130cqh);
    padding: 6cqmin 7cqmin;
    border-radius: 2.4cqmin;
    background: color-mix(in srgb, #0c0f16 62%, transparent);
    backdrop-filter: blur(1.2cqmin);
    border-top: 1cqmin solid var(--accent);
    box-shadow: 0 2cqmin 6cqmin rgb(0 0 0 / 0.35);
    color: #fff;
  }
  .ann-card .ann-heading { font-size: calc(10cqmin * var(--k)); }

  /* Banner: the heading across a band of the accent colour, details beneath. */
  .ann-banner .banner-band {
    width: 100%;
    background: var(--accent);
    color: var(--on-accent);
    padding: 5cqmin 8cqw;
  }
  .ann-banner .ann-label { color: inherit; opacity: 0.8; }
  .ann-banner .banner-body { padding: 3cqmin 8cqw 0; width: 100%; }

  /* Split: the small line large in an accent panel, the words beside it. */
  .ann-split { flex-direction: row; align-items: stretch; }
  .split-side {
    flex: 0 0 34%;
    background: var(--accent);
    color: var(--on-accent);
    display: flex;
    align-items: flex-end;
    padding: 7cqmin 5cqmin;
  }
  .split-label { font-size: calc(8cqmin * var(--k)); font-weight: 700; line-height: 1.05; overflow-wrap: anywhere; }
  .split-main { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 6cqmin 7cqmin; min-width: 0; }

  /* Bulletin: left aligned, an accent line under the heading, details as a list. */
  .ann-bulletin { align-items: stretch; padding: 0 9cqw; }
  .ann-bulletin .ann-heading { padding-bottom: 2.4cqmin; border-bottom: 0.5cqmin solid var(--accent); margin-bottom: 1.6cqmin; }
  .ann-list { list-style: none; padding: 0; }
  .ann-list li { position: relative; padding-left: 4cqmin; }
  .ann-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.55em;
    width: 1.4cqmin;
    height: 1.4cqmin;
    border-radius: 50%;
    background: var(--accent);
  }

  /* Lower bar: along the bottom, so a picture behind stays in view. */
  .ann-lower { justify-content: flex-end; padding: 0 5cqw 6cqh; }
  .ann-lower .ann-box {
    width: 100%;
    padding: 3.4cqmin 4.4cqmin;
    border-radius: 1.4cqmin;
    background: color-mix(in srgb, #0c0f16 78%, transparent);
    border-left: 1cqmin solid var(--accent);
    color: #fff;
  }
  .ann-lower .ann-label { background: var(--accent); color: var(--on-accent); padding: 0.5cqmin 1.6cqmin; border-radius: 0.8cqmin; margin-bottom: 1.2cqmin; }
  .ann-lower .ann-heading { font-size: calc(7.6cqmin * var(--k)); }
  .ann-lower .ann-body { font-size: calc(4.6cqmin * var(--k)); margin-top: 0.6cqmin; }
  .ann-lower .ann-label { font-size: calc(3.6cqmin * var(--k)); }
</style>
