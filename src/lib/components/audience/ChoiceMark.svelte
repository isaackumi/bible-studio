<script lang="ts">
  import { CHOICE_PATHS, CHOICE_STYLES } from "../../domain/game-colors";

  // An answer's mark as people see it on their phones and the big screen: its colour and shape.
  let { index, size = 22, muted = false }: { index: number; size?: number; muted?: boolean } = $props();
  const style = $derived(CHOICE_STYLES[index % CHOICE_STYLES.length]!);
</script>

<span class="mark" class:muted style:--c={style.color} style:width="{size}px" style:height="{size}px" aria-hidden="true">
  <svg viewBox="0 0 24 24" width={Math.round(size * 0.58)} height={Math.round(size * 0.58)}><path d={CHOICE_PATHS[style.shape]} fill="#fff" /></svg>
</span>

<style>
  .mark { flex: none; display: inline-grid; place-items: center; border-radius: 6px; background: var(--c); }
  .mark.muted { background: color-mix(in srgb, var(--c) 30%, transparent); }
</style>
