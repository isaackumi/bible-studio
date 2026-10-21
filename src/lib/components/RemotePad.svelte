<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../i18n/core";

  // One phone UI for every transport: static/remote.html (LAN server and same-origin windows).
  // Relative, so it opens beside the desk wherever it is served (the app, or the web demo under /app).
  onMount(() => {
    location.replace("remote.html");
  });
</script>

<p style="font: 15px system-ui; color: #9aa7b8; padding: 24px">{t("Opening the remote…")}</p>
