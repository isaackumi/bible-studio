<script lang="ts">
  import type { Snippet } from "svelte";

  // A toolbar button that opens a small menu below it. Closes on outside click, Escape, or an item's close().
  let {
    label,
    tip = label,
    on = false,
    className = "desk-btn icon",
    align = "right",
    trigger,
    children,
  }: {
    label: string;
    tip?: string;
    on?: boolean;
    className?: string;
    /** Which edge of the button the menu lines up with ("left" for buttons near the left edge). */
    align?: "left" | "right";
    trigger: Snippet;
    children: Snippet<[() => void]>;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | undefined>();
  let button = $state<HTMLButtonElement | undefined>();

  function close() {
    open = false;
  }

  function onWindowPointer(event: PointerEvent) {
    if (open && root && !root.contains(event.target as Node)) open = false;
  }

  function onKey(event: KeyboardEvent) {
    if (!open || event.key !== "Escape") return;
    event.stopPropagation();
    open = false;
    button?.focus();
  }
</script>

<svelte:window onpointerdown={onWindowPointer} />

<div class="tool-menu" bind:this={root}>
  <button
    bind:this={button}
    type="button"
    class={className}
    class:on={on || open}
    aria-label={label}
    aria-haspopup="menu"
    aria-expanded={open}
    data-tip={open ? undefined : tip}
    onclick={() => (open = !open)}
  >{@render trigger()}</button>
  {#if open}
    <div class="menu" class:align-left={align === "left"} role="menu" tabindex="-1" aria-label={label} onkeydown={onKey}>
      {@render children(close)}
    </div>
  {/if}
</div>

<style>
  .tool-menu { position: relative; flex: none; }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 60;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: calc(var(--radius-control) + 2px);
    background: var(--panel);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
  }
  .menu.align-left { right: auto; left: 0; }
  .menu :global([role="menuitem"]),
  .menu :global([role="menuitemcheckbox"]) {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-control);
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    text-align: left;
    white-space: nowrap;
  }
  .menu :global([role="menuitem"]:hover),
  .menu :global([role="menuitemcheckbox"]:hover) { background: var(--field); }
  .menu :global([role="menuitemcheckbox"][aria-checked="true"]) { color: var(--accent); }
  .menu :global([role="menuitemcheckbox"][aria-checked="true"])::after { content: "✓"; margin-left: auto; padding-left: 12px; }
  .menu :global(.menu-sep) { height: 1px; margin: 4px 2px; background: var(--line); }
  .menu :global(.menu-label) { margin: 4px 10px 2px; font-size: 11px; font-weight: 650; color: var(--muted); }
  .menu :global(.menu-note) { margin: 2px 10px 6px; font-size: 12px; color: var(--muted); white-space: normal; }
  .menu :global(.menu-key) { margin-left: auto; color: var(--muted); font-size: 11px; }
</style>
