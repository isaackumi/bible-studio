<script lang="ts">
  import InlineWords from "./InlineWords.svelte";
  import { session } from "../app/session.svelte";
  import { moveSongSection, removeSongSection } from "../domain/song";
  import type { Song, SongSection, SongSectionKind } from "../domain/types";
  import { t } from "../i18n/core";

  let query = $state("");
  let draft = $state<Song | null>(null);

  function blank(): Song {
    return { id: crypto.randomUUID(), title: "", author: "", sections: [] };
  }

  function addSection(kind: SongSectionKind) {
    if (!draft) return;
    const count = draft.sections.filter((section) => section.kind === kind).length + 1;
    const label = kind === "verse" ? t("Verse {n}", { n: count }) : kind === "chorus" ? t("Chorus") : kind === "bridge" ? t("Bridge") : t("Tag");
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
    <input class="field" placeholder={t("Search songs")} bind:value={query} aria-label={t("Search songs")} />
  </form>
  <button type="button" class="primary" onclick={() => (draft = blank())}>{t("New song")}</button>
  {#if session.songPlace()}
    <p class="hint">{session.songPlace()}</p>
    <div class="actions">
      <button type="button" onclick={() => session.stepSong(-1)}>{t("Previous")}</button>
      <button type="button" onclick={() => session.stepSong(1)}>{t("Next")}</button>
    </div>
  {/if}
  {#each session.songs as song (song.id)}
    <button type="button" class="hit" onclick={() => open(song)}>
      <strong>{song.title || t("Untitled song")}</strong>
      <span class="hint">{song.author}</span>
    </button>
  {/each}
  {#if draft}
    <input class="field" placeholder={t("Title")} bind:value={draft.title} aria-label={t("Song title")} />
    <input class="field" placeholder={t("Author")} bind:value={draft.author} aria-label={t("Song author")} />
    <div class="actions">
      <button type="button" onclick={() => addSection("verse")}>{t("Verse")}</button>
      <button type="button" onclick={() => addSection("chorus")}>{t("Chorus")}</button>
      <button type="button" onclick={() => addSection("bridge")}>{t("Bridge")}</button>
      <button type="button" onclick={() => addSection("tag")}>{t("Tag")}</button>
    </div>
    {#each draft.sections as section, index (section.id)}
      <p class="hint">{t("{kind} · {index} of {length}", { kind: section.kind, index: index + 1, length: draft.sections.length })}</p>
      <input class="field" bind:value={section.label} aria-label={t("Section label")} />
      <InlineWords
        text={section.lines.join("\n")}
        rich={section.rich ?? null}
        multiline
        label={t("{label} lines", { label: section.label })}
        onchange={(words) => {
          if (!draft) return;
          const { rich: _old, ...rest } = section;
          draft.sections[index] = { ...rest, lines: words.text.split("\n"), ...(words.rich ? { rich: words.rich } : {}) };
          draft = draft;
        }}
      />
      <div class="actions">
        <button type="button" onclick={() => draft && (draft = moveSongSection(draft, section.id, -1))}>{t("Up")}</button>
        <button type="button" onclick={() => draft && (draft = moveSongSection(draft, section.id, 1))}>{t("Down")}</button>
        <button type="button" onclick={() => draft && (draft = removeSongSection(draft, section.id))}>{t("Remove")}</button>
        <button type="button" onclick={() => draft && session.previewSongSection(draft, section.id)}>{t("Preview")}</button>
        <button type="button" onclick={() => draft && session.addLyric(draft.id, section.id, `${draft.title} — ${section.label}`)}>{t("Add")}</button>
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
    >{t("Save song")}</button>
  {/if}
</div>
