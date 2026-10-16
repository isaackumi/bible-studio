<script lang="ts">
  import { cameraFeedForLayer } from "../domain/camera";
  import { displayWash } from "../domain/backgrounds";
  import { timerDisplay, timerFromPaint } from "../domain/timer";
  import type { PresentationModel } from "../domain/types";
  import FrameView from "./FrameView.svelte";

  let {
    model,
    stream = null,
    nested = false,
    cameraFeedId = null,
  }: {
    model: PresentationModel;
    stream?: MediaStream | null;
    nested?: boolean;
    cameraFeedId?: string | null;
  } = $props();
  let video = $state<HTMLVideoElement | undefined>();
  let now = $state(0);

  $effect(() => {
    const node = video;
    if (!node) return;
    node.srcObject = stream ?? null;
    return () => {
      node.srcObject = null;
    };
  });

  $effect(() => {
    const paint = model.timer;
    if (model.layout !== "timer" || !paint) return;
    now = Date.now();
    if (!paint.running && paint.mode !== "clock" && paint.mode !== "target") return;
    const id = setInterval(() => {
      now = Date.now();
    }, 250);
    return () => clearInterval(id);
  });

  const wash = $derived(model.theme.background.type === "wash" ? displayWash(model.theme.background.washId) : null);
  const timerView = $derived(
    model.layout === "timer" && model.timer ? timerDisplay(timerFromPaint(model.timer), now || Date.now()) : null,
  );

  const background = $derived.by(() => {
    if (model.layout === "black") return "#000000";
    if (nested && (model.layout === "lower-third" || model.layout === "timer" || model.layout === "empty")) return "transparent";
    if (model.backgroundImageUrl) {
      return `center / cover no-repeat url("${model.backgroundImageUrl}")`;
    }
    if (wash) return wash.background;
    if (model.theme.background.type === "color") return model.theme.background.color;
    return nested ? "transparent" : "#050505";
  });

  const justify = $derived(
    model.theme.vertical === "top" ? "flex-start" : model.theme.vertical === "bottom" ? "flex-end" : "center",
  );

  const displayLines = $derived(timerView ? [{ text: timerView.text }] : model.lines);
</script>

<div
  class="frame"
  class:black={model.layout === "black"}
  class:wash={!!wash && model.layout !== "black" && !nested}
  class:light={!!wash?.light}
  class:drift={wash?.motion === "drift" && model.layout !== "black" && !nested}
  class:glow={wash?.motion === "glow" && model.layout !== "black" && !nested}
  class:lower={(model.theme.layout === "lower-third" || model.layout === "lower-third") && model.layout !== "black" && model.layout !== "empty" && model.layout !== "image"}
  class:nested
  class:composition={model.layout === "composition"}
  class:timer={model.layout === "timer"}
  class:warning={!!timerView?.warning}
  style:background={background}
  style:color={model.theme.color}
  style:font-family={model.theme.fontFamily}
>
  {#if model.layout === "composition"}
    {#each model.layers ?? [] as layer (layer.id)}
      <div
        class="comp-layer enter-{layer.animation?.entrance ?? "none"}"
        class:fit-cover={layer.fit === "cover"}
        class:fit-fill={layer.fit === "fill"}
        style:left="{layer.bounds.x}%"
        style:top="{layer.bounds.y}%"
        style:width="{layer.bounds.w}%"
        style:height="{layer.bounds.h}%"
        style:opacity={layer.opacity}
        style:--layer-opacity={layer.opacity}
        style:z-index={layer.zIndex}
        style:--layer-dur="{layer.animation?.durationMs ?? 400}ms"
        style:--layer-ease={layer.animation?.easing ?? "ease-out"}
      >
        <FrameView
          model={layer.model}
          nested
          cameraFeedId={cameraFeedId}
          stream={cameraFeedForLayer(layer.sourceId, cameraFeedId, stream, "preview") as MediaStream | null}
        />
      </div>
    {/each}
  {:else if stream}
    <video bind:this={video} class="cover" autoplay muted playsinline></video>
  {:else if model.layout === "image" && model.imageUrl}
    <img class="cover" src={model.imageUrl} alt="" />
  {:else if model.layout === "logo" && model.imageUrl}
    <img class="logo" src={model.imageUrl} alt="" />
  {:else if model.layout !== "empty" && model.layout !== "black"}
    <div class="stack" style:text-align={model.theme.align} style:justify-content={justify} style:padding="{nested ? 16 : model.theme.margin}px">
      {#if model.reference && model.theme.reference.show}
        <p class="ref" style:font-size="{model.theme.reference.size}px" style:color={model.theme.reference.color}>{model.reference}</p>
      {/if}
      {#each displayLines as line}
        <p class="line" class:clock={model.layout === "timer"} style:font-size="{model.layout === 'logo' ? 92 : model.layout === 'timer' ? Math.max(model.theme.fontSize, 96) : model.theme.fontSize}px">
          {#if line.marker}<sup class="marker">{line.marker}</sup>{/if}{line.text}
        </p>
      {/each}
      {#if model.attribution}
        <p class="attr" style:font-size="{model.theme.attribution.size}px" style:color={model.theme.attribution.color}>{model.attribution}</p>
      {/if}
    </div>
  {/if}
</div>
