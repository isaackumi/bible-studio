<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { CANON } from "../../bible/reference";
  import { BUILT_IN_FIXES, nearMisses } from "../../voice/words";
  import { t, tn } from "../../i18n/core";
  import { isDesktop } from "../../platform/runtime";
  import { CLOUD_SPEECH, type CloudSpeech } from "../../voice/cloud-listen";

  // Words the recognizer mishears in this church (accents, names), put right before verses are
  // found. Learned from the operator, added here, or taught in Practice.

  const BOOKS = [...new Set(CANON.map((book) => book.name.replace(/^\d\s+/, "")))];
  const words = $derived(session.workspace.voice.words ?? []);
  const practice = $derived(session.voicePractice);
  const listening = $derived(session.voice.status === "listening");

  const engine = $derived(session.workspace.voice.engine ?? "system");
  const desktop = isDesktop();

  // Speech services with the church's own key: saved, tested, removed here.
  const SERVICES: CloudSpeech[] = ["elevenlabs", "deepgram"];
  const keys = $derived(session.workspace.voice.speechKeys ?? {});
  let drafts = $state<Record<CloudSpeech, string>>({ elevenlabs: "", deepgram: "" });
  let tested = $state<Record<CloudSpeech, "" | "testing" | "ok">>({ elevenlabs: "", deepgram: "" });
  let testError = $state<Record<CloudSpeech, string>>({ elevenlabs: "", deepgram: "" });

  async function saveKey(service: CloudSpeech) {
    session.setSpeechKey(service, drafts[service]);
    drafts[service] = "";
    await testKey(service);
  }

  async function testKey(service: CloudSpeech) {
    tested[service] = "testing";
    testError[service] = "";
    try {
      await session.testSpeechKey(service);
      tested[service] = "ok";
    } catch (error) {
      tested[service] = "";
      testError[service] = error instanceof Error ? error.message : String(error);
    }
  }
  const model = $derived(session.accurate.model);
  const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

  $effect(() => {
    if (isDesktop()) untrack(() => void session.refreshAccurate());
  });

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

<p class="section-label">{t("Recognizer")}</p>
<section class="rows">
  <div class="row stack">
    <div class="row-copy">
      <strong>{t("Which recognizer listens")}</strong>
      <span>{desktop ? t("The system recognizer is built into the computer. Accurate uses Whisper on this computer and never sends audio away. ElevenLabs and Deepgram are speech services with your own key: they hear accents and Bible names best, and send the sound to that service while listening.") : t("This browser's own recognizer works in Chrome and Edge. ElevenLabs and Deepgram are speech services with your own key: they work in any browser, hear accents and Bible names best, and send the sound to that service while listening.")}</span>
    </div>
    <div class="choices" role="radiogroup" aria-label={t("Recognizer")}>
      <button type="button" role="radio" class="choice" class:on={engine === "system"} aria-checked={engine === "system"} onclick={() => void session.setVoiceEngine("system")}>
        <b>{desktop ? t("System") : t("This browser")}</b><span>{desktop ? t("Built in, light on the computer") : t("Chrome and Edge, free")}</span>
      </button>
      {#if desktop && !model?.unsupported}
        <button type="button" role="radio" class="choice" class:on={engine === "accurate"} aria-checked={engine === "accurate"} disabled={!model?.installed} onclick={() => void session.setVoiceEngine("accurate")}>
          <b>{t("Accurate")}</b><span>{model?.installed ? t("Whisper, on this computer") : t("Download it first")}</span>
        </button>
      {/if}
      {#each SERVICES as service (service)}
        <button type="button" role="radio" class="choice" class:on={engine === service} aria-checked={engine === service} disabled={!keys[service]} onclick={() => void session.setVoiceEngine(service)}>
          <b>{CLOUD_SPEECH[service].name}</b><span>{keys[service] ? (service === "elevenlabs" ? t("Scribe, your key") : t("Nova-3, your key")) : t("Add your key below")}</span>
        </button>
      {/each}
    </div>
  </div>
  {#each SERVICES as service (service)}
    <div class="row stack">
      <div class="row-copy">
        <strong>{t("{service} key", { service: CLOUD_SPEECH[service].name })}{#if keys[service]} <em class="ok">{tested[service] === "ok" ? t("Works") : t("Saved")}</em>{/if}</strong>
        <span>{t("Make a key in your {service} account and paste it here. It stays on this computer.", { service: CLOUD_SPEECH[service].name })} <a href={CLOUD_SPEECH[service].keysUrl} target="_blank" rel="noreferrer">{t("Get a key")}</a></span>
      </div>
      <div class="key-row">
        <input type="password" autocomplete="off" spellcheck="false" placeholder={keys[service] ? "••••••••••••" : t("Paste the key")} bind:value={drafts[service]} aria-label={t("{service} key", { service: CLOUD_SPEECH[service].name })} />
        <button type="button" class="btn primary" disabled={!drafts[service].trim()} onclick={() => saveKey(service)}>{t("Save")}</button>
        {#if keys[service]}
          <button type="button" class="btn" disabled={tested[service] === "testing"} onclick={() => void testKey(service)}>{tested[service] === "testing" ? t("Testing…") : t("Test")}</button>
          <button type="button" class="btn" onclick={() => { session.setSpeechKey(service, ""); tested[service] = ""; }}>{t("Remove")}</button>
        {/if}
      </div>
      {#if testError[service]}<p class="key-error" role="alert">{testError[service]}</p>{/if}
    </div>
  {/each}
</section>

{#if desktop && !model?.unsupported}
  <section class="rows">
    <div class="row">
      <div class="row-copy">
        <strong>{t("Accurate listening model")}</strong>
        <span>
          {#if session.accurate.progress !== null}{t("Downloading… {percent}%", { percent: Math.round(session.accurate.progress * 100) })}
          {:else if session.accurate.error}{session.accurate.error}
          {:else if model?.installed}{t("Downloaded ({size}). It stays on this computer.", { size: megabytes(model.bytes) })}
          {:else}{t("A one-time download of {size}, kept on this computer.", { size: megabytes(model?.bytes || 59_721_011) })}{/if}
        </span>
        {#if session.accurate.progress !== null}<progress max="1" value={session.accurate.progress}></progress>{/if}
      </div>
      {#if session.accurate.progress !== null}
        <button type="button" class="btn" onclick={() => session.cancelAccurate()}>{t("Cancel")}</button>
      {:else if model?.installed}
        <button type="button" class="btn" onclick={() => void session.deleteAccurate()}>{t("Remove")}</button>
      {:else}
        <button type="button" class="btn primary" onclick={() => void session.downloadAccurate()}>{t("Download")}</button>
      {/if}
    </div>
  </section>
{/if}

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
  .choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .key-row { display: flex; gap: 8px; }
  .key-row input { flex: 1; min-width: 0; height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; }
  .key-row .btn { height: 36px; }
  .row-copy a { color: var(--accent); font-weight: 600; text-decoration: none; }
  .row-copy a:hover { text-decoration: underline; }
  .key-error { margin: 0; color: var(--danger, #ff6b6b); font-size: 12.5px; }
  .ok { margin-left: 6px; padding: 1px 8px; border-radius: 99px; background: color-mix(in srgb, var(--good, #3ccf7a) 18%, transparent); color: var(--good, #3ccf7a); font-size: 11px; font-style: normal; font-weight: 700; }
  .choice { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .choice span { font-size: 12px; color: var(--muted); }
  .choice.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .choice:disabled { opacity: .55; cursor: default; }
  progress { width: 100%; height: 6px; margin-top: 8px; accent-color: var(--accent); }
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
