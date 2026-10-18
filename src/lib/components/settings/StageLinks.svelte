<script lang="ts">
  import QRCode from "qrcode";
  import { session } from "../../app/session.svelte";
  import { isDesktop } from "../../platform/runtime";

  // Stage on phones and tablets: a link (and QR code) that shows the stage view in any browser on
  // the church Wi-Fi. It reads the desk and presses nothing; each link can be removed.
  let name = $state("");
  let token = $state<string | null>(null);
  let qr = $state("");
  let armed = $state<string | null>(null);
  let copied = $state(false);

  const link = $derived(token && session.remoteLanUrl ? new URL(`/stage?token=${encodeURIComponent(token)}`, session.remoteLanUrl).toString() : "");
  const links = $derived(session.remoteDevices.filter((device) => device.viewer));

  $effect(() => {
    const url = link;
    qr = "";
    if (!url) return;
    let cancelled = false;
    void QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((svg) => {
      if (!cancelled) qr = svg;
    });
    return () => {
      cancelled = true;
    };
  });

  async function make(event: SubmitEvent) {
    event.preventDefault();
    token = await session.createStageLink(name);
    name = "";
    copied = false;
  }

  function remove(id: string) {
    if (armed !== id) {
      armed = id;
      return;
    }
    armed = null;
    session.revokeRemote(id);
  }

  function ago(at: number): string {
    if (!at) return "Not opened yet";
    const minutes = Math.round((Date.now() - at) / 60_000);
    return minutes < 1 ? "Open now" : minutes < 60 ? `Seen ${minutes} min ago` : `Seen ${new Date(at).toLocaleDateString([], { day: "numeric", month: "short" })}`;
  }
</script>

<section class="rows">
  <form class="row" onsubmit={make}>
    <div class="row-copy">
      <strong>Make a stage link</strong>
      <span>{isDesktop() ? "The band or the pastor see the stage on a phone or tablet on the church Wi-Fi: words now and next, the song part, messages, notes, clock and timer. It shows only; it presses nothing." : "Stage links work with the desktop app, which runs the network server."}</span>
    </div>
    <div class="row-end">
      <input class="field" aria-label="Stage link name" placeholder="Band iPad" maxlength="40" bind:value={name} />
      <button type="submit" class="btn primary" disabled={!isDesktop()}>Make link</button>
    </div>
  </form>
  {#if link}
    <div class="row new-link">
      <div class="qr" aria-label="Stage link QR code">{@html qr}</div>
      <div class="row-copy">
        <strong>Scan with the phone or tablet</strong>
        <span>Or open this link on it. Copy it now: it is not shown again. Add it to the home screen to open it like an app.</span>
        <code>{link}</code>
        <span class="actions">
          <button type="button" class="btn small" onclick={() => { void navigator.clipboard?.writeText(link); copied = true; }}>{copied ? "Copied" : "Copy link"}</button>
          <button type="button" class="btn small" onclick={() => (token = null)}>Done</button>
        </span>
      </div>
    </div>
  {/if}
  {#each links as device (device.id)}
    <div class="row">
      <div class="row-copy"><strong>{device.name}</strong><span>{ago(device.lastSeen)} · stage only · never signs out</span></div>
      <button type="button" class="btn danger" aria-label={armed === device.id ? `Confirm remove ${device.name}` : `Remove ${device.name}`} onclick={() => remove(device.id)}>
        {armed === device.id ? "Remove? Its screen stops" : "Remove"}
      </button>
    </div>
  {/each}
</section>

<style>
  .new-link { align-items: center !important; gap: 18px !important; flex-wrap: wrap; }
  .qr { width: 164px; height: 164px; background: #fff; border-radius: 12px; padding: 8px; flex: none; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  code { display: block; margin-top: 6px; font-size: 12px; word-break: break-all; color: var(--ink); }
  .actions { display: flex; gap: 6px; margin-top: 8px; }
</style>
