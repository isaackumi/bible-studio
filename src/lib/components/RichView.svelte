<script lang="ts">
  import { BLOCK_SCALE, runCss, type RichBlock, type RichDoc } from "../domain/rich-text";

  // Formatted words on the screen (audience, Program, Preview, thumbnails). Drawn from plain data
  // (blocks of runs), never from markup. Sizes follow the theme's text size and the screen's fit.
  // `base` is the size a normal paragraph starts from (CSS); by default the theme's size, fitted.
  let { doc, fontSize = 0, base = "" }: { doc: RichDoc; fontSize?: number; base?: string } = $props();

  /** Each block with its number, for numbered lines that restart after anything else. */
  const numbered = $derived.by(() => {
    let count = 0;
    return doc.blocks.map((block) => {
      count = block.type === "number" ? count + 1 : 0;
      return { block, number: count };
    });
  });

  const blockSize = (block: RichBlock) =>
    base ? `calc(${base} * ${BLOCK_SCALE[block.type]})` : `calc(${Math.round(fontSize * BLOCK_SCALE[block.type])}px * var(--fit, 1))`;
</script>

<div class="rich">
  {#each numbered as { block, number }, index (index)}
    <p class="block {block.type}" style:font-size={blockSize(block)} style:text-align={block.align}>
      {#if block.type === "bullet"}<span class="mark" aria-hidden="true">•</span>{:else if block.type === "number"}<span class="mark" aria-hidden="true">{number}.</span>{/if}
      <span class="words">
        {#each block.runs as run, at (at)}<span style={runCss(run)}>{run.text}</span>{/each}{#if block.runs.length === 0}&nbsp;{/if}
      </span>
    </p>
  {/each}
</div>

<style>
  .rich { display: flex; flex-direction: column; gap: 0.18em; width: 100%; }
  .block { margin: 0; line-height: 1.22; overflow-wrap: anywhere; }
  .block.title { font-weight: 800; line-height: 1.08; }
  .block.subtitle { font-weight: 700; opacity: 0.92; }
  .block.quote { font-style: italic; padding-left: 0.6em; border-left: 0.12em solid currentColor; opacity: 0.94; text-align: left; }
  .block.bullet, .block.number { display: flex; gap: 0.45em; text-align: left; }
  .mark { flex: none; min-width: 0.8em; opacity: 0.85; }
  .words { min-width: 0; }
</style>
