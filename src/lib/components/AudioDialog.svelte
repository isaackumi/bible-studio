<script lang="ts">
  import { session } from "../app/session.svelte";
  import { formatDuration } from "../domain/playlists";
  import { isDesktop } from "../platform/runtime";
  import DeskDialog from "./sources/DeskDialog.svelte";
  import Icon from "./Icon.svelte";
  import { t } from "../i18n/core";

  // Audio: playlists of walk-in music and backing tracks, played on this computer. The player
  // keeps going on every page; this window chooses, orders and controls what plays.
  let { onclose }: { onclose: () => void } = $props();

  const deck = session.audio;
  let selectedId = $state(session.audio.playlistId ?? session.workspace.playlists[0]?.id ?? null);
  let newName = $state("");
  let fileInput = $state<HTMLInputElement | undefined>();
  let armed = $state<string | null>(null);
  let note = $state("");
  /** Dragging tracks to reorder the playlist. */
  let trackDrag = $state<number | null>(null);
  let trackDrop = $state<number | null>(null);

  const playlists = $derived(session.workspace.playlists);
  const selected = $derived(playlists.find((list) => list.id === selectedId) ?? playlists[0] ?? null);
  const tracks = $derived(selected ? session.playlistTracks(selected.id) : []);
  const playingHere = $derived(!!selected && deck.playlistId === selected.id);

  async function addMusic() {
    if (!selected) return;
    if (!isDesktop()) {
      fileInput?.click();
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: true, filters: [{ name: "Audio", extensions: ["mp3", "m4a", "aac", "wav", "ogg", "oga", "flac"] }] });
    const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
    if (paths.length) note = (await session.importAudio(paths, selected.id)) ? "" : session.message;
  }

  async function addFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = "";
    if (selected && files.length) note = (await session.importAudio(files, selected.id)) ? "" : session.message;
  }

  function newPlaylist(event: SubmitEvent) {
    event.preventDefault();
    const list = session.createPlaylist(newName);
    newName = "";
    selectedId = list.id;
  }

  function removeList(id: string) {
    if (armed !== id) {
      armed = id;
      return;
    }
    armed = null;
    session.removePlaylist(id);
    selectedId = session.workspace.playlists[0]?.id ?? null;
  }
</script>

