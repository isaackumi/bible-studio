<script lang="ts">
  import { session } from "../app/session.svelte";
  import { t } from "../i18n/core";

  const waiting = $derived(session.remotePending.filter((entry) => entry.status === "waiting"));
</script>

{#if waiting.length}
  <div class="approval" role="alertdialog" aria-label={t("Phone pairing request")}>
    {#each waiting as request (request.id)}
      <div class="request">
        <p><strong>{request.name}</strong> {t("wants to control this desk.")}</p>
        <!-- The operator chooses how much the phone may do; Preview only can never go live. -->
        <p class="hint">{t("Preview only: it can move Preview and pick items, but only the desk goes live.")}</p>
        <div class="buttons">
          <button type="button" class="desk-btn" onclick={() => session.declineRemote(request.id)}>{t("Decline")}</button>
          <button type="button" class="desk-btn" onclick={() => void session.approveRemote(request.id, "preview")}>{t("Preview only")}</button>
          <button type="button" class="desk-btn primary" onclick={() => void session.approveRemote(request.id, "full")}>{t("Full control")}</button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .approval {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: min(360px, calc(100vw - 32px));
  }
  .request {
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--accent);
    border-radius: 12px;
    padding: 12px 14px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
    font: 13px/1.4 var(--font-ui);
  }
  .request p { margin: 0 0 10px; }
  .request .hint { margin-top: -4px; color: var(--muted); font-size: 12px; }
  .buttons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
</style>
