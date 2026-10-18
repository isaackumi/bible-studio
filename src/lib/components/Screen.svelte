<script lang="ts">
  import type { Snippet } from "svelte";
  import { cameraFeedForLayer, type CameraFeeds } from "../domain/camera";
  import type { PresentationModel } from "../domain/types";
  import { canvasFor } from "../display/shape";
  import { outputShape } from "../display/output-shape.svelte";
  import FrameView from "./FrameView.svelte";
  import { t } from "../i18n/core";

  let {
    model,
    sourceId = null,
    feeds = {},
    audio = false,
    still = false,
    overlay,
    hint = "",
    aspect,
  }: {
    model: PresentationModel;
    sourceId?: string | null;
    /** Open camera feeds by camera source id. Absent feeds paint the camera card. */
    feeds?: CameraFeeds<MediaStream>;
    /** Audience only: let video play its sound. */
    audio?: boolean;
    /** Hold animated backgrounds still (gallery thumbnails). */
    still?: boolean;
    overlay?: Snippet;
    /** Operator monitors only: a quiet line shown while nothing is up. Never on the audience screen. */
    hint?: string;
    /** Width ÷ height of the screen. Defaults to the audience screen's shape, so every monitor matches it. */
    aspect?: number;
  } = $props();
  const shape = $derived(aspect ?? outputShape.aspect);
  const canvas = $derived(canvasFor(shape));
  let box: HTMLDivElement | undefined = $state();
  let scale = $state(0.3);
  /** How far long words were shrunk to fit; the desk says so when it is a lot. */
  let fit = $state(1);

  const stream = $derived(model.layout === "composition" ? null : cameraFeedForLayer(sourceId, feeds));

  $effect(() => {
    const node = box;
    if (!node) return;
    const measure = () => {
      scale = node.clientWidth / canvas.width;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  });
</script>

<div class="ratio" bind:this={box} style:--aspect={shape} style:--canvas-w="{canvas.width}px" style:--canvas-h="{canvas.height}px">
  <div class="canvas" style:transform="scale({scale})">
    <FrameView {model} {stream} {feeds} {audio} {still} bind:fit />
  </div>
  {#if hint && fit < 0.7}
    <p class="fit-note" title={t("Long text is shrunk to fit the screen. Split it for bigger words: fewer verses, or a song part in two.")}>{t("Text at {percent}% to fit", { percent: Math.round(fit * 100) })}</p>
  {/if}
  {#if hint && model.layout === "empty"}
    <p class="screen-hint" style:font-size="{Math.max(10, Math.min(14, scale * canvas.width * 0.028))}px">{hint}</p>
  {/if}
  {@render overlay?.()}
</div>

<style>
  .screen-hint {
    position: absolute;
    inset: auto 8% 50% 8%;
    transform: translateY(50%);
    margin: 0;
    text-align: center;
    color: rgba(255, 255, 255, 0.62);
    font-weight: 550;
    line-height: 1.35;
    text-wrap: balance;
    pointer-events: none;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
  }
  .fit-note { position: absolute; left: 6px; bottom: 6px; z-index: 4; margin: 0; padding: 2px 7px; border-radius: 6px; background: rgb(0 0 0 / 0.7); color: #ffd27a; font-size: 10px; font-weight: 700; pointer-events: auto; }
</style>
