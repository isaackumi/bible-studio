<script lang="ts">
  import { onMount } from "svelte";
  import { cloudAsks, setCloudAsks, type CloudSync } from "../../app/cloud.svelte";
  import { formatBytes } from "../../app/move";
  import { session } from "../../app/session.svelte";
  import type { CloudBinItem, CloudMediaItem } from "../../sync/protocol";
  import { t, tn } from "../../i18n/core";
  import Icon from "../Icon.svelte";
  import { isDesktop } from "../../platform/runtime";

  // Cloud space, in Settings › Account: how much of the plan's space is used and by what, the
  // files largest first with a way to take each out, the bin, and the computers syncing.

  let cloud = $state<CloudSync | null>(null);
  let items = $state<CloudMediaItem[]>([]);
  let bin = $state<CloudBinItem[]>([]);
  let loading = $state(true);
  let note = $state("");
  /** The file (or "bin") whose dangerous button was pressed once; a second press does it. */
  let armed = $state<string | null>(null);
  /** Computers on this licence found on this network: they lend each other files first. */
  let nearby = $state<Set<string>>(new Set());
  let asks = $state(cloudAsks());

  function setAsks(ask: boolean) {
    asks = ask;
    setCloudAsks(ask);
    // Back to automatic: what was waiting goes now.
    if (!ask) void cloud?.syncNow();
  }

  onMount(() => {
    void session.nearbyComputers().then((found) => (nearby = new Set(found.map((computer) => computer.device))));
    void session.cloudEngine().then(async (engine) => {
      cloud = engine;
      await refresh();
    });
  });

  async function refresh() {
    if (!cloud) return;
    loading = true;
    await cloud.refreshStatus();
    if (cloud.status === "idle" || cloud.status === "syncing" || cloud.status === "readOnly") {
      const [media, deleted] = await Promise.all([cloud.media(), cloud.bin()]);
      if (media.ok) items = media.data.items;
      if (deleted.ok) bin = deleted.data.items;
    }
    loading = false;
  }

  const bytesOf = (kind: string) => items.filter((item) => item.kind === kind).reduce((sum, item) => sum + item.bytes, 0);
  const share = $derived(cloud && cloud.limitBytes > 0 ? Math.min(100, (cloud.usedBytes / cloud.limitBytes) * 100) : 0);
  const kinds = $derived([
    { id: "video", label: t("Videos"), bytes: bytesOf("video") },
    { id: "image", label: t("Pictures"), bytes: bytesOf("image") },
    { id: "audio", label: t("Audio"), bytes: bytesOf("audio") },
  ]);

  const when = (at: number | null) => (at ? new Date(at).toLocaleDateString() : t("never"));

  /** "just now", "5 min ago", or the time: how fresh the cloud copy is, at a glance. */
  function ago(at: number | null): string {
    if (!at) return t("not yet");
    const minutes = Math.round((Date.now() - at) / 60_000);
    if (minutes < 1) return t("just now");
    if (minutes < 60) return t("{n} min ago", { n: minutes });
    return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  /** The one answer people look for first: is the library safe in the cloud, and if not, why. */
  type Headline = { tone: "good" | "busy" | "wait" | "bad"; icon: string; title: string; detail: string };
  const headline = $derived.by((): Headline | null => {
    if (!cloud) return null;
    const computers = tn(cloud.devices.length, "{n} computer", "{n} computers");
    if (cloud.status === "licenceChanged") return { tone: "wait", icon: "pause", title: t("Sync is paused"), detail: t("This computer moved to another license. Choose below whether to bring this library along.") };
    if (cloud.status === "noSeat") return { tone: "bad", icon: "alerts", title: t("Not syncing on this computer"), detail: cloud.message };
    if (cloud.status === "offline") return { tone: "wait", icon: "cloud", title: t("Offline"), detail: t("Changes are kept here and go up when the internet is back.") };
    if (cloud.status === "error") return { tone: "bad", icon: "alerts", title: t("Sync could not finish"), detail: cloud.message };
    if (cloud.readOnlyUntil) return { tone: "bad", icon: "alerts", title: t("Your plan has ended"), detail: t("The cloud copy can be read until {date}; renew to keep it.", { date: new Date(cloud.readOnlyUntil).toLocaleDateString() }) };
    if (cloud.status === "syncing") return { tone: "busy", icon: "refresh", title: t("Syncing…"), detail: cloud.pendingMedia ? tn(cloud.pendingMedia, "{n} file still to go", "{n} files still to go") : t("Sending and fetching changes") };
    if (asks && cloud.held) return { tone: "wait", icon: "cloud", title: tn(cloud.held, "{n} change waiting", "{n} changes waiting"), detail: t("Made on this computer. They go to the cloud and your other computers when you press Sync now.") };
    if (cloud.over) return { tone: "bad", icon: "alerts", title: t("Over your cloud space"), detail: t("Remove some files below, or ask about more space.") };
    if (cloud.full) return { tone: "wait", icon: "alerts", title: t("Cloud space is full"), detail: t("Songs and services still sync. New pictures and videos stay on this computer until some room is made below.") };
    if (cloud.pendingMedia) return { tone: "busy", icon: "refresh", title: t("Almost in sync"), detail: tn(cloud.pendingMedia, "{n} file still to go", "{n} files still to go") };
    return { tone: "good", icon: "check", title: t("Everything is in sync"), detail: t("Last synced {when} · {computers} on this license", { when: ago(cloud.lastSyncAt), computers }) };
  });

  /** Sync now: with Ask me first on, this is also what sends the waiting changes. */
  function syncNow() {
    if (!cloud) return;
    void (asks && cloud.held ? cloud.sendHeld() : cloud.syncNow()).then(refresh);
  }
  const kindWord = (kind: string) => (kind === "video" ? t("Video") : kind === "audio" ? t("Audio") : t("Picture"));

  function arm(key: string, run: () => Promise<string | null>) {
    if (armed !== key) {
      armed = key;
      setTimeout(() => (armed = null), 4000);
      return;
    }
    armed = null;
    void run().then(async (error) => {
      note = error ?? "";
      await refresh();
    });
  }
</script>

<p class="section-label">{t("Cloud space")}</p>
<section class="rows">
  {#if !cloud || loading}
    <div class="row"><div class="row-copy"><span>{t("Checking…")}</span></div></div>
  {:else if cloud.status === "free"}
    <div class="row"><div class="row-copy"><strong>{t("Cloud space comes with Premium and Church")}</strong><span>{t("Your songs, services, slides and media on every computer on the license, and a copy if a computer is lost.")}</span></div><button type="button" class="btn primary" onclick={() => (session.upgradeFor = "cloud-sync")}>{t("See plans")}</button></div>
  {:else if cloud.status === "signedOut"}
    <div class="row"><div class="row-copy"><strong>{t("Sign in to use your cloud space")}</strong><span>{t("Your library then follows the license: this computer and the others on it keep one copy.")}</span></div></div>
  {:else if cloud.status === "off"}
    <div class="row"><div class="row-copy"><span>{t("Cloud space works in the desktop app.")}</span></div></div>
  {:else}
    {#if headline}
      <!-- First, the answer: in sync or not, and the one thing to do. -->
      <div class="status tone-{headline.tone}" role="status">
        <span class="status-icon"><Icon name={headline.icon} size={20} /></span>
        <div class="status-copy"><strong>{headline.title}</strong><span>{headline.detail}{#if note} · <b class="bad">{note}</b>{/if}</span></div>
        <button type="button" class="btn" class:primary={headline.tone === "wait" && asks && cloud.held > 0} disabled={cloud.status === "syncing"} onclick={syncNow}>{t("Sync now")}</button>
      </div>
    {/if}
    {#if cloud.status === "licenceChanged"}
      <div class="row">
        <div class="row-copy"><strong>{t("Bring this library to the new license?")}</strong><span>{t("Its songs, services and files will go into the new license's library, and that library will come to this computer. Do this only if both belong to the same church, such as after an upgrade.")}</span></div>
        <button type="button" class="btn" onclick={() => arm("licence", async () => { await cloud?.acceptLicence(); return null; })}>{armed === "licence" ? t("Press again to bring it") : t("Bring it")}</button>
      </div>
    {/if}
    <div class="row stack">
      <div class="row-copy"><strong>{t("When to sync")}</strong><span>{t("Changes from your other computers always arrive by themselves. This decides when this computer's changes go up.")}</span></div>
      <div class="choose" role="radiogroup" aria-label={t("When to sync")}>
        <button type="button" role="radio" aria-checked={!asks} class:on={!asks} onclick={() => setAsks(false)}><b>{t("By itself")}</b><span>{t("A few seconds after each change")}</span></button>
        <button type="button" role="radio" aria-checked={asks} class:on={asks} onclick={() => setAsks(true)}><b>{t("When I press Sync now")}</b><span>{t("Changes wait here until you say")}</span></button>
      </div>
    </div>
  {/if}
</section>

{#if cloud && !loading && cloud.status !== "free" && cloud.status !== "signedOut" && cloud.status !== "off"}
  <p class="section-label">{t("What goes to the cloud")}</p>
  <section class="rows">
    <div class="row"><div class="row-lead"><span class="row-icon"><Icon name="lyrics" size={16} /></span><div class="row-copy"><strong>{t("Songs, services and slides")}</strong><span>{t("Always. They are small: a few MB for a whole library.")}</span></div></div><span class="always">{t("Always")}</span></div>
    <div class="row"><div class="row-lead"><span class="row-icon"><Icon name="media" size={16} /></span><div class="row-copy"><strong>{t("Pictures and audio")}</strong><span>{t("The ones your songs, services and slides use · {size}", { size: formatBytes(kinds[1]!.bytes + kinds[2]!.bytes) })}</span></div></div><span class="always">{t("Always")}</span></div>
    <div class="row">
      <div class="row-lead"><span class="row-icon"><Icon name="video" size={16} /></span><div class="row-copy"><strong>{t("Videos")}</strong><span>{t("The biggest files · {size}. Off: each computer keeps its own.", { size: formatBytes(kinds[0]!.bytes) })}</span></div></div>
      <label class="switch-wrap"><input type="checkbox" class="switch" aria-label={t("Sync videos")} checked={cloud.syncVideos} onchange={(event) => void cloud?.setSyncVideos(event.currentTarget.checked)} /></label>
    </div>
    <div class="row stack">
      <div class="row-copy">
        <strong>{t("{used} of {limit} used", { used: formatBytes(cloud.usedBytes), limit: formatBytes(cloud.limitBytes) })}</strong>
        <span class="meter" role="progressbar" aria-label={t("Cloud space used")} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(share)}><i class:over={cloud.over} style:width="{share}%"></i></span>
        {#if cloud.paused}<span>{t("Cloud space is paused for everyone at the moment. Songs and services still sync.")}</span>{/if}
      </div>
    </div>
  </section>

  {#if cloud.devices.length}
    <p class="section-label">{t("Computers on this license")}</p>
    <section class="rows">
      {#each cloud.devices as device (device.device)}
        <div class="row"><div class="row-lead"><span class="row-icon"><Icon name="laptop" size={16} /></span><div class="row-copy"><strong>{device.name}</strong><span>{t("Last synced {when}", { when: new Date(device.lastSyncAt).toLocaleString() })}</span></div></div>{#if nearby.has(device.device)}<span class="always">{t("On this network")}</span>{/if}</div>
      {/each}
      {#if nearby.size}
        <div class="row"><div class="row-copy"><span>{t("Pictures and videos come from the computers on this network first: faster, and they do not need the cloud space.")}</span></div></div>
      {/if}
      {#if isDesktop()}
        <!-- Nearby needs the computers to see each other: the usual reasons they cannot, in plain words. -->
        <details class="row help">
          <summary>{t("Another computer not on this network?")}</summary>
          <ul>
            <li>{t("Both computers need Church Studio 0.5.6 or newer, on the same plan.")}</li>
            <li>{t("Both need the same network: the same Wi-Fi, or a cable. Guest Wi-Fi often hides computers from each other; use the main network, an Ethernet cable, or a cable straight between the two computers.")}</li>
            <li>{t("Windows: if it asks whether Church Studio may use networks, choose Allow. If the network is set to Public, set it to Private (Settings › Network & internet › your network).")}</li>
            <li>{t("Mac: System Settings › Privacy & Security › Local Network, and turn on Church Studio.")}</li>
            <li>{t("Until then, pictures and videos still come through the cloud.")}</li>
          </ul>
        </details>
      {/if}
    </section>
  {/if}

  <p class="section-label">{t("Files in the cloud")}</p>
  <section class="rows">
    {#if items.length}
      {#each items as item (item.hash)}
        <div class="row">
          <div class="row-lead">
            <span class="row-icon"><Icon name={item.kind === "video" ? "video" : item.kind === "audio" ? "audio" : "media"} size={16} /></span>
            <div class="row-copy">
              <strong>{item.name}</strong>
              <span>{kindWord(item.kind)} · {formatBytes(item.bytes)} · {item.usedIn ? tn(item.usedIn, "used in {n} place", "used in {n} places") : t("not used")} · {t("last used {date}", { date: when(item.lastUsedAt) })}</span>
            </div>
          </div>
          <div class="row-end">
            <button type="button" class="btn" onclick={() => arm(`keep:${item.hash}`, () => cloud!.removeMedia(item.hash, false))}>{armed === `keep:${item.hash}` ? t("Click again to remove") : t("Remove from cloud")}</button>
            <button type="button" class="btn danger" onclick={() => arm(`all:${item.hash}`, () => cloud!.removeMedia(item.hash, true))}>{armed === `all:${item.hash}` ? t("Click again to delete") : t("Delete everywhere")}</button>
          </div>
        </div>
      {/each}
    {:else}
      <div class="row"><div class="row-copy"><span>{t("No pictures, videos or audio in the cloud yet. They go up as your songs, services and slides use them.")}</span></div></div>
    {/if}
    {#if bin.length}
      <p class="list-label">{t("Recently deleted")}</p>
      {#each bin as item (`${item.col}/${item.id}`)}
        <div class="row">
          <div class="row-copy"><strong>{item.name || item.id}</strong><span>{t("Deleted {date}. Gone for good 30 days later.", { date: when(item.deletedAt) })}</span></div>
          <button type="button" class="btn" onclick={() => void cloud?.restore(item.col, item.id).then(async (error) => { note = error ?? ""; await refresh(); })}>{t("Put back")}</button>
        </div>
      {/each}
      <div class="row"><div class="row-copy"><span>{t("Emptying the bin frees nothing in the cloud space; it only ends the 30 days early.")}</span></div><button type="button" class="btn danger" onclick={() => arm("bin", () => cloud!.emptyBin())}>{armed === "bin" ? t("Click again to empty it") : t("Empty now")}</button></div>
    {/if}
  </section>
{/if}

{#if session.nearbyActive}
  <p class="section-label">{t("Without the cloud")}</p>
  <section class="rows">
    <div class="row">
      <div class="row-lead"><span class="row-icon"><Icon name="laptop" size={16} /></span><div class="row-copy"><strong>{t("Send to computers on this network")}</strong><span>{t("Choose what to send. Someone at each computer accepts it. No internet or cloud space needed.")}</span></div></div>
      <button type="button" class="btn" onclick={() => (session.pushing = true)}>{t("Send…")}</button>
    </div>
    {#each session.offers as offer (offer.id)}
      <div class="row">
        <div class="row-copy"><strong>{t("Waiting from {name}", { name: offer.from })}</strong><span>{tn(offer.items.length + offer.files.length, "{n} item", "{n} items")}</span></div>
        <button type="button" class="btn" onclick={() => (session.reviewing = offer)}>{t("Review")}</button>
      </div>
    {/each}
  </section>
{/if}

<style>
  .status { display: flex; align-items: center; gap: 14px; padding: 16px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--tone) 8%, transparent); --tone: #30a46c; }
  .status.tone-busy { --tone: var(--accent); }
  .status.tone-wait { --tone: #f5a524; }
  .status.tone-bad { --tone: #e5484d; }
  .status-icon { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: color-mix(in srgb, var(--tone) 18%, transparent); color: var(--tone); }
  .tone-busy .status-icon :global(svg) { animation: spin 1.4s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .tone-busy .status-icon :global(svg) { animation: none; } }
  .status-copy { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .status-copy strong { font-size: 15px; }
  .status-copy span { color: var(--muted); font-size: 12.5px; line-height: 1.4; }
  .choose { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
  .choose button { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .choose button b { font-size: 13px; }
  .choose button span { color: var(--muted); font-size: 12px; }
  .choose button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); box-shadow: inset 0 0 0 1px var(--accent); }
  .always { flex: none; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, currentColor 8%, transparent); color: var(--muted); font-size: 11.5px; font-weight: 600; }
  .help { display: block; }
  .help summary { cursor: pointer; font-size: 13px; color: var(--muted); }
  .help ul { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 6px; font-size: 12.5px; line-height: 1.45; color: var(--muted); }
  .meter { display: block; height: 8px; margin: 6px 0; border-radius: 999px; background: color-mix(in srgb, currentColor 12%, transparent); overflow: hidden; }
  .meter i { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width 0.3s ease; }
  .meter i.over { background: var(--live, #ff3b3b); }
  .list-label { margin: 10px 14px 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
  .bad { color: var(--live, #ff6b6b); }
  .switch-wrap { display: flex; align-items: center; }
</style>
