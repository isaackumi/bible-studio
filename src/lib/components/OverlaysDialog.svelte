<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../app/session.svelte";
  import { OVERLAY_KINDS, paintOverlays, type OverlayCorner, type OverlayKind, type ScreenOverlay } from "../domain/screen-overlays";
  import type { PresentationModel } from "../domain/types";
  import { mediaUrl } from "../db/api";
  import DeskDialog from "./sources/DeskDialog.svelte";
  import Icon from "./Icon.svelte";
  import Screen from "./Screen.svelte";

  // Overlays: set them up once, switch them on and off during the service. They sit above
  // whatever is on Program, on the audience screen and the Program monitor.
  let { onclose }: { onclose: () => void } = $props();

  const overlays = $derived(session.workspace.overlays);
  let selectedId = $state<string | null>(untrack(() => session.workspace.overlays[0]?.id ?? null));
  const selected = $derived(overlays.find((overlay) => overlay.id === selectedId) ?? null);
  const images = $derived(session.mediaByFavorite.filter((asset) => asset.kind === "image"));
  const kindOf = (kind: OverlayKind) => OVERLAY_KINDS.find((entry) => entry.kind === kind)!;

  /** The preview: what is on Program now, with the overlays that are on plus the one being edited. */
  const preview = $derived.by((): PresentationModel => {
    const { overlays: _program, ...base } = session.live.program.model;
    const shown = overlays.map((overlay) => (overlay.id === selectedId ? { ...overlay, on: true } : overlay));
    const painted = paintOverlays(shown, (id) => mediaUrl(session.media.find((asset) => asset.id === id) ?? null));
    return painted.length ? { ...base, overlays: painted } : base;
  });

  function add(kind: OverlayKind) {
    selectedId = session.addOverlay(kind);
  }

  function set(patch: Partial<ScreenOverlay>) {
    if (selected) session.updateOverlay(selected.id, patch);
  }

  const CORNERS: Array<[OverlayCorner, string]> = [["top-left", "Top left"], ["top-right", "Top right"], ["bottom-left", "Bottom left"], ["bottom-right", "Bottom right"]];
  const usesCorner = (kind: OverlayKind) => kind === "logo" || kind === "clock" || kind === "badge";
  const usesEdge = (kind: OverlayKind) => kind === "ticker" || kind === "banner";
</script>

