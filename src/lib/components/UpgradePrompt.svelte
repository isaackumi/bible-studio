<script lang="ts">
  import { session } from "../app/session.svelte";
  import { FEATURE_LABELS, planFor, TRIAL_DAYS } from "../domain/plans";
  import Icon from "./Icon.svelte";
  import MiniDesk from "./onboarding/MiniDesk.svelte";
  import { presentCamera } from "../domain/camera";
  import { presentScripture } from "../domain/present";
  import { t } from "../i18n/core";

  // Shown when a feature is outside the current plan. Offers the one-time trial, or the plans page.
  const feature = $derived(session.upgradeFor);
  const plan = $derived(feature ? planFor(feature) : null);
  const canTrial = $derived(!session.workspace.entitlement.trialUsed && session.workspace.entitlement.plan === "free" && plan?.id === "premium");
  const highlights = $derived(plan ? plan.features.filter((entry) => !FEATURE_LABELS[entry].soon && !["presenter", "scripture", "songs", "sermon", "slides", "media", "audience-output"].includes(entry)).slice(0, 6) : []);

  /** The Production Desk is easier to want once you have seen it: a camera with a verse beside it. */
  const glimpse = $derived(
    feature === "production"
      ? {
          preview: presentCamera({ theme: session.theme(), label: "Camera 1" }),
          program: presentScripture({ theme: session.theme(), reference: "Psalm 23:1", attribution: "", verses: [{ verse: 1, text: "The Lord is my shepherd; I shall not want." }] }),
        }
      : null,
  );

  function close() {
    session.upgradeFor = null;
  }

  function trial() {
    if (session.startTrial()) close();
  }

  function plans() {
    close();
    session.openSettings("account");
  }

  function onKey(event: KeyboardEvent) {
    if (feature && event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if feature && plan}
  <div class="layer">
    <button type="button" class="backdrop" aria-label={t("Close")} onclick={close}></button>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
      {#if glimpse}
        <div class="glimpse"><MiniDesk preview={glimpse.preview} program={glimpse.program} onAir reference="Camera 1" desk="obs" /></div>
      {/if}
      <span class="badge" style:background={plan.color}><Icon name="key" size={20} /></span>
      <p class="eyebrow">{t("{name} feature", { name: t(plan.name) })}</p>
      <h2 id="upgrade-title">{t(FEATURE_LABELS[feature].label)}</h2>
      <p class="lede">{t("Part of {name}. {tagline}", { name: t(plan.name), tagline: t(plan.tagline) })}</p>
      {#if highlights.length}
        <ul>
          {#each highlights as entry (entry)}
            <li class:this={entry === feature}><Icon name="check" size={14} />{t(FEATURE_LABELS[entry].label)}</li>
          {/each}
        </ul>
      {/if}
      <div class="buttons">
        {#if canTrial}
          <button type="button" class="primary" style:background={plan.color} onclick={trial}>{t("Start {TRIAL_DAYS}-day free trial", { TRIAL_DAYS })}</button>
        {/if}
        <button type="button" onclick={plans}>{t("See plans")}</button>
        <button type="button" class="quiet" onclick={close}>{t("Not now")}</button>
      </div>
      {#if canTrial}<p class="fine">{t("Runs on this computer. No card needed. Your library stays yours on every plan.")}</p>{/if}
    </div>
  </div>
{/if}

<style>
  .layer { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; }
  .backdrop { position: absolute; inset: 0; border: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(6px); }
  .sheet {
    position: relative;
    width: min(440px, calc(100% - 32px));
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 28px;
    border: 1px solid color-mix(in srgb, var(--ink) 12%, var(--line));
    border-radius: 18px;
    background: var(--panel);
    color: var(--ink);
    box-shadow: 0 40px 120px rgba(0, 0, 0, 0.55);
  }
  .glimpse { align-self: stretch; margin: -8px -8px 10px; pointer-events: none; }
  .glimpse :global(.window) { box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45); }
  .badge { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; color: #fff; margin-bottom: 6px; }
  .eyebrow { margin: 0; font-size: 12px; font-weight: 700; color: var(--muted); }
  h2 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
  .lede { margin: 0 0 6px; font-size: 13px; color: var(--muted); line-height: 1.5; }
  ul { list-style: none; margin: 4px 0 10px; padding: 0; display: flex; flex-direction: column; gap: 6px; width: 100%; }
  li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  li :global(svg) { color: var(--presence, #3fb950); flex: none; }
  li.this { font-weight: 700; }
  .buttons { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
  .buttons button { height: 36px; padding: 0 16px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
  .buttons .primary { flex: 1; border-color: transparent; color: #fff; }
  .buttons .quiet { background: none; border-color: transparent; color: var(--muted); }
  .fine { margin: 4px 0 0; font-size: 11px; color: var(--muted); }
</style>
