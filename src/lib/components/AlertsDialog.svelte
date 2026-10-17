<script lang="ts">
  import { session } from "../app/session.svelte";
  import DeskDialog from "./sources/DeskDialog.svelte";

  // Put a message on top of Program (nursery calls, car lights) without replacing the slide.
  let { onclose }: { onclose: () => void } = $props();

  let text = $state("");
  let style = $state<"banner" | "ticker">("banner");
  let position = $state<"top" | "bottom">("bottom");
  let seconds = $state<number | null>(60);
  const durations: Array<[number | null, string]> = [[30, "30 s"], [60, "1 min"], [120, "2 min"], [300, "5 min"], [null, "Until cleared"]];

  async function show(event?: Event) {
    event?.preventDefault();
    if (!text.trim()) return;
    await session.showAlert({ text, style, position, seconds });
    onclose();
  }
</script>

<DeskDialog title="Alert on Program" {onclose}>
  {#if session.alert}
    <div class="current" role="status">
      <span><strong>On Program now:</strong> {session.alert.text}</span>
      <button type="button" class="desk-btn" onclick={() => void session.clearAlert()}>Clear alert</button>
    </div>
  {/if}
  <form class="alert-form" onsubmit={show}>
    <label class="stack">
      <span>Message</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="field" aria-label="Alert message" placeholder="Parent of child #34, please come to the nursery" maxlength="160" bind:value={text} autofocus />
    </label>
    {#if session.recentAlerts.length}
      <div class="recent" aria-label="Recent alerts">
        {#each session.recentAlerts as recent (recent)}
          <button type="button" class="chip" onclick={() => (text = recent)}>{recent}</button>
        {/each}
      </div>
    {/if}
    <div class="options">
      <div class="choices">
        <div class="group" role="radiogroup" aria-label="Look">
          <span>Look</span>
          <div class="seg">
            {#each [["banner", "Banner"], ["ticker", "Scrolling ticker"]] as [id, label] (id)}
              <button type="button" role="radio" aria-checked={style === id} class:on={style === id} onclick={() => (style = id as "banner" | "ticker")}>{label}</button>
            {/each}
          </div>
        </div>
        <div class="group" role="radiogroup" aria-label="Where">
          <span>Where</span>
          <div class="seg">
            {#each [["bottom", "Bottom"], ["top", "Top"]] as [id, label] (id)}
              <button type="button" role="radio" aria-checked={position === id} class:on={position === id} onclick={() => (position = id as "top" | "bottom")}>{label}</button>
            {/each}
          </div>
        </div>
        <div class="group" role="radiogroup" aria-label="How long">
          <span>How long</span>
          <div class="seg wrap">
            {#each durations as [value, label] (label)}
              <button type="button" role="radio" aria-checked={seconds === value} class:on={seconds === value} onclick={() => (seconds = value)}>{label}</button>
            {/each}
          </div>
        </div>
      </div>
      <!-- Where the alert will sit on the screen. -->
      <div class="mock" aria-hidden="true">
        <span class="mock-slide">Program stays underneath</span>
        <span class="mock-bar {style} {position}"><span>{text.trim() || "Your message"}</span></span>
      </div>
    </div>
    <p class="note">Shows on Program and the audience screen right away, over whatever is live. Preview is not affected.</p>
  </form>
  {#snippet footer()}
    <button type="button" class="desk-btn" onclick={onclose}>Cancel</button>
    <button type="button" class="desk-btn live" disabled={!text.trim()} onclick={() => void show()}>Show alert</button>
  {/snippet}
</DeskDialog>

<style>
  .alert-form { display: flex; flex-direction: column; gap: 12px; }
  .stack { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 12px; }
  .field { height: var(--control-h, 34px); border-radius: var(--radius-control, 8px); border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 0 10px; font: inherit; font-size: 14px; }
  .options { display: grid; grid-template-columns: minmax(0, 1fr) 200px; gap: 14px; align-items: start; }
  .choices { display: grid; gap: 10px; }
  .group { display: grid; gap: 5px; }
  .group > span { color: var(--muted); font-size: 12px; font-weight: 650; }
  .seg { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); justify-self: start; }
  .seg button { height: 28px; padding: 0 12px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .seg button.on { background: var(--live); color: #fff; }
  .mock { position: relative; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: linear-gradient(160deg, #1b2230, #0b0d12); border: 1px solid var(--line); }
  .mock-slide { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(255, 255, 255, 0.35); font-size: 10px; }
  .mock-bar { position: absolute; left: 0; right: 0; height: 22%; display: flex; align-items: center; padding: 0 8px; background: #c8102e; color: #fff; font-size: 9px; font-weight: 700; overflow: hidden; white-space: nowrap; }
  .mock-bar.bottom { bottom: 0; }
  .mock-bar.top { top: 0; }
  .mock-bar.ticker span { animation: mock-ticker 6s linear infinite; }
  @keyframes mock-ticker { from { transform: translateX(100%); } to { transform: translateX(-100%); } }
  @media (prefers-reduced-motion: reduce) { .mock-bar.ticker span { animation: none; } }
  .recent { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { border: 1px solid var(--line); border-radius: 999px; background: var(--field); color: var(--ink); padding: 4px 10px; min-height: 28px; cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .current { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, #c8102e 22%, transparent); }
  .note { margin: 0; color: var(--muted); font-size: 12px; }
  @media (max-width: 560px) { .options { grid-template-columns: 1fr; } .mock { display: none; } }
</style>
