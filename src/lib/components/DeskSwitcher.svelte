<script lang="ts">
  import { session } from "../app/session.svelte";
  import { audienceRoom } from "../app/rooms.svelte";
  import Icon from "./Icon.svelte";
  import { t } from "../i18n/core";

  /** Compact: icons only, names in the tooltip. */
  let { compact = false }: { compact?: boolean } = $props();
</script>

<nav class="desk-switch" class:compact aria-label={t("Desk")}>
  <button
    type="button"
    class:on={session.workspace.appearance.desk === "pewbeam" || !session.entitled("production")}
    aria-label={t("Presenter Desk")}
    aria-pressed={session.workspace.appearance.desk === "pewbeam" || !session.entitled("production")}
    data-tip={t("Presenter Desk: scripture, songs and sermons")}
    onclick={() => session.setAppearance({ desk: "pewbeam" })}
  >
    <Icon name="pew" size={16} />
    <span class="label">{t("Presenter Desk")}</span>
    <span class="short">{t("Presenter")}</span>
  </button>
  <button
    type="button"
    class:on={session.workspace.appearance.desk === "obs" && session.entitled("production")}
    aria-label={t("Production Desk")}
    aria-pressed={session.workspace.appearance.desk === "obs" && session.entitled("production")}
    data-tip={t("Production Desk: scenes, cameras and video")}
    onclick={() => session.requireFeature("production") && session.setAppearance({ desk: "obs" })}
  >
    <Icon name="obs" size={16} />
    <span class="label">{t("Production Desk")}</span>
    <span class="short">{t("Production")}</span>
  </button>
  <!-- Not a desk: the design studio opens over whichever desk is showing. -->
  <button
    type="button"
    class="studio"
    class:on={!!session.studio}
    aria-label={t("Design studio")}
    data-tip={t("Design studio: slides, templates, lower thirds, gradients and icons (⌘K, then type “design”)")}
    onclick={() => session.openStudio()}
  >
    <Icon name="stage" size={16} />
    <span class="label">{t("Studio")}</span>
    <span class="short">{t("Studio")}</span>
  </button>
  <!-- The congregation's phones: Q&A, quizzes and polls (a drawer beside the desk). -->
  <button
    type="button"
    class:on={audienceRoom.open}
    aria-label={t("Audience")}
    aria-pressed={audienceRoom.open}
    data-tip={t("Audience: live Q&A, quizzes, Bible games and polls on people's phones")}
    onclick={() => (audienceRoom.open ? audienceRoom.hide() : audienceRoom.show())}
  >
    <Icon name="users" size={16} />
    <span class="label">{t("Audience")}</span>
    <span class="short">{t("Audience")}</span>
    {#if (audienceRoom.view?.questions.filter((question) => question.state === "pending").length ?? 0) > 0}<span class="dot" aria-hidden="true"></span>{/if}
  </button>
</nav>

<style>
  .short { display: none; }
  /* Questions are waiting for the operator. */
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); margin-left: 2px; }
  .compact .label { display: none; }
  .compact button { width: var(--tool-size); padding: 0; justify-content: center; }
  /* With room in the bar, the compact switch names its desks too. */
  @media (min-width: 1400px) {
    .compact .short { display: inline; font-size: 12px; font-weight: 650; }
    .compact button { width: auto; padding: 0 10px; gap: 6px; }
  }
</style>
