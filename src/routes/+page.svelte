<script lang="ts">
  import { onMount } from "svelte";
  import AudienceOutput from "$lib/components/AudienceOutput.svelte";
  import OperatorShell from "$lib/components/OperatorShell.svelte";
  import RemotePad from "$lib/components/RemotePad.svelte";
  import { isDesktop } from "$lib/platform/runtime";

  let surface = $state<"boot" | "operator" | "audience" | "remote">("boot");

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("remote") === "1") {
      surface = "remote";
      return;
    }
    const tauri = isDesktop();
    if (!tauri) {
      surface = params.get("display") === "1" ? "audience" : "operator";
      return;
    }
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    surface = getCurrentWindow().label === "audience" ? "audience" : "operator";
  });
</script>

{#if surface === "audience"}
  <AudienceOutput />
{:else if surface === "remote"}
  <RemotePad />
{:else if surface === "operator"}
  <OperatorShell />
{:else}
  <div class="boot">CHURCH STUDIO</div>
{/if}
