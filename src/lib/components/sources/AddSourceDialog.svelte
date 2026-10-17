<script lang="ts">
  import { untrack } from "svelte";
  import { nextSourceName, sourceKindLabel, sourcesOfType, type SharedSource, type SourceKind } from "../../domain/sources";
  import DeskDialog from "./DeskDialog.svelte";
  import Icon from "../Icon.svelte";
  import { sourceMeta } from "../obs/source-meta";

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
  const meta = $derived(sourceMeta(type));
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
  <form class="add" onsubmit={submit} style:--tint={meta.color}>
    <div class="intro">
      <span class="type-icon"><Icon name={meta.icon} size={20} /></span>
      <p>{meta.blurb}. Name it, then set it up in the next step.</p>
    </div>

    <div class="options" role="radiogroup" aria-label="New or saved">
      <label class="option" class:on={mode === "new"}>
        <input type="radio" name="add-mode" value="new" bind:group={mode} />
        <span class="option-copy">
          <strong>A new {sourceKindLabel(type).toLowerCase()}</strong>
          <!-- svelte-ignore a11y_autofocus -->
          <input class="field" aria-label="Source name" bind:value={name} autofocus onfocus={() => (mode = "new")} />
        </span>
      </label>

      <label class="option" class:on={mode === "existing"} class:disabled={existing.length === 0}>
        <input type="radio" name="add-mode" value="existing" bind:group={mode} disabled={existing.length === 0} />
        <span class="option-copy">
          <strong>One you already made</strong>
          {#if existing.length === 0}
            <em>None yet. Saved {sourceKindLabel(type).toLowerCase()} sources can be shared by many scenes; edit one and every scene follows.</em>
          {:else}
            <span class="existing" role="listbox" aria-label="Existing sources">
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
                ><Icon name={meta.icon} size={13} /> {entry.name}</button>
              {/each}
            </span>
          {/if}
        </span>
      </label>
    </div>
  </form>
  {#snippet footer()}
    <button type="button" class="desk-btn" onclick={onclose}>Cancel</button>
    <button type="button" class="desk-btn primary-soft" disabled={!ready} onclick={() => submit()}>{mode === "new" ? "Next: set it up" : "Add to scene"}</button>
  {/snippet}
</DeskDialog>

<style>
  .add { display: grid; gap: 14px; }
  .intro { display: flex; align-items: center; gap: 12px; }
  .intro p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
  .type-icon { display: grid; place-items: center; flex: none; width: 42px; height: 42px; border-radius: 12px; background: color-mix(in srgb, var(--tint) 18%, transparent); color: var(--tint); }
  .options { display: grid; gap: 8px; }
  .option { display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); cursor: pointer; }
  .option.on { border-color: var(--tint); box-shadow: 0 0 0 1px var(--tint); }
  .option.disabled { opacity: 0.6; cursor: default; }
  .option > input { margin-top: 3px; accent-color: var(--tint); }
  .option-copy { flex: 1; display: grid; gap: 8px; min-width: 0; }
  .option-copy strong { font-size: 13px; }
  .option-copy em { font-style: normal; font-size: 12px; color: var(--muted); line-height: 1.45; }
  .field {
    width: 100%;
    box-sizing: border-box;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink);
    padding: 0 10px;
    font: inherit;
  }
  .field:focus { outline: none; border-color: var(--tint); }
  .existing { display: grid; gap: 2px; max-height: 200px; overflow: auto; }
  .existing button { display: flex; align-items: center; gap: 8px; text-align: left; border: 1px solid transparent; border-radius: 8px; background: var(--panel); color: var(--ink); padding: 7px 10px; font: inherit; cursor: pointer; }
  .existing button :global(svg) { color: var(--tint); }
  .existing button:hover { border-color: var(--line); }
  .existing button.on { border-color: var(--tint); background: color-mix(in srgb, var(--tint) 14%, var(--panel)); }
</style>
