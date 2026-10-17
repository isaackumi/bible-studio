<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  let { children } = $props();

  // Every surface (desk, audience, stage, phone) removes the plain-HTML loading mark once it runs.
  onMount(() => document.getElementById("preboot")?.remove());
</script>

{@render children()}
