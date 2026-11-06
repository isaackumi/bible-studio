<script lang="ts">
  import { session } from "../app/session.svelte";
  import DeskDialog from "./sources/DeskDialog.svelte";
  import { t } from "../i18n/core";
  import { STAGE_READY_MESSAGES as READY } from "../domain/stage-messages";

  // A word to the people on stage (the preacher, the band), straight from the desk: it shows on the
  // stage screen until cleared, and the audience never sees it. Opened from On the screen, so it no
  // longer takes the operator into Settings in the middle of a service.
  let { onclose }: { onclose: () => void } = $props();

  let text = $state("");

  function send(message = text) {
    if (!message.trim()) return;
    session.sendStageMessage(message);
    onclose();
  }

  function clear() {
    session.sendStageMessage("");
    onclose();
  }
</script>

<DeskDialog title={t("Message to the stage")} {onclose}>
  {#if session.stageMessage}
    <div class="current" role="status">
      <span><strong>{t("On the stage screen now:")}</strong> {session.stageMessage}</span>
      <button type="button" class="desk-btn" onclick={clear}>{t("Clear")}</button>
    </div>
  {/if}
  <form class="stage-form" onsubmit={(event) => { event.preventDefault(); send(); }}>
    <label class="stack">
      <span>{t("Message")}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="field" aria-label={t("Message to the stage")} placeholder={t("Two minutes, then the closing song")} maxlength="140" bind:value={text} autofocus />
    </label>
    <div class="ready" aria-label={t("Ready messages")}>
      {#each READY as line (line)}
        <button type="button" class="chip" onclick={() => send(t(line))}>{t(line)}</button>
      {/each}
    </div>
    <p class="note">{t("It shows on the stage screen until you clear it. The audience never sees it.")}</p>
  </form>
  {#snippet footer()}
    <button type="button" class="desk-btn" onclick={onclose}>{t("Cancel")}</button>
    <button type="button" class="desk-btn primary" disabled={!text.trim()} onclick={() => send()}>{t("Send to stage")}</button>
  {/snippet}
</DeskDialog>

<style>
  .stage-form { display: flex; flex-direction: column; gap: 12px; }
  .stack { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 12px; }
  .field { height: var(--control-h, 34px); border-radius: var(--radius-control, 8px); border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 0 10px; font: inherit; font-size: 14px; }
  .ready { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { min-height: 30px; padding: 4px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--field); color: var(--ink); font: inherit; font-size: 12.5px; cursor: pointer; }
  .chip:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .note { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .current { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 10px; background: color-mix(in srgb, var(--accent) 8%, transparent); font-size: 13px; }
</style>
