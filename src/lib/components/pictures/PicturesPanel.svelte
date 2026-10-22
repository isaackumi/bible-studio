<script lang="ts">
  import { folderName, parentOf, pictures } from "../../app/pictures.svelte";
  import { isDesktop } from "../../platform/runtime";
  import { t, tn } from "../../i18n/core";
  import Icon from "../Icon.svelte";

  // Pictures straight from a folder: a grid to pick from, Preview or straight to the screen, and a
  // slideshow that runs on its own until the operator takes over.
  const selected = $derived(pictures.images[pictures.current] ?? null);

  function onkeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      pictures.step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      pictures.step(-1);
    }
  }
</script>

<aside class="pictures dock-drawer" aria-label={t("Pictures")}>
  <header>
    <div class="title">
      <h2>{t("Pictures")}</h2>
      <p>{pictures.folder ? `${folderName(pictures.folder)} · ${tn(pictures.images.length, "{n} picture", "{n} pictures")}` : t("From any folder on this computer, without copying")}</p>
    </div>
    <button type="button" class="icon-btn" aria-label={t("Close")} onclick={() => pictures.hide()}><Icon name="close" size={16} /></button>
  </header>

  {#if !isDesktop()}
    <p class="note">{t("Pictures from a folder are in the desktop app. Here, import pictures in Media.")}</p>
  {:else}
    <div class="bar">
      <button type="button" class="btn accent" onclick={() => pictures.choose()}>{t("Choose folder…")}</button>
      {#if pictures.folder}
        <button type="button" class="btn" disabled={!parentOf(pictures.folder)} onclick={() => pictures.up()} title={t("The folder this one is in")}>{t("Up")}</button>
        <button type="button" class="btn" aria-pressed={pictures.pinned.includes(pictures.folder)} onclick={() => pictures.togglePin()}>{pictures.pinned.includes(pictures.folder) ? t("Unpin") : t("Pin folder")}</button>
      {/if}
    </div>
    {#if pictures.pinned.length}
      <div class="chips" aria-label={t("Pinned folders")}>
        {#each pictures.pinned as path (path)}
          <button type="button" class="chip" class:on={pictures.folder === path} title={path} onclick={() => pictures.openFolder(path)}>★ {folderName(path)}</button>
        {/each}
      </div>
    {/if}
    {#if pictures.folders.length}
      <div class="chips" aria-label={t("Folders inside")}>
        {#each pictures.folders as entry (entry.path)}
          <button type="button" class="chip" onclick={() => pictures.openFolder(entry.path)}>{entry.name}</button>
        {/each}
      </div>
    {/if}
    {#if pictures.error}<p class="error" role="alert">{pictures.error}</p>{/if}

    {#if pictures.folder}
      {#if pictures.images.length}
        <ul class="grid" role="listbox" tabindex="0" aria-label={t("Pictures in {folder}", { folder: folderName(pictures.folder) })} {onkeydown}>
          {#each pictures.images as entry, index (entry.path)}
            <li>
              <button type="button" role="option" aria-selected={index === pictures.current} class:on={index === pictures.current} title={entry.name} onclick={() => pictures.preview(index)} ondblclick={() => pictures.showNow(index)}>
                <img src={pictures.url(entry)} alt={entry.name} loading="lazy" decoding="async" />
              </button>
            </li>
          {/each}
        </ul>
      {:else if !pictures.loading}
        <p class="note">{t("No pictures in this folder (JPEG, PNG, GIF, BMP or WebP).")}</p>
      {/if}

      <div class="now">
        <span class="one-line">{selected ? selected.name : t("Click a picture for Preview; double-click shows it now.")}</span>
        <div class="row">
          <button type="button" class="btn" aria-label={t("Previous picture")} onclick={() => pictures.step(-1)}>‹</button>
          <button type="button" class="btn" aria-label={t("Next picture")} onclick={() => pictures.step(1)}>›</button>
          <button type="button" class="btn accent" disabled={!selected} onclick={() => pictures.showNow(pictures.current)}>{t("Show now")}</button>
          <button type="button" class="btn" disabled={!selected} onclick={() => pictures.addToService(pictures.current)}>{t("Add to service")}</button>
        </div>
      </div>

      <section class="slideshow" aria-label={t("Slideshow")}>
        <div class="slide-head">
          <h3>{t("Slideshow")}</h3>
          {#if pictures.slideshow.running}<span class="live">{pictures.slideshow.paused ? t("Paused") : t("On the screen")}</span>{/if}
        </div>
        <label class="field">
          <span>{t("Each picture")}</span>
          <input type="range" min="1" max="30" step="1" value={pictures.slideshow.seconds} aria-label={t("Seconds for each picture")} oninput={(event) => pictures.setSeconds(Number(event.currentTarget.value))} />
          <b>{tn(pictures.slideshow.seconds, "{n} second", "{n} seconds")}</b>
        </label>
        <div class="field">
          <span>{t("Change")}</span>
          <div class="seg" role="radiogroup" aria-label={t("How pictures change")}>
            <button type="button" role="radio" aria-checked={pictures.slideshow.transition === "fade"} class:on={pictures.slideshow.transition === "fade"} onclick={() => pictures.setOptions({ transition: "fade" })}>{t("Fade")}</button>
            <button type="button" role="radio" aria-checked={pictures.slideshow.transition === "cut"} class:on={pictures.slideshow.transition === "cut"} onclick={() => pictures.setOptions({ transition: "cut" })}>{t("Cut")}</button>
          </div>
          <label class="loop"><input type="checkbox" class="switch" checked={pictures.slideshow.loop} onchange={(event) => pictures.setOptions({ loop: event.currentTarget.checked })} /> {t("Loop")}</label>
        </div>
        <div class="row">
          {#if !pictures.slideshow.running}
            <button type="button" class="btn accent" disabled={!pictures.images.length} onclick={() => pictures.start()}>{selected ? t("Start from this picture") : t("Start slideshow")}</button>
          {:else}
            {#if pictures.slideshow.paused}
              <button type="button" class="btn accent" onclick={() => pictures.resume()}>{t("Resume")}</button>
            {:else}
              <button type="button" class="btn" onclick={() => pictures.pause()}>{t("Pause")}</button>
            {/if}
            <button type="button" class="btn" onclick={() => pictures.stop()}>{t("Stop")}</button>
          {/if}
        </div>
        <p class="note">{t("The slideshow steps aside the moment anything else goes LIVE.")}</p>
      </section>
    {:else}
      <p class="note">{t("Choose a folder of pictures: announcements, a photo album, a picture loop for the walk-in. Nothing is copied.")}</p>
    {/if}
  {/if}
</aside>

<style>
  .pictures { position: fixed; top: 0; right: 0; bottom: 0; z-index: 30; width: min(var(--drawer-w, 420px), 100vw); display: flex; flex-direction: column; gap: 12px; padding: 16px; overflow: auto; background: var(--panel); color: var(--ink); border-left: 1px solid var(--line); box-shadow: -24px 0 60px rgb(0 0 0 / 0.35); font-size: 13px; text-align: left; }
  .pictures > :global(*) { width: 100%; flex: none; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .title { min-width: 0; }
  h2 { margin: 0; font-size: 17px; font-weight: 750; }
  header p { margin: 2px 0 0; color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
  .icon-btn { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; }
  .bar, .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .btn { height: 30px; padding: 0 11px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .btn:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.accent { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { max-width: 100%; height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip.on, .chip:hover { color: var(--ink); border-color: var(--accent); }
  .error { margin: 0; color: var(--danger, #ff6b5e); font-size: 12.5px; }
  .note { margin: 0; color: var(--muted); font-size: 12.5px; line-height: 1.5; }
  /* A grid of thumbnails, drawn only as they scroll into view. */
  .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 6px; max-height: 44vh; overflow: auto; }
  .grid li { content-visibility: auto; contain-intrinsic-size: 92px 64px; }
  .grid button { display: block; width: 100%; aspect-ratio: 16 / 11; padding: 0; border: 2px solid transparent; border-radius: 8px; background: #000; overflow: hidden; cursor: pointer; }
  .grid button.on { border-color: var(--accent); }
  .grid img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .now { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }
  .now .one-line { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .slideshow { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; }
  .slide-head { display: flex; align-items: center; justify-content: space-between; }
  h3 { margin: 0; font-size: 13px; font-weight: 700; }
  .live { padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); font-size: 11px; font-weight: 700; }
  .field { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; }
  .field input[type="range"] { flex: 1; }
  .field b { min-width: 76px; color: var(--ink); font-weight: 650; text-align: right; }
  .seg { display: inline-flex; padding: 2px; border-radius: 8px; background: color-mix(in srgb, currentColor 7%, transparent); }
  .seg button { height: 24px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .seg button.on { background: var(--panel-2, #2a2a30); color: var(--ink); }
  .loop { display: flex; align-items: center; gap: 6px; margin-left: auto; }
</style>
