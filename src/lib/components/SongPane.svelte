<script lang="ts">
  import { session } from "../app/session.svelte";
  import { moveSongSection, removeSongSection } from "../domain/song";
  import type { Song, SongSection, SongSectionKind } from "../domain/types";

  let query = $state("");
  let draft = $state<Song | null>(null);

  function blank(): Song {
    return { id: crypto.randomUUID(), title: "", author: "", sections: [] };
  }

  function addSection(kind: SongSectionKind) {
    if (!draft) return;
    const count = draft.sections.filter((section) => section.kind === kind).length + 1;
    const label = kind === "verse" ? `Verse ${count}` : kind === "chorus" ? "Chorus" : kind === "bridge" ? "Bridge" : "Tag";
    const section: SongSection = { id: crypto.randomUUID(), kind, label, lines: [""] };
    draft = { ...draft, sections: [...draft.sections, section] };
  }

  function open(song: Song) {
    draft = structuredClone(song);
    session.previewSongSection(song, song.sections[0]?.id ?? null);
  }
</script>

<div class="pane">
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void session.searchSongs(query);
    }}
  >
    <input class="field" placeholder="Search songs" bind:value={query} aria-label="Search songs" />
  </form>
  <button type="button" class="primary" onclick={() => (draft = blank())}>New song</button>
  {#if session.songPlace()}
    <p class="hint">{session.songPlace()}</p>
    <div class="actions">
      <button type="button" onclick={() => session.stepSong(-1)}>Previous</button>
      <button type="button" onclick={() => session.stepSong(1)}>Next</button>
    </div>
  {/if}
  {#each session.songs as song (song.id)}
    <button type="button" class="hit" onclick={() => open(song)}>
      <strong>{song.title || "Untitled song"}</strong>
      <span class="hint">{song.author}</span>
    </button>
  {/each}
  {#if draft}
    <input class="field" placeholder="Title" bind:value={draft.title} aria-label="Song title" />
    <input class="field" placeholder="Author" bind:value={draft.author} aria-label="Song author" />
    <div class="actions">
      <button type="button" onclick={() => addSection("verse")}>Verse</button>
      <button type="button" onclick={() => addSection("chorus")}>Chorus</button>
      <button type="button" onclick={() => addSection("bridge")}>Bridge</button>
      <button type="button" onclick={() => addSection("tag")}>Tag</button>
    </div>
    {#each draft.sections as section, index (section.id)}
      <p class="hint">{section.kind} · {index + 1} of {draft.sections.length}</p>
      <input class="field" bind:value={section.label} aria-label="Section label" />
      <textarea
        class="field"
        rows="4"
        value={section.lines.join("\n")}
        aria-label="{section.label} lines"
        oninput={(event) => {
          if (!draft) return;
          const lines = event.currentTarget.value.split("\n");
          draft.sections[index] = { ...section, lines };
          draft = draft;
        }}
      ></textarea>
      <div class="actions">
        <button type="button" onclick={() => draft && (draft = moveSongSection(draft, section.id, -1))}>Up</button>
        <button type="button" onclick={() => draft && (draft = moveSongSection(draft, section.id, 1))}>Down</button>
        <button type="button" onclick={() => draft && (draft = removeSongSection(draft, section.id))}>Remove</button>
        <button type="button" onclick={() => draft && session.previewSongSection(draft, section.id)}>Preview</button>
        <button type="button" onclick={() => draft && session.addLyric(draft.id, section.id, `${draft.title} — ${section.label}`)}>Add</button>
      </div>
    {/each}
    {#if session.message}<p class="hint">{session.message}</p>{/if}
    <button
      type="button"
      class="primary"
      onclick={() => {
        if (!draft) return;
        void session.saveSong(draft);
      }}
    >Save song</button>
  {/if}
</div>
