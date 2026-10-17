<script lang="ts">
  import { onMount } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { session } from "../app/session.svelte";
  import { mediaUrl } from "../db/api";
  import { presentImage, presentVideo } from "../domain/present";
  import { isDesktop } from "../platform/runtime";

  let picker: HTMLInputElement | null = $state(null);

  onMount(() => {
    void session.loadCameras();
  });

  async function chooseDesktop() {
    const picked = await open({
      multiple: false,
      filters: [
        { name: "Image or video", extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "m4v", "mov", "webm"] },
      ],
    });
    if (typeof picked === "string") await session.importImage(picked);
  }

  async function chooseBrowser(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) await session.importImage(file);
  }

  let loop = $state(false);

  function preview(assetId: string) {
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

  function add(assetId: string, name: string, kind: "image" | "video") {
    if (kind === "video") session.addVideo(assetId, name, { loop });
    else session.addImage(assetId, name);
  }
</script>

<div class="pane">
  {#if isDesktop()}
    <button type="button" class="primary" onclick={() => void chooseDesktop()}>Import image or video</button>
  {:else}
    <button type="button" class="primary" onclick={() => picker?.click()}>Import image or video</button>
    <input
      bind:this={picker}
      type="file"
      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mov,.m4v"
      hidden
      onchange={(event) => void chooseBrowser(event)}
    />
  {/if}
  {#if session.media.some((asset) => asset.kind === "video")}
    <label class="loop"><input type="checkbox" bind:checked={loop} /> Loop videos (backgrounds, walk-in loops)</label>
  {/if}
  {#each session.media as asset (asset.id)}
    <div class="hit">
      <strong>{asset.name}</strong>
      <span class="kind">{asset.kind === "video" ? "Video" : "Image"}</span>
      <div class="actions">
        <button type="button" onclick={() => preview(asset.id)}>Preview</button>
        <button type="button" onclick={() => add(asset.id, asset.name, asset.kind)}>Add to section</button>
        {#if asset.kind === "image"}
          <button type="button" onclick={() => session.setLogo(asset.id)}>Use as logo</button>
        {/if}
      </div>
    </div>
  {/each}

  <h4>Camera</h4>
  <p class="camera-note">Select a camera for Preview. LIVE still sends Program. Permission denied stays on this desk.</p>
  <button type="button" onclick={() => void session.loadCameras()}>List cameras</button>
  {#if session.cameraNote}<p class="camera-note">{session.cameraNote}</p>{/if}
  {#each session.cameras as camera (camera.deviceId)}
    <div class="hit">
      <strong>{camera.label}</strong>
      <div class="actions">
        <button type="button" onclick={() => void session.previewCamera(camera.deviceId)}>Preview</button>
      </div>
    </div>
  {/each}
</div>

<style>
  h4 { margin: 16px 0 6px; font-size: 13px; }
  .kind { font-size: 12px; color: var(--muted, #a3a3a3); letter-spacing: 0; }
  .loop { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted, #a3a3a3); margin: 8px 0; }
  .camera-note { margin: 0 0 8px; font-size: 12px; color: var(--muted, #a3a3a3); }
</style>
