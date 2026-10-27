<script lang="ts">
  import { crumbsOf, FAVORITES, folderColor, folderName, matchesQuery, pictures, thumbFor, type Place } from "../../app/pictures.svelte";
  import { releaseVideo } from "../../display/stream";
  import { isDesktop } from "../../platform/runtime";
  import { msg, t, tn } from "../../i18n/core";
  import type { SlideTransition } from "../../domain/slideshow";
  import Icon from "../Icon.svelte";
  import PickList, { type PickItem } from "../PickList.svelte";
  import { session } from "../../app/session.svelte";

  // Pictures straight from a folder: a grid to pick from, Preview or straight to the screen, and a
  // slideshow that runs on its own until the operator takes over.
  const selected = $derived(pictures.images[pictures.current] ?? null);
  const videos = $derived(pictures.images.filter((entry) => entry.kind === "video").length);
  const favoritesOpen = $derived(pictures.folder === FAVORITES);
  const crumbs = $derived(pictures.folder && !favoritesOpen ? crumbsOf(pictures.folder) : []);
  const folderLabel = $derived(favoritesOpen ? t("Favourites") : pictures.folder ? folderName(pictures.folder) : "");
  /** What the grid shows: every picture, or those whose names hold the words typed. */
  const shownImages = $derived(pictures.query.trim() ? pictures.images.filter((entry) => matchesQuery(entry.name, pictures.query)) : pictures.images);
  const parent = $derived(crumbs.length > 1 ? crumbs[crumbs.length - 2]! : null);
  // Folders with no pictures and no folders inside are kept out of the way, a click from showing.
  let showEmpty = $state(false);
  const isEmpty = (entry: { items: number; folders?: number }) => !entry.items && !entry.folders;
  const emptyFolders = $derived(pictures.folders.filter(isEmpty).length);
  const shownFolders = $derived((showEmpty ? pictures.folders : pictures.folders.filter((entry) => !isEmpty(entry))).filter((entry) => !pictures.query.trim() || matchesQuery(entry.name, pictures.query)));
  const show = $derived(pictures.slideshow);
  const playlists = $derived(session.workspace.playlists.filter((list) => list.trackIds.length));
  /** The songs the slideshow will play (its playlist's, in order). */
  const chosenTracks = $derived(show.playlistId ? session.playlistTracks(show.playlistId) : []);

  // Choose music: the church's music library first; songs from this computer join the library.
  let musicPicking = $state(false);
  let justImported = $state<string[]>([]);
  let importing = $state(false);
  const libraryItems = $derived<PickItem[]>(
    session.audioTracks.map((track) => ({
      key: track.id,
      name: track.name.replace(/\.[a-z0-9]+$/i, ""),
      detail: session.workspace.playlists.filter((list) => list.trackIds.includes(track.id)).map((list) => list.name).join(", ") || t("In the music library"),
      icon: "note",
    })),
  );
  function openMusic() {
    justImported = [];
    musicPicking = true;
  }
  async function importMusic() {
    importing = true;
    try {
      const added = await pictures.importMusic();
      justImported = [...justImported, ...added];
    } finally {
      importing = false;
    }
  }
  /** What is switched on in each group, in a few words, for its closed heading. */
  const playingOn = $derived([show.loop ? "" : t("Plays once"), show.order === "newest" ? t("Newest first") : show.order === "shuffle" ? t("Shuffle") : "", show.kenBurns ? t("Slow zoom") : "", show.watch ? t("New pictures join") : ""].filter(Boolean).join(", "));
  const screenOn = $derived(
    [show.title && show.titleText ? t("Title") : "", show.clock ? t("Clock") : "", show.captions ? t("Captions") : "", show.countdown ? t("Countdown") : "", show.themeBackground ? "" : t("Black background"), show.fill ? t("Fill the screen") : ""].filter(Boolean).join(", "),
  );
  const musicOn = $derived(show.music && chosenTracks.length ? tn(chosenTracks.length, "{n} song", "{n} songs") : "");

  // The preview's clock, as the screen shows it (ticks only while the full window shows it).
  let clockNow = $state(new Date());
  $effect(() => {
    if (!wide || !show.clock) return;
    const timer = setInterval(() => (clockNow = new Date()), 15_000);
    return () => clearInterval(timer);
  });

  // The whole window: a big grid to pick from, the chosen picture large, and every setting in view.
  const WIDE_KEY = "church-studio:pictures-wide";
  let wide = $state(readWide());
  function readWide(): boolean {
    try {
      return localStorage.getItem(WIDE_KEY) === "1";
    } catch {
      return false;
    }
  }
  function toggleWide() {
    wide = !wide;
    try {
      localStorage.setItem(WIDE_KEY, wide ? "1" : "0");
    } catch {
      // Remembered for this visit only.
    }
  }

  /** How pictures change, with a line on what each looks like. */
  const CHANGES: Array<{ id: SlideTransition; label: string; tip: string }> = [
    { id: "fade", label: msg("Fade"), tip: msg("One picture melts into the next.") },
    { id: "slide", label: msg("Push"), tip: msg("The next picture pushes the last one off the side.") },
    { id: "zoom", label: msg("Zoom"), tip: msg("The next picture settles in from slightly larger.") },
    { id: "dip", label: msg("Dip"), tip: msg("Down to black, then up into the next picture.") },
    { id: "mix", label: msg("Mix"), tip: msg("A different change each time: fade, push, zoom and dip in turn.") },
    { id: "cut", label: msg("Cut"), tip: msg("Straight to the next picture.") },
  ];

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
    // The tile gone (another folder, a search): its decoder goes with it (WebKit allows only so many).
    return {
      destroy: () => {
        observer.disconnect();
        releaseVideo(node);
      },
    };
  }

  /** A picture's small copy, asked for only when its tile scrolls into view. */
  function thumb(node: HTMLImageElement, path: string) {
    let gone = false;
    const observer = new IntersectionObserver((seen) => {
      if (!seen.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void thumbFor(path).then((src) => !gone && (node.src = src)).catch(() => !gone && (node.src = pictures.url({ path } as never)));
    }, { rootMargin: "200px" });
    observer.observe(node);
    return {
      destroy: () => {
        gone = true;
        observer.disconnect();
      },
    };
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

<aside class="pictures dock-drawer" class:wide aria-label={t("Pictures")}>
  <header>
    <div class="title">
      <h2>{t("Pictures")}</h2>
      <p>{pictures.folder ? [tn(pictures.images.length - videos, "{n} picture", "{n} pictures"), videos ? tn(videos, "{n} video", "{n} videos") : "", pictures.folders.length ? tn(pictures.folders.length, "{n} folder", "{n} folders") : ""].filter(Boolean).join(" · ") : t("From any folder on this computer, without copying")}</p>
    </div>
    <div class="head-tools">
      <button type="button" class="icon-btn" aria-pressed={wide} aria-label={wide ? t("Back to the side") : t("Full window")} data-tip={wide ? t("Back to the side") : t("Full window: a big grid and every setting in view")} onclick={toggleWide}><Icon name={wide ? "shrink" : "expand"} size={16} /></button>
      <button type="button" class="icon-btn" aria-label={t("Close")} onclick={() => pictures.hide()}><Icon name="close" size={16} /></button>
    </div>
  </header>

  {#if !isDesktop()}
    <p class="note">{t("Pictures from a folder are in the desktop app. Here, import pictures in Media.")}</p>
  {:else}
  <div class="layout">
  <div class="browse">
    {#if pictures.folder}
      {@const pinned = pictures.pinned.includes(pictures.folder)}
      <!-- Where you are: up a level, the folder's name, the way back, and what to do with it. -->
      <div class="location">
        <button type="button" class="icon-btn up" disabled={!parent} aria-label={parent ? t("Up to {folder}", { folder: parent.name }) : t("Up")} data-tip={parent ? t("Up to {folder}", { folder: parent.name }) : undefined} onclick={() => parent && pictures.openFolder(parent.path)}><Icon name="chevron-left" size={16} /></button>
        <span class="loc-icon" style:color={folderColor(folderName(pictures.folder))}><Icon name="folder-open" size={20} /></span>
        <div class="loc-text">
          <strong title={favoritesOpen ? undefined : pictures.folder}>{folderLabel}</strong>
          {#if crumbs.length > 1}
            <nav class="loc-path" aria-label={t("Folder path")}>
              {#each crumbs.slice(0, -1) as crumb, index (crumb.path)}{#if index}<span aria-hidden="true">›</span>{/if}<button type="button" title={crumb.path} onclick={() => pictures.openFolder(crumb.path)}>{crumb.name}</button>{/each}
            </nav>
          {/if}
        </div>
        <input class="find" type="search" aria-label={t("Find pictures by name")} placeholder={t("Find by name")} bind:value={pictures.query} />
        {#if !favoritesOpen}<button type="button" class="icon-btn pin" class:on={pinned} aria-pressed={pinned} aria-label={pinned ? t("Unpin this folder") : t("Pin this folder")} data-tip={pinned ? t("Unpin this folder") : t("Pin this folder to Go to")} onclick={() => pictures.togglePin()}><Icon name="star" size={16} /></button>{/if}
        <button type="button" class="btn open" onclick={() => pictures.choose()}><Icon name="folder" size={14} /> {t("Open…")}</button>
      </div>
    {:else}
      <div class="start">
        <span class="start-icon"><Icon name="media" size={22} /></span>
        <div><strong>{t("Show pictures from any folder")}</strong><span>{t("Announcements, a photo album, a picture loop for the walk-in. Nothing is copied.")}</span></div>
        <button type="button" class="btn accent" data-tour="pic-folder" onclick={() => pictures.choose()}>{t("Choose folder…")}</button>
      </div>
    {/if}
    <!-- Go to: the usual places (synced cloud drives included) and pinned folders, on one line. -->
    {#if pictures.places.length || pictures.pinned.length || pictures.favorites.length}
      <div class="places" role="group" aria-label={t("Go to")}>
        <span class="places-label">{t("Go to")}</span>
        {#if pictures.favorites.length}
          <button type="button" class="place" class:on={favoritesOpen} onclick={() => pictures.openFavorites()}>
            <i style:background="#f5a524"><Icon name="star" size={11} /></i>{t("Favourites")}
          </button>
        {/if}
        {#each pictures.places as place (place.path)}
          <button type="button" class="place" class:on={pictures.folder === place.path} title={place.path} onclick={() => pictures.openFolder(place.path)}>
            <i style:background={PLACE_COLORS[place.kind]}><Icon name={place.kind === "desktop" ? "laptop" : place.kind === "pictures" ? "media" : "globe"} size={11} /></i>{place.kind === "pictures" ? t("Pictures") : place.kind === "desktop" ? t("Desktop") : place.name}
          </button>
        {/each}
        {#each pictures.pinned as path (path)}
          <button type="button" class="place" class:on={pictures.folder === path} title={path} onclick={() => pictures.openFolder(path)}>
            <i style:background={folderColor(folderName(path))}><Icon name="star" size={11} /></i>{folderName(path)}
          </button>
        {/each}
      </div>
    {/if}
    {#if pictures.error}<p class="error" role="alert">{pictures.error}</p>{/if}

    {#if pictures.folder}
      {#if shownFolders.length}
        <ul class="folders" aria-label={t("Folders inside")}>
          {#each shownFolders as entry (entry.path)}
            <li>
              <button type="button" title={entry.name} onclick={() => pictures.openFolder(entry.path)}>
                <span class="folder-icon" style:color={folderColor(entry.name)}><Icon name="folder" size={22} /></span>
                <span class="folder-name">{entry.name}</span>
                <small>{entry.items ? tn(entry.items, "{n} item", "{n} items") : entry.folders ? tn(entry.folders, "{n} folder", "{n} folders") : t("Empty")}</small>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if emptyFolders}
        <button type="button" class="link-btn" onclick={() => (showEmpty = !showEmpty)}>{showEmpty ? t("Hide empty folders") : tn(emptyFolders, "Show {n} empty folder", "Show {n} empty folders")}</button>
      {/if}
      {#if shownImages.length}
        <ul class="grid" role="listbox" tabindex="0" aria-label={t("Pictures in {folder}", { folder: folderLabel })} {onkeydown}>
          {#each shownImages as entry (entry.path)}
            {@const index = pictures.images.indexOf(entry)}
            {@const starred = pictures.isFavorite(entry.path)}
            <li>
              <button type="button" role="option" aria-selected={index === pictures.current} class:on={index === pictures.current} title={entry.name} onclick={() => pictures.preview(index)} ondblclick={() => pictures.showNow(index)}>
                {#if entry.kind === "video"}
                  <video use:frame={pictures.url(entry)} muted playsinline preload="metadata" aria-label={entry.name}></video>
                  <span class="badge" aria-hidden="true"><Icon name="play" size={11} /></span>
                {:else}
                  <img use:thumb={entry.path} alt={entry.name} decoding="async" />
                {/if}
              </button>
              <button type="button" class="star" class:on={starred} aria-pressed={starred} aria-label={starred ? t("Take {name} out of Favourites", { name: entry.name }) : t("Add {name} to Favourites", { name: entry.name })} onclick={() => pictures.toggleFavorite(entry)}><Icon name="star" size={12} /></button>
            </li>
          {/each}
        </ul>
      {:else if pictures.query.trim() && pictures.images.length}
        <p class="note">{t("No pictures here have “{query}” in their name.", { query: pictures.query.trim() })}</p>
      {:else if favoritesOpen}
        <p class="note">{t("Star a picture in any folder to keep it here.")}</p>
      {:else if !pictures.loading && !pictures.folders.length}
        <p class="note">{t("No pictures or videos in this folder (JPEG, PNG, GIF, BMP, WebP, MP4, MOV or WebM).")}</p>
      {/if}
    {/if}
  </div>

  {#if pictures.folder}
  <div class="control">
      {#if wide && selected}
        <figure class="big" class:fill={show.fill} class:black={!show.themeBackground}>
          {#if selected.kind === "video"}<video src={pictures.url(selected)} muted playsinline preload="metadata"></video>{:else}<img src={pictures.url(selected)} alt={selected.name} />{/if}
          {#if show.title && show.titleText}<figcaption class="big-title">{show.titleText}</figcaption>{/if}
          {#if show.clock}<span class="big-clock" class:low={show.title && !!show.titleText}>{clockNow.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>{/if}
          {#if show.captions}<figcaption class="big-caption">{selected.name.replace(/\.[a-z0-9]+$/i, "")}</figcaption>{/if}
        </figure>
      {/if}
      <!-- The slideshow's controls first: which picture, and start or stop. Settings come after. -->
      <section class="player" aria-label={t("Slideshow")}>
        <div class="picker">
          <button type="button" class="icon-btn" aria-label={t("Previous picture")} onclick={() => pictures.step(-1)}><Icon name="chevron-left" size={16} /></button>
          <span class="one-line" title={selected?.name}>{selected ? selected.name.replace(/\.[a-z0-9]+$/i, "") : t("Click a picture for Preview; double-click shows it now.")}</span>
          <span class="count">{pictures.images.length ? `${Math.max(1, pictures.current + 1)} / ${pictures.images.length}` : ""}</span>
          <button type="button" class="icon-btn" aria-label={t("Next picture")} onclick={() => pictures.step(1)}><Icon name="chevron-right" size={16} /></button>
        </div>
        {#if !pictures.slideshow.running}
          <button type="button" class="btn accent start-btn" disabled={!pictures.images.length} onclick={() => pictures.start()}><Icon name="play" size={15} /> {selected ? t("Start from this picture") : t("Start slideshow")}</button>
        {:else}
          <div class="running">
            <span class="live"><i></i>{pictures.slideshow.paused ? t("Paused") : t("On the screen")}</span>
            {#if pictures.slideshow.paused}
              <button type="button" class="btn accent" onclick={() => pictures.resume()}><Icon name="play" size={14} /> {t("Resume")}</button>
            {:else}
              <button type="button" class="btn" onclick={() => pictures.pause()}><Icon name="pause" size={14} /> {t("Pause")}</button>
            {/if}
            <button type="button" class="btn" onclick={() => pictures.stop()}>{t("Stop")}</button>
          </div>
        {/if}
        <div class="pair">
          <button type="button" class="btn" disabled={!selected} onclick={() => pictures.showNow(pictures.current)}>{t("Show now")}</button>
          <button type="button" class="btn" disabled={!selected} onclick={() => pictures.addToService(pictures.current)}>{t("Add to service")}</button>
        </div>
        <p class="hint">{videos ? t("Videos play to the end before the next. The slideshow steps aside the moment anything else goes LIVE.") : t("The slideshow steps aside the moment anything else goes LIVE.")}</p>
      </section>

      <section class="slideshow" aria-label={t("Slideshow settings")}>
        <h3>{t("Slideshow settings")}</h3>
        <label class="setting">
          <span>{t("Each picture")}</span>
          <input type="range" min="1" max="30" step="1" value={pictures.slideshow.seconds} aria-label={t("Seconds for each picture")} oninput={(event) => pictures.setSeconds(Number(event.currentTarget.value))} />
          <b>{tn(pictures.slideshow.seconds, "{n} second", "{n} seconds")}</b>
        </label>
        <div class="setting">
          <span>{t("Change")}</span>
          <div class="seg changes" role="radiogroup" aria-label={t("How pictures change")}>
            {#each CHANGES as change (change.id)}
              <button type="button" role="radio" title={t(change.tip)} aria-checked={pictures.slideshow.transition === change.id} class:on={pictures.slideshow.transition === change.id} onclick={() => pictures.setOptions({ transition: change.id })}>{t(change.label)}</button>
            {/each}
          </div>
        </div>
        {#if pictures.slideshow.transition !== "cut"}
          <label class="setting">
            <span>{t("Change takes")}</span>
            <input type="range" min="0.3" max="3" step="0.1" value={pictures.slideshow.transitionSeconds} aria-label={t("Seconds for each change")} oninput={(event) => pictures.setOptions({ transitionSeconds: Number(event.currentTarget.value) })} />
            <b>{t("{seconds} s", { seconds: pictures.slideshow.transitionSeconds.toFixed(1) })}</b>
          </label>
        {/if}
        <!-- Every choice is the church's to switch on or off, in three groups; remembered on this computer. -->
        <details class="options" open={wide || undefined}>
          <summary><span>{t("Playing")}</span>{#if playingOn}<small>{playingOn}</small>{/if}<Icon name="chevron-down" size={14} /></summary>
          <div class="setting">
            <span>{t("Order")}</span>
            <div class="seg" role="radiogroup" aria-label={t("Order")}>
              {#each [["name", t("In order")], ["newest", t("Newest first")], ["shuffle", t("Shuffle")]] as [id, label] (id)}
                <button type="button" role="radio" aria-checked={show.order === id} class:on={show.order === id} onclick={() => pictures.setOptions({ order: id as "name" | "newest" | "shuffle" })}>{label}</button>
              {/each}
            </div>
          </div>
          <label class="opt"><input type="checkbox" class="switch" checked={show.loop} onchange={(event) => pictures.setOptions({ loop: event.currentTarget.checked })} /><span><b>{t("Loop")}</b>{t("Start again from the first picture after the last.")}</span></label>
          <label class="opt"><input type="checkbox" class="switch" checked={show.kenBurns} onchange={(event) => pictures.setOptions({ kenBurns: event.currentTarget.checked })} /><span><b>{t("Slow zoom")}</b>{t("Each picture slowly zooms and drifts, so stills feel alive.")}</span></label>
          <label class="opt"><input type="checkbox" class="switch" checked={show.watch} onchange={(event) => pictures.setOptions({ watch: event.currentTarget.checked })} /><span><b>{t("Pick up new pictures")}</b>{t("Pictures added to the folder while it runs (a shared Drive folder) join the slideshow.")}</span></label>
        </details>

        <details class="options" open={wide || undefined}>
          <summary><span>{t("On the screen")}</span>{#if screenOn}<small>{screenOn}</small>{/if}<Icon name="chevron-down" size={14} /></summary>
          <label class="opt"><input type="checkbox" class="switch" checked={show.title} onchange={(event) => pictures.setOptions({ title: event.currentTarget.checked })} /><span><b>{t("Title at the top")}</b>{t("Words across the top for the whole slideshow: a welcome, an event, a theme.")}</span></label>
          {#if show.title}
            <div class="sub"><input class="text" maxlength="120" aria-label={t("Title")} placeholder={t("Welcome to Grace Chapel")} value={show.titleText} oninput={(event) => pictures.setOptions({ titleText: event.currentTarget.value })} /></div>
          {/if}
          <label class="opt"><input type="checkbox" class="switch" checked={show.clock} onchange={(event) => pictures.setOptions({ clock: event.currentTarget.checked })} /><span><b>{t("Clock")}</b>{t("The time of day in the top corner.")}</span></label>
          <label class="opt"><input type="checkbox" class="switch" checked={show.countdown} onchange={(event) => pictures.setOptions({ countdown: event.currentTarget.checked })} /><span><b>{t("Countdown")}</b>{t("A countdown over the pictures; it leaves the screen at zero.")}</span></label>
          {#if show.countdown}
            <div class="sub">
              <input class="text" aria-label={t("Countdown words")} value={show.countdownLabel === "Service starts in" ? t("Service starts in") : show.countdownLabel} onchange={(event) => pictures.setOptions({ countdownLabel: event.currentTarget.value })} />
              <input class="num" type="number" min="1" max="120" aria-label={t("Minutes")} value={show.countdownMinutes} onchange={(event) => pictures.setOptions({ countdownMinutes: Number(event.currentTarget.value) })} />
              <span>{t("min")}</span>
            </div>
          {/if}
          <label class="opt"><input type="checkbox" class="switch" checked={show.captions} onchange={(event) => pictures.setOptions({ captions: event.currentTarget.checked })} /><span><b>{t("Names as captions")}</b>{t("A picture's file name shows along the bottom: name a file “Youth Night – Friday 7pm”.")}</span></label>
          <label class="opt"><input type="checkbox" class="switch" checked={show.themeBackground} onchange={(event) => pictures.setOptions({ themeBackground: event.currentTarget.checked })} /><span><b>{t("Theme background")}</b>{t("The theme's colour or motion shows around a picture that does not fill the screen. Off: plain black.")}</span></label>
          <label class="opt"><input type="checkbox" class="switch" checked={show.fill} onchange={(event) => pictures.setOptions({ fill: event.currentTarget.checked })} /><span><b>{t("Fill the screen")}</b>{t("Each picture fills the whole screen, trimming its edges if its shape differs. Off: the whole picture shows.")}</span></label>
        </details>

        <details class="options" open={wide || undefined}>
          <summary><span>{t("Background music")}</span>{#if musicOn}<small>♪ {musicOn}</small>{/if}<Icon name="chevron-down" size={14} /></summary>
          <label class="opt"><input type="checkbox" class="switch" checked={show.music && chosenTracks.length > 0} onchange={(event) => { const on = event.currentTarget.checked; if (on && !chosenTracks.length) { event.currentTarget.checked = false; openMusic(); } else pictures.setOptions({ music: on }); }} /><span><b>{t("Music")}</b>{t("Songs play under the pictures, start again at the end, and fade out when the slideshow stops.")}</span></label>
          <div class="sub music">
            <button type="button" class="btn" onclick={openMusic}><Icon name="note" size={13} /> {chosenTracks.length ? t("Change music…") : t("Choose music…")}</button>
            {#if playlists.length > 1}
              <select aria-label={t("Or play a playlist")} value={show.playlistId ?? ""} onchange={(event) => pictures.setOptions({ music: true, playlistId: event.currentTarget.value })}>
                {#each playlists as list (list.id)}<option value={list.id}>{list.name} · {tn(list.trackIds.length, "{n} song", "{n} songs")}</option>{/each}
              </select>
            {/if}
            {#if chosenTracks.length}
              {@const ours = session.audio.playlistId === show.playlistId && !!session.audio.current}
              <button type="button" class="btn" aria-pressed={ours && session.audio.playing} onclick={() => void pictures.testMusic()}><Icon name={ours && session.audio.playing ? "pause" : "play"} size={13} /> {ours && session.audio.playing ? t("Pause") : t("Test")}</button>
            {/if}
          </div>
          {#if chosenTracks.length}
            <p class="sub tracks">{tn(chosenTracks.length, "{n} song", "{n} songs")}: {chosenTracks.slice(0, 3).map((track) => track.name.replace(/\.[a-z0-9]+$/i, "")).join(", ")}{chosenTracks.length > 3 ? "…" : ""}</p>
            {@const ours = session.audio.playlistId === show.playlistId && !!session.audio.current}
            <div class="sub music-volume">
              <Icon name="sound" size={14} />
              <input type="range" min="0" max="1" step="0.05" aria-label={t("Music volume")} value={session.audio.volume} oninput={(event) => session.setAudioVolume(Number(event.currentTarget.value))} />
              <span class="music-now" class:warn={!!session.audio.error || session.audio.volume === 0}>
                {#if session.audio.error}{session.audio.error === "Press play to start the music." ? t("The computer held the music back. Press Test to start it.") : session.audio.error}
                {:else if session.audio.volume === 0}{t("The volume is at zero.")}
                {:else if ours && session.audio.playing}♪ {session.audio.current?.name.replace(/\.[a-z0-9]+$/i, "")}
                {:else}{t("Press Test to hear it.")}{/if}
              </span>
            </div>
          {/if}
        </details>
        {#if pictures.slideshow.running}<p class="note">{t("Changes apply from the next picture; the title and clock at once; order, countdown and music from the next start.")}</p>{/if}
      </section>
  </div>
  {/if}
  </div>
  {/if}
</aside>

{#if musicPicking}
  <PickList
    title={t("Choose music for the slideshow")}
    intro={t("Tick the songs to play under the pictures. Songs from this computer go into the music library too.")}
    items={libraryItems}
    picked={chosenTracks.map((track) => track.id)}
    also={justImported}
    empty={t("No music in the library yet. Import songs from this computer.")}
    action={{ allowNone: true, label: (count) => (count ? tn(count, "Use {n} song", "Use {n} songs") : t("No music")), run: (keys) => { pictures.useMusic(keys); musicPicking = false; } }}
    onclose={() => (musicPicking = false)}
  >
    {#snippet extra()}
      <button type="button" class="btn import-btn" disabled={importing} onclick={() => void importMusic()}><Icon name="plus" size={13} /> {importing ? t("Importing…") : t("Import from computer…")}</button>
    {/snippet}
  </PickList>
{/if}

<style>
  .pictures { position: fixed; top: 0; right: 0; bottom: 0; z-index: 30; width: min(var(--drawer-w, 420px), 100vw); display: flex; flex-direction: column; gap: 12px; padding: 16px; overflow: auto; background: var(--panel); color: var(--ink); border-left: 1px solid var(--line); box-shadow: -24px 0 60px rgb(0 0 0 / 0.35); font-size: 13px; text-align: left; }
  .pictures > :global(*) { width: 100%; flex: none; }
  .head-tools { display: flex; gap: 2px; }
  .layout, .browse, .control { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .browse > :global(*), .control > :global(*) { flex: none; }
  /* Full window: pick on the left in a big grid; the chosen picture large and every setting on the right. */
  .pictures.wide { left: 0; width: auto; z-index: 60; padding: 18px 22px; overflow: hidden; border-left: 0; box-shadow: none; }
  .wide .layout { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) clamp(340px, 30vw, 440px); gap: 20px; }
  .wide .browse { min-height: 0; overflow: auto; padding-right: 4px; }
  .wide .control { min-height: 0; overflow-y: auto; overflow-x: hidden; padding-right: 4px; }
  .wide .grid { max-height: none; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
  .wide .grid li { contain-intrinsic-size: 170px 117px; }
  .wide .folders { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
  .big { position: relative; margin: 0; aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden; background: var(--frame-bg, #111); border: 1px solid var(--line); }
  .big.black { background: #000; }
  .big img, .big video { width: 100%; height: 100%; object-fit: contain; display: block; }
  .big.fill img, .big.fill video { object-fit: cover; }
  .big-title { position: absolute; left: 0; right: 0; top: 0; padding: 8px 12px; background: rgb(0 0 0 / 0.55); color: #fff; font-size: 14px; font-weight: 700; text-align: center; }
  .big-clock { position: absolute; right: 10px; top: 10px; padding: 3px 9px; border-radius: 6px; background: rgb(0 0 0 / 0.6); color: #fff; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .big-clock.low { top: auto; bottom: 10px; }
  .big-caption { position: absolute; left: 10px; bottom: 10px; max-width: calc(100% - 20px); padding: 4px 10px; border-radius: 6px; background: rgb(0 0 0 / 0.6); color: #fff; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .title { min-width: 0; }
  h2 { margin: 0; font-size: 17px; font-weight: 750; }
  header p { margin: 2px 0 0; color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
  .icon-btn { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; }
  .btn { height: 30px; padding: 0 11px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .btn:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.accent { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  /* Where you are: one bar, the folder's name large and its path small beneath. */
  .location { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 6px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, currentColor 3%, transparent); }
  .location .up:disabled { opacity: 0.3; cursor: default; }
  .loc-icon { flex: none; display: grid; }
  .loc-icon :global(svg) { fill: currentColor; fill-opacity: 0.2; }
  .loc-text { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .loc-text strong { font-size: 14px; font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .loc-path { display: flex; align-items: center; gap: 3px; min-width: 0; overflow: hidden; color: var(--muted); font-size: 11.5px; white-space: nowrap; }
  .loc-path button { flex: 0 1 auto; min-width: 0; max-width: 140px; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; overflow: hidden; text-overflow: ellipsis; }
  .loc-path button:hover { color: var(--ink); text-decoration: underline; }
  .icon-btn:hover:not(:disabled) { background: color-mix(in srgb, currentColor 9%, transparent); color: var(--ink); }
  .pin.on { color: var(--warn-text); }
  .pin.on :global(svg) { fill: currentColor; }
  .btn.open { flex: none; display: inline-flex; align-items: center; gap: 6px; }
  .start { display: grid; grid-template-columns: auto 1fr; gap: 10px 12px; align-items: center; padding: 14px; border: 1px dashed var(--line); border-radius: 12px; }
  .start-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent-text); }
  .start div { display: grid; gap: 2px; }
  .start strong { font-size: 13.5px; }
  .start span { color: var(--muted); font-size: 12px; line-height: 1.4; }
  .start .btn { grid-column: 1 / -1; justify-self: start; }
  /* Go to: one line that scrolls sideways rather than wrapping into a wall of chips. */
  .places { display: flex; align-items: center; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 1px; padding-right: 24px; -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); }
  .places::-webkit-scrollbar { display: none; }
  .places-label { flex: none; color: var(--muted); font-size: 11.5px; font-weight: 650; margin-right: 2px; }
  .place { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px 0 4px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .place i { flex: none; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; color: #fff; }
  .place:hover, .place.on { border-color: var(--accent); }
  .place.on { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .link-btn { justify-self: start; align-self: flex-start; padding: 0; border: 0; background: none; color: var(--accent-text); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
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
  .grid li { position: relative; content-visibility: auto; contain-intrinsic-size: 92px 64px; }
  /* Star a picture into Favourites: shows on hover or focus, and stays lit once starred. */
  .grid .star { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; background: rgb(0 0 0 / 0.55); color: #e5e7eb; opacity: 0; cursor: pointer; aspect-ratio: auto; }
  .grid li:hover .star, .grid .star:focus-visible, .grid .star.on { opacity: 1; }
  .grid .star.on { background: #f5a524; color: #1a1a1a; }
  @media (hover: none) { .grid .star { opacity: 1; } }
  .find { flex: 0 1 160px; min-width: 90px; height: 30px; padding: 0 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; }
  .grid button { display: block; width: 100%; aspect-ratio: 16 / 11; padding: 0; border: 2px solid transparent; border-radius: 8px; background: #000; overflow: hidden; cursor: pointer; }
  .grid button.on { border-color: var(--accent); }
  .grid img { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* Settings: one rhythm. Labels share a column, toggles sit in a column of their own, and anything
     a toggle opens lines up under its words. */
  .slideshow { --toggle: 40px; --toggle-gap: 12px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; padding: 14px 14px 10px; border: 1px solid var(--line); border-radius: 12px; }
  .slideshow > h3 { margin: 0 0 6px; }
  .setting { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 36px; color: var(--muted); font-size: 12.5px; }
  .setting input[type="range"] { width: 100%; accent-color: var(--accent); }
  .setting b { min-width: 64px; color: var(--ink); font-weight: 650; text-align: right; font-variant-numeric: tabular-nums; }
  .seg { display: inline-flex; flex-wrap: wrap; justify-self: start; gap: 2px; padding: 3px; border-radius: 9px; background: color-mix(in srgb, currentColor 7%, transparent); }
  .seg button { height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .seg button:hover:not(.on) { color: var(--ink); }
  .seg button.on { background: var(--panel-2, #2a2a30); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.25); }
  .setting .seg { grid-column: 2 / -1; }
  .options { margin-top: 6px; border-top: 1px solid var(--line); }
  .options summary { display: flex; align-items: center; gap: 8px; min-height: 40px; cursor: pointer; list-style: none; font-size: 13px; font-weight: 700; }
  .options summary::-webkit-details-marker { display: none; }
  .options summary small { flex: 1; min-width: 0; color: var(--accent-text); font-size: 11.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .options summary :global(svg) { margin-left: auto; color: var(--muted); transition: transform 150ms; }
  .options[open] summary :global(svg) { transform: rotate(180deg); }
  /* A <details> does not lay out its contents as a grid, so the spacing is margins on each row. */
  .options[open] { padding-bottom: 4px; }
  .options > :not(summary) { margin: 0 0 14px; }
  .options > .opt:has(+ .sub) { margin-bottom: 8px; }
  .options > .sub + .sub { margin-top: -6px; }
  .opt { display: grid; grid-template-columns: var(--toggle) minmax(0, 1fr); gap: var(--toggle-gap); align-items: start; cursor: pointer; }
  .opt input { margin: 1px 0 0; }
  .opt span { display: grid; gap: 2px; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .opt b { color: var(--ink); font-size: 13px; font-weight: 650; line-height: 1.3; }
  /* What a toggle opens: under its words, not under the toggle. */
  .sub { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--muted); font-size: 12px; }
  .options > .sub { margin-left: calc(var(--toggle) + var(--toggle-gap)); }
  .sub .text { flex: 1; min-width: 0; }
  .sub .num { width: 64px; }
  .sub input, .sub select { height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field, transparent); color: var(--ink); font: inherit; font-size: 12.5px; }
  .music { flex-wrap: wrap; }
  .music select { flex: 1 1 140px; min-width: 0; max-width: 100%; }
  .music .btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; }
  .tracks { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .music-volume input { flex: 0 1 150px; accent-color: var(--accent); }
  .music-now { flex: 1; min-width: 0; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .music-now.warn { color: var(--warn-text); white-space: normal; }
  h3 { margin: 0; font-size: 13px; font-weight: 700; }
  /* The player: the picture, start or stop, and the two other things to do with it. */
  .player { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, currentColor 3%, transparent); }
  .picker { display: flex; align-items: center; gap: 6px; }
  .picker .one-line { flex: 1; min-width: 0; font-size: 13px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .picker .count { flex: none; color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .start-btn { height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 13.5px; font-weight: 700; }
  .running { display: flex; align-items: center; gap: 6px; }
  .running .live { margin-right: auto; }
  .running .btn, .pair .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .hint { margin: 0; color: var(--muted); font-size: 11.5px; line-height: 1.45; }
  .live { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--onair, #f21b1b) 16%, transparent); color: var(--ink); font-size: 11.5px; font-weight: 700; }
  .live i { width: 7px; height: 7px; border-radius: 50%; background: var(--onair, #f21b1b); animation: blink 1.4s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) { .live i { animation: none; } }
  .import-btn { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }

</style>
