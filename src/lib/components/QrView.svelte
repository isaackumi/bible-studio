<script lang="ts">
  import QRCode from "qrcode";
  import { t } from "../i18n/core";
  import type { PresentationModel } from "../domain/types";

  // A crisp, scalable QR code drawn as SVG from the code's modules (no image file).
  let { qr }: { qr: NonNullable<PresentationModel["qr"]> } = $props();

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
<div class="qr-inner" class:with-code={!!qr.code}>
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
  {#if qr.code}
    <!-- For the back rows: the same room by typing a short code, one character to a box. -->
    <div class="join">
      {#if qr.caption}<p class="lead">{qr.caption}</p>{/if}
      <p class="or">{t("or go to")} <b>{qr.code.at}</b> {t("and enter")}</p>
      <div class="boxes" role="img" aria-label={qr.code.value.split("").join(" ")}>
        {#each qr.code.value.split("") as char, index (index)}<span>{char}</span>{/each}
      </div>
    </div>
  {:else if qr.caption}<p>{qr.caption}</p>{/if}
</div>
</div>

<style>
  .qr-frame { width: 100%; height: 100%; box-sizing: border-box; }
  .qr-inner { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4%; padding: 4%; box-sizing: border-box; }
  /* Desk-wide icon rules give every svg a stroke; a QR code must never inherit it. */
  svg, svg * { stroke: none !important; }
  svg { flex: 1 1 auto; min-height: 0; max-width: 100%; aspect-ratio: 1; }
  p { margin: 0; font-weight: 600; font-size: clamp(14px, 6cqmin, 64px); text-align: center; }
  .qr-frame { container-type: size; }
  /* With a code: side by side on a wide screen, stacked on a tall one. */
  .with-code { gap: 3cqmin; }
  .with-code svg { flex: 0 1 auto; width: min(100%, 52cqh); }
  @container (min-aspect-ratio: 5/4) {
    .with-code { flex-direction: row; gap: 6cqw; padding: 6cqh 7cqw; }
    .with-code svg { width: auto; height: min(100%, 44cqw); flex: none; }
    .with-code .join { align-items: flex-start; text-align: left; }
  }
  .join { display: flex; flex-direction: column; align-items: center; gap: 2.4cqmin; min-width: 0; text-align: center; }
  .join p { margin: 0; }
  .lead { font-size: clamp(16px, 7cqmin, 80px); font-weight: 750; line-height: 1.1; }
  .or { font-size: clamp(12px, 4.2cqmin, 44px); font-weight: 500; opacity: 0.85; }
  .or b { font-weight: 750; opacity: 1; white-space: nowrap; }
  .boxes { display: flex; gap: 1.6cqmin; margin-top: 1cqmin; }
  .boxes span {
    display: grid;
    place-items: center;
    width: 1.15em;
    height: 1.4em;
    font-size: clamp(20px, 9cqmin, 120px);
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    border: 0.06em solid color-mix(in srgb, currentColor 45%, transparent);
    border-radius: 0.18em;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
</style>
