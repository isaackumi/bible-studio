<script lang="ts">
  import { onMount } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { session } from "../../app/session.svelte";
  import { mediaUrl } from "../../db/api";
  import { presentImage, presentVideo } from "../../domain/present";
  import type { SourceFields } from "../../domain/sources";
  import { isDesktop } from "../../platform/runtime";
  import Icon from "../Icon.svelte";
  import SlidesPanel from "../SlidesPanel.svelte";

  // Production Desk media: files, cameras and slide decks. "Add to scene" puts a source on the
  // scene on Preview; "Preview" shows the item alone. Program changes only on TAKE / LIVE.
  let { locked, onadd }: { locked: boolean; onadd: (name: string, fields: SourceFields) => void } = $props();

  type Tab = "files" | "cameras" | "slides";
  const TABS: { id: Tab; label: string }[] = [
    { id: "files", label: "Files" },
    { id: "cameras", label: "Cameras" },
    { id: "slides", label: "Slides" },
  ];
  let tab = $state<Tab>("files");
  let loop = $state(false);
  let picker = $state<HTMLInputElement | null>(null);
  const lockedTip = "This scene is locked. Unlock it to add sources.";

  onMount(() => {
    void session.loadCameras();
  });

  async function chooseDesktop() {
    const picked = await open({
      multiple: false,
      filters: [{ name: "Image or video", extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "m4v", "mov", "webm"] }],
    });
    if (typeof picked === "string") await session.importImage(picked);
  }

  async function chooseBrowser(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) await session.importImage(file);
  }

  function previewFile(assetId: string) {
    const asset = session.media.find((entry) => entry.id === assetId) ?? null;
    const url = mediaUrl(asset);
    if (!url || !asset) return;
    session.previewModel(
      asset.kind === "video"
        ? presentVideo({ theme: session.theme(), videoUrl: url, loop })
        : presentImage({ theme: session.theme(), imageUrl: url }),
      null,
    );
  }

  function addFile(assetId: string) {
    const asset = session.media.find((entry) => entry.id === assetId) ?? null;
    const url = mediaUrl(asset) ?? "";
    if (!asset) return;
    onadd(
      asset.name,
      asset.kind === "video"
        ? { type: "video", assetId: asset.id, name: asset.name, videoUrl: url, loop, muted: false }
        : { type: "image", assetId: asset.id, name: asset.name, imageUrl: url },
    );
  }

  function addCamera(deviceId: string, label: string) {
    onadd(label, { type: "camera", deviceId, label, mirror: false });
  }
</script>

<div class="media-dock">
  <div class="tabs" role="tablist" aria-label="Media">
    {#each TABS as entry (entry.id)}
      <button type="button" role="tab" aria-selected={tab === entry.id} class:on={tab === entry.id} onclick={() => (tab = entry.id)}>{entry.label}</button>
    {/each}
  </div>

  {#if tab === "files"}
    <div class="body">
      <div class="bar">
        {#if isDesktop()}
          <button type="button" class="desk-btn" onclick={() => void chooseDesktop()}><Icon name="plus" size={14} /> Import</button>
        {:else}
          <button type="button" class="desk-btn" onclick={() => picker?.click()}><Icon name="plus" size={14} /> Import</button>
          <input
            bind:this={picker}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mov,.m4v"
            hidden
            onchange={(event) => void chooseBrowser(event)}
          />
        {/if}
        {#if session.media.some((asset) => asset.kind === "video")}
          <label class="loop"><input type="checkbox" bind:checked={loop} /> Loop videos</label>
        {/if}
      </div>
      {#if session.media.length === 0}
        <p class="empty">Import images and videos for backgrounds, walk-in loops and clips.</p>
      {/if}
      {#each session.media as asset (asset.id)}
        <div class="row">
          <span class="name"><strong>{asset.name}</strong><small>{asset.kind === "video" ? "Video" : "Image"}</small></span>
          <button type="button" class="desk-btn ghost" data-tip="Show alone on Preview" onclick={() => previewFile(asset.id)}>Preview</button>
          <button type="button" class="desk-btn" disabled={locked} data-tip={locked ? lockedTip : "Add to the scene on Preview"} onclick={() => addFile(asset.id)}>Add to scene</button>
          {#if asset.kind === "image"}
            <button type="button" class="desk-btn ghost icon" aria-label={`Use ${asset.name} as logo`} data-tip="Use as logo" onclick={() => session.setLogo(asset.id)}><Icon name="logo" size={14} /></button>
          {/if}
        </div>
      {/each}
    </div>
  {:else if tab === "cameras"}
    <div class="body">
      <div class="bar">
        <button type="button" class="desk-btn" onclick={() => void session.loadCameras()}><Icon name="refresh" size={14} /> Refresh</button>
      </div>
      {#if session.cameraNote}<p class="empty">{session.cameraNote}</p>{/if}
      {#if session.cameras.length === 0 && !session.cameraNote}
        <p class="empty">No cameras found. Connect a camera, then Refresh.</p>
      {/if}
      {#each session.cameras as camera (camera.deviceId)}
        <div class="row">
          <span class="name"><strong>{camera.label}</strong></span>
          <button type="button" class="desk-btn ghost" data-tip="Show alone on Preview" onclick={() => void session.previewCamera(camera.deviceId)}>Preview</button>
          <button type="button" class="desk-btn" disabled={locked} data-tip={locked ? lockedTip : "Add to the scene on Preview"} onclick={() => addCamera(camera.deviceId, camera.label)}>Add to scene</button>
        </div>
      {/each}
    </div>
  {:else}
    <SlidesPanel />
  {/if}
</div>

<style>
  .media-dock { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  .tabs { display: flex; gap: 2px; padding: 6px 8px; border-bottom: 1px solid var(--line); flex: none; }
  .media-dock .tabs button {
    flex: none;
    text-transform: none;
    letter-spacing: normal;
    font-size: 13px;
    height: 28px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    font-weight: 600;
  }
  .media-dock .tabs button:hover { color: var(--ink); }
  .media-dock .tabs button.on { color: var(--ink); background: var(--field); border-color: var(--line); }
  .body { display: flex; flex-direction: column; gap: 4px; padding: 8px; overflow: auto; min-height: 0; }
  .bar { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .loop { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); }
  .empty { margin: 4px 2px; font-size: 12px; color: var(--muted); }
  .row { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 8px; }
  .row:hover { background: var(--field); }
  .name { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
  .name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .name small { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
</style>
