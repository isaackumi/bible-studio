<script lang="ts">
  import { session } from "../app/session.svelte";

  // Pause, start and reset the timer that is on Program. Hidden when Program has no timer.
  let { compact = false }: { compact?: boolean } = $props();
  const state = $derived(session.programTimerState);
</script>

{#if state}
  <div class="timer-controls" class:compact role="group" aria-label="Program timer">
    <span class="label">Timer {state === "running" ? "running" : "paused"}</span>
    {#if state === "running"}
      <button type="button" class="desk-btn" onclick={() => void session.run("timer-pause")}>Pause</button>
    {:else}
      <button type="button" class="desk-btn" onclick={() => void session.run("timer-resume")}>Start</button>
    {/if}
    <button type="button" class="desk-btn" onclick={() => void session.run("timer-reset")}>Reset</button>
  </div>
{/if}

<style>
  .timer-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); flex: 1 1 100%; }
  .compact .label { flex: 0 0 auto; }
  .timer-controls .desk-btn { flex: 1 1 64px; }
</style>
