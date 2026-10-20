<script lang="ts">
  import { fade } from "svelte/transition";
  import { session } from "../app/session.svelte";
  import { messageTone } from "../app/status-line";

  // The desk's messages ("Nothing on Preview yet", "Reference not found", "Queue cleared"): a quiet
  // line at the bottom of the desk for a few seconds. Problems stay longer and show in amber.
  // Routine confirmations of the main buttons ("Live.") are left out: the monitors show those.
  let shown = $state<{ text: string; tone: "info" | "warn"; key: number } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let count = 0;

  $effect(() => {
    const text = session.message;
    const tone = messageTone(text);
    if (!tone) return;
    count += 1;
    shown = { text, tone, key: count };
    clearTimeout(timer);
    timer = setTimeout(() => (shown = null), tone === "warn" ? 7000 : 4000);
  });
</script>

{#if shown}
  {#key shown.key}
    <div class="status-line" class:warn={shown.tone === "warn"} role={shown.tone === "warn" ? "alert" : "status"} aria-live={shown.tone === "warn" ? "assertive" : "polite"} transition:fade={{ duration: 160 }}>
      {shown.text}
    </div>
  {/key}
{/if}

<style>
  .status-line {
    position: fixed;
    left: 50%;
    bottom: 18px;
    z-index: 870;
    translate: -50% 0;
    max-width: min(640px, calc(100vw - 48px));
    padding: 8px 14px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: color-mix(in srgb, var(--panel) 94%, var(--ink) 6%);
    color: var(--ink);
    font-size: 13px;
    line-height: 1.35;
    text-align: center;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.35);
    pointer-events: none;
  }
  .status-line.warn {
    border-color: color-mix(in srgb, #f5a524 70%, var(--line));
    background: color-mix(in srgb, #f5a524 16%, var(--panel));
  }
</style>
