<script lang="ts">
  import { displayWash } from "../domain/backgrounds";
  import type { PresentationModel } from "../domain/types";

  let { model }: { model: PresentationModel } = $props();

  const wash = $derived(model.theme.background.type === "wash" ? displayWash(model.theme.background.washId) : null);

  const background = $derived.by(() => {
    if (model.layout === "black") return "#000000";
    if (model.backgroundImageUrl) {
      return `center / cover no-repeat url("${model.backgroundImageUrl}")`;
    }
    if (wash) return wash.background;
    if (model.theme.background.type === "color") return model.theme.background.color;
    return "#050505";
  });

  const justify = $derived(
    model.theme.vertical === "top" ? "flex-start" : model.theme.vertical === "bottom" ? "flex-end" : "center",
  );
</script>

<div
  class="frame"
  class:black={model.layout === "black"}
  class:wash={!!wash && model.layout !== "black"}
  class:light={!!wash?.light}
  class:drift={wash?.motion === "drift" && model.layout !== "black"}
  class:glow={wash?.motion === "glow" && model.layout !== "black"}
  class:lower={model.theme.layout === "lower-third" && model.layout !== "black" && model.layout !== "empty" && model.layout !== "image"}
  style:background={background}
  style:color={model.theme.color}
  style:font-family={model.theme.fontFamily}
>
  {#if model.layout === "image" && model.imageUrl}
    <img class="cover" src={model.imageUrl} alt="" />
  {:else if model.layout === "logo" && model.imageUrl}
    <img class="logo" src={model.imageUrl} alt="" />
  {:else if model.layout !== "empty" && model.layout !== "black"}
    <div class="stack" style:text-align={model.theme.align} style:justify-content={justify} style:padding="{model.theme.margin}px">
      {#if model.reference && model.theme.reference.show}
        <p class="ref" style:font-size="{model.theme.reference.size}px" style:color={model.theme.reference.color}>{model.reference}</p>
      {/if}
      {#each model.lines as line}
        <p class="line" style:font-size="{model.layout === 'logo' ? 92 : model.theme.fontSize}px">
          {#if line.marker}<sup class="marker">{line.marker}</sup>{/if}{line.text}
        </p>
      {/each}
      {#if model.attribution}
        <p class="attr" style:font-size="{model.theme.attribution.size}px" style:color={model.theme.attribution.color}>{model.attribution}</p>
      {/if}
    </div>
  {/if}
</div>
