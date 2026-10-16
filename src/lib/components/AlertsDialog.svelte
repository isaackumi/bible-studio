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
      <fieldset>
        <legend>Look</legend>
        <label><input type="radio" name="alert-style" value="banner" bind:group={style} /> Banner</label>
        <label><input type="radio" name="alert-style" value="ticker" bind:group={style} /> Scrolling ticker</label>
      </fieldset>
      <fieldset>
        <legend>Where</legend>
        <label><input type="radio" name="alert-position" value="bottom" bind:group={position} /> Bottom</label>
        <label><input type="radio" name="alert-position" value="top" bind:group={position} /> Top</label>
      </fieldset>
      <label class="stack">
        <span>How long</span>
        <select class="field" aria-label="Alert duration" bind:value={seconds}>
          {#each durations as [value, label] (label)}
            <option {value}>{label}</option>
          {/each}
        </select>
      </label>
    </div>
    <p class="note">Shows on Program and the audience screen right away, over whatever is live. Preview is not affected.</p>
  </form>
  {#snippet footer()}
    <button type="button" class="desk-btn" onclick={onclose}>Cancel</button>
    <button type="button" class="desk-btn primary" disabled={!text.trim()} onclick={() => void show()}>Show alert</button>
  {/snippet}
</DeskDialog>

<style>
  .alert-form { display: flex; flex-direction: column; gap: 12px; }
  .stack { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 12px; }
  .field { height: var(--control-h, 34px); border-radius: var(--radius-control, 8px); border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 0 10px; font: inherit; font-size: 14px; }
  .options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; align-items: start; }
  fieldset { border: 1px solid var(--line); border-radius: 8px; margin: 0; padding: 6px 10px 8px; display: flex; flex-direction: column; gap: 4px; }
  legend { color: var(--muted); font-size: 12px; padding: 0 4px; }
  fieldset label { display: flex; gap: 6px; align-items: center; min-height: 28px; }
  .recent { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { border: 1px solid var(--line); border-radius: 999px; background: var(--field); color: var(--ink); padding: 4px 10px; min-height: 28px; cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .current { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, #c8102e 22%, transparent); }
  .note { margin: 0; color: var(--muted); font-size: 12px; }
  @media (max-width: 560px) { .options { grid-template-columns: 1fr; } }
</style>
