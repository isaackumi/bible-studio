<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    onclose,
    children,
    footer,
  }: {
    title: string;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
  } = $props();

  const id = `desk-dialog-${Math.random().toString(36).slice(2, 8)}`;

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onclose();
  }
</script>

<svelte:window {onkeydown} />

<div class="layer">
  <button type="button" class="backdrop" aria-label="Close" onclick={onclose}></button>
  <div class="panel" role="dialog" aria-modal="true" aria-labelledby={id}>
    <h2 {id}>{title}</h2>
    <div class="body">{@render children()}</div>
    {#if footer}
      <footer>{@render footer()}</footer>
    {/if}
  </div>
</div>

<style>
  .layer {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(0, 0, 0, 0.6);
    cursor: default;
  }
  .panel {
    position: relative;
    width: min(520px, calc(100% - 28px));
    max-height: calc(100% - 28px);
    display: flex;
    flex-direction: column;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--radius-panel);
    font-family: var(--font-ui);
    font-size: 13px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }
  h2 {
    margin: 0;
    padding: 14px 16px 10px;
    font-size: 14px;
    font-weight: 600;
    border-bottom: 1px solid var(--line);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    padding: 10px 16px 14px;
    border-top: 1px solid var(--line);
  }
</style>
