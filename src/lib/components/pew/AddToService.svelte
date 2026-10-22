<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { t } from "../../i18n/core";
  import Icon from "../Icon.svelte";

  // "Add to service" that asks first: the window names the service (switch it, or start one) and
  // lists its parts; nothing is added until a part is chosen.
  let {
    onadd,
    item = "",
    label = t("Add to service"),
    disabled = false,
    className = "desk-btn",
  }: { onadd: (sectionId: string) => void; item?: string; label?: string; disabled?: boolean; className?: string } = $props();

  async function ask() {
    const sectionId = await session.pickServicePart(item || label);
    if (sectionId) onadd(sectionId);
  }
</script>

<button type="button" class={className} {disabled} aria-haspopup="dialog" data-tip={session.service ? t("Add to {service}", { service: session.service.name }) : t("Add to a service")} onclick={() => void ask()}>
  <Icon name="queue" size={14} /> {label}
</button>
