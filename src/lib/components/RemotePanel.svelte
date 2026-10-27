<script lang="ts">
  import { session } from "../app/session.svelte";
  import { isDesktop } from "../platform/runtime";
  import { CONTROLLER_EXPIRY_DAYS, commandUrl, controllerExpires, REMOTE_COMMANDS, remoteAccess, type RemoteAccess, type RemoteDevice } from "../domain/remote";
  import { REMOTE_PAIR_MS } from "../domain/remote";
  import { t } from "../i18n/core";
  import Icon from "./Icon.svelte";
  import QrView from "./QrView.svelte";
  import { internetRemote } from "../app/remote-relay.svelte";

  let keyName = $state("");
  let keyDays = $state<number>(0);
  let newKey = $state<string | null>(null);

  /** How long a new controller key lasts, in words. */
  function lifetime(days: number) {
    if (days === 0) return t("Never expires");
    return days === 1 ? t("Expires after 1 day") : t("Expires after {days} days", { days });
  }

  /** A key's expiry for the list: never, the date it stops, or that it already has. */
  function keyExpiry(device: RemoteDevice) {
    if (!controllerExpires(device)) return t("never expires");
    if (device.expiresAt <= now) return t("expired: make a new key");
    return t("expires {date}", { date: new Date(device.expiresAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) });
  }

  let now = $state(Date.now());

  const pairUrl = $derived(session.remotePairingUrl());
  const internet = $derived(session.remoteVia === "internet");
  /** What a phone types when it cannot scan: the LAN address, or the short internet one. */
  const address = $derived(internet ? internetRemote.shortUrl() : session.remoteLanUrl);
  const problem = $derived(internet ? internetRemote.error : session.remoteLanError);
  const pairing = $derived(session.remotePairing);
  const secondsLeft = $derived(pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0);

  $effect(() => {
    const id = setInterval(() => {
      now = Date.now();
      if (session.remotePairing && session.remotePairing.expiresAt <= now) session.closeRemotePairing();
    }, 1000);
    return () => clearInterval(id);
  });

  /** Minutes and seconds left on the code, and how much of its life is left (for the bar). */
  const clock = $derived(`${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`);
  const left = $derived(Math.min(100, (secondsLeft * 1000 * 100) / REMOTE_PAIR_MS));
  const digits = $derived(pairing ? pairing.code.split("") : []);

  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(internet ? `https://${address}` : address);
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = false), 1800);
    } catch {
      session.notify(t("Could not copy. Select the address and copy it."));
    }
  }

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
    if (minutes < 1) return t("just now");
    if (minutes < 60) return t("{minutes} min ago", { minutes });
    return t("{hours} h ago", { hours: Math.round(minutes / 60) });
  }
</script>

