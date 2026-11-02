<script lang="ts">
  import { session } from "../app/session.svelte";
  import { FONT_SIZE_MAX, FONT_SIZE_MIN, themeForSong } from "../domain/theme";
  import { t } from "../i18n/core";

  // A−, the size, A+: verses and songs each keep their own, as a room often wants songs bigger.
  let { kind, onopen }: { kind: "verses" | "songs"; onopen?: () => void } = $props();

  const songs = $derived(kind === "songs");
  const size = $derived(songs ? themeForSong(session.theme()).fontSize : session.theme().fontSize);
</script>

<span class="size" role="group" aria-label={songs ? t("Song text size") : t("Verse text size")}>
  <button type="button" aria-label={songs ? t("Smaller song text") : t("Smaller verse text")} data-tip={songs ? t("Smaller song text. A song on Program changes at once.") : t("Smaller verse text. A verse on Program changes at once.")} disabled={size <= FONT_SIZE_MIN} onclick={() => session.stepTextSize(kind, -1)}>A<small>−</small></button>
  {#if onopen}
    <button type="button" class="now" aria-label={t("Font size")} data-tip={t("Size {fontSize}. Open all the text settings.", { fontSize: size })} onclick={onopen}>{size}</button>
  {:else}
    <span class="now">{size}</span>
  {/if}
  <button type="button" aria-label={songs ? t("Larger song text") : t("Larger verse text")} data-tip={songs ? t("Larger song text. A song on Program changes at once.") : t("Larger verse text. A verse on Program changes at once.")} disabled={size >= FONT_SIZE_MAX} onclick={() => session.stepTextSize(kind, 1)}>A<small>+</small></button>
</span>

<style>
  .size { display: inline-flex; align-items: center; flex: none; margin-left: auto; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
  button, .now { min-width: 28px; height: 24px; padding: 0 6px; border: 0; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 700; }
  .now { display: inline-grid; place-items: center; border-inline: 1px solid var(--line); color: var(--muted); font-weight: 600; font-variant-numeric: tabular-nums; }
  button:hover:not(:disabled) { background: var(--field); }
  button:disabled { color: var(--muted); opacity: 0.5; }
  small { font-size: 10px; }
</style>
