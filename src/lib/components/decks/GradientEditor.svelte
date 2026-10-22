<script lang="ts">
  import { addStop, fillCss, GRADIENT_PRESETS, mainColor, MOST_STOPS, type Fill, type GradientStop } from "../../domain/fill";
  import { t } from "../../i18n/core";

  // One colour or a gradient, for a shape or a page. The bar shows the colours left to right: click
  // it to add a colour, drag a stop to move it. Dragging previews at once and is one undo step.
  let { fill, onchange, label }: { fill: Fill; onchange: (fill: Fill) => void; label: string } = $props();

  let live = $state<Fill | null>(null);
  const shown = $derived(live ?? fill);
  let picked = $state(0);
  let bar = $state<HTMLDivElement>();

  const stops = $derived(shown.kind === "solid" ? [] : shown.stops);
  const selected = $derived(stops[Math.min(picked, stops.length - 1)]);

  function withStops(next: GradientStop[]): Fill {
    return shown.kind === "solid" ? shown : { ...shown, stops: next };
  }

  function setKind(kind: Fill["kind"]) {
    if (kind === shown.kind) return;
    const base = shown.kind === "solid" ? [{ color: shown.color, at: 0 }, { color: "#000000", at: 100 }] : shown.stops;
    if (kind === "solid") onchange({ kind: "solid", color: mainColor(shown) });
    else if (kind === "linear") onchange({ kind: "linear", angle: shown.kind === "linear" ? shown.angle : 180, stops: base });
    else onchange({ kind: "radial", x: 50, y: 50, stops: base });
  }

  const at = (event: PointerEvent) => {
    const box = bar!.getBoundingClientRect();
    return Math.round(Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100)));
  };

  function addAt(event: PointerEvent) {
    if (event.target !== bar || stops.length >= MOST_STOPS) return;
    const position = at(event);
    const next = addStop(stops, position);
    picked = next.findIndex((stop) => stop.at === position);
    onchange(withStops(next));
  }

  function drag(event: PointerEvent, index: number) {
    event.stopPropagation();
    picked = index;
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const move = (moved: PointerEvent) => {
      const next = stops.map((stop, i) => (i === index ? { ...stop, at: at(moved) } : stop));
      live = withStops(next);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      if (live && live.kind !== "solid") {
        const moved = live.stops[index]!;
        const sorted = [...live.stops].sort((a, b) => a.at - b.at);
        picked = sorted.indexOf(moved);
        onchange({ ...live, stops: sorted });
      }
      live = null;
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  }

  function nudge(event: KeyboardEvent, index: number) {
    const step = event.shiftKey ? 10 : 1;
    const delta = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    if (event.key === "Delete" || event.key === "Backspace") {
      if (stops.length > 2) onchange(withStops(stops.filter((_, i) => i !== index)));
      return;
    }
    if (!delta) return;
    event.preventDefault();
    onchange(withStops(stops.map((stop, i) => (i === index ? { ...stop, at: Math.min(100, Math.max(0, stop.at + delta)) } : stop))));
  }

  const setStop = (patch: Partial<GradientStop>) => onchange(withStops(stops.map((stop, i) => (i === picked ? { ...stop, ...patch } : stop))));
</script>

<div class="gradient" role="group" aria-label={label}>
  <div class="kinds" role="radiogroup" aria-label={t("Paint")}>
    {#each [["solid", t("Colour")], ["linear", t("Straight")], ["radial", t("Round")]] as [kind, name] (kind)}
      <button type="button" role="radio" aria-checked={shown.kind === kind} class:on={shown.kind === kind} onclick={() => setKind(kind as Fill["kind"])}>{name}</button>
    {/each}
  </div>

  {#if shown.kind === "solid"}
    <label class="row">
      <span>{t("Colour")}</span>
      <input type="color" value={shown.color} aria-label={t("Colour")} oninput={(event) => onchange({ kind: "solid", color: event.currentTarget.value })} />
    </label>
  {:else}
    <!-- The colours left to right, whatever the gradient's direction. -->
    <div
      class="bar"
      bind:this={bar}
      style:background={`linear-gradient(90deg, ${stops.map((stop) => `${stop.color} ${stop.at}%`).join(", ")})`}
      onpointerdown={addAt}
      role="presentation"
      title={stops.length < MOST_STOPS ? t("Click to add a colour") : undefined}
    >
      {#each stops as stop, index (index)}
        <button
          type="button"
          class="stop"
          class:on={index === picked}
          style:left="{stop.at}%"
          style:--stop={stop.color}
          aria-label={t("Colour stop at {at}%", { at: stop.at })}
          onpointerdown={(event) => drag(event, index)}
          onkeydown={(event) => nudge(event, index)}
          onfocus={() => (picked = index)}
        ></button>
      {/each}
    </div>
    {#if selected}
      <div class="row">
        <input type="color" value={selected.color} aria-label={t("Stop colour")} oninput={(event) => setStop({ color: event.currentTarget.value })} />
        <input class="field num" type="number" min="0" max="100" value={selected.at} aria-label={t("Stop position")} onchange={(event) => setStop({ at: Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0)) })} />
        <span class="unit">%</span>
        <button type="button" class="quiet" disabled={stops.length <= 2} onclick={() => { onchange(withStops(stops.filter((_, i) => i !== picked))); picked = 0; }}>{t("Remove")}</button>
      </div>
    {/if}
    {#if shown.kind === "linear"}
      {@const angle = shown.angle}
      <label class="row">
        <span class="dial" style:--angle="{angle}deg" aria-hidden="true"><i></i></span>
        <input type="range" min="0" max="360" step="5" value={angle} aria-label={t("Direction")} onchange={(event) => onchange({ ...shown, angle: Number(event.currentTarget.value) })} />
        <span class="unit">{angle}°</span>
      </label>
    {:else}
      {@const centre = shown}
      <div class="row">
        <span>{t("Centre")}</span>
        <input type="range" min="-50" max="150" value={centre.x} aria-label={t("Centre across")} onchange={(event) => onchange({ ...centre, x: Number(event.currentTarget.value) })} />
        <input type="range" min="-50" max="150" value={centre.y} aria-label={t("Centre down")} onchange={(event) => onchange({ ...centre, y: Number(event.currentTarget.value) })} />
      </div>
    {/if}
  {/if}

  <div class="presets" role="group" aria-label={t("Ready-made gradients")}>
    {#each GRADIENT_PRESETS as preset (preset.id)}
      <button type="button" class="preset" style:background={fillCss(preset.fill)} title={preset.name} aria-label={preset.name} onclick={() => onchange(preset.fill)}></button>
    {/each}
  </div>
</div>

<style>
  .gradient { display: grid; gap: 10px; }
  .kinds { display: grid; grid-template-columns: repeat(3, 1fr); padding: 2px; border-radius: 9px; background: color-mix(in srgb, currentColor 7%, transparent); }
  .kinds button { height: 26px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .kinds button.on { background: var(--panel-2, #2a2a30); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.3); }
  .row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
  .row input[type="range"] { flex: 1; min-width: 0; }
  .row input[type="color"] { width: 34px; height: 26px; padding: 0; border: 1px solid var(--line); border-radius: 7px; background: none; }
  .num { width: 52px; }
  .unit { min-width: 28px; font-variant-numeric: tabular-nums; }
  .quiet { margin-left: auto; padding: 4px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
  .quiet:hover:not(:disabled) { color: var(--ink); background: color-mix(in srgb, currentColor 8%, transparent); }
  .quiet:disabled { opacity: 0.4; cursor: default; }
  /* The stop bar: a checkerboard under it shows see-through colours. */
  .bar {
    position: relative;
    height: 26px;
    margin: 4px 7px 8px;
    border-radius: 7px;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.14);
    cursor: copy;
    background-color: #888;
  }
  .stop {
    position: absolute;
    top: 50%;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 2px solid #fff;
    border-radius: 50%;
    background: var(--stop);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.6);
    transform: translate(-50%, -50%);
    cursor: grab;
    touch-action: none;
  }
  .stop.on { width: 20px; height: 20px; box-shadow: 0 0 0 2px var(--accent), 0 1px 3px rgb(0 0 0 / 0.6); }
  .stop:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .dial { position: relative; flex: none; width: 22px; height: 22px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--muted); }
  .dial i { position: absolute; left: 50%; top: 50%; width: 2px; height: 9px; background: var(--ink); border-radius: 1px; transform-origin: 50% 0; transform: translate(-50%, 0) rotate(calc(var(--angle) + 180deg)); }
  .presets { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
  .preset { aspect-ratio: 1; padding: 0; border: 0; border-radius: 8px; cursor: pointer; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12); }
  .preset:hover { transform: scale(1.06); }
  .preset:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .preset:hover { transform: none; } }
</style>
