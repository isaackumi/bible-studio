<script lang="ts">
  import { session } from "../app/session.svelte";
  import { defaultShortcuts, shortcutLabel } from "../keyboard/manager";

  const map = $derived(session.workspace.shortcuts ?? defaultShortcuts);
</script>

<div class="transport">
  <button class="take" onclick={() => session.take()}>Go live <kbd>{shortcutLabel(map, "take")}</kbd></button>
  <button onclick={() => session.cut()}>Cut <kbd>{shortcutLabel(map, "cut")}</kbd></button>
  <button onclick={() => session.clear()}>Clear <kbd>{shortcutLabel(map, "clear")}</kbd></button>
  <button onclick={() => session.black()}>Black <kbd>{shortcutLabel(map, "black")}</kbd></button>
  <button onclick={() => session.logo()}>Logo <kbd>{shortcutLabel(map, "logo")}</kbd></button>
  <span class="spacer"></span>
  <span class="hint">← → move preview, not program</span>
</div>
