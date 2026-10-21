<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { session } from "../../app/session.svelte";
  import { isDesktop } from "../../platform/runtime";
  import { t } from "../../i18n/core";

  // Space on this computer: what Church Studio keeps, and the safe ways to make it smaller.

  type Usage = { library: number; media: number; models: number; cache: number; folder: string };
  let usage = $state<Usage | null>(null);
  let busy = $state<"" | "cache" | "compact" | "model" | "find" | "remove">("");
  let note = $state("");
  type Unused = { id: string; name: string; path: string; bytes: number };
  let unused = $state<Unused[] | null>(null);
  let picked = $state<Set<string>>(new Set());
  let confirming = $state(false);
  const keyOf = (item: Unused) => item.id || item.path;
  const pickedBytes = $derived((unused ?? []).filter((item) => picked.has(keyOf(item))).reduce((sum, item) => sum + item.bytes, 0));

  async function findUnused() {
    busy = "find";
    note = "";
    confirming = false;
    // Save first, so the search sees every song, service and setting as they are now.
    await session.flushSave().catch(() => {});
    unused = await invoke<Unused[]>("storage_unused_media").catch(() => []);
    picked = new Set((unused ?? []).map(keyOf));
    busy = "";
  }

  function toggle(item: Unused) {
    const next = new Set(picked);
    if (next.has(keyOf(item))) next.delete(keyOf(item));
    else next.add(keyOf(item));
    picked = next;
    confirming = false;
  }

  async function removePicked() {
    if (!unused) return;
    if (!confirming) {
      confirming = true;
      return;
    }
    busy = "remove";
    const chosen = unused.filter((item) => picked.has(keyOf(item)));
    try {
      await invoke("storage_remove_unused", { ids: chosen.filter((item) => item.id).map((item) => item.id), files: chosen.filter((item) => !item.id).map((item) => item.path) });
      note = t("{count} unused files removed: {size} freed.", { count: chosen.length, size: size(pickedBytes) });
      unused = null;
      await session.reloadMedia();
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
    }
    confirming = false;
    busy = "";
    await refresh();
  }

  const size = (bytes: number) => (bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : bytes >= 1_000_000 ? `${Math.round(bytes / 1_000_000)} MB` : bytes >= 1000 ? `${Math.round(bytes / 1000)} KB` : bytes ? `${bytes} B` : "0 MB");
  const total = $derived(usage ? usage.library + usage.media + usage.models + usage.cache : 0);

  async function refresh() {
    if (!isDesktop()) return;
    usage = await invoke<Usage>("storage_usage").catch(() => null);
  }

  $effect(() => {
    void refresh();
  });

  async function clearCache() {
    busy = "cache";
    const freed = await invoke<number>("storage_clear_cache").catch(() => 0);
    note = freed ? t("Cache cleared: {size} freed.", { size: size(freed) }) : t("The cache was already small.");
    busy = "";
    await refresh();
  }

  async function compact() {
    busy = "compact";
    const before = usage?.library ?? 0;
    try {
      await invoke("storage_compact");
      await refresh();
      const saved = before - (usage?.library ?? before);
      note = saved > 100_000 ? t("Library compacted: {size} smaller, nothing removed.", { size: size(saved) }) : t("The library was already compact.");
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
    }
    busy = "";
  }

  async function removeModel() {
    busy = "model";
    await session.deleteAccurate();
    note = t("Speech model removed. Listening uses the system recognizer.");
    busy = "";
    await refresh();
  }
</script>

{#if isDesktop() && usage}
  <p class="section-label">{t("Space on this computer")}</p>
  <section class="rows">
    <div class="row">
      <div class="row-copy"><strong>{t("Church Studio uses {size}", { size: size(total) })}</strong><span>{note || t("Your library is kept small: songs, services and Bibles take little room. Pictures and videos take the most.")}</span></div>
    </div>
    <div class="row">
      <div class="row-copy"><strong>{t("Library")} · {size(usage.library)}</strong><span>{t("Songs, services, sermons, settings and Bibles. Compacting rewrites it in less space; nothing is removed.")}</span></div>
      <button type="button" class="btn" disabled={!!busy} onclick={() => void compact()}>{busy === "compact" ? t("Compacting…") : t("Compact")}</button>
    </div>
    <div class="row">
      <div class="row-copy"><strong>{t("Pictures and videos")} · {size(usage.media)}</strong><span>{t("Files added to Media. Find the ones nothing uses: no song, service, sermon, slide, look, theme or setting.")}</span></div>
      <button type="button" class="btn" disabled={!!busy} onclick={() => void findUnused()}>{busy === "find" ? t("Looking…") : t("Find unused")}</button>
    </div>
    {#if unused}
      <div class="row stack">
        {#if !unused.length}
          <div class="row-copy"><span>{t("Every picture and video is used somewhere. Nothing to clear.")}</span></div>
        {:else}
          <div class="row-copy"><strong>{t("{count} files nothing uses · {size}", { count: unused.length, size: size(unused.reduce((sum, item) => sum + item.bytes, 0)) })}</strong><span>{t("Untick any you want to keep. Removed files leave Media for good; a backup folder keeps a copy of the library, not of media files.")}</span></div>
          <ul class="unused">
            {#each unused as item (keyOf(item))}
              <li><label><input type="checkbox" checked={picked.has(keyOf(item))} onchange={() => toggle(item)} /> <span class="file">{item.name}</span>{#if !item.id}<em>{t("leftover file")}</em>{/if}<span class="bytes">{size(item.bytes)}</span></label></li>
            {/each}
          </ul>
          <div class="actions">
            <button type="button" class="btn" class:danger={confirming} disabled={!!busy || !picked.size} onclick={() => void removePicked()}>
              {busy === "remove" ? t("Removing…") : confirming ? t("Click again to remove {count} files ({size})", { count: picked.size, size: size(pickedBytes) }) : t("Remove {count} files ({size})", { count: picked.size, size: size(pickedBytes) })}
            </button>
            <button type="button" class="btn" onclick={() => { unused = null; confirming = false; }}>{t("Cancel")}</button>
          </div>
        {/if}
      </div>
    {/if}
    {#if usage.models}
      <div class="row">
        <div class="row-copy"><strong>{t("Speech model")} · {size(usage.models)}</strong><span>{t("For Accurate listening. Remove it to free the space; download it again any time.")}</span></div>
        <button type="button" class="btn" disabled={!!busy} onclick={() => void removeModel()}>{t("Remove")}</button>
      </div>
    {/if}
    <div class="row">
      <div class="row-copy"><strong>{t("Cache")} · {size(usage.cache)}</strong><span>{t("Copies of downloaded files the window keeps to be quicker. Safe to clear any time.")}</span></div>
      <button type="button" class="btn" disabled={!!busy || usage.cache < 1_000_000} onclick={() => void clearCache()}>{busy === "cache" ? t("Clearing…") : t("Clear cache")}</button>
    </div>
  </section>
{/if}

<style>
  .stack { flex-direction: column; align-items: stretch !important; gap: 10px; }
  .unused { max-height: 240px; overflow: auto; margin: 0; padding: 0; list-style: none; border: 1px solid var(--line); border-radius: 10px; }
  .unused li { border-bottom: 1px solid var(--line); } .unused li:last-child { border-bottom: 0; }
  .unused label { display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-size: 13px; cursor: pointer; }
  .unused .file { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .unused em { font-style: normal; font-size: 11px; color: var(--muted); }
  .unused .bytes { color: var(--muted); font-variant-numeric: tabular-nums; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .danger { border-color: #e5484d !important; color: #ff6b6f !important; }
</style>
