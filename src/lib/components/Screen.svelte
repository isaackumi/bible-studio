<script lang="ts">
  import { previewShowsCamera, type CameraSurface } from "../domain/camera";
  import type { PresentationModel } from "../domain/types";
  import FrameView from "./FrameView.svelte";

  let {
    model,
    stream = null,
    sourceId = null,
    cameraFeedId = null,
    surface = "audience",
  }: {
    model: PresentationModel;
    stream?: MediaStream | null;
    sourceId?: string | null;
    cameraFeedId?: string | null;
    surface?: CameraSurface;
  } = $props();
  let box: HTMLDivElement | undefined = $state();
  let scale = $state(0.3);

  const feed = $derived(surface === "preview" && previewShowsCamera(model, sourceId) ? stream : null);

  $effect(() => {
    const node = box;
    if (!node) return;
    const measure = () => {
      scale = node.clientWidth / 1920;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  });
</script>

<div class="ratio" bind:this={box}>
  <div class="canvas" style:transform="scale({scale})">
    <FrameView {model} stream={feed} cameraFeedId={surface === "preview" ? cameraFeedId : null} />
  </div>
</div>
