<script lang="ts">
  import { onMount, type Component } from "svelte";
  import { isDesktop } from "$lib/platform/runtime";

  type Surface = "operator" | "audience" | "remote" | "stage" | "second" | "screen" | "receiver";

  // Each window loads only what it shows: an audience, stage or extra screen never loads the desk
  // (most of the app's code), so it opens faster and holds less memory, once per screen.
  const SURFACES: Record<Surface, () => Promise<{ default: Component<any> }>> = {
    operator: () => import("$lib/components/OperatorShell.svelte"),
    audience: () => import("$lib/components/AudienceOutput.svelte"),
    remote: () => import("$lib/components/RemotePad.svelte"),
    stage: () => import("$lib/components/StageOutput.svelte"),
    second: () => import("$lib/components/SecondOutput.svelte"),
    screen: () => import("$lib/components/ScreenOutput.svelte"),
    // A phone or browser used as a display, over the internet (/d/CODE).
    receiver: () => import("$lib/components/ReceiverOutput.svelte"),
  };

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
    if (/^[A-Za-z0-9]{6}$/.test(params.get("receiver") ?? "")) return "receiver";
    if (params.get("stage") === "1" || tauriWindowLabel() === "stage") return "stage";
    if (params.get("second") === "1" || tauriWindowLabel() === "second") return "second";
    // Extra screens (Settings › Screens): ?screen=<id>, or a window labelled screen-<id>.
    if (params.get("screen") || tauriWindowLabel()?.startsWith("screen-")) return "screen";
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

{#await SURFACES[surface]() then { default: View }}
  {#if surface === "receiver"}
    <View code={(new URLSearchParams(window.location.search).get("receiver") ?? "").toUpperCase()} />
  {:else if surface === "screen"}
    <View id={new URLSearchParams(window.location.search).get("screen") || (tauriWindowLabel() ?? "").replace(/^screen-/, "")} />
  {:else}
    <View />
  {/if}
{/await}
