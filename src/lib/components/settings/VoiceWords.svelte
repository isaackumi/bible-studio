<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { CANON } from "../../bible/reference";
  import { BUILT_IN_FIXES, nearMisses } from "../../voice/words";
  import { t, tn } from "../../i18n/core";

  // Words the recognizer mishears in this church (accents, names), put right before verses are
  // found. Learned from the operator, added here, or taught in Practice.

  const BOOKS = [...new Set(CANON.map((book) => book.name.replace(/^\d\s+/, "")))];
  const words = $derived(session.workspace.voice.words ?? []);
  const practice = $derived(session.voicePractice);
  const listening = $derived(session.voice.status === "listening");

  let heard = $state("");
  let means = $state("");
  let showBuiltIn = $state(false);

  /** In practice, the words heard where the book should be: offered to teach. */
  const guess = $derived.by(() => {
    if (!practice || practice.found || !practice.raw) return "";
    return nearMisses(practice.raw)[0]?.words ?? "";
  });

  function add(event: SubmitEvent) {
    event.preventDefault();
    if (!heard.trim() || !means.trim()) return;
    session.addWord(heard.trim().toLowerCase(), means.trim());
    heard = "";
    means = "";
  }

  function teach() {
    if (!practice || !guess) return;
    session.addWord(guess, practice.book);
    session.nextPractice();
  }
</script>

<p class="section-label">{t("Words")}</p>
<section class="rows">
  <div class="row stack">
    <div class="row-copy">
      <strong>{t("Misheard words")}</strong>
      <span>{t("Accents and names the recognizer gets wrong are put right before verses are found: “efficient 4” becomes Ephesians 4. A book name changes only next to a chapter number, so ordinary speech keeps its words. When you put up a passage the recognizer missed, Church Studio learns the word by itself.")}</span>
    </div>
  </div>

  <div class="row stack practice">
    <div class="row-copy">
      <strong>{t("Practice")}</strong>
      <span>{t("Read references aloud, as the pastor would, and see what the recognizer writes. Teach it any word it gets wrong.")}</span>
    </div>
    {#if practice}
      <div class="card" aria-live="polite">
        <div class="say"><span>{t("Say")}</span><b>{practice.target}</b></div>
        <div class="heard">
          <span>{t("Heard")}</span>
          <q>{practice.raw || (listening ? t("Listening…") : t("Starting the microphone…"))}</q>
        </div>
        {#if practice.applied.length}
          <div class="heard"><span>{t("Put right")}</span><q>{practice.fixed}</q></div>
        {/if}
        {#if practice.raw}
          {#if practice.found}
            <p class="result ok">✓ {t("Found {reference}", { reference: practice.found })}</p>
          {:else if practice.final}
            <p class="result miss">{t("No verse found yet.")}
              {#if guess}{t("Was “{guess}” {book}?", { guess, book: practice.book })} <button type="button" class="btn primary" onclick={teach}>{t("Teach it")}</button>{/if}
            </p>
          {/if}
        {/if}
        <div class="actions">
          <button type="button" class="btn" onclick={() => session.nextPractice()}>{t("Next reference")}</button>
          <button type="button" class="btn" onclick={() => session.stopPractice()}>{t("Done")}</button>
        </div>
      </div>
    {:else}
      <button type="button" class="btn primary" onclick={() => void session.startPractice()}>{t("Start practice")}</button>
    {/if}
  </div>

  <form class="row add" onsubmit={add}>
    <label class="field-label">{t("Heard")}<input class="field" bind:value={heard} placeholder={t("efficient")} maxlength="40" /></label>
    <span class="arrow" aria-hidden="true">→</span>
    <label class="field-label">{t("Means")}<input class="field" bind:value={means} list="voice-books" placeholder={t("Ephesians, or a name")} maxlength="60" /></label>
    <datalist id="voice-books">{#each BOOKS as book (book)}<option value={book}></option>{/each}</datalist>
    <button type="submit" class="btn" disabled={!heard.trim() || !means.trim()}>{t("Add")}</button>
  </form>

  {#each [...words].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)) as word (word.heard)}
    <div class="row">
      <div class="row-copy">
        <strong>“{word.heard}” → {word.means}</strong>
        <span>{word.source === "learned" ? t("Learned") : t("Added here")}{word.uses ? ` · ${tn(word.uses, "put right once", "put right {n} times")}` : ""}</span>
      </div>
      <button type="button" class="btn" onclick={() => session.removeWord(word.heard)}>{t("Remove")}</button>
    </div>
  {:else}
    <div class="row"><div class="row-copy"><span>{t("No words of your own yet.")}</span></div></div>
  {/each}

  <div class="row stack">
    <div class="row-copy">
      <strong>{tn(BUILT_IN_FIXES.length, "{n} built-in correction", "{n} built-in corrections")}</strong>
      <span>{t("Common mishearings of book names across accents, always on.")} <button type="button" class="link" onclick={() => (showBuiltIn = !showBuiltIn)}>{showBuiltIn ? t("Hide") : t("Show")}</button></span>
    </div>
    {#if showBuiltIn}
      <p class="built-in">{BUILT_IN_FIXES.map(([heardAs, book]) => `${heardAs} → ${book}`).join(" · ")}</p>
    {/if}
  </div>
</section>

<style>
  .stack { flex-direction: column; align-items: stretch !important; gap: 10px; }
  .card { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); }
  .say { display: flex; align-items: baseline; gap: 10px; } .say span, .heard span { min-width: 64px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .say b { font-size: 20px; letter-spacing: -.01em; }
  .heard { display: flex; align-items: baseline; gap: 10px; min-width: 0; } .heard q { min-width: 0; overflow-wrap: anywhere; color: var(--ink); }
  .result { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 2px 0 0; font-size: 13px; font-weight: 600; }
  .result.ok { color: var(--ok, #2f9e6a); } .result.miss { color: var(--muted); }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .add { align-items: flex-end !important; gap: 10px !important; flex-wrap: wrap; }
  .field-label { display: grid; gap: 4px; flex: 1 1 160px; min-width: 0; font-size: 12px; font-weight: 650; color: var(--muted); }
  .field-label .field { width: 100%; max-width: none; }
  .arrow { padding-bottom: 8px; color: var(--muted); }
  .built-in { margin: 0; font-size: 12px; line-height: 1.7; color: var(--muted); }
  .link { border: 0; background: none; padding: 0; color: var(--accent); font: inherit; text-decoration: underline; cursor: pointer; }
</style>
