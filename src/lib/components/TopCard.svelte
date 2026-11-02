<script lang="ts">
  import type { Snippet } from "svelte";
  import { fly } from "../ui/motion";
  import { t } from "../i18n/core";
  import Icon from "./Icon.svelte";

  // A card at the top of the desk asking for a decision. It never times out: it waits to be answered.
  let { icon, title, detail, onclose, children }: { icon: string; title: string; detail: string; onclose: () => void; children: Snippet } = $props();
</script>

<div class="card" role="status" transition:fly={{ y: -10, duration: 180 }}>
  <span class="badge"><Icon name={icon as never} size={15} /></span>
  <div class="copy"><strong>{title}</strong><span>{detail}</span></div>
  <div class="acts">{@render children()}</div>
  <button type="button" class="close" aria-label={t("Close")} title={t("Close")} onclick={onclose}><Icon name="close" size={14} /></button>
</div>

<style>
  .card { display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 12px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 12px; background: var(--panel); color: var(--ink); box-shadow: 0 14px 40px rgb(0 0 0 / 0.35); }
  .badge { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent-text); }
  .copy { display: grid; gap: 1px; min-width: 0; flex: 1; }
  .copy strong { font-size: 13px; font-weight: 700; }
  .copy span { font-size: 12px; color: var(--muted); }
  .acts { flex: none; display: flex; gap: 6px; }
  .acts :global(button) { height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; }
  .acts :global(button:hover) { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .close { flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--muted); display: grid; place-items: center; }
  .close:hover { background: var(--field); color: var(--ink); }
</style>
