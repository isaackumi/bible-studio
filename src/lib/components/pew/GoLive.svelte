<script lang="ts">
  import { session } from "../../app/session.svelte";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";

  // LIVE, on the Preview picture itself: what you see here goes to the screen with one click.
  // Hidden while Preview is empty; says so when Preview is already what the audience sees.
  const empty = $derived(session.live.preview.model.layout === "empty");
  const same = $derived(
    !!session.live.preview.sourceId &&
      session.live.preview.sourceId === session.live.program.sourceId &&
      session.live.preview.model.reference === session.live.program.model.reference &&
      session.live.preview.model.lines.map((line) => line.text).join("\n") === session.live.program.model.lines.map((line) => line.text).join("\n"),
  );
</script>

{#if !empty}
  {#if same}
    <span class="go-live on" role="status"><Icon name="check" size={12} /> {t("On LIVE")}</span>
  {:else}
    <button type="button" class="go-live" title={t("Send Preview to the screen (Space)")} onclick={() => void session.take()}>
      <i aria-hidden="true"></i>{t("Go LIVE")}<kbd>{t("Space")}</kbd>
    </button>
  {/if}
{/if}

<style>
  .go-live {
    position: absolute;
    right: var(--go-live-inset, 8px);
    bottom: var(--go-live-inset, 8px);
    z-index: 5;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 6px 0 12px;
    border: 0;
    border-radius: 999px;
    background: var(--live, #e5484d);
    color: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.45);
    cursor: pointer;
    opacity: 0.92;
    transform: translateY(0);
    transition: opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  }
  .go-live:hover { opacity: 1; transform: translateY(-1px); box-shadow: 0 6px 18px color-mix(in srgb, var(--live, #e5484d) 45%, transparent); }
  .go-live:active { transform: translateY(0) scale(0.97); }
  .go-live i { width: 7px; height: 7px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 0 rgb(255 255 255 / 0.7); animation: beat 1.8s ease-out infinite; }
  .go-live kbd { padding: 2px 6px; border-radius: 999px; background: rgb(0 0 0 / 0.22); font: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0; }
  .go-live.on { padding: 0 11px; background: rgb(0 0 0 / 0.62); color: #8fe3b4; font-weight: 700; cursor: default; box-shadow: none; }
  @keyframes beat { to { box-shadow: 0 0 0 7px rgb(255 255 255 / 0); } }
  @media (prefers-reduced-motion: reduce) { .go-live i { animation: none; } .go-live { transition: none; } }
</style>
