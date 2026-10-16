<script lang="ts">
  import { untrack } from "svelte";
  import { nextSourceName, sourceKindLabel, sourcesOfType, type SharedSource, type SourceKind } from "../../domain/sources";
  import DeskDialog from "./DeskDialog.svelte";

  let {
    type,
    sources,
    oncreate,
    onpick,
    onclose,
    returnTo,
  }: {
    type: SourceKind;
    sources: SharedSource[];
    oncreate: (name: string) => void;
    onpick: (id: string) => void;
    onclose: () => void;
    returnTo?: () => HTMLElement | null | undefined;
  } = $props();

  const existing = $derived(sourcesOfType(sources, type));
  let mode = $state<"new" | "existing">("new");
  // Prefilled once when the dialog opens; the operator may then edit it.
  let name = $state(untrack(() => nextSourceName(sources, type)));
  let picked = $state<string | null>(null);
  const ready = $derived(mode === "new" ? name.trim().length > 0 : picked !== null);

  function submit(event?: Event) {
    event?.preventDefault();
    if (!ready) return;
    if (mode === "new") oncreate(name.trim());
    else if (picked) onpick(picked);
  }
</script>

<DeskDialog title={`Add ${sourceKindLabel(type)}`} {onclose} {returnTo}>
  <form class="add" onsubmit={submit}>
    <label class="choice">
      <input type="radio" name="add-mode" value="new" bind:group={mode} />
      Create new
    </label>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="field" aria-label="Source name" bind:value={name} disabled={mode !== "new"} autofocus onfocus={() => (mode = "new")} />

    <label class="choice">
      <input type="radio" name="add-mode" value="existing" bind:group={mode} disabled={existing.length === 0} />
      Add existing
    </label>
    {#if existing.length === 0}
      <p class="note">No saved {sourceKindLabel(type).toLowerCase()} sources yet.</p>
    {:else}
      <div class="existing" role="listbox" aria-label="Existing sources">
        {#each existing as entry (entry.id)}
          <button
            type="button"
            role="option"
            aria-selected={mode === "existing" && picked === entry.id}
            class:on={mode === "existing" && picked === entry.id}
            onclick={() => {
              mode = "existing";
              picked = entry.id;
            }}
            ondblclick={() => onpick(entry.id)}
          >{entry.name}</button>
        {/each}
      </div>
    {/if}
  </form>
  {#snippet footer()}
    <button type="button" class="desk-btn" onclick={onclose}>Cancel</button>
    <button type="button" class="desk-btn primary" disabled={!ready} onclick={() => submit()}>OK</button>
  {/snippet}
</DeskDialog>

<style>
  .add { display: flex; flex-direction: column; gap: 8px; }
  .choice { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .field {
    height: var(--control-h);
    border-radius: var(--radius-control);
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    padding: 0 10px;
    margin-left: 24px;
  }
  .note { margin: 0 0 0 24px; color: var(--muted); }
  .existing {
    margin-left: 24px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: 4px;
  }
  .existing button {
    text-align: left;
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--ink);
    padding: 6px 8px;
  }
  .existing button:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .existing button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
</style>
