<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { watchProblems } from "$lib/app/diagnostics";
  let { children } = $props();

  // Every surface (desk, audience, stage, phone) removes the plain-HTML loading mark once it runs.
  onMount(() => {
    document.getElementById("preboot")?.remove();
    // Errors nothing handled are kept on this computer for a problem report.
    return watchProblems();
  });
</script>

{@render children()}
