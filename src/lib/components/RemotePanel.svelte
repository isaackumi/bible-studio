<script lang="ts">
  import QRCode from "qrcode";
  import { session } from "../app/session.svelte";
  import { isDesktop } from "../platform/runtime";

  let qr = $state("");
  let now = $state(Date.now());

  const pairUrl = $derived(session.remotePairingUrl());
  const pairing = $derived(session.remotePairing);
  const secondsLeft = $derived(pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0);

  $effect(() => {
    const id = setInterval(() => {
      now = Date.now();
      if (session.remotePairing && session.remotePairing.expiresAt <= now) session.closeRemotePairing();
    }, 1000);
    return () => clearInterval(id);
  });

  $effect(() => {
    const url = pairUrl;
    if (!url) {
      qr = "";
      return;
    }
    let cancelled = false;
    void QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#000000", light: "#ffffff" } }).then(
      (svg) => {
        if (!cancelled) qr = svg;
      },
    );
    return () => {
      cancelled = true;
    };
  });

  /** Two clicks: the first arms for three seconds, the second removes the phone. */
  let armed = $state<string | null>(null);
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  function removeDevice(id: string) {
    clearTimeout(armTimer);
    if (armed === id) {
      armed = null;
      session.revokeRemote(id);
      return;
    }
    armed = id;
    armTimer = setTimeout(() => (armed = null), 3000);
  }

  function ago(at: number) {
    const minutes = Math.round((now - at) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    return `${Math.round(minutes / 60)} h ago`;
  }
</script>

<section class="card remote">
  <h3>Phone remote</h3>
  {#if !isDesktop()}
    <p class="note">
      A phone connects to the Church Studio desktop app over this Wi-Fi. A browser tab cannot run a network server, so here you can
      only open a pad window on this computer.
    </p>
    <div class="actions">
      <button type="button" class="primary" onclick={() => void session.openRemotePairing()}>Show pairing code</button>
      <button type="button" onclick={() => window.open(session.remotePageUrl(), "_blank", "noopener")}>Open pad window</button>
    </div>
    {#if pairing}<p class="note">Code <strong>{pairing.code}</strong> · {secondsLeft}s</p>{/if}
  {:else}
    <p class="note">
      The phone and this computer must be on the same network. Scan the code with the phone's camera, then allow the phone here.
      Next and Previous on the phone change Preview; Take changes Program.
    </p>
    {#if session.remoteLanError}
      <p class="error" role="alert">{session.remoteLanError}</p>
    {/if}
    {#if pairing}
      <div class="pair">
        {#if qr}
          <div class="qr" aria-label="Pairing QR code">{@html qr}</div>
        {:else}
          <div class="qr empty">Starting the phone server…</div>
        {/if}
        <div class="pair-info">
          <p class="note">Or open <strong>{session.remoteLanUrl || "…"}</strong> and type</p>
          <p class="code">{pairing.code}</p>
          <p class="note">Expires in {secondsLeft}s. The QR code works once.</p>
          <button type="button" class="text" onclick={session.closeRemotePairing}>Close pairing</button>
        </div>
      </div>
    {:else}
      <div class="actions">
        <button type="button" class="primary" onclick={() => void session.openRemotePairing()}>Pair a phone</button>
        {#if session.remoteLanUrl}
          <button type="button" class="text" onclick={() => void session.stopRemoteLan()}>Stop phone server</button>
        {/if}
      </div>
    {/if}
  {/if}

  <h4>Paired phones</h4>
  {#if session.remoteDevices.length === 0}
    <p class="note">None yet.</p>
  {:else}
    <ul class="devices">
      {#each session.remoteDevices as device (device.id)}
        <li>
          <span>
            <strong>{device.name}</strong>
            <small>Last seen {ago(device.lastSeen)} · signs out after 12 h idle</small>
          </span>
          <button
            type="button"
            class="text"
            class:armed={armed === device.id}
            aria-label={armed === device.id ? `Confirm remove ${device.name}` : `Remove ${device.name}`}
            onclick={() => removeDevice(device.id)}
          >{armed === device.id ? "Remove? It must pair again" : "Remove"}</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .remote h4 { margin: 16px 0 6px; font-size: 13px; }
  .pair { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
  .qr { width: 184px; height: 184px; background: #fff; border-radius: 10px; padding: 6px; flex: none; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .qr.empty { display: grid; place-items: center; color: #333; font-size: 12px; text-align: center; }
  .pair-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .code { margin: 0; font: 600 28px/1.1 var(--font-ui); letter-spacing: 0.2em; }
  .error { color: #ff8a8a; margin: 0 0 8px; }
  .devices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .devices li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
  .devices span { display: flex; flex-direction: column; min-width: 0; }
  .devices small { color: var(--muted); }
  .devices .armed { color: #ff8a8a; font-weight: 600; }
</style>
