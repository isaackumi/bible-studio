<script lang="ts">
  import { onMount } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { session } from "../app/session.svelte";
  import { mediaUrl } from "../db/api";
  import { presentImage } from "../domain/present";
  import { isDesktop } from "../platform/runtime";

  let picker: HTMLInputElement | null = $state(null);

  onMount(() => {
    void session.loadCameras();
  });

  async function chooseDesktop() {
    const picked = await open({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (typeof picked === "string") await session.importImage(picked);
  }

  async function chooseBrowser(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) await session.importImage(file);
  }

  function preview(assetId: string) {
    const url = mediaUrl(session.media.find((entry) => entry.id === assetId) ?? null);
    if (!url) return;
    session.previewModel(presentImage({ theme: session.theme(), imageUrl: url }), null);
  }
</script>

<div class="pane">
  {#if isDesktop()}
    <button type="button" class="primary" onclick={() => void chooseDesktop()}>Import image</button>
  {:else}
    <button type="button" class="primary" onclick={() => picker?.click()}>Import image</button>
    <input
      bind:this={picker}
      type="file"
      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
      hidden
      onchange={(event) => void chooseBrowser(event)}
    />
  {/if}
  {#each session.media as asset}
    <div class="hit">
      <strong>{asset.name}</strong>
      <div class="actions">
        <button type="button" onclick={() => preview(asset.id)}>Preview</button>
        <button type="button" onclick={() => session.addImage(asset.id, asset.name)}>Add to section</button>
        <button type="button" onclick={() => session.setLogo(asset.id)}>Use as logo</button>
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
  .camera-note { margin: 0 0 8px; font-size: 12px; color: var(--muted, #a3a3a3); }
</style>
