<script lang="ts">
  import { onMount } from "svelte";
  import AudienceOutput from "$lib/components/AudienceOutput.svelte";
  import OperatorShell from "$lib/components/OperatorShell.svelte";
  import RemotePad from "$lib/components/RemotePad.svelte";
  import StageOutput from "$lib/components/StageOutput.svelte";
  import SecondOutput from "$lib/components/SecondOutput.svelte";
  import { isDesktop } from "$lib/platform/runtime";

  type Surface = "operator" | "audience" | "remote" | "stage" | "second";

  function markedAudience(): boolean {
    if (typeof window === "undefined") return false;
    const page = window as Window & { __CHURCH_STUDIO_SURFACE__?: string };
    return page.__CHURCH_STUDIO_SURFACE__ === "audience";
  }

  function tauriWindowLabel(): string | null {
    if (typeof window === "undefined") return null;
    try {
      const internals = window as Window & {
        __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } };
      };
      return internals.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? null;
    } catch {
      return null;
    }
  }

  function initialSurface(): Surface {
    if (typeof window === "undefined") return "operator";
    const params = new URLSearchParams(window.location.search);
    if (params.get("remote") === "1") return "remote";
    if (params.get("stage") === "1" || tauriWindowLabel() === "stage") return "stage";
    if (params.get("second") === "1" || tauriWindowLabel() === "second") return "second";
    if (params.get("display") === "1" || markedAudience()) return "audience";
    if (isDesktop() && tauriWindowLabel() === "audience") return "audience";
    return "operator";
  }

  let surface = $state<Surface>(initialSurface());

  onMount(() => {
    if (surface !== "operator") return;
    if (markedAudience() || tauriWindowLabel() === "audience") surface = "audience";
  });
</script>

{#if surface === "audience"}
  <AudienceOutput />
{:else if surface === "remote"}
  <RemotePad />
{:else if surface === "stage"}
  <StageOutput />
{:else if surface === "second"}
  <SecondOutput />
{:else}
  <OperatorShell />
{/if}
