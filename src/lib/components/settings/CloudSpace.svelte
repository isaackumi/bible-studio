<script lang="ts">
  import { onMount } from "svelte";
  import type { CloudSync } from "../../app/cloud.svelte";
  import { formatBytes } from "../../app/move";
  import { session } from "../../app/session.svelte";
  import type { CloudBinItem, CloudMediaItem } from "../../sync/protocol";
  import { t, tn } from "../../i18n/core";
  import Icon from "../Icon.svelte";

  // Cloud space, in Settings › Account: how much of the plan's space is used and by what, the
  // files largest first with a way to take each out, the bin, and the computers syncing.

  let cloud = $state<CloudSync | null>(null);
  let items = $state<CloudMediaItem[]>([]);
  let bin = $state<CloudBinItem[]>([]);
  let loading = $state(true);
  let note = $state("");
  /** The file (or "bin") whose dangerous button was pressed once; a second press does it. */
  let armed = $state<string | null>(null);

  onMount(() => {
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
    <div class="row"><div class="row-copy"><strong>{t("Cloud space comes with Premium and Church")}</strong><span>{t("Your songs, services, slides and media on every computer on the licence, and a copy if a computer is lost.")}</span></div><button type="button" class="btn primary" onclick={() => (session.upgradeFor = "cloud-sync")}>{t("See plans")}</button></div>
  {:else if cloud.status === "signedOut"}
    <div class="row"><div class="row-copy"><strong>{t("Sign in to use your cloud space")}</strong><span>{t("Your library then follows the licence: this computer and the others on it keep one copy.")}</span></div></div>
  {:else if cloud.status === "off"}
    <div class="row"><div class="row-copy"><span>{t("Cloud space works in the desktop app.")}</span></div></div>
  {:else}
    <div class="row stack">
      <div class="row-copy">
        <strong>{t("{used} of {limit}", { used: formatBytes(cloud.usedBytes), limit: formatBytes(cloud.limitBytes) })}</strong>
        <span class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(share)}><i class:over={cloud.over} style:width="{share}%"></i></span>
        <span class="kinds">
          {#each kinds as kind (kind.id)}<em><b>{kind.label}</b> {formatBytes(kind.bytes)}</em>{/each}
          <em><b>{t("Songs & services")}</b> {t("a few MB")}</em>
        </span>
        <span>
          {#if cloud.status === "noSeat"}{cloud.message}
          {:else if cloud.readOnlyUntil}{t("Your plan has ended. The cloud copy can be read until {date}; renew to keep it.", { date: new Date(cloud.readOnlyUntil).toLocaleDateString() })}
          {:else if cloud.over}{t("You are over your cloud space. Remove some files below, or ask about more space.")}
          {:else if cloud.paused}{t("Cloud space is paused for everyone at the moment. Songs and services still sync.")}
          {:else if cloud.full}{t("Cloud space is full: new pictures and videos stay on this computer until some room is made below.")}
          {:else if cloud.status === "offline"}{cloud.message}
          {:else if cloud.status === "error"}{cloud.message}
          {:else if cloud.status === "syncing"}{t("Syncing…")}
          {:else}{t("Last synced {when} · {n}", { when: cloud.lastSyncAt ? new Date(cloud.lastSyncAt).toLocaleTimeString() : t("not yet"), n: tn(cloud.devices.length, "{n} computer", "{n} computers") })}{/if}
          {#if note} · <span class="bad">{note}</span>{/if}
        </span>
      </div>
      <div class="row-end"><button type="button" class="btn" onclick={() => { void cloud?.syncNow().then(refresh); }}>{t("Sync now")}</button></div>
    </div>
    <div class="row">
      <div class="row-copy"><strong>{t("Sync videos")}</strong><span>{t("Videos are the biggest files. Off: they stay on each computer.")}</span></div>
      <label class="switch-wrap"><input type="checkbox" class="switch" checked={cloud.syncVideos} onchange={(event) => void cloud?.setSyncVideos(event.currentTarget.checked)} /></label>
    </div>
    {#if items.length}
      <p class="list-label">{t("Largest first")}</p>
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
    {#if cloud.devices.length}
      <p class="list-label">{t("Computers syncing")}</p>
      {#each cloud.devices as device (device.device)}
        <div class="row"><div class="row-lead"><span class="row-icon"><Icon name="laptop" size={16} /></span><div class="row-copy"><strong>{device.name}</strong><span>{t("Last synced {when}", { when: new Date(device.lastSyncAt).toLocaleString() })}</span></div></div></div>
      {/each}
    {/if}
  {/if}
</section>

<style>
  .meter { display: block; height: 8px; margin: 6px 0; border-radius: 999px; background: color-mix(in srgb, currentColor 12%, transparent); overflow: hidden; }
  .meter i { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width 0.3s ease; }
  .meter i.over { background: var(--live, #ff3b3b); }
  .kinds { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; }
  .kinds em { font-style: normal; }
  .kinds b { font-weight: 650; margin-right: 4px; }
  .list-label { margin: 10px 14px 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
  .bad { color: var(--live, #ff6b6b); }
  .switch-wrap { display: flex; align-items: center; }
</style>
