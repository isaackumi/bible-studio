<script lang="ts">
  import { session } from "../app/session.svelte";

  const waiting = $derived(session.remotePending.filter((entry) => entry.status === "waiting"));
</script>

{#if waiting.length}
  <div class="approval" role="alertdialog" aria-label="Phone pairing request">
    {#each waiting as request (request.id)}
      <div class="request">
        <p><strong>{request.name}</strong> wants to control this desk.</p>
        <div class="buttons">
          <button type="button" class="desk-btn primary" onclick={() => void session.approveRemote(request.id)}>Allow</button>
          <button type="button" class="desk-btn" onclick={() => session.declineRemote(request.id)}>Decline</button>
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
  .buttons { display: flex; gap: 8px; justify-content: flex-end; }
</style>
