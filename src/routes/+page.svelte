<script lang="ts">
  import { onMount } from "svelte";
  import AudienceOutput from "$lib/components/AudienceOutput.svelte";
  import OperatorShell from "$lib/components/OperatorShell.svelte";
  import { isDesktop } from "$lib/platform/runtime";

  let surface = $state<"boot" | "operator" | "audience">("boot");

  onMount(async () => {
    const tauri = isDesktop();
    if (!tauri) {
      surface = new URLSearchParams(window.location.search).get("display") === "1" ? "audience" : "operator";
      return;
    }
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    surface = getCurrentWindow().label === "audience" ? "audience" : "operator";
  });
</script>

{#if surface === "audience"}
  <AudienceOutput />
{:else if surface === "operator"}
  <OperatorShell />
{:else}
  <div class="boot">CHURCH STUDIO</div>
{/if}
