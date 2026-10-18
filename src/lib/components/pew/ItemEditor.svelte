<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { formatReference, parseReference } from "../../bible/reference";
  import { restoreComposition } from "../../domain/composition";
  import type { PresentationItem, PresentationModel, TextStyle } from "../../domain/types";
  import { emptyModel } from "../../domain/theme";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Screen from "../Screen.svelte";
  import TextStyleEditor from "../TextStyleEditor.svelte";
  import { ACCENT_SWATCHES, ANNOUNCEMENT_DESIGNS, LABEL_SUGGESTIONS, presentAnnouncement, themeAccent, type AnnouncementDesign } from "../../domain/announcement";

  // Everything about one service item, with a live preview. Saving changes the running order;
  // if the item is on Preview it refreshes there. Program only changes with LIVE.
  let { item, onclose }: { item: PresentationItem; onclose: () => void } = $props();

  // A working copy, taken once when the editor opens; Cancel leaves the item as it was.
  let draft = $state<PresentationItem>(untrack(() => structuredClone($state.snapshot(item)) as PresentationItem));
  let preview = $state<PresentationModel>(emptyModel(session.theme()));
  let reference = $state(untrack(() => item.bible?.reference ?? ""));
  let referenceNote = $state("");

  /** Words on screen: slides, announcements and text all edit the same way. */
  const wordy = $derived(draft.kind === "slide" || draft.kind === "announcement" || draft.kind === "text");
  const words = $derived(draft.slide ?? draft.announcement ?? { heading: draft.title, body: "" });
  const images = $derived(session.mediaByFavorite.filter((asset) => asset.kind !== "video"));
  const videos = $derived(session.mediaByFavorite.filter((asset) => asset.kind === "video"));
  const song = $derived(draft.lyric ? session.songs.find((entry) => entry.id === draft.lyric?.songId) : undefined);

  // Re-render the preview as the draft changes (a short pause keeps typing smooth).
  $effect(() => {
    const snapshot = $state.snapshot(draft) as PresentationItem;
    const timer = setTimeout(() => {
      void session.renderItem(snapshot).then((model) => (preview = model)).catch(() => {});
    }, 120);
    return () => clearTimeout(timer);
  });

  function setWords(change: Partial<{ heading: string; body: string; imageId: string | null }>) {
    const current = { heading: words.heading, body: words.body, imageId: draft.slide?.imageId ?? draft.announcement?.imageId ?? null };
    const next = { ...current, ...change };
    // Announcements keep their kind; text with a picture is a slide.
    if (draft.kind === "announcement") draft.announcement = { ...draft.announcement, heading: next.heading, body: next.body, imageId: next.imageId };
    else {
      draft.kind = "slide";
      draft.slide = next;
      delete draft.announcement;
    }
  }

  /** Announcement design, the small line above the heading, and the accent colour. */
  function setAnnouncement(change: Partial<{ design: AnnouncementDesign; label: string; accent: string }>) {
    if (draft.kind !== "announcement") return;
    draft.announcement = { heading: words.heading, body: words.body, ...draft.announcement, ...change };
  }
  const announcement = $derived(draft.kind === "announcement" ? draft.announcement : undefined);
  const designThumbs = $derived(
    announcement
      ? ANNOUNCEMENT_DESIGNS.map((design) => ({
          ...design,
          model: presentAnnouncement({ theme: session.theme(), words: { ...announcement, design: design.id } }),
        }))
      : [],
  );

  /** Words over a picture: the picture item becomes a slide with that picture behind the text. */
  function addTextToPicture() {
    const imageId = draft.image?.assetId ?? null;
    draft.kind = "slide";
    draft.slide = { heading: draft.title, body: "", imageId };
    delete draft.image;
  }

  function applyReference() {
    const parsed = parseReference(reference);
    if (!parsed?.startVerse || !draft.bible) {
      referenceNote = "Type a reference like John 3:16-18.";
      return;
    }
    const book = session.books.find((entry) => entry.ord === parsed.bookOrd);
    const end = parsed.endVerse ?? parsed.startVerse;
    const formatted = formatReference(parsed.bookName, parsed.chapter, parsed.startVerse, end, book?.chapters ?? 1);
    draft.bible = { ...draft.bible, bookOrd: parsed.bookOrd, chapter: parsed.chapter, startVerse: parsed.startVerse, endVerse: end, reference: formatted };
    if (!draft.title || draft.title === item.bible?.reference) draft.title = formatted;
    reference = formatted;
    referenceNote = "";
  }

  function save() {
    if (draft.bible && reference.trim() && reference !== draft.bible.reference) applyReference();
    session.updateItem($state.snapshot(draft) as PresentationItem);
    session.message = `${draft.title} updated. Program only changes with LIVE.`;
    onclose();
  }
</script>

