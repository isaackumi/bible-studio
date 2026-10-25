<script lang="ts">
  import RichView from "./RichView.svelte";
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
      {#if paint.rich}<div class="ann-body ann-rich"><RichView doc={paint.rich} base="1em" /></div>{:else}{#each paint.body as line, n (n)}<p class="ann-body">{line}</p>{/each}{/if}
    </div>
  {:else if paint.design === "ticket"}
    <div class="ticket">
      <div class="ticket-main">
        {#if paint.label}<span class="ann-label">{paint.label}</span>{/if}
        <h2 class="ann-heading">{paint.heading}</h2>
      </div>
      {#if paint.body.length || paint.rich}
        <div class="ticket-stub">{#if paint.rich}<div class="ann-body ann-rich"><RichView doc={paint.rich} base="1em" /></div>{:else}{#each paint.body as line, n (n)}<p class="ann-body">{line}</p>{/each}{/if}</div>
      {/if}
    </div>
  {:else if paint.design === "banner"}
    <div class="banner-band">
      {#if paint.label}<span class="ann-label">{paint.label}</span>{/if}
      <h2 class="ann-heading">{paint.heading}</h2>
    </div>
    {#if paint.body.length}
      <div class="banner-body">{#if paint.rich}<div class="ann-body ann-rich"><RichView doc={paint.rich} base="1em" /></div>{:else}{#each paint.body as line, n (n)}<p class="ann-body">{line}</p>{/each}{/if}</div>
    {/if}
  {:else}
    <div class="ann-box">
      {#if paint.label}<span class="ann-label">{paint.label}</span>{/if}
      <h2 class="ann-heading">{paint.heading}</h2>
      {#if paint.design === "classic" && paint.body.length}<span class="ann-rule" aria-hidden="true"></span>{/if}
      {#if paint.design === "bulletin"}
        {#if paint.rich}<div class="ann-body ann-rich"><RichView doc={paint.rich} base="1em" /></div>{:else}<ul class="ann-list">{#each paint.body as line, n (n)}<li class="ann-body">{line}</li>{/each}</ul>{/if}
      {:else}
        {#if paint.rich}<div class="ann-body ann-rich"><RichView doc={paint.rich} base="1em" /></div>{:else}{#each paint.body as line, n (n)}<p class="ann-body">{line}</p>{/each}{/if}
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
    color: var(--accent-text);
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
    align-items: center;
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

  /* Spotlight: left aligned, a thick accent bar beside a big heading. */
  .ann-spotlight { align-items: flex-start; padding: 0 10cqw; }
  .ann-spotlight .ann-box { max-width: 78cqw; padding-left: 5cqmin; border-left: 1.6cqmin solid var(--accent); }
  .ann-spotlight .ann-label { text-transform: uppercase; letter-spacing: 0.14em; }
  .ann-spotlight .ann-heading { font-size: calc(12.5cqmin * var(--k)); line-height: 1.02; }

  /* Poster: a wash of the colour over the background, a huge centred heading, details under a rule. */
  .ann-poster { background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 55%, transparent), color-mix(in srgb, var(--accent) 12%, transparent) 70%); }
  .ann-poster .ann-box { max-width: 86cqw; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .ann-poster .ann-label { padding: 0.8cqmin 2.4cqmin; border: 0.4cqmin solid currentColor; border-radius: 99cqmin; color: inherit; text-transform: uppercase; letter-spacing: 0.18em; font-size: calc(3.6cqmin * var(--k)); margin-bottom: 3cqmin; }
  .ann-poster .ann-heading { font-size: calc(15cqmin * var(--k)); line-height: 0.98; text-transform: uppercase; letter-spacing: -0.02em; }
  .ann-poster .ann-body { margin-top: 2cqmin; }
  .ann-poster .ann-body:first-of-type { padding-top: 3cqmin; border-top: 0.4cqmin solid color-mix(in srgb, currentColor 40%, transparent); }

  /* Ticket: a card in two parts with a perforated edge between them. */
  .ticket { display: flex; align-items: stretch; width: min(86cqw, 150cqh); border-radius: 2.4cqmin; overflow: hidden; box-shadow: 0 2cqmin 6cqmin rgb(0 0 0 / 0.35); color: #fff; }
  .ticket-main { flex: 1.3; display: flex; flex-direction: column; justify-content: center; padding: 6cqmin; background: var(--accent); color: var(--on-accent); min-width: 0; }
  .ticket-main .ann-label { color: inherit; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.12em; }
  .ticket-main .ann-heading { font-size: calc(9.5cqmin * var(--k)); }
  .ticket-stub { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 5cqmin 5.5cqmin; background: color-mix(in srgb, #0c0f16 82%, transparent); border-left: 0.5cqmin dashed color-mix(in srgb, #fff 45%, transparent); min-width: 0; }
  .ticket-stub .ann-body { font-size: calc(4.8cqmin * var(--k)); margin-top: 0.8cqmin; }
  .ticket-stub .ann-body:first-child { margin-top: 0; }

  /* Top corner: a compact card at the top left, out of the way of a picture. */
  .ann-corner { justify-content: flex-start; align-items: flex-start; padding: 6cqh 5cqw; }
  .ann-corner .ann-box { max-width: 52cqw; padding: 3.4cqmin 4cqmin; border-radius: 1.6cqmin; background: color-mix(in srgb, #0c0f16 80%, transparent); border-top: 0.8cqmin solid var(--accent); color: #fff; }
  .ann-corner .ann-label { font-size: calc(3.4cqmin * var(--k)); margin-bottom: 0.8cqmin; }
  .ann-corner .ann-heading { font-size: calc(6.6cqmin * var(--k)); }
  .ann-corner .ann-body { font-size: calc(4cqmin * var(--k)); margin-top: 0.5cqmin; }
</style>
