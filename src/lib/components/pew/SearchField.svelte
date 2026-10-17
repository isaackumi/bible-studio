<script lang="ts">
  import { session } from "../../app/session.svelte";
  import Icon from "../Icon.svelte";

  // Library search: icon, clear button, and the desk's Find key ("/") focuses it.
  // ↑ ↓ and Enter go to the parent so it can move through its list.
  let {
    value = $bindable(""),
    label,
    placeholder,
    onnavigate,
  }: { value?: string; label: string; placeholder: string; onnavigate?: (key: "up" | "down" | "enter") => void } = $props();

  let input = $state<HTMLInputElement | undefined>();

  // While mounted, the desk's "/" (Find) focuses this field instead of opening the Find overlay.
  $effect(() => {
    const focus = () => {
      input?.focus();
      input?.select();
    };
    session.localSearch = focus;
    return () => {
      if (session.localSearch === focus) session.localSearch = null;
    };
  });

  function onKey(event: KeyboardEvent) {
    const key = event.key === "ArrowDown" ? "down" : event.key === "ArrowUp" ? "up" : event.key === "Enter" ? "enter" : null;
    if (event.key === "Escape" && value) {
      value = "";
      event.stopPropagation();
      return;
    }
    if (!key || !onnavigate) return;
    // Keep arrows here: the desk's own arrow keys step Preview.
    event.preventDefault();
    event.stopPropagation();
    onnavigate(key);
  }
</script>

<label class="search">
  <Icon name="search" size={14} />
  <input bind:this={input} type="search" aria-label={label} {placeholder} bind:value onkeydown={onKey} />
  {#if value}
    <button type="button" aria-label="Clear search" onclick={() => { value = ""; input?.focus(); }}><Icon name="close" size={12} /></button>
  {:else}
    <kbd aria-hidden="true">/</kbd>
  {/if}
</label>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    margin: 0 12px 12px 14px;
    padding: 0 6px 0 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius-control, 8px);
    background: var(--field);
    color: var(--muted);
    flex: none;
  }
  .search:focus-within { border-color: var(--accent); color: var(--ink); }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    outline: none;
  }
  input::-webkit-search-cancel-button { display: none; }
  button { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 5px; background: var(--panel); color: var(--muted); }
  button:hover { color: var(--ink); }
  kbd { padding: 0 6px; border: 1px solid var(--line); border-radius: 4px; font: inherit; font-size: 11px; color: var(--muted); }
</style>