<DeskDialog title="Edit {draft.title}" {onclose} wide>
  <div class="editor">
    <div class="fields">
      <label class="field-row">
        <span>Name in the running order</span>
        <input aria-label="Item name" bind:value={draft.title} />
      </label>

      {#if wordy}
        <label class="field-row">
          <span>Heading</span>
          <input aria-label="Heading" value={words.heading} oninput={(event) => setWords({ heading: event.currentTarget.value })} />
        </label>
        <label class="field-row">
          <span>Text</span>
          <textarea aria-label="Text" rows="5" value={words.body} oninput={(event) => setWords({ body: event.currentTarget.value })}></textarea>
        </label>
        {#if announcement}
          <label class="field-row">
            <span>Small line above the heading</span>
            <input aria-label="Small line above the heading" placeholder="Leave empty to hide it" value={announcement.label ?? ""} oninput={(event) => setAnnouncement({ label: event.currentTarget.value })} />
          </label>
          <div class="ann-chips" role="group" aria-label="Suggestions for the small line">
            {#each LABEL_SUGGESTIONS as suggestion (suggestion)}
              <button type="button" class="ann-chip" aria-pressed={(announcement.label ?? "") === suggestion} onclick={() => setAnnouncement({ label: suggestion })}>{suggestion}</button>
            {/each}
          </div>
          <div class="field-row">
            <span>Design</span>
            <div class="ann-designs" role="radiogroup" aria-label="Announcement design">
              {#each designThumbs as design (design.id)}
                <button
                  type="button"
                  class="ann-design"
                  role="radio"
                  aria-checked={(announcement.design ?? "classic") === design.id}
                  title={design.hint}
                  onclick={() => setAnnouncement({ design: design.id })}
                >
                  <span class="ann-thumb"><Screen model={design.model} still /></span>
                  <span class="ann-design-name">{design.name}</span>
                </button>
              {/each}
            </div>
          </div>
          <div class="field-row">
            <span>Accent colour</span>
            <div class="ann-swatches" role="radiogroup" aria-label="Accent colour">
              <button type="button" class="ann-swatch theme" role="radio" aria-checked={!announcement.accent} title="The theme's colour" style:--swatch={themeAccent(session.theme())} onclick={() => setAnnouncement({ accent: "" })}>Theme</button>
              {#each ACCENT_SWATCHES as color (color)}
                <button type="button" class="ann-swatch" role="radio" aria-checked={announcement.accent === color} aria-label="Accent {color}" style:--swatch={color} onclick={() => setAnnouncement({ accent: color })}></button>
              {/each}
              <input type="color" aria-label="Pick any accent colour" value={announcement.accent || themeAccent(session.theme())} oninput={(event) => setAnnouncement({ accent: event.currentTarget.value })} />
            </div>
          </div>
        {/if}
        <label class="field-row">
          <span>Picture behind the words</span>
          <select aria-label="Background picture" value={draft.slide?.imageId ?? draft.announcement?.imageId ?? ""} onchange={(event) => setWords({ imageId: event.currentTarget.value || null })}>
            <option value="">The theme's background</option>
            {#each images as asset (asset.id)}<option value={asset.id}>{asset.name}</option>{/each}
          </select>
        </label>
        <TextStyleEditor style={draft.style ?? {}} onchange={(style: TextStyle) => (draft.style = style)} label="Text style for this item" />
      {:else if draft.kind === "bible" && draft.bible}
        <form class="field-row" onsubmit={(event) => { event.preventDefault(); applyReference(); }}>
          <span>Reference</span>
          <div class="inline">
            <input aria-label="Reference" bind:value={reference} placeholder="John 3:16-18" />
            <button type="submit" class="desk-btn">Use</button>
          </div>
          {#if referenceNote}<em class="note">{referenceNote}</em>{/if}
        </form>
        <label class="field-row">
          <span>Translation</span>
          <select aria-label="Translation" value={draft.bible.translationId} onchange={(event) => draft.bible && (draft.bible = { ...draft.bible, translationId: event.currentTarget.value })}>
            {#each session.translations as translation (translation.id)}<option value={translation.id}>{translation.abbreviation} · {translation.name}</option>{/each}
          </select>
        </label>
      {:else if draft.kind === "lyric" && draft.lyric}
        <label class="field-row">
          <span>Song</span>
          <select aria-label="Song" value={draft.lyric.songId} onchange={(event) => {
            const next = session.songs.find((entry) => entry.id === event.currentTarget.value);
            if (next?.sections[0]) {
              draft.lyric = { songId: next.id, sectionId: next.sections[0].id };
              draft.title = next.title;
            }
          }}>
            {#each session.songsByFavorite as entry (entry.id)}<option value={entry.id}>{entry.title || "Untitled song"}</option>{/each}
          </select>
        </label>
        {#if song}
          <label class="field-row">
            <span>Start on</span>
            <select aria-label="First section" value={draft.lyric.sectionId} onchange={(event) => draft.lyric && (draft.lyric = { ...draft.lyric, sectionId: event.currentTarget.value })}>
              {#each song.sections as section (section.id)}<option value={section.id}>{section.label}</option>{/each}
            </select>
          </label>
          <p class="note">To change the words, open the song on the Songs page.</p>
        {/if}
      {:else if draft.kind === "image"}
        <label class="field-row">
          <span>Picture</span>
          <select aria-label="Picture" value={draft.image?.assetId ?? ""} onchange={(event) => (draft.image = { assetId: event.currentTarget.value })}>
            {#each images as asset (asset.id)}<option value={asset.id}>{asset.name}</option>{/each}
          </select>
        </label>
        <button type="button" class="desk-btn" onclick={addTextToPicture}>Add words over the picture</button>
      {:else if draft.kind === "video" && draft.video}
        <label class="field-row">
          <span>Video</span>
          <select aria-label="Video" value={draft.video.assetId} onchange={(event) => draft.video && (draft.video = { ...draft.video, assetId: event.currentTarget.value })}>
            {#each videos as asset (asset.id)}<option value={asset.id}>{asset.name}</option>{/each}
          </select>
        </label>
        <label class="check"><input type="checkbox" checked={draft.video.loop} onchange={(event) => draft.video && (draft.video = { ...draft.video, loop: event.currentTarget.checked })} /> Play round and round (walk-in loops)</label>
        <label class="check"><input type="checkbox" checked={draft.video.muted} onchange={(event) => draft.video && (draft.video = { ...draft.video, muted: event.currentTarget.checked })} /> No sound</label>
      {:else if draft.kind === "deck" && draft.deck}
        <label class="field-row">
          <span>Slide deck</span>
          <select aria-label="Slide deck" value={draft.deck.deckId} onchange={(event) => (draft.deck = { deckId: event.currentTarget.value })}>
            {#each session.decks as deck (deck.id)}<option value={deck.id}>{deck.name} · {deck.pages.length} pages</option>{/each}
          </select>
        </label>
        <p class="note">Edit the pages themselves on the Production Desk › Media › Slides.</p>
      {:else if draft.kind === "composition" && draft.composition}
        <label class="field-row">
          <span>Look</span>
          <select aria-label="Look" value={draft.composition.compositionId} onchange={(event) => (draft.composition = { compositionId: event.currentTarget.value })}>
            {#each session.looksByFavorite as look (look.id)}<option value={look.id}>{restoreComposition(look).name}</option>{/each}
          </select>
        </label>
      {/if}
    </div>

    <figure class="preview">
      <figcaption>Preview of this item</figcaption>
      <div class="screen"><Screen model={preview} /></div>
    </figure>
  </div>

  {#snippet footer()}
    <button type="button" class="desk-btn" onclick={onclose}>Cancel</button>
    <button type="button" class="desk-btn primary-soft" onclick={save}>Save</button>
  {/snippet}
</DeskDialog>

<style>
  .editor { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 18px; align-items: start; }
  .fields { display: grid; gap: 12px; min-width: 0; }
  .field-row { display: grid; gap: 5px; margin: 0; }
  .field-row > span { font-size: 12px; font-weight: 650; color: var(--muted); }
  input, select, textarea { min-width: 0; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); color: var(--ink); font: inherit; }
  input, select { height: 34px; padding: 0 10px; }
  textarea { padding: 8px 10px; resize: vertical; line-height: 1.45; }
  .inline { display: flex; gap: 6px; }
  .inline input { flex: 1; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .check input { height: auto; }
  .note { margin: 0; font-size: 12px; color: var(--muted); font-style: normal; }
  .preview { position: sticky; top: 0; margin: 0; display: grid; gap: 6px; }
  .preview figcaption { font-size: 12px; font-weight: 650; color: var(--muted); }
  .screen { container-type: inline-size; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: #000; }
  .ann-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: -4px; }
  .ann-chip { height: 26px; padding: 0 10px; border-radius: 13px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font-size: 12px; }
  .ann-chip[aria-pressed="true"] { border-color: var(--accent, #4f8cff); background: color-mix(in srgb, var(--accent, #4f8cff) 16%, var(--field)); }
  .ann-designs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .ann-design { display: grid; gap: 4px; padding: 4px; border-radius: 9px; border: 1px solid var(--line); background: var(--field); color: var(--ink); text-align: left; }
  .ann-design[aria-checked="true"] { border-color: var(--accent, #4f8cff); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #4f8cff) 45%, transparent); }
  .ann-thumb { display: block; border-radius: 6px; overflow: hidden; background: #000; pointer-events: none; }
  .ann-design-name { font-size: 12px; font-weight: 600; padding: 0 2px 2px; }
  .ann-swatches { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ann-swatch { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--line); background: var(--swatch); }
  .ann-swatch.theme { width: auto; border-radius: 14px; padding: 0 10px; font-size: 12px; color: var(--ink); background: linear-gradient(90deg, var(--swatch) 0 8px, var(--field) 8px); padding-left: 16px; }
  .ann-swatch[aria-checked="true"] { border-color: var(--ink); }
  .ann-swatches input[type="color"] { width: 36px; height: 30px; padding: 2px; }
  @media (max-width: 820px) {
    .editor { grid-template-columns: 1fr; }
    .preview { position: static; order: -1; }
  }
</style>
