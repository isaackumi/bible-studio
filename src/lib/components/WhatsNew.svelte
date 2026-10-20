<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { session } from "../app/session.svelte";
  import { t } from "../i18n/core";
  import Icon from "./Icon.svelte";

  // Shown once, the first time a new version opens: what changed, in a few plain lines.
  const release = $derived(session.whatsNew);
  let close: HTMLButtonElement | undefined = $state();
  $effect(() => {
    if (release) close?.focus();
  });
</script>

{#if release}
  <div class="scrim" role="presentation" transition:fade={{ duration: 150 }} onclick={() => session.dismissWhatsNew()}></div>
  <div class="card" role="dialog" aria-modal="true" aria-labelledby="whats-new-title" tabindex="-1" transition:scale={{ start: 0.96, duration: 180 }} onkeydown={(event) => event.key === "Escape" && session.dismissWhatsNew()}>
    <p class="eyebrow">{t("Updated to {version}", { version: release.version })}</p>
    <h2 id="whats-new-title">{t("What's new")}</h2>
    <ul>
      {#each release.highlights as highlight (highlight.title)}
        <li>
          <span class="icon"><Icon name={highlight.icon} size={18} /></span>
          <div><strong>{t(highlight.title)}</strong><span>{t(highlight.text)}</span></div>
        </li>
      {/each}
    </ul>
    <button type="button" class="ok" bind:this={close} onclick={() => session.dismissWhatsNew()}>{t("Got it")}</button>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 950; background: rgb(0 0 0 / 0.55); }
  .card {
    position: fixed;
    left: 50%;
    top: 50%;
    z-index: 951;
    width: min(480px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow: auto;
    translate: -50% -50%;
    padding: 26px 26px 22px;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: var(--panel);
    color: var(--ink);
    box-shadow: 0 30px 80px rgb(0 0 0 / 0.5);
  }
  .eyebrow { margin: 0 0 4px; font-size: 12px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); }
  h2 { margin: 0 0 18px; font-size: 22px; letter-spacing: -0.01em; }
  ul { display: grid; gap: 14px; margin: 0 0 22px; padding: 0; list-style: none; }
  li { display: flex; gap: 12px; align-items: flex-start; }
  .icon { flex: none; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
  li div { display: grid; gap: 2px; }
  li strong { font-size: 14px; }
  li span { font-size: 13px; line-height: 1.45; color: var(--muted); }
  .ok { width: 100%; height: 42px; border: 0; border-radius: 11px; background: var(--accent); color: #fff; font: inherit; font-size: 14px; font-weight: 750; }
  .ok:hover { filter: brightness(1.06); }
</style>
