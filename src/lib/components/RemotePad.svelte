<script lang="ts">
  import { onMount } from "svelte";

  // One phone UI for every transport: static/remote.html (LAN server and same-origin windows).
  onMount(() => {
    location.replace("/remote.html");
  });
</script>

<p style="font: 15px system-ui; color: #9aa7b8; padding: 24px">Opening the remote…</p>
