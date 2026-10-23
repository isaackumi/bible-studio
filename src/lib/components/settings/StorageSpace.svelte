<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { session } from "../../app/session.svelte";
  import { isDesktop } from "../../platform/runtime";
  import { msg, t, tn } from "../../i18n/core";
  import { assetUrl } from "../../db/api";
  import PickList, { type PickItem } from "../PickList.svelte";

  // Space on this computer: what Church Studio keeps, and the safe ways to make it smaller.

  type Usage = { library: number; media: number; models: number; cache: number; folder: string };
  let usage = $state<Usage | null>(null);
  /** How much of the media nothing uses (null until counted). */
  let unusedBytes = $state<number | null>(null);
  let busy = $state<"" | "cache" | "compact" | "model" | "find" | "remove">("");
  let note = $state("");
  type Unused = { id: string; name: string; path: string; bytes: number };
  /** Every picture and video, with the parts of the library that use it (none: unused). */
  type MediaUse = Unused & { usedIn: string[] };
  let unused = $state<MediaUse[] | null>(null);
  const keyOf = (item: Unused) => item.id || item.path;
  const PICTURE = /\.(png|jpe?g|webp|gif|bmp|svg)$/i;
  const VIDEO = /\.(mp4|m4v|mov|webm)$/i;
  const PLACES: Record<string, string> = { songs: msg("songs"), services: msg("services"), sermons: msg("sermons"), themes: msg("themes"), workspace: msg("slides, looks and settings") };
  const unusedItems = $derived<PickItem[]>(
    (unused ?? []).map((item) => {
      const picture = PICTURE.test(item.path);
      const video = VIDEO.test(item.path);
      const kind = video ? t("Video") : picture ? t("Picture") : t("File");
      const used = item.usedIn.length > 0;
      return {
        key: keyOf(item),
        name: item.name,
        bytes: item.bytes,
        thumb: picture ? assetUrl(item.path) : null,
        icon: video ? "video" : picture ? "media" : "files",
        detail: used ? t("{kind} · used in {places}", { kind, places: item.usedIn.map((table) => t(PLACES[table] ?? table)).join(", ") }) : t("{kind} · used nowhere", { kind }),
        tag: used ? t("in use") : item.id ? t("not used") : t("leftover file"),
        locked: used,
      };
    }),
  );

  /** Every file, used and not, so the two can be compared; only the unused ones can be ticked. */
  async function findUnused() {
    busy = "find";
    note = "";
    // Save first, so the search sees every song, service and setting as they are now.
    await session.flushSave().catch(() => {});
    unused = await invoke<MediaUse[]>("storage_media_usage").catch(() => []);
    busy = "";
    if (unused && !unused.length) {
      note = t("No pictures or videos have been added to Media yet.");
      unused = null;
    }
  }

  /** Removes what is ticked in the list; a failure stays in the list for the operator to see. */
  async function removePicked(keys: string[]) {
    const chosen = (unused ?? []).filter((item) => keys.includes(keyOf(item)));
    const freed = chosen.reduce((sum, item) => sum + item.bytes, 0);
    busy = "remove";
    try {
      await invoke("storage_remove_unused", { ids: chosen.filter((item) => item.id).map((item) => item.id), files: chosen.filter((item) => !item.id).map((item) => item.path) });
      note = t("{count} unused files removed: {size} freed.", { count: chosen.length, size: size(freed) });
      await session.reloadMedia();
    } finally {
      busy = "";
      await refresh();
    }
  }

  const size = (bytes: number) => (bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : bytes >= 1_000_000 ? `${Math.round(bytes / 1_000_000)} MB` : bytes >= 1000 ? `${Math.round(bytes / 1000)} KB` : bytes ? `${bytes} B` : "0 MB");
  const total = $derived(usage ? usage.library + usage.media + usage.models + usage.cache : 0);

  async function refresh() {
    if (!isDesktop()) return;
    usage = await invoke<Usage>("storage_usage").catch(() => null);
    // Counted after saving, so a picture just placed in a service is not called unused.
    await session.flushSave().catch(() => {});
    const found = await invoke<Unused[]>("storage_unused_media").catch(() => null);
    unusedBytes = found ? found.reduce((sum, item) => sum + item.bytes, 0) : null;
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
      <div class="row-copy"><strong>{t("Pictures and videos")} · {size(usage.media)}</strong><span>{unusedBytes === null ? t("Files added to Media. Find the ones nothing uses: no song, service, sermon, slide, look, theme or setting.") : unusedBytes ? t("Files added to Media. {size} of it is used nowhere: no song, service, sermon, slide, look, theme or setting.", { size: size(unusedBytes) }) : t("Files added to Media. Every one is used somewhere.")}</span></div>
      <button type="button" class="btn" disabled={!!busy} onclick={() => void findUnused()}>{busy === "find" ? t("Looking…") : t("Review files")}</button>
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

{#if unused?.length}
  <PickList
    title={t("Pictures and videos")}
    intro={t("Every file in Media, with where it is used. Files in use cannot be ticked. The rest are ticked to remove; untick any you want to keep. Removed files leave Media for good; a backup keeps the library, not media files.")}
    items={unusedItems}
    picked={unusedItems.filter((item) => !item.locked).map((item) => item.key)}
    filters={[
      { id: "unused", label: t("Not used"), match: (item) => !item.locked },
      { id: "used", label: t("In use"), match: (item) => !!item.locked },
      { id: "picture", label: t("Pictures"), match: (item) => item.icon === "media" },
      { id: "video", label: t("Videos"), match: (item) => item.icon === "video" },
      { id: "leftover", label: t("Leftover files"), match: (item) => item.tag === t("leftover file") },
    ]}
    action={{ danger: true, label: (count, bytes) => tn(count, "Remove {n} file", "Remove {n} files") + (bytes ? ` · ${size(bytes)}` : ""), run: removePicked }}
    onclose={() => (unused = null)}
  />
{/if}

