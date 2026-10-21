<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { session } from "../../app/session.svelte";
  import { isDesktop } from "../../platform/runtime";
  import { t } from "../../i18n/core";

  // Space on this computer: what Church Studio keeps, and the safe ways to make it smaller.

  type Usage = { library: number; media: number; models: number; cache: number; folder: string };
  let usage = $state<Usage | null>(null);
  let busy = $state<"" | "cache" | "compact" | "model">("");
  let note = $state("");

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
      <div class="row-copy"><strong>{t("Pictures and videos")} · {size(usage.media)}</strong><span>{t("Files added to Media. Delete ones you no longer use from Media.")}</span></div>
    </div>
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
