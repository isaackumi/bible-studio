<script lang="ts">
  import { cameraFeedForLayer, type CameraFeeds } from "../domain/camera";
  import { displayWash, frameBackground } from "../domain/backgrounds";
  import { effectsCss } from "../domain/text-style";
  import { cubicIn, cubicInOut, cubicOut, linear } from "svelte/easing";
  import type { TransitionConfig } from "svelte/transition";
  import { timerDisplay, timerFromPaint } from "../domain/timer";
  import type { PaintedLayer, PresentationModel } from "../domain/types";
  import FrameView from "./FrameView.svelte";

  let {
    model,
    stream = null,
    feeds = {},
    nested = false,
    mirror = false,
    audio = false,
  }: {
    model: PresentationModel;
    /** Live pixels for this frame's own camera source. */
    stream?: MediaStream | null;
    /** Open camera feeds by camera source id, resolved per composition layer. */
    feeds?: CameraFeeds<MediaStream>;
    nested?: boolean;
    mirror?: boolean;
    /** Only the audience screen plays sound; operator monitors stay silent. */
    audio?: boolean;
  } = $props();

  /** A layer that is hidden or leaves the scene plays its exit animation. */
  function leave(node: Element, animation: PaintedLayer["animation"]): TransitionConfig {
    const kind = animation?.exit ?? "none";
    const reduced = node.closest(".app") !== null && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (kind === "none" || reduced) return { duration: 0 };
    const easing = animation?.easing === "linear" ? linear : animation?.easing === "ease-in" ? cubicIn : animation?.easing === "ease" ? cubicInOut : cubicOut;
    const shift: Record<string, string> = {
      "slide-left": "translateX(-12%)",
      "slide-right": "translateX(12%)",
      "slide-up": "translateY(-18%)",
      "slide-down": "translateY(18%)",
    };
    const away = shift[kind];
    return {
      duration: Math.max(0, animation?.durationMs ?? 400),
      easing,
      css: (t) => (away ? `opacity: ${t}; transform: ${away.replace(/(-?\d+)%/, (_, n) => `${Number(n) * (1 - t)}%`)};` : `opacity: ${t};`),
    };
  }

  /** Start playback; if sound is not allowed without a click, keep playing muted. */
  function playClip(node: HTMLVideoElement, muted: boolean) {
    node.muted = muted;
    const start = () => {
      void node.play().catch(() => {
        node.muted = true;
        void node.play().catch(() => {});
      });
    };
    start();
    return {
      update(next: boolean) {
        node.muted = next;
        if (node.paused) start();
      },
    };
  }
  let video = $state<HTMLVideoElement | undefined>();
  let playing = $state(false);
  let now = $state(0);

  $effect(() => {
    const node = video;
    if (!node) return;
    playing = false;
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

  const background = $derived(frameBackground(model, nested));
  const effects = $derived(effectsCss(model.style, model.theme));

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
  class:done={!!timerView?.complete && model.timer?.mode !== "clock"}
  style:background={background}
  style:color={model.theme.color}
  style:font-family={model.theme.fontFamily}
>
  {#if model.layout === "composition"}
    {#each model.layers ?? [] as layer (layer.id)}
      <div
        out:leave={layer.animation}
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
          mirror={layer.mirror ?? false}
          {audio}
          stream={cameraFeedForLayer(layer.sourceId, feeds)}
        />
      </div>
    {/each}
  {:else if model.layout === "video" && model.video}
    {#key model.video.url}
      <!-- svelte-ignore a11y_media_has_caption -- operator media on a projection screen; captions belong in the file -->
      <video class="cover" src={model.video.url} loop={model.video.loop} playsinline preload="auto" use:playClip={!audio || model.video.muted}></video>
    {/key}
  {:else if model.layout === "image" && model.imageUrl}
    <img class="cover" src={model.imageUrl} alt="" />
  {:else if model.layout === "logo" && model.imageUrl}
    <img class="logo" src={model.imageUrl} alt="" />
  {:else if model.layout !== "empty" && model.layout !== "black"}
    <div
      class="stack"
      style:text-align={model.theme.align}
      style:justify-content={justify}
      style:padding="{nested ? 16 : model.theme.margin}px"
      style:font-weight={effects["font-weight"]}
      style:font-style={effects["font-style"]}
      style:text-decoration={effects["text-decoration"]}
      style:text-transform={effects["text-transform"]}
      style:text-shadow={effects["text-shadow"]}
    >
      {#if model.reference && model.theme.reference.show}
        <p class="ref" style:font-size="{model.theme.reference.size}px" style:color={model.theme.reference.color}>{model.reference}</p>
      {/if}
      {#each displayLines as line}
        <p class="line" class:clock={model.layout === "timer"} style:font-size="{model.layout === 'logo' ? 92 : model.theme.fontSize}px">
          {#if line.marker}<sup class="marker">{line.marker}</sup>{/if}{line.text}
        </p>
      {/each}
      {#if model.attribution}
        <p class="attr" style:font-size="{model.theme.attribution.size}px" style:color={model.theme.attribution.color}>{model.attribution}</p>
      {/if}
    </div>
  {/if}
  {#if stream && model.layout !== "composition"}
    <!-- The camera card stays underneath until real frames arrive, so a slow or failed camera never shows black. -->
    <video bind:this={video} class="cover live" class:ready={playing} class:mirror autoplay muted playsinline onplaying={() => (playing = true)}></video>
  {/if}
</div>
