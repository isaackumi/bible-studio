<script lang="ts">
  import { inlineRuns, runCss, type RichDoc, type RichRun } from "../domain/rich-text";

  // Formatted words in one line (overlays, lower thirds, a lyric line): the runs only, no blocks.
  let { doc = null, runs = null }: { doc?: RichDoc | null; runs?: RichRun[] | null } = $props();
  const list = $derived(runs ?? (doc ? inlineRuns(doc) : []));
</script>

{#each list as run, index (index)}<span style={runCss(run)}>{run.text}</span>{/each}
