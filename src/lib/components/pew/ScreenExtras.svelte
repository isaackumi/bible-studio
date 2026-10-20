<script lang="ts">
  import { session } from "../../app/session.svelte";
  import Icon from "../Icon.svelte";
  import OverlaysDialog from "../OverlaysDialog.svelte";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import ScreenCardEditor from "./ScreenCardEditor.svelte";
  import { msg, t } from "../../i18n/core";

  // Two buttons that say what the service puts on the audience screen by itself and where: the
  // countdown and the leaders' names. Either opens one wide window with both, and a picture of the screen.
  let open = $state<"countdown" | "leader" | null>(null);
  let overlaysOpen = $state(false);

  const COUNT_LABEL = { corner: msg("In the corner"), full: msg("Full screen"), off: msg("Off") } as const;
  const LEADER_LABEL = { screen: msg("On screen"), preview: msg("Via Preview"), off: msg("Off") } as const;
  const mode = $derived(session.countdownMode);
  const leader = $derived(session.leaderTo);
</script>

<span class="extras">
  <button type="button" class="trigger" class:on={mode !== "off"} aria-haspopup="dialog" onclick={() => (open = "countdown")} title={t("The countdown on the audience screen: time left in the running part")}>
    <Icon name="timer" size={13} />
    <span class="what">{t("Countdown")}</span>
    <span class="state">{t(COUNT_LABEL[mode])}</span>
  </button>
  <button type="button" class="trigger" class:on={leader !== "off"} aria-haspopup="dialog" onclick={() => (open = "leader")} title={t("Who leads each part, as a name on the audience screen")}>
    <Icon name="user" size={13} />
    <span class="what">{t("Leaders' names")}</span>
    <span class="state">{t(LEADER_LABEL[leader])}</span>
  </button>
</span>

{#if open}
  <DeskDialog title={t("On the screen")} wide onclose={() => (open = null)}>
    <ScreenCardEditor bind:tab={open} onoverlays={() => { overlaysOpen = true; open = null; }} />
    {#snippet footer()}
      <button type="button" class="done" onclick={() => (open = null)}>{t("Done")}</button>
    {/snippet}
  </DeskDialog>
{/if}

{#if overlaysOpen}
  <OverlaysDialog onclose={() => (overlaysOpen = false)} />
{/if}

<style>
  .extras { display: inline-flex; gap: 6px; flex-wrap: wrap; }
  .trigger { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 10px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; white-space: nowrap; cursor: pointer; }
  .trigger:hover { background: var(--field); color: var(--ink); }
  .trigger .what { color: var(--ink); }
  .trigger .state { padding: 1px 7px; border-radius: 8px; background: color-mix(in srgb, var(--ink) 10%, transparent); font-size: 11px; }
  .trigger.on { border-color: color-mix(in srgb, #30a46c 50%, var(--line)); }
  .trigger.on .state { background: color-mix(in srgb, #30a46c 24%, transparent); color: var(--ink); }
  .done { height: 34px; padding: 0 18px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
</style>
