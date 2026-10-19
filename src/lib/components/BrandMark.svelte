<script lang="ts">
  // The Church Studio mark: four screens of a multiview, the gaps between them a Latin cross, the
  // top-right screen live. Masters and usage rules: docs/brand. Below 32 px it uses the small cut
  // (wider gaps), so the cross stays open. `boot` lights the screens one by one while loading.
  let {
    size = 32,
    tone = "light",
    boot = false,
    label = "Church Studio",
  }: { size?: number; tone?: "light" | "dark" | "current"; boot?: boolean; label?: string } = $props();

  type Pane = [number, number, number, number, number, number, number, number];
  const LARGE: Pane[] = [
    [32, 32, 116, 88, 20, 8, 8, 8],
    [140, 32, 224, 88, 8, 20, 8, 8],
    [32, 112, 116, 224, 8, 8, 8, 20],
    [140, 112, 224, 224, 8, 8, 20, 8],
  ];
  const SMALL: Pane[] = [
    [28, 28, 112, 84, 24, 10, 10, 10],
    [144, 28, 228, 84, 10, 24, 10, 10],
    [28, 116, 112, 228, 10, 10, 10, 24],
    [144, 116, 228, 228, 10, 10, 24, 10],
  ];
  function path([x0, y0, x1, y1, tl, tr, br, bl]: Pane): string {
    return `M${x0 + tl} ${y0}H${x1 - tr}A${tr} ${tr} 0 0 1 ${x1} ${y0 + tr}V${y1 - br}A${br} ${br} 0 0 1 ${x1 - br} ${y1}H${x0 + bl}A${bl} ${bl} 0 0 1 ${x0} ${y1 - bl}V${y0 + tl}A${tl} ${tl} 0 0 1 ${x0 + tl} ${y0}Z`;
  }
  const panes = $derived((size < 32 ? SMALL : LARGE).map(path));
  const ink = $derived(tone === "light" ? "#f5f5f5" : tone === "dark" ? "#111010" : "currentColor");
</script>

<svg class="brand-mark" class:boot viewBox="0 0 256 256" width={size} height={size} role="img" aria-label={label}>
  {#each panes as d, i (i)}
    <path {d} fill={i === 1 ? "var(--brand-live, #fa4f00)" : ink} style:--i={[0, 3, 1, 2][i]} />
  {/each}
</svg>

<style>
  .brand-mark { display: block; flex: none; }
  /* Loading: the screens come on one after another, the live one last. */
  .boot path { animation: pane 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: calc(var(--i) * 140ms); }
  @keyframes pane {
    0%, 100% { opacity: 1; }
    35% { opacity: 0.28; }
    60% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .boot path { animation: none; }
  }
</style>
