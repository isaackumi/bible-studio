<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "../../i18n/core";

  let {
    title,
    onclose,
    children,
    footer,
    returnTo,
    wide = false,
    huge = false,
  }: {
    title: string;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
    /** Where focus goes on close when the control that opened the dialog is gone (a closed menu). */
    returnTo?: () => HTMLElement | null | undefined;
    /** Room for an editor with a preview beside it. */
    wide?: boolean;
    /** Most of the screen: a finder with several columns. */
    huge?: boolean;
  } = $props();

  const id = `desk-dialog-${Math.random().toString(36).slice(2, 8)}`;
  let panel = $state<HTMLDivElement | undefined>();

  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // Modal focus: move in on open (autofocus first), keep Tab inside, give focus back on close.
  $effect(() => {
    const node = panel;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = node.querySelector<HTMLElement>("[autofocus]") ?? node.querySelector<HTMLElement>(FOCUSABLE) ?? node;
    first.focus();
    return () => {
      const usable = opener && opener !== document.body && opener.isConnected;
      const target = usable ? opener : returnTo?.();
      target?.focus();
    };
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onclose();
      return;
    }
    if (event.key !== "Tab" || !panel) return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null);
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="layer">
  <button type="button" class="backdrop" aria-label={t("Close")} tabindex="-1" onclick={onclose}></button>
  <div class="panel" class:wide class:huge role="dialog" aria-modal="true" aria-labelledby={id} tabindex="-1" bind:this={panel}>
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
  .panel:focus { outline: none; }
  .panel.wide { width: min(1040px, calc(100% - 28px)); }
  .panel.huge { width: min(1360px, calc(100% - 28px)); }
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
