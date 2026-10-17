<script lang="ts">
  import QRCode from "qrcode";
  import { session } from "../app/session.svelte";
  import { isDesktop } from "../platform/runtime";
  import { commandUrl, REMOTE_COMMANDS } from "../domain/remote";

  let keyName = $state("");
  let newKey = $state<string | null>(null);

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

{#if !isDesktop()}
  <section class="rows">
    <div class="row">
      <div class="row-copy"><strong>Pair a phone</strong><span>A phone connects to the desktop app over Wi-Fi. A browser tab cannot run a network server, so here you can only open a pad window on this computer.</span></div>
      <div class="row-end">
        <button type="button" class="btn primary" onclick={() => void session.openRemotePairing()}>Show code</button>
        <button type="button" class="btn" onclick={() => window.open(session.remotePageUrl(), "_blank", "noopener")}>Open pad</button>
      </div>
    </div>
    {#if pairing}
      <div class="row"><div class="row-copy"><strong>Code {pairing.code}</strong><span>Expires in {secondsLeft}s.</span></div></div>
    {/if}
  </section>
{:else}
  {#if session.remoteLanError}<p class="error" role="alert">{session.remoteLanError}</p>{/if}
  {#if pairing}
    <section class="card pair">
      {#if qr}
        <div class="qr" aria-label="Pairing QR code">{@html qr}</div>
      {:else}
        <div class="qr empty">Starting the phone server…</div>
      {/if}
      <div class="pair-info">
        <span class="step">Scan with the phone's camera, or open</span>
        <strong class="url">{session.remoteLanUrl || "…"}</strong>
        <span class="step">and type</span>
        <p class="code">{pairing.code}</p>
        <span class="step">Expires in {secondsLeft}s · the QR code works once.</span>
        <button type="button" class="btn" onclick={session.closeRemotePairing}>Close pairing</button>
      </div>
    </section>
  {:else}
    <section class="rows">
      <div class="row">
        <div class="row-copy"><strong>Pair a phone</strong><span>The phone and this computer must be on the same network. Next and Previous on the phone change Preview; Go live changes what the audience sees.</span></div>
        <button type="button" class="btn primary" onclick={() => void session.openRemotePairing()}>Pair</button>
      </div>
      {#if session.remoteLanUrl}
        <div class="row">
          <div class="row-copy"><strong>Phone server is running</strong><span>{session.remoteLanUrl}</span></div>
          <button type="button" class="btn" onclick={() => void session.stopRemoteLan()}>Stop</button>
        </div>
      {/if}
    </section>
  {/if}
{/if}

<p class="section-label">Stream Deck and other controllers</p>
<section class="rows">
  <form class="row" onsubmit={async (event) => { event.preventDefault(); newKey = await session.createControllerKey(keyName); keyName = ""; }}>
    <div class="row-copy"><strong>Add a controller</strong><span>Bitfocus Companion (Stream Deck), MIDI bridges and scripts press buttons by opening a link. Each controller gets its own key.</span></div>
    <div class="row-end">
      <input class="field" aria-label="Controller name" placeholder="Stream Deck" bind:value={keyName} />
      <button type="submit" class="btn primary" disabled={!isDesktop()}>Create key</button>
    </div>
  </form>
  {#if newKey && session.remoteLanUrl}
    <div class="row links">
      <div class="row-copy"><strong>Links for this controller</strong><span>Copy them now: the key is not shown again. In Companion use a Generic HTTP "GET" action for each button.</span></div>
      <div class="overlay-link">
        <strong>Stream overlay</strong>
        <span>Add as a Browser Source (1920×1080) in OBS or vMix: the words on Program as a lower third over your camera.</span>
        <code>{new URL(`/stream?token=${encodeURIComponent(newKey)}`, session.remoteLanUrl).toString()}</code>
        <button type="button" class="btn small" onclick={() => void navigator.clipboard?.writeText(new URL(`/stream?token=${encodeURIComponent(newKey!)}`, session.remoteLanUrl).toString())}>Copy overlay link</button>
      </div>
      <ul class="cmd-list">
        {#each REMOTE_COMMANDS as command (command)}
          {@const url = commandUrl(session.remoteLanUrl, command, newKey)}
          <li><code>{command}</code><button type="button" class="btn small" onclick={() => void navigator.clipboard?.writeText(url)}>Copy link</button></li>
        {/each}
      </ul>
    </div>
  {:else if !isDesktop()}
    <div class="row"><div class="row-copy"><span>Controllers work with the desktop app, which runs the network server.</span></div></div>
  {/if}
  {#each session.remoteDevices.filter((device) => device.controller) as device (device.id)}
    <div class="row">
      <div class="row-copy"><strong>{device.name}</strong><span>{device.lastSeen ? `Last used ${ago(device.lastSeen)}` : "Not used yet"} · never signs out</span></div>
      <button type="button" class="btn danger" aria-label={armed === device.id ? `Confirm remove ${device.name}` : `Remove ${device.name}`} onclick={() => removeDevice(device.id)}>{armed === device.id ? "Remove? Its buttons stop" : "Remove"}</button>
    </div>
  {/each}
</section>

<p class="section-label">Paired phones</p>
<section class="rows">
  {#each session.remoteDevices.filter((device) => !device.controller) as device (device.id)}
    <div class="row">
      <div class="row-copy"><strong>{device.name}</strong><span>Last seen {ago(device.lastSeen)} · signs out after 12 h idle</span></div>
      <button
        type="button"
        class="btn danger"
        aria-label={armed === device.id ? `Confirm remove ${device.name}` : `Remove ${device.name}`}
        onclick={() => removeDevice(device.id)}
      >{armed === device.id ? "Remove? It must pair again" : "Remove"}</button>
    </div>
  {:else}
    <div class="row"><div class="row-copy"><strong>None yet</strong><span>Phones you allow appear here.</span></div></div>
  {/each}
</section>

<style>
  .pair { flex-direction: row !important; align-items: center; gap: 20px !important; flex-wrap: wrap; }
  .qr { width: 184px; height: 184px; background: #fff; border-radius: 12px; padding: 8px; flex: none; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .qr.empty { display: grid; place-items: center; color: #333; font-size: 12px; text-align: center; }
  .pair-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .step { font-size: 12px; color: var(--muted); }
  .url { font-size: 14px; word-break: break-all; }
  .code { margin: 2px 0 6px; font: 700 32px/1.1 var(--font-ui); letter-spacing: 0.2em; }
  .links { flex-direction: column; align-items: stretch !important; }
  .cmd-list { list-style: none; margin: 4px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
  .cmd-list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; }
  .cmd-list code { font-size: 12px; }
  .overlay-link { display: grid; gap: 4px; justify-items: start; margin-top: 6px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; }
  .overlay-link span { font-size: 12px; color: var(--muted); }
  .overlay-link code { font-size: 11px; word-break: break-all; }
  .error { margin: 0; padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, #ff5a5a 14%, transparent); color: #ff8a8a; font-size: 13px; }
</style>