<DeskDialog title="Overlays" {onclose} wide>
  <div class="ov-editor">
    <section class="ov-list" aria-label="Your overlays">
      {#each overlays as overlay (overlay.id)}
        <div class="ov-row" class:on={overlay.id === selectedId}>
          <button type="button" class="ov-pick" onclick={() => (selectedId = overlay.id)}>
            <span class="ov-icon"><Icon name={kindOf(overlay.kind).icon} size={15} /></span>
            <span class="ov-copy">
              <strong>{kindOf(overlay.kind).label}</strong>
              <em>{overlay.kind === "clock" ? "The time" : overlay.text || kindOf(overlay.kind).detail}</em>
            </span>
          </button>
          <input
            type="checkbox"
            class="switch"
            role="switch"
            aria-label={`${kindOf(overlay.kind).label} on the screen`}
            checked={overlay.on}
            onchange={(event) => session.toggleOverlay(overlay.id, event.currentTarget.checked)}
          />
        </div>
      {:else}
        <p class="ov-empty">No overlays yet. Add one below; it stays off until you switch it on.</p>
      {/each}

      <p class="ov-label">Add an overlay</p>
      <div class="ov-kinds">
        {#each OVERLAY_KINDS as entry (entry.kind)}
          <button type="button" class="ov-kind" onclick={() => add(entry.kind)}>
            <Icon name={entry.icon} size={16} />
            <span><strong>{entry.label}</strong><em>{entry.detail}</em></span>
          </button>
        {/each}
      </div>
    </section>

    <section class="ov-side">
      <figure class="ov-preview">
        <div class="ov-screen"><Screen model={preview} /></div>
        <figcaption>{selected && !selected.on ? "Preview of this overlay (it is off on the screen)" : "What the audience sees"}</figcaption>
      </figure>

      {#if selected}
        <div class="ov-fields">
          {#if selected.kind !== "clock"}
            <label class="ov-field">
              <span>{selected.kind === "lower-third" ? "Name" : selected.kind === "logo" ? "Words (when there is no picture)" : selected.kind === "badge" ? "Word" : "Words"}</span>
              {#if selected.kind === "ticker"}
                <textarea rows="2" value={selected.text} onchange={(event) => set({ text: event.currentTarget.value })}></textarea>
              {:else}
                <input value={selected.text} onchange={(event) => set({ text: event.currentTarget.value })} />
              {/if}
            </label>
          {/if}
          {#if selected.kind === "lower-third"}
            <label class="ov-field"><span>Title</span><input value={selected.subtitle} onchange={(event) => set({ subtitle: event.currentTarget.value })} /></label>
          {/if}
          {#if selected.kind === "logo"}
            <label class="ov-field">
              <span>Picture</span>
              <select value={selected.assetId ?? ""} onchange={(event) => set({ assetId: event.currentTarget.value || null })}>
                <option value="">None: show the words</option>
                {#each images as asset (asset.id)}<option value={asset.id}>{asset.name}</option>{/each}
              </select>
            </label>
          {/if}
          {#if usesCorner(selected.kind)}
            <div class="ov-field">
              <span>Corner</span>
              <div class="ov-seg">
                {#each CORNERS as [corner, label] (corner)}
                  <button type="button" class:on={selected.corner === corner} onclick={() => set({ corner })}>{label}</button>
                {/each}
              </div>
            </div>
          {/if}
          {#if usesCorner(selected.kind) && overlays.some((other) => other.id !== selected.id && usesCorner(other.kind) && other.corner === selected.corner)}
            <p class="ov-note">Another overlay uses this corner. When both are on, only the one lower in the list shows.</p>
          {/if}
          {#if usesEdge(selected.kind)}
            <div class="ov-field">
              <span>Where</span>
              <div class="ov-seg">
                <button type="button" class:on={selected.edge === "top"} onclick={() => set({ edge: "top" })}>Top</button>
                <button type="button" class:on={selected.edge === "bottom"} onclick={() => set({ edge: "bottom" })}>Bottom</button>
              </div>
            </div>
          {/if}
          {#if selected.kind === "ticker"}
            <div class="ov-field">
              <span>Speed</span>
              <div class="ov-seg">
                <button type="button" class:on={selected.speed === 1} onclick={() => set({ speed: 1 })}>Slow</button>
                <button type="button" class:on={selected.speed === 2} onclick={() => set({ speed: 2 })}>Steady</button>
                <button type="button" class:on={selected.speed === 3} onclick={() => set({ speed: 3 })}>Quick</button>
              </div>
            </div>
          {/if}
          {#if selected.kind !== "logo" && selected.kind !== "clock"}
            <label class="ov-field ov-color"><span>Color</span><input type="color" value={selected.color} onchange={(event) => set({ color: event.currentTarget.value })} /></label>
          {/if}
          <button type="button" class="desk-btn ghost ov-remove" onclick={() => { session.removeOverlay(selected.id); selectedId = overlays.find((overlay) => overlay.id !== selected.id)?.id ?? null; }}>
            <Icon name="trash" size={14} /> Remove this overlay
          </button>
        </div>
      {/if}
    </section>
  </div>

  {#snippet footer()}
    <button type="button" class="desk-btn ghost" disabled={!overlays.some((overlay) => overlay.on)} onclick={() => session.clearOverlays()}>All off</button>
    <button type="button" class="desk-btn primary-soft" onclick={onclose}>Done</button>
  {/snippet}
</DeskDialog>

<style>
  .ov-editor { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 20px; align-items: start; }
  .ov-list { display: grid; gap: 6px; }
  .ov-row { display: flex; align-items: center; gap: 8px; padding-right: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); }
  .ov-row.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .ov-pick { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 10px; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .ov-icon { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 14%, var(--panel)); color: var(--accent); }
  .ov-copy { display: grid; min-width: 0; }
  .ov-copy strong { font-size: 13px; }
  .ov-copy em { font-style: normal; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ov-empty { margin: 0; padding: 14px; border: 1px dashed var(--line); border-radius: 10px; font-size: 13px; color: var(--muted); }
  .ov-label { margin: 10px 0 2px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .ov-kinds { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .ov-kind { display: flex; align-items: flex-start; gap: 8px; padding: 9px 10px; border: 1px dashed var(--line); border-radius: 10px; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .ov-kind:hover { border-style: solid; border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .ov-kind :global(svg) { flex: none; margin-top: 1px; color: var(--accent); }
  .ov-kind span { display: grid; gap: 1px; }
  .ov-kind strong { font-size: 12px; }
  .ov-kind em { font-style: normal; font-size: 11px; color: var(--muted); }

  .ov-side { display: grid; gap: 14px; position: sticky; top: 0; }
  .ov-preview { margin: 0; display: grid; gap: 6px; }
  .ov-screen { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: #000; }
  .ov-preview figcaption { font-size: 12px; color: var(--muted); }
  .ov-fields { display: grid; gap: 12px; }
  .ov-field { display: grid; gap: 5px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .ov-field input, .ov-field select, .ov-field textarea { min-width: 0; padding: 0 10px; height: 34px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 500; }
  .ov-field textarea { height: auto; padding: 8px 10px; resize: vertical; }
  .ov-color input { width: 60px; padding: 2px; }
  .ov-seg { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); justify-self: start; }
  .ov-seg button { height: 28px; padding: 0 12px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .ov-seg button.on { background: var(--accent); color: var(--on-accent); }
  .ov-remove { justify-self: start; }
  .ov-note { margin: -4px 0 0; font-size: 12px; color: var(--muted); }
  @media (max-width: 820px) {
    .ov-editor { grid-template-columns: 1fr; }
    .ov-side { position: static; }
  }
</style>
