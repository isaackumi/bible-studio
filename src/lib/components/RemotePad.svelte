<script lang="ts">
  import { onMount } from "svelte";
  import { REMOTE_COMMANDS, type RemoteCommandId } from "../domain/remote";
  import { publishRemote, subscribeRemote } from "../remote/channel";

  let code = $state("");
  let token = $state("");
  let note = $state("Enter the pairing code from the desk. This pad is a controller, not a display.");
  let last = $state("");

  const labels: Record<RemoteCommandId, string> = {
    take: "LIVE",
    next: "Next",
    previous: "Previous",
    clear: "Clear",
    black: "Black",
    logo: "Logo",
  };

  onMount(() => {
    return subscribeRemote((envelope) => {
      if (envelope.type === "welcome" && envelope.payload.token) {
        token = envelope.payload.token;
        note = "Paired. LIVE sends Program. Next and Previous stay on Preview.";
        return;
      }
      if (envelope.type === "denied") {
        note = envelope.payload.reason || "That remote is not paired.";
        if (!token) return;
        if (envelope.payload.reason === "That remote is not paired.") token = "";
        return;
      }
      if (envelope.type === "ack") last = envelope.payload.id ?? "";
    });
  });

  function pair() {
    publishRemote("pair", { code: code.trim() });
  }

  function send(id: RemoteCommandId) {
    publishRemote("command", { token, id });
  }
</script>

<div class="pad">
  <h1>Remote</h1>
  <p>{note}</p>
  {#if !token}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        pair();
      }}
    >
      <input aria-label="Pairing code" inputmode="numeric" maxlength="6" placeholder="000000" bind:value={code} />
      <button type="submit">Pair</button>
    </form>
  {:else}
    <p class="ok">Connected{last ? ` · last ${last}` : ""}</p>
  {/if}
  <div class="grid">
    {#each REMOTE_COMMANDS as id (id)}
      <button type="button" class:live={id === "take"} onclick={() => send(id)}>{labels[id]}</button>
    {/each}
  </div>
</div>

<style>
  .pad {
    min-height: 100vh;
    margin: 0;
    padding: 24px 16px 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: #050505;
    color: #f5f5f5;
    font-family: "SF Pro Text", system-ui, sans-serif;
  }
  h1 { margin: 0; font-size: 28px; }
  p { margin: 0; color: #a3a3a3; line-height: 1.45; }
  .ok { color: #f5f5f5; }
  form, .grid { display: flex; flex-wrap: wrap; gap: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; }
  input, button {
    height: 52px;
    border-radius: 12px;
    border: 1px solid #fa4f00;
    background: #111;
    color: #f5f5f5;
    font-size: 18px;
  }
  input { flex: 1; min-width: 140px; padding: 0 12px; letter-spacing: 0.2em; }
  button { color: #fa4f00; }
  button.live {
    grid-column: 1 / -1;
    background: #fa4f00;
    color: #fff;
    border-color: #fa4f00;
  }
</style>
