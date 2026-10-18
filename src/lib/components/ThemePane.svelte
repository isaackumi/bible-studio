<script lang="ts">
  import { session } from "../app/session.svelte";
  import OutputType from "./OutputType.svelte";
  import { t } from "../i18n/core";

  const theme = $derived(session.theme());
</script>

<div class="pane">
  <p class="hint">{t("Church name, used on the logo frame")}</p>
  <input class="field" value={session.workspace.churchName} aria-label={t("Church name")} oninput={(event) => session.setChurchName(event.currentTarget.value)} />
  <OutputType />
  <p class="hint">{t("Go live transition")}</p>
  <select
    class="field"
    value={theme.transition.type}
    aria-label={t("Transition")}
    onchange={(event) =>
      session.saveTheme({
        ...theme,
        transition: { ...theme.transition, type: event.currentTarget.value as "cut" | "fade" },
      })}
  >
    <option value="fade">{t("Fade")}</option>
    <option value="cut">{t("Cut")}</option>
  </select>
  <p class="hint">{t("Cut still switches instantly. Go live uses this transition.")}</p>
</div>
