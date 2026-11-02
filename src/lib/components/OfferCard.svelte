<script lang="ts">
  import { session } from "../app/session.svelte";
  import { t, tn } from "../i18n/core";
  import type { Offer } from "../sync/offer";
  import TopCard from "./TopCard.svelte";

  // Another computer pushed something. Nothing reaches the library until someone here accepts it.
  let { offer }: { offer: Offer } = $props();
</script>

<TopCard icon="laptop" title={t("{name} sent you something", { name: offer.from })} detail={tn(offer.items.length + offer.files.length, "{n} item is waiting for you to accept.", "{n} items are waiting for you to accept.")} onclose={() => session.closeOfferCard(offer.id)}>
  <button type="button" onclick={() => (session.reviewing = offer)}>{t("Review")}</button>
</TopCard>
