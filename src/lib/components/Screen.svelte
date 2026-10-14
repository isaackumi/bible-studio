<script lang="ts">
  import type { PresentationModel } from "../domain/types";
  import FrameView from "./FrameView.svelte";

  let { model }: { model: PresentationModel } = $props();
  let box: HTMLDivElement | undefined = $state();
  let scale = $state(0.3);

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
    <FrameView {model} />
  </div>
</div>
