<script lang="ts">
  import { session } from "../app/session.svelte";
  import { FEATURE_LABELS, planFor, TRIAL_DAYS } from "../domain/plans";
  import Icon from "./Icon.svelte";

  // Shown when a feature is outside the current plan. Offers the one-time trial, or the plans page.
  const feature = $derived(session.upgradeFor);
  const plan = $derived(feature ? planFor(feature) : null);
  const canTrial = $derived(!session.workspace.entitlement.trialUsed && session.workspace.entitlement.plan === "free" && plan?.id === "premium");
  const highlights = $derived(plan ? plan.features.filter((entry) => !FEATURE_LABELS[entry].soon && !["presenter", "scripture", "songs", "sermon", "slides", "media", "audience-output"].includes(entry)).slice(0, 6) : []);

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
    <button type="button" class="backdrop" aria-label="Close" onclick={close}></button>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
      <span class="badge" style:background={plan.color}><Icon name="key" size={20} /></span>
      <p class="eyebrow">{plan.name} feature</p>
      <h2 id="upgrade-title">{FEATURE_LABELS[feature].label}</h2>
      <p class="lede">Part of {plan.name}. {plan.tagline}</p>
      {#if highlights.length}
        <ul>
          {#each highlights as entry (entry)}
            <li class:this={entry === feature}><Icon name="check" size={14} />{FEATURE_LABELS[entry].label}</li>
          {/each}
        </ul>
      {/if}
      <div class="buttons">
        {#if canTrial}
          <button type="button" class="primary" style:background={plan.color} onclick={trial}>Start {TRIAL_DAYS}-day free trial</button>
        {/if}
        <button type="button" onclick={plans}>See plans</button>
        <button type="button" class="quiet" onclick={close}>Not now</button>
      </div>
      {#if canTrial}<p class="fine">Runs on this computer. No card needed. Your library stays yours on every plan.</p>{/if}
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