<DeskDialog title={t("Audio")} wide {onclose}>
  <div class="audio">
    <nav class="lists" aria-label={t("Playlists")}>
      {#each playlists as list (list.id)}
        <button type="button" class="list" class:on={selected?.id === list.id} onclick={() => (selectedId = list.id)}>
          <span class="list-name">{list.name}</span>
          <span class="list-meta">
            {#if deck.playlistId === list.id && deck.playing}<Icon name="audio" size={12} />{/if}
            {list.trackIds.length}
          </span>
        </button>
      {/each}
      <form class="new-list" onsubmit={newPlaylist}>
        <input aria-label={t("New playlist name")} placeholder={t("New playlist")} maxlength="60" bind:value={newName} />
        <button type="submit" aria-label={t("Add playlist")}><Icon name="plus" size={14} /></button>
      </form>
    </nav>

    <section class="tracks">
      {#if selected}
        <header class="tracks-head">
          <input class="list-title" aria-label={t("Playlist name")} value={selected.name} onchange={(event) => session.renamePlaylist(selected.id, event.currentTarget.value)} />
          <label class="loop">
            <input type="checkbox" class="switch" role="switch" checked={selected.loop} onchange={(event) => session.setPlaylistLoop(selected.id, event.currentTarget.checked)} />
            {t("Loop")}
          </label>
          <button type="button" class="btn" onclick={() => void addMusic()}><Icon name="plus" size={14} /> {t("Add music")}</button>
          <button type="button" class="btn primary" disabled={!tracks.length} onclick={() => void session.playPlaylist(selected.id, 0)}><Icon name="play" size={14} /> {t("Play")}</button>
          {#if playlists.length > 1}
            <button type="button" class="btn ghost danger" aria-label={armed === selected.id ? t("Confirm delete {name}", { name: selected.name }) : t("Delete {name}", { name: selected.name })} onclick={() => removeList(selected.id)}>
              {armed === selected.id ? t("Delete?") : ""}<Icon name="trash" size={14} />
            </button>
          {/if}
        </header>
        {#if note}<p class="note" role="status">{note}</p>{/if}
        <ol class="track-list">
          {#each tracks as track, index (`${index}:${track.id}`)}
            {@const now = playingHere && deck.index === index}
            <li
              class="track"
              class:now
              class:dragging={trackDrag === index}
              class:drop-before={trackDrag !== null && trackDrop === index && trackDrag !== index}
              ondragover={(event) => { if (trackDrag !== null) { event.preventDefault(); trackDrop = index; } }}
              ondrop={(event) => { event.preventDefault(); if (trackDrag !== null && trackDrag !== index) session.moveInPlaylist(selected.id, trackDrag, index); trackDrag = null; trackDrop = null; }}
            >
              <button
                type="button"
                id="track-grip-{index}"
                class="grip"
                draggable="true"
                aria-label={t("Move {name}: drag, or Alt+arrow keys", { name: track.name })}
                title={t("Drag to move")}
                ondragstart={(event) => { trackDrag = index; event.dataTransfer?.setData("text/plain", String(index)); if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"; }}
                ondragend={() => { trackDrag = null; trackDrop = null; }}
                onkeydown={(event) => {
                  if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                  event.preventDefault();
                  const to = index + (event.key === "ArrowUp" ? -1 : 1);
                  if (to < 0 || to >= tracks.length) return;
                  session.moveInPlaylist(selected.id, index, to);
                  queueMicrotask(() => document.getElementById(`track-grip-${to}`)?.focus());
                }}
              ><Icon name="grip" size={14} /></button>
              <button type="button" class="track-play" aria-label={now && deck.playing ? t("Pause {name}", { name: track.name }) : t("Play {name}", { name: track.name })} onclick={() => (now ? void deck.toggle() : void session.playPlaylist(selected.id, index))}>
                {#if now && deck.playing}<Icon name="square" size={12} />{:else}<Icon name="play" size={12} />{/if}
              </button>
              <span class="track-n">{index + 1}</span>
              <span class="track-name">{track.name.replace(/\.[a-z0-9]+$/i, "")}</span>
              {#if now}<span class="track-time">{formatDuration(deck.time)} / {formatDuration(deck.duration)}</span>{/if}
              <button type="button" class="mini del" aria-label={t("Remove {name} from {playlist}", { name: track.name, playlist: selected.name })} title={t("Remove from this playlist")} onclick={() => session.removeFromPlaylist(selected.id, index)}><Icon name="trash" size={14} /></button>
            </li>
          {:else}
            <li class="empty">
              <strong>{t("No music yet")}</strong>
              <span>{t("Add MP3, M4A, WAV, AAC, OGG or FLAC files: walk-in music, an offering song, backing tracks. Loop keeps walk-in music going until you fade it out.")}</span>
              <button type="button" class="btn primary" onclick={() => void addMusic()}><Icon name="plus" size={14} /> {t("Add music")}</button>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  </div>

  {#snippet footer()}
    <div class="transport" aria-label={t("Player")}>
      <div class="now-playing">
        <strong>{deck.current ? deck.current.name.replace(/\.[a-z0-9]+$/i, "") : t("Nothing playing")}</strong>
        <span>{deck.error || (deck.fading ? t("Fading out…") : deck.current ? `${playlists.find((list) => list.id === deck.playlistId)?.name ?? ""}${deck.loop ? ` · ${t("loops")}` : ""}` : t("Pick a playlist and press Play."))}</span>
      </div>
      <div class="controls">
        <button type="button" class="round" aria-label={t("Previous track")} disabled={!deck.current} onclick={() => void deck.step(-1)}><Icon name="chevron-left" size={16} /></button>
        <button type="button" class="round big" aria-label={deck.playing ? t("Pause") : t("Play")} disabled={!deck.current} onclick={() => void deck.toggle()}>
          {#if deck.playing}<Icon name="square" size={14} />{:else}<Icon name="play" size={16} />{/if}
        </button>
        <button type="button" class="round" aria-label={t("Next track")} disabled={!deck.current} onclick={() => void deck.step(1)}><Icon name="chevron-right" size={16} /></button>
      </div>
      <label class="scrub">
        <span>{formatDuration(deck.time)}</span>
        <input type="range" min="0" max={Math.max(1, deck.duration)} step="1" value={deck.time} aria-label={t("Position in the track")} disabled={!deck.current} oninput={(event) => deck.seek(Number(event.currentTarget.value))} />
        <span>{formatDuration(deck.duration)}</span>
      </label>
      <label class="volume" title={t("Volume")}>
        <Icon name="audio" size={14} />
        <input type="range" min="0" max="1" step="0.05" value={deck.volume} aria-label={t("Volume")} oninput={(event) => session.setAudioVolume(Number(event.currentTarget.value))} />
      </label>
      <button type="button" class="btn" disabled={!deck.playing || deck.fading} onclick={() => deck.fadeOut(4)}>{t("Fade out")}</button>
      <label class="fade-live" title={t("Looping music (walk-in) fades out when you press LIVE; backing tracks play on")}>
        <input type="checkbox" class="switch" role="switch" checked={session.workspace.audio.fadeOnLive} onchange={(event) => session.setFadeOnLive(event.currentTarget.checked)} />
        {t("Fade walk-in music at LIVE")}
      </label>
    </div>
  {/snippet}
</DeskDialog>
<input bind:this={fileInput} type="file" multiple accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.flac" hidden onchange={(event) => void addFiles(event)} />

<style>
  .audio { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 16px; min-height: min(56vh, 520px); }
  .lists { display: flex; flex-direction: column; gap: 4px; border-right: 1px solid var(--line); padding-right: 12px; }
  .list { display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 36px; padding: 0 10px; border: 0; border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 13px; text-align: left; }
  .list.on { background: var(--field); font-weight: 650; }
  .list-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list-meta { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: 12px; flex: none; }
  .new-list { display: flex; gap: 4px; margin-top: 6px; }
  .new-list input { flex: 1; min-width: 0; height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; }
  .new-list button { width: 32px; height: 32px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); display: grid; place-items: center; }
  .tracks { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .tracks-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .list-title { flex: 1; min-width: 140px; height: 34px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 16px; font-weight: 700; }
  .list-title:hover, .list-title:focus { border-color: var(--line); background: var(--field); }
  .loop, .fade-live { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); white-space: nowrap; }
  .btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.ghost { background: none; }
  .btn.danger { color: var(--danger, #e5484d); }
  .btn:disabled { opacity: 0.5; }
  .note { margin: 0; font-size: 12px; color: var(--muted); }
  .track-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; overflow: auto; max-height: 46vh; }
  .track { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 6px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); }
  .track.now { border-color: var(--accent); }
  .track-play { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--line); background: none; color: var(--ink); display: grid; place-items: center; flex: none; }
  .track.now .track-play { background: var(--accent); border-color: var(--accent); color: #fff; }
  .track-n { width: 18px; text-align: right; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; flex: none; }
  .track-name { flex: 1; min-width: 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .track-time { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; flex: none; }
  .mini { width: 26px; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--muted); display: grid; place-items: center; flex: none; }
  .mini:hover:not(:disabled) { color: var(--ink); background: color-mix(in srgb, var(--ink) 8%, transparent); }
  .mini:disabled { opacity: 0.3; }
  .empty { display: grid; gap: 8px; justify-items: start; padding: 18px; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); font-size: 13px; line-height: 1.45; }
  .empty strong { color: var(--ink); font-size: 14px; }
  .transport { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; width: 100%; }
  .now-playing { display: flex; flex-direction: column; min-width: 140px; max-width: 220px; }
  .now-playing strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .now-playing span { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .controls { display: flex; align-items: center; gap: 6px; }
  .round { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--line); background: var(--field); color: var(--ink); display: grid; place-items: center; }
  .round.big { width: 40px; height: 40px; background: var(--accent); border-color: var(--accent); color: #fff; }
  .round:disabled { opacity: 0.45; }
  .transport .round { padding: 0; min-width: 0; flex: none; }
  .transport .btn { white-space: nowrap; flex: none; }
  .scrub { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 180px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .scrub input { flex: 1; }
  .volume { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
  .volume input { width: 90px; }
  @media (max-width: 720px) {
    .audio { grid-template-columns: 1fr; }
    .lists { border-right: 0; border-bottom: 1px solid var(--line); padding: 0 0 10px; }
  }
  .grip { flex: none; width: 22px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--muted); display: grid; place-items: center; cursor: grab; }
  .grip:hover { color: var(--ink); background: var(--field); }
  .track.dragging { opacity: 0.4; }
  .track.drop-before { box-shadow: 0 -2px 0 var(--accent); }
  .mini.del:hover { color: var(--danger, #e5484d); }
</style>
