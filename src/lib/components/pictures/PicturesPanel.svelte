<script lang="ts">
  import { crumbsOf, folderColor, folderName, pictures, type Place } from "../../app/pictures.svelte";
  import { isDesktop } from "../../platform/runtime";
  import { t, tn } from "../../i18n/core";
  import Icon from "../Icon.svelte";
  import { session } from "../../app/session.svelte";

  // Pictures straight from a folder: a grid to pick from, Preview or straight to the screen, and a
  // slideshow that runs on its own until the operator takes over.
  const selected = $derived(pictures.images[pictures.current] ?? null);
  const videos = $derived(pictures.images.filter((entry) => entry.kind === "video").length);
  const crumbs = $derived(pictures.folder ? crumbsOf(pictures.folder) : []);
  const show = $derived(pictures.slideshow);
  const playlists = $derived(session.workspace.playlists.filter((list) => list.trackIds.length));
  /** What is switched on, in a few words, for the closed Options heading. */
  const optionsOn = $derived(
    [
      show.order === "newest" ? t("Newest first") : show.order === "shuffle" ? t("Shuffle") : "",
      show.kenBurns ? t("Slow zoom") : "",
      show.captions ? t("Captions") : "",
      show.countdown ? t("Countdown") : "",
      show.music && show.playlistId ? t("Music") : "",
    ].filter(Boolean).join(", "),
  );

  /** Each kind of place keeps one colour, so Google Drive or Dropbox is spotted at once. */
  const PLACE_COLORS: Record<Place["kind"], string> = { pictures: "#3b82f6", desktop: "#64748b", "google-drive": "#22c55e", icloud: "#38bdf8", dropbox: "#2563eb", onedrive: "#0ea5e9" };

  /** A video's first frame, loaded only when its tile scrolls into view (a folder can hold hundreds). */
  function frame(node: HTMLVideoElement, src: string) {
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((entry) => entry.isIntersecting)) {
        node.src = `${src}#t=0.5`;
        observer.disconnect();
      }
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

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
      <p>{pictures.folder ? [tn(pictures.images.length - videos, "{n} picture", "{n} pictures"), videos ? tn(videos, "{n} video", "{n} videos") : "", pictures.folders.length ? tn(pictures.folders.length, "{n} folder", "{n} folders") : ""].filter(Boolean).join(" · ") : t("From any folder on this computer, without copying")}</p>
    </div>
    <button type="button" class="icon-btn" aria-label={t("Close")} onclick={() => pictures.hide()}><Icon name="close" size={16} /></button>
  </header>

  {#if !isDesktop()}
    <p class="note">{t("Pictures from a folder are in the desktop app. Here, import pictures in Media.")}</p>
  {:else}
    <div class="bar">
      <button type="button" class="btn accent" onclick={() => pictures.choose()}>{t("Choose folder…")}</button>
      {#if pictures.folder}
        <button type="button" class="btn" aria-pressed={pictures.pinned.includes(pictures.folder)} onclick={() => pictures.togglePin()}>{pictures.pinned.includes(pictures.folder) ? t("Unpin") : t("Pin folder")}</button>
      {/if}
    </div>
    <!-- Go to: the usual places (synced cloud drives included) and pinned folders, each with its colour. -->
    {#if pictures.places.length || pictures.pinned.length}
      <div class="places" aria-label={t("Go to")}>
        {#each pictures.places as place (place.path)}
          <button type="button" class="place" class:on={pictures.folder === place.path} title={place.path} onclick={() => pictures.openFolder(place.path)}>
            <i style:background={PLACE_COLORS[place.kind]}><Icon name={place.kind === "desktop" ? "laptop" : place.kind === "pictures" ? "media" : "globe"} size={12} /></i>{place.kind === "pictures" ? t("Pictures") : place.kind === "desktop" ? t("Desktop") : place.name}
          </button>
        {/each}
        {#each pictures.pinned as path (path)}
          <button type="button" class="place" class:on={pictures.folder === path} title={path} onclick={() => pictures.openFolder(path)}>
            <i style:background={folderColor(folderName(path))}><Icon name="pin" size={12} /></i>{folderName(path)}
          </button>
        {/each}
      </div>
    {/if}
    {#if crumbs.length}
      <nav class="crumbs" aria-label={t("Folder path")}>
        {#each crumbs as crumb, index (crumb.path)}
          {#if index}<span class="sep" aria-hidden="true">›</span>{/if}
          <button type="button" class:here={crumb.path === pictures.folder} disabled={crumb.path === pictures.folder} title={crumb.path} onclick={() => pictures.openFolder(crumb.path)}>
            <span class="crumb-icon" style:color={folderColor(crumb.name)}><Icon name={crumb.path === pictures.folder ? "folder-open" : "folder"} size={14} /></span>{crumb.name}
          </button>
        {/each}
      </nav>
    {/if}
    {#if pictures.error}<p class="error" role="alert">{pictures.error}</p>{/if}

    {#if pictures.folder}
      {#if pictures.folders.length}
        <ul class="folders" aria-label={t("Folders inside")}>
          {#each pictures.folders as entry (entry.path)}
            <li>
              <button type="button" title={entry.name} onclick={() => pictures.openFolder(entry.path)}>
                <span class="folder-icon" style:color={folderColor(entry.name)}><Icon name="folder" size={22} /></span>
                <span class="folder-name">{entry.name}</span>
                <small>{entry.items ? tn(entry.items, "{n} item", "{n} items") : t("Empty")}</small>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if pictures.images.length}
        <ul class="grid" role="listbox" tabindex="0" aria-label={t("Pictures in {folder}", { folder: folderName(pictures.folder) })} {onkeydown}>
          {#each pictures.images as entry, index (entry.path)}
            <li>
              <button type="button" role="option" aria-selected={index === pictures.current} class:on={index === pictures.current} title={entry.name} onclick={() => pictures.preview(index)} ondblclick={() => pictures.showNow(index)}>
                {#if entry.kind === "video"}
                  <video use:frame={pictures.url(entry)} muted playsinline preload="metadata" aria-label={entry.name}></video>
                  <span class="badge" aria-hidden="true"><Icon name="play" size={11} /></span>
                {:else}
                  <img src={pictures.url(entry)} alt={entry.name} loading="lazy" decoding="async" />
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else if !pictures.loading && !pictures.folders.length}
        <p class="note">{t("No pictures or videos in this folder (JPEG, PNG, GIF, BMP, WebP, MP4, MOV or WebM).")}</p>
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
        <!-- Each extra is the church's to switch on or off; remembered on this computer. -->
        <details class="options">
          <summary><span>{t("Options")}</span>{#if optionsOn}<small>{optionsOn}</small>{/if}<Icon name="chevron-down" size={14} /></summary>
          <div class="field">
            <span>{t("Order")}</span>
            <div class="seg" role="radiogroup" aria-label={t("Order")}>
              {#each [["name", t("In order")], ["newest", t("Newest first")], ["shuffle", t("Shuffle")]] as [id, label] (id)}
                <button type="button" role="radio" aria-checked={show.order === id} class:on={show.order === id} onclick={() => pictures.setOptions({ order: id as "name" | "newest" | "shuffle" })}>{label}</button>
              {/each}
            </div>
          </div>
          <label class="opt"><input type="checkbox" class="switch" checked={show.kenBurns} onchange={(event) => pictures.setOptions({ kenBurns: event.currentTarget.checked })} /><span><b>{t("Slow zoom")}</b>{t("Each picture slowly zooms and drifts, so stills feel alive.")}</span></label>
          <label class="opt"><input type="checkbox" class="switch" checked={show.captions} onchange={(event) => pictures.setOptions({ captions: event.currentTarget.checked })} /><span><b>{t("Names as captions")}</b>{t("A picture's file name shows along the bottom: name a file “Youth Night – Friday 7pm”.")}</span></label>
          <label class="opt"><input type="checkbox" class="switch" checked={show.countdown} onchange={(event) => pictures.setOptions({ countdown: event.currentTarget.checked })} /><span><b>{t("Countdown")}</b>{t("A countdown over the pictures; it leaves the screen at zero.")}</span></label>
          {#if show.countdown}
            <div class="sub">
              <input class="text" aria-label={t("Countdown words")} value={show.countdownLabel === "Service starts in" ? t("Service starts in") : show.countdownLabel} onchange={(event) => pictures.setOptions({ countdownLabel: event.currentTarget.value })} />
              <input class="num" type="number" min="1" max="120" aria-label={t("Minutes")} value={show.countdownMinutes} onchange={(event) => pictures.setOptions({ countdownMinutes: Number(event.currentTarget.value) })} />
              <span>{t("min")}</span>
            </div>
          {/if}
          <label class="opt"><input type="checkbox" class="switch" checked={show.music} disabled={!playlists.length} onchange={(event) => pictures.setOptions({ music: event.currentTarget.checked, playlistId: show.playlistId ?? playlists[0]?.id ?? null })} /><span><b>{t("Music")}</b>{playlists.length ? t("A playlist plays with the pictures and fades out when the slideshow stops.") : t("Add music to a playlist (Audio, at the top) to play it with the pictures.")}</span></label>
          {#if show.music && playlists.length}
            <div class="sub">
              <select aria-label={t("Playlist")} value={show.playlistId ?? playlists[0]?.id} onchange={(event) => pictures.setOptions({ playlistId: event.currentTarget.value })}>
                {#each playlists as list (list.id)}<option value={list.id}>{list.name}</option>{/each}
              </select>
            </div>
          {/if}
          <label class="opt"><input type="checkbox" class="switch" checked={show.watch} onchange={(event) => pictures.setOptions({ watch: event.currentTarget.checked })} /><span><b>{t("Pick up new pictures")}</b>{t("Pictures added to the folder while it runs (a shared Drive folder) join the slideshow.")}</span></label>
          {#if pictures.slideshow.running}<p class="note">{t("Changes apply from the next picture; order, countdown and music from the next start.")}</p>{/if}
        </details>
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
        <p class="note">{videos ? t("Videos play to the end before the next. The slideshow steps aside the moment anything else goes LIVE.") : t("The slideshow steps aside the moment anything else goes LIVE.")}</p>
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
  .places { display: flex; flex-wrap: wrap; gap: 6px; }
  .place { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; height: 28px; padding: 0 10px 0 4px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .place i { flex: none; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: #fff; }
  .place:hover, .place.on { border-color: var(--accent); }
  .crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 6px 8px; border-radius: 10px; background: color-mix(in srgb, currentColor 5%, transparent); }
  .crumbs button { display: inline-flex; align-items: center; gap: 5px; max-width: 160px; height: 26px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .crumbs button:hover:not(:disabled) { color: var(--ink); background: color-mix(in srgb, currentColor 8%, transparent); }
  .crumbs button.here { color: var(--ink); cursor: default; }
  .crumb-icon { display: grid; flex: none; }
  .crumbs .sep { color: var(--muted); font-size: 13px; }
  /* Folders inside: big coloured icons first, so they read as places to go, not pictures. */
  .folders { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
  .folders button { width: 100%; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 8px; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, currentColor 3%, transparent); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .folders button:hover { border-color: var(--accent); }
  .folder-icon { grid-row: 1 / 3; display: grid; }
  .folder-icon :global(svg) { fill: currentColor; fill-opacity: 0.22; }
  .folder-name { font-size: 12.5px; font-weight: 650; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  .folders small { color: var(--muted); font-size: 11px; }
  .grid button { position: relative; }
  .grid video { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
  .badge { position: absolute; right: 5px; bottom: 5px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: rgb(0 0 0 / 0.65); color: #fff; }
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
  .options { border-top: 1px solid var(--line); padding-top: 8px; }
  .options summary { display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; font-size: 12.5px; font-weight: 700; }
  .options summary::-webkit-details-marker { display: none; }
  .options summary small { flex: 1; min-width: 0; color: var(--accent); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .options summary :global(svg) { margin-left: auto; color: var(--muted); transition: transform 150ms; }
  .options[open] summary :global(svg) { transform: rotate(180deg); }
  .options[open] { display: grid; gap: 10px; }
  .opt { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
  .opt input { flex: none; margin-top: 2px; }
  .opt span { display: grid; gap: 1px; color: var(--muted); font-size: 12px; line-height: 1.4; }
  .opt b { color: var(--ink); font-size: 12.5px; font-weight: 650; }
  .sub { display: flex; align-items: center; gap: 6px; margin: -4px 0 0 46px; color: var(--muted); font-size: 12px; }
  .sub .text { flex: 1; min-width: 0; }
  .sub .num { width: 64px; }
  .sub input, .sub select { height: 30px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--field, transparent); color: var(--ink); font: inherit; font-size: 12.5px; }
</style>
