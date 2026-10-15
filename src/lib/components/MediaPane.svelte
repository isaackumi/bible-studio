<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { session } from "../app/session.svelte";
  import { mediaUrl } from "../db/api";
  import { presentImage } from "../domain/present";
  import { isDesktop } from "../platform/runtime";

  let picker: HTMLInputElement | null = $state(null);

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
</div>
