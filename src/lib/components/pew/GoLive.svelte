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
    <span class="desk-btn go-live on" role="status"><Icon name="check" size={12} /> {t("On LIVE")}</span>
  {:else}
    <button type="button" class="desk-btn live go-live" title={t("Send Preview to the screen (Space)")} onclick={() => void session.take()}>
      <i aria-hidden="true"></i>{t("GO LIVE")}<kbd>{t("Space")}</kbd>
    </button>
  {/if}
{/if}

<style>
  /* The desk's LIVE button (app.css .desk-btn.live), floating on the Preview picture. */
  .go-live {
    position: absolute;
    right: var(--go-live-inset, 8px);
    bottom: var(--go-live-inset, 8px);
    z-index: 5;
    gap: 7px;
    padding: 0 6px 0 12px;
    letter-spacing: 0.08em;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.4);
    cursor: pointer;
  }
  .go-live:not(.on):hover { border-color: var(--live); filter: brightness(1.08); }
  .go-live i { width: 7px; height: 7px; border-radius: 50%; background: #fff; flex: none; }
  .go-live kbd { padding: 0 5px; border: 1px solid rgb(255 255 255 / 0.45); border-radius: 4px; font: inherit; font-size: 10px; font-weight: 650; letter-spacing: 0; line-height: 16px; }
  .go-live.on { padding: 0 10px; letter-spacing: 0.04em; background: rgb(0 0 0 / 0.62); border-color: transparent; color: #8fe3b4; cursor: default; box-shadow: none; }
</style>
