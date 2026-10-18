<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";

  // A library column that can be resized by its edge or collapsed to a rail. Width and collapsed
  // state are remembered per sidebar in this browser (a convenience; it survives without storage).
  let {
    title,
    icon,
    count,
    storageKey,
    actions,
    children,
  }: { title: string; icon: string; count: number; storageKey: string; actions?: Snippet; children: Snippet } = $props();

  const MIN = 220;
  const MAX = 460;
  const DEFAULT = 290;

  function load(): { width: number; collapsed: boolean } {
    try {
      const saved = JSON.parse(localStorage.getItem(`sidebar:${storageKey}`) ?? "null");
      if (saved && typeof saved.width === "number") return { width: clamp(saved.width), collapsed: saved.collapsed === true };
    } catch {
      // No storage: defaults.
    }
    return { width: DEFAULT, collapsed: false };
  }

  function clamp(value: number): number {
    return Math.round(Math.min(MAX, Math.max(MIN, value)));
  }

  const initial = load();
  let width = $state(initial.width);
  let collapsed = $state(initial.collapsed);
  let dragging = $state(false);

  $effect(() => {
    const value = JSON.stringify({ width, collapsed });
    try {
      localStorage.setItem(`sidebar:${storageKey}`, value);
    } catch {
      // Not saved; fine.
    }
  });

  function startDrag(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startWidth = width;
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => (width = clamp(startWidth + next.clientX - startX));
    const stop = () => {
      dragging = false;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  function keyResize(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") width = clamp(width - 16);
    else if (event.key === "ArrowRight") width = clamp(width + 16);
    else if (event.key === "Home") width = MIN;
    else if (event.key === "End") width = MAX;
    else return;
    event.preventDefault();
    event.stopPropagation();
  }
</script>

{#if collapsed}
  <aside class="rail" aria-label={title}>
    <button type="button" class="rail-btn" aria-label={t("Show {title}", { title })} title={t("Show {title}", { title })} onclick={() => (collapsed = false)}>
      <Icon name="library" size={16} />
    </button>
    <button type="button" class="rail-label" onclick={() => (collapsed = false)}>
      <Icon name={icon} size={16} />
      <span>{title}</span>
      <small>{count}</small>
    </button>
  </aside>
{:else}
  <aside class="sidebar" class:dragging aria-label={title} style:width={`${width}px`}>
    <header class="head">
      <h2>{title}</h2>
      <div class="head-actions">
        {@render actions?.()}
        <button type="button" class="collapse" aria-label={t("Hide {title}", { title })} title={t("Hide {title}", { title })} onclick={() => (collapsed = true)}>
          <Icon name="chevron-left" size={16} />
        </button>
      </div>
    </header>
    {@render children()}
    <!-- A focusable separator is the ARIA window-splitter pattern: arrows resize it. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="edge"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("Resize {title}", { title })}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={width}
      tabindex="0"
      title={t("Drag to resize · double-click to reset")}
      onpointerdown={startDrag}
      ondblclick={() => (width = DEFAULT)}
      onkeydown={keyResize}
    ></div>
  </aside>
{/if}

<style>
  .sidebar, .rail {
    position: relative;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-panel, 12px);
  }
  .sidebar { min-width: 0; overflow: hidden; }
  .sidebar.dragging { user-select: none; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 10px 10px 14px; flex: none; }
  h2 { margin: 0; font-size: 16px; white-space: nowrap; }
  .head-actions { display: flex; align-items: center; gap: 4px; }
  .collapse, .rail-btn {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
  }
  .collapse:hover, .rail-btn:hover { background: var(--field); color: var(--ink); }
  .edge {
    position: absolute;
    top: 0;
    right: -1px;
    bottom: 0;
    width: 8px;
    cursor: col-resize;
    touch-action: none;
  }
  .edge::after {
    content: "";
    position: absolute;
    top: 12px;
    bottom: 12px;
    right: 2px;
    width: 2px;
    border-radius: 2px;
    background: transparent;
    transition: background 120ms;
  }
  .edge:hover::after, .edge:focus-visible::after, .dragging .edge::after { background: var(--accent); }
  .edge:focus-visible { outline: none; }

  .rail { width: 52px; align-items: center; padding: 8px 0; gap: 8px; }
  .rail-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    font: inherit;
  }
  .rail-label:hover { color: var(--ink); background: var(--field); }
  .rail-label span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .rail-label small { font-size: 11px; }
</style>
