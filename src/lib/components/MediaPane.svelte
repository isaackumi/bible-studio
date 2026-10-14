<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { session } from "../app/session.svelte";
  import { assetUrl } from "../db/api";
  import { presentImage } from "../domain/present";

  async function choose() {
    const picked = await open({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (typeof picked === "string") await session.importImage(picked);
  }
</script>

<div class="pane">
  <button type="button" class="primary" onclick={() => void choose()}>Import image</button>
  {#each session.media as asset}
    <div class="hit">
      <strong>{asset.name}</strong>
      <div class="actions">
        <button
          type="button"
          onclick={() => {
            const url = assetUrl(asset.path);
            if (!url) return;
            session.previewModel(presentImage({ theme: session.theme(), imageUrl: url }), null);
          }}
        >Preview</button>
        <button type="button" onclick={() => session.addImage(asset.id, asset.name)}>Add to section</button>
        <button type="button" onclick={() => session.setLogo(asset.id)}>Use as logo</button>
      </div>
    </div>
  {/each}
</div>
