<script lang="ts">
  import { session } from "../app/session.svelte";
  import { defaultShortcuts, shortcutLabel } from "../keyboard/manager";
  import { t } from "../i18n/core";

  const map = $derived(session.workspace.shortcuts ?? defaultShortcuts);
</script>

<div class="transport">
  <button class="take" onclick={() => session.take()}>{t("Go live")} <kbd>{shortcutLabel(map, "take")}</kbd></button>
  <button onclick={() => session.cut()}>{t("Cut")} <kbd>{shortcutLabel(map, "cut")}</kbd></button>
  <button onclick={() => session.clear()}>{t("Clear")} <kbd>{shortcutLabel(map, "clear")}</kbd></button>
  <button onclick={() => session.black()}>{t("Black")} <kbd>{shortcutLabel(map, "black")}</kbd></button>
  <button onclick={() => session.logo()}>{t("Logo")} <kbd>{shortcutLabel(map, "logo")}</kbd></button>
  <span class="spacer"></span>
  <span class="hint">{t("← → move preview, not program")}</span>
</div>