<!-- How phones reach the desk: this Wi-Fi (nothing leaves the network) or the internet (any connection). -->
<div class="via">
  <span>{t("Phones connect over")}</span>
  <div class="seg" role="radiogroup" aria-label={t("Phones connect over")}>
    {#if isDesktop()}
      <button type="button" role="radio" aria-checked={!internet} class:on={!internet} onclick={() => void session.setRemoteVia("lan")}><Icon name="screens" size={13} />{t("This Wi-Fi")}</button>
    {/if}
    <button type="button" role="radio" aria-checked={internet} class:on={internet} onclick={() => void session.setRemoteVia("internet")}><Icon name="globe" size={13} />{t("Internet")}</button>
  </div>
  <small>{internet ? t("Any connection, Wi-Fi or mobile data. Presses go through Church Studio's server; you still approve each phone here.") : t("Same network only. Nothing leaves this building.")}</small>
</div>
  {#if problem}<p class="error" role="alert">{problem}</p>{/if}
  {#if pairing}
    <section class="card pair">
      <div class="qr-side">
        <div class="qr-box" aria-label={t("Pairing QR code")}>
          {#if pairUrl}
            <QrView qr={{ data: pairUrl, style: "square", dark: "#000000", light: "#ffffff", caption: "" }} />
          {:else}
            <span class="qr-wait">{internet ? t("Connecting to the internet…") : t("Starting the phone server…")}</span>
          {/if}
        </div>
        <div class="life" aria-hidden="true"><i style:width="{left}%" class:low={secondsLeft <= 20}></i></div>
        <span class="expires" class:low={secondsLeft <= 20}>{t("Code expires in {clock}", { clock })}</span>
      </div>

      <ol class="pair-steps">
        <li>
          <b>1</b>
          {#if internet}
            <div><strong>{t("Any internet connection")}</strong><span>{t("The phone can be on mobile data or another Wi-Fi.")}</span></div>
          {:else}
            <div><strong>{t("Join the same Wi-Fi")}</strong><span>{t("The phone and this computer must be on the same network.")}</span></div>
          {/if}
        </li>
        <li>
          <b>2</b>
          <div>
            <strong>{t("Scan the code with the phone's camera")}</strong>
            <span>{t("Or open this address in the phone's browser:")}</span>
            <div class="addr">
              <input readonly aria-label={t("Phone address")} value={address || "…"} onfocus={(event) => event.currentTarget.select()} />
              <button type="button" class="btn small" disabled={!address} onclick={() => void copyAddress()}><Icon name={copied ? "check" : "copy"} size={13} />{copied ? t("Copied") : t("Copy")}</button>
            </div>
          </div>
        </li>
        <li>
          <b>3</b>
          <div>
            <strong>{t("Type this code on the phone")}</strong>
            <div class="digits" role="img" aria-label={t("Code {code}", { code: pairing.code })}>
              {#each digits as digit, i (i)}<span class:gap={i === 3}>{digit}</span>{/each}
            </div>
          </div>
        </li>
        <li>
          <b>4</b>
          <div><strong>{t("Allow it here")}</strong><span>{t("This computer asks you before a phone can control the screen.")}</span></div>
        </li>
      </ol>

      <footer class="pair-foot">
        <button type="button" class="btn" onclick={() => void session.openRemotePairing()}><Icon name="refresh" size={13} />{t("New code")}</button>
        <button type="button" class="btn" onclick={session.closeRemotePairing}>{t("Close pairing")}</button>
      </footer>
    </section>
  {:else}
    <section class="rows">
      <div class="row">
        <div class="row-copy"><strong>{t("Pair a phone")}</strong><span>{internet ? t("The phone can be anywhere with internet. Next and Previous on the phone change Preview; Go live changes what the audience sees.") : t("The phone and this computer must be on the same network. Next and Previous on the phone change Preview; Go live changes what the audience sees.")}</span></div>
        <button type="button" class="btn primary" onclick={() => void session.openRemotePairing()}>{t("Pair")}</button>
      </div>
      {#if internet && internetRemote.connected}
        <div class="row">
          <div class="row-copy"><strong>{t("Phones can reach this desk over the internet")}</strong><span>{address}</span></div>
          <button type="button" class="btn" onclick={() => void session.stopRemoteLan()}>{t("Stop")}</button>
        </div>
      {:else if !internet && session.remoteLanUrl}
        <div class="row">
          <div class="row-copy"><strong>{t("Phone server is running")}</strong><span>{session.remoteLanUrl}</span></div>
          <button type="button" class="btn" onclick={() => void session.stopRemoteLan()}>{t("Stop")}</button>
        </div>
      {/if}
    </section>
  {/if}

<p class="section-label">{t("Stream Deck and other controllers")}</p>
<section class="rows">
  <form class="row" onsubmit={async (event) => { event.preventDefault(); newKey = await session.createControllerKey(keyName, keyDays); keyName = ""; }}>
    <div class="row-copy"><strong>{t("Add a controller")}</strong><span>{t("Bitfocus Companion (Stream Deck), MIDI bridges and scripts press buttons by opening a link. Each controller gets its own key.")}</span></div>
    <div class="row-end">
      <input class="field" aria-label={t("Controller name")} placeholder={t("Stream Deck")} bind:value={keyName} />
      <select class="field" aria-label={t("How long the key works")} bind:value={keyDays}>
        {#each CONTROLLER_EXPIRY_DAYS as days (days)}<option value={days}>{lifetime(days)}</option>{/each}
      </select>
      <button type="submit" class="btn primary" disabled={!isDesktop()}>{t("Create key")}</button>
    </div>
  </form>
  {#if newKey && session.remoteLanUrl}
    <div class="row links">
      <div class="row-copy"><strong>{t("Links for this controller")}</strong><span>{t("Copy them now: the key is not shown again. In Companion use a Generic HTTP \"GET\" action for each button.")}</span></div>
      <div class="overlay-link">
        <strong>{t("Stream overlay")}</strong>
        <span>{t("Add as a Browser Source (1920×1080) in OBS or vMix: the words on Program as a lower third over your camera.")}</span>
        <code>{new URL(`/stream?token=${encodeURIComponent(newKey)}`, session.remoteLanUrl).toString()}</code>
        <button type="button" class="btn small" onclick={() => void navigator.clipboard?.writeText(new URL(`/stream?token=${encodeURIComponent(newKey!)}`, session.remoteLanUrl).toString())}>{t("Copy overlay link")}</button>
      </div>
      <ul class="cmd-list">
        {#each REMOTE_COMMANDS as command (command)}
          {@const url = commandUrl(session.remoteLanUrl, command, newKey)}
          <li><code>{command}</code><button type="button" class="btn small" onclick={() => void navigator.clipboard?.writeText(url)}>{t("Copy link")}</button></li>
        {/each}
      </ul>
    </div>
  {:else if !isDesktop()}
    <div class="row"><div class="row-copy"><span>{t("Controllers work with the desktop app, which runs the network server.")}</span></div></div>
  {/if}
  {#each session.remoteDevices.filter((device) => device.controller) as device (device.id)}
    <div class="row">
      <div class="row-copy"><strong>{device.name}</strong><span>{device.lastSeen ? t("Last used {ago}", { ago: ago(device.lastSeen) }) : t("Not used yet")} · <span class:expired={controllerExpires(device) && device.expiresAt <= now}>{keyExpiry(device)}</span></span></div>
      <button type="button" class="btn danger" aria-label={armed === device.id ? t("Confirm remove {name}", { name: device.name }) : t("Remove {name}", { name: device.name })} onclick={() => removeDevice(device.id)}>{armed === device.id ? t("Remove? Its buttons stop") : t("Remove")}</button>
    </div>
  {/each}
</section>

<p class="section-label">{t("Paired phones")}</p>
<section class="rows">
  {#each session.remoteDevices.filter((device) => !device.controller && !device.viewer) as device (device.id)}
    <div class="row">
      <div class="row-copy"><strong>{device.name}</strong><span>{t("Last seen {lastSeen} · signs out after 12 h idle", { lastSeen: ago(device.lastSeen) })}</span></div>
      <!-- What this phone may do; the desk checks it on every press. -->
      <select
        class="field access"
        aria-label={t("What {name} may do", { name: device.name })}
        value={remoteAccess(device)}
        onchange={(event) => session.setRemoteAccess(device.id, event.currentTarget.value as RemoteAccess)}
      >
        <option value="full">{t("Full control")}</option>
        <option value="preview">{t("Preview only")}</option>
      </select>
      <button
        type="button"
        class="btn danger"
        aria-label={armed === device.id ? t("Confirm remove {name}", { name: device.name }) : t("Remove {name}", { name: device.name })}
        onclick={() => removeDevice(device.id)}
      >{armed === device.id ? t("Remove? It must pair again") : t("Remove")}</button>
    </div>
  {:else}
    <div class="row"><div class="row-copy"><strong>{t("None yet")}</strong><span>{t("Phones you allow appear here.")}</span></div></div>
  {/each}
</section>

<style>
  .via { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 6px 12px; margin-bottom: 14px; }
  .via > span { font-size: 13px; font-weight: 650; }
  .via small { grid-column: 1 / -1; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .seg { justify-self: start; display: inline-flex; padding: 3px; border-radius: 10px; background: var(--field); }
  .seg button { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
  .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / 0.25); }
  .pair { display: grid !important; grid-template-columns: auto minmax(0, 1fr); gap: 18px 26px !important; align-items: start; }
  .qr-side { display: grid; gap: 8px; justify-items: center; }
  .qr-box { display: grid; place-items: center; width: 208px; height: 208px; padding: 10px; border-radius: 14px; background: #fff; box-shadow: 0 0 0 1px var(--line); }
  .qr-box :global(.qr-frame) { padding: 0; }
  .qr-wait { padding: 0 18px; color: #333; font-size: 12px; text-align: center; }
  .life { width: 100%; height: 4px; border-radius: 4px; background: color-mix(in srgb, var(--ink) 10%, transparent); overflow: hidden; }
  .life i { display: block; height: 100%; border-radius: 4px; background: var(--accent); transition: width 1s linear; }
  .life i.low { background: var(--live); }
  .expires { font-size: 12px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
  .expires.low { color: var(--live-text); }
  .pair-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; min-width: 0; }
  .pair-steps li { display: flex; gap: 12px; min-width: 0; }
  .pair-steps li > b { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 50%; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent-text); font-size: 12px; font-weight: 800; }
  .pair-steps li > div { flex: 1; display: grid; gap: 4px; min-width: 0; }
  .pair-steps strong { font-size: 13.5px; }
  .pair-steps span { font-size: 12.5px; color: var(--muted); }
  .addr { display: flex; gap: 6px; max-width: 420px; margin-top: 4px; min-width: 0; }
  .addr input { flex: 1; min-width: 0; height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: 600 13px/1 ui-monospace, "SF Mono", Menlo, monospace; }
  .addr .btn { display: inline-flex; align-items: center; gap: 6px; }
  .digits { display: flex; gap: 6px; margin-top: 4px; }
  .digits span { display: grid; place-items: center; width: 40px; height: 50px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); font: 750 26px/1 var(--font-ui); font-variant-numeric: tabular-nums; }
  .digits span.gap { margin-left: 10px; }
  .pair-foot { grid-column: 1 / -1; display: flex; gap: 8px; justify-content: flex-end; padding-top: 12px; border-top: 1px solid var(--line); }
  .pair-foot .btn { display: inline-flex; align-items: center; gap: 6px; }
  @media (max-width: 720px) { .pair { grid-template-columns: 1fr; } }
  .links { flex-direction: column; align-items: stretch !important; }
  .cmd-list { list-style: none; margin: 4px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
  .cmd-list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; }
  .cmd-list code { font-size: 12px; }
  .overlay-link { display: grid; gap: 4px; justify-items: start; margin-top: 6px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; }
  .overlay-link span { font-size: 12px; color: var(--muted); }
  .overlay-link code { font-size: 11px; word-break: break-all; }
  .access { width: auto; flex: none; }
  .expired { color: var(--live-text); font-weight: 650; }
  .error { margin: 0; padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, #ff5a5a 14%, transparent); color: #ff8a8a; font-size: 13px; }
</style>
