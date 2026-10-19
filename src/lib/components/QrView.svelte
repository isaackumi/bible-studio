<script lang="ts">
  import QRCode from "qrcode";
  import { t } from "../i18n/core";

  // A crisp, scalable QR code drawn as SVG from the code's modules (no image file).
  let { qr }: { qr: { data: string; style: "square" | "rounded" | "dots"; dark: string; light: string; caption: string } } = $props();

  const code = $derived.by(() => {
    try {
      const made = QRCode.create(qr.data, { errorCorrectionLevel: "M" });
      const size = made.modules.size;
      const cells: Array<[number, number]> = [];
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (made.modules.get(x, y)) cells.push([x, y]);
      return { size, cells };
    } catch {
      return null;
    }
  });
  const margin = 2;
</script>

<div class="qr-frame">
  {#if code}
    <svg viewBox="{-margin} {-margin} {code.size + margin * 2} {code.size + margin * 2}" shape-rendering={qr.style === "square" ? "crispEdges" : undefined} role="img" aria-label={qr.caption || t("QR code")}>
      <rect x={-margin} y={-margin} width={code.size + margin * 2} height={code.size + margin * 2} rx={qr.style === "square" ? 0 : 2} fill={qr.light} stroke="none" />
      {#each code.cells as [x, y] (`${x},${y}`)}
        {#if qr.style === "dots"}
          <circle cx={x + 0.5} cy={y + 0.5} r="0.45" fill={qr.dark} stroke="none" />
        {:else}
          <rect {x} {y} width="1.02" height="1.02" rx={qr.style === "rounded" ? 0.35 : 0} fill={qr.dark} stroke="none" />
        {/if}
      {/each}
    </svg>
  {/if}
  {#if qr.caption}<p>{qr.caption}</p>{/if}
</div>

<style>
  .qr-frame { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4%; padding: 4%; box-sizing: border-box; }
  /* Desk-wide icon rules give every svg a stroke; a QR code must never inherit it. */
  svg, svg * { stroke: none !important; }
  svg { flex: 1 1 auto; min-height: 0; max-width: 100%; aspect-ratio: 1; }
  p { margin: 0; font-weight: 600; font-size: clamp(14px, 6cqmin, 64px); text-align: center; }
  .qr-frame { container-type: size; }
</style>
