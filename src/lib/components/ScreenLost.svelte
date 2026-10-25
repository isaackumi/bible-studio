<script lang="ts">
  import { fly } from "svelte/transition";
  import { session } from "../app/session.svelte";
  import { t } from "../i18n/core";
  import Icon from "./Icon.svelte";

  // The audience screen dropped out mid-service: said plainly at the top of the desk until it is
  // back. Program is held, and the screen picks up again by itself.
  let { name }: { name: string } = $props();
</script>

<div class="lost" role="alert" transition:fly={{ y: -10, duration: 180 }}>
  <span class="badge"><Icon name="screens" size={15} /></span>
  <div class="copy">
    <strong>{t("{name} disconnected", { name })}</strong>
    <span>{t("Program is held and comes back by itself when the screen returns. Check the cable and the TV's input.")}</span>
  </div>
  <button type="button" class="act" onclick={() => session.openSettings("displays")}>{t("Screens")}</button>
</div>

<style>
  .lost {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 890;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(620px, calc(100vw - 32px));
    padding: 10px 10px 10px 12px;
    border: 1px solid color-mix(in srgb, #ff6b4a 55%, var(--line));
    border-radius: 12px;
    background: color-mix(in srgb, var(--panel) 88%, #ff6b4a 12%);
    color: var(--ink);
    box-shadow: 0 14px 40px rgb(0 0 0 / 0.35);
  }
  .badge { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, #ff6b4a 25%, transparent); color: #ff6b4a; }
  .copy { display: grid; gap: 1px; min-width: 0; flex: 1; }
  .copy strong { font-size: 13px; font-weight: 700; }
  .copy span { font-size: 12px; color: var(--muted); }
  .act { flex: none; height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; }
  .act:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
</style>
