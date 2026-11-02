<script lang="ts">
  import type { CloudSync } from "../app/cloud.svelte";
  import { t, tn } from "../i18n/core";
  import TopCard from "./TopCard.svelte";

  // Ask me first: what changed here is waiting. Later puts it away until there is more.
  let { cloud }: { cloud: CloudSync } = $props();
</script>

<TopCard icon="cloud" title={tn(cloud.asking, "{n} change waiting to sync", "{n} changes waiting to sync")} detail={t("It stays on this computer until you sync it to the cloud.")} onclose={cloud.askLater}>
  <button type="button" onclick={() => void cloud.sendHeld()}>{t("Sync now")}</button>
  <button type="button" onclick={cloud.askLater}>{t("Later")}</button>
</TopCard>
