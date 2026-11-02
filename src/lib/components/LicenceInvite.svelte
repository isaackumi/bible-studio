<script lang="ts">
  import { session } from "../app/session.svelte";
  import { t } from "../i18n/core";
  import TopCard from "./TopCard.svelte";

  // Added to another church's licence. Nothing changes here until someone chooses: switching is in
  // Settings, beside the licences, with what it does said plainly.
  let { invite }: { invite: { license: string; by?: string } } = $props();
</script>

<TopCard icon="church" title={invite.by ? t("{name} added you to their licence", { name: invite.by }) : t("You were added to another licence")} detail={t("This computer stays on its own library until you choose.")} onclose={() => session.notNowLicence(invite.license)}>
  <button type="button" onclick={() => session.openSettings("account")}>{t("Review")}</button>
  <button type="button" onclick={() => session.notNowLicence(invite.license)}>{t("Not now")}</button>
</TopCard>
