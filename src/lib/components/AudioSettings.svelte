<script lang="ts">
  import { onDestroy } from "svelte";
  import { session } from "../app/session.svelte";
  import { VOICE_ACTIONS, type VoiceAction } from "../voice/commands";
  import { MIC_SAMPLE_MS, MIC_SIGNAL_LEVEL, MIC_TEST_MS, micVerdict, type MicVerdict } from "../voice/mic-test";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { isDesktop } from "../platform/runtime";
  import type { NoiseFilter } from "../domain/types";
  import { noiseCut } from "../voice/noise";
  import { msg, t } from "../i18n/core";

  const bars = 16;

  // ---- Noise filter, with a check that shows the room and what listening hears after cleaning
  const FILTERS: Array<{ id: NoiseFilter; label: string; detail: string }> = [
    { id: "off", label: msg("Off"), detail: msg("Listening hears the microphone as it is.") },
    { id: "light", label: msg("Light"), detail: msg("Turns down fans, hum and hiss, and keeps some of the room so quiet words are never lost.") },
    { id: "strong", label: msg("Strong"), detail: msg("Removes as much background noise as it can. Best for noisy rooms; very soft speech can drop out.") },
  ];
  const filter = $derived(session.workspace.voice.noiseFilter ?? "off");
  const desktop = isDesktop();
  let checking = $state(false);
  let room = $state(0);
  let clean = $state(0);
  let checkError = $state("");
  const rooms: number[] = [];
  const cleans: number[] = [];
  let cut = $state<number | null>(null);
  let stopCheck: (() => void) | null = null;

  async function startCheck(current: NoiseFilter = filter) {
    stopCheck?.();
    checkError = "";
    rooms.length = 0;
    cleans.length = 0;
    cut = null;
    const unlisten = await listen<{ room: number; clean: number }>("noise-test", (event) => {
      room = Math.min(1, event.payload.room * 4);
      clean = Math.min(1, event.payload.clean * 4);
      rooms.push(event.payload.room);
      cleans.push(event.payload.clean);
      if (rooms.length % 6 === 0) cut = noiseCut(rooms, cleans);
    });
    try {
      await invoke("start_noise_test", { filter: current });
    } catch (error) {
      unlisten();
      checkError = error instanceof Error ? error.message : String(error);
      return;
    }
    checking = true;
    const timer = setTimeout(() => stopCheck?.(), 30_000);
    stopCheck = () => {
      clearTimeout(timer);
      unlisten();
      void invoke("stop_noise_test");
      checking = false;
      room = 0;
      clean = 0;
      stopCheck = null;
    };
  }

  async function chooseFilter(next: NoiseFilter) {
    await session.setNoiseFilter(next);
    // A running check follows the new setting straight away.
    if (checking) await startCheck(next);
  }

  onDestroy(() => stopCheck?.());

  // ---- 20-second microphone test (its own stream; it never starts listening or touches Program)
  let testing = $state(false);
  let level = $state(0);
  let remaining = $state(0);
  let verdict = $state<MicVerdict | null>(null);
  let testError = $state("");
  let stopTest: (() => void) | null = null;

  async function startTest() {
    stopTest?.();
    verdict = null;
    testError = "";
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const name = error && typeof error === "object" && "name" in error ? String((error as { name: string }).name) : "";
      testError =
        name === "NotFoundError" ? t("No microphone is connected.") : t("The microphone is blocked for this window. Allow it in the browser or System Settings → Privacy & Security.");
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const levels: number[] = [];
    let ended = false;
    const track = stream.getAudioTracks()[0];
    track?.addEventListener("ended", () => (ended = true));
    const startedAt = Date.now();
    testing = true;
    const finish = () => {
      clearInterval(timer);
      stream.getTracks().forEach((each) => each.stop());
      void context.close();
      testing = false;
      level = 0;
      stopTest = null;
    };
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let total = 0;
      for (const sample of samples) total += ((sample - 128) / 128) ** 2;
      level = Math.min(1, Math.sqrt(total / samples.length) * 4);
      levels.push(level);
      remaining = Math.max(0, Math.ceil((MIC_TEST_MS - (Date.now() - startedAt)) / 1000));
      if (ended || Date.now() - startedAt >= MIC_TEST_MS) {
        verdict = micVerdict(levels, ended);
        finish();
      }
    }, MIC_SAMPLE_MS);
    stopTest = () => {
      verdict = levels.length ? micVerdict(levels, false) : null;
      finish();
    };
  }

  onDestroy(() => stopTest?.());

  const lit = $derived(Math.round(level * bars));

  // ---- Voice command settings
  const settings = $derived(session.workspace.voice);
  let phrase = $state("");
  let action = $state<VoiceAction>("next");

  function addCustom(event?: Event) {
    event?.preventDefault();
    const clean = phrase.trim();
    if (!clean) return;
    session.saveVoiceSettings({ custom: [...settings.custom, { phrase: clean, action }] });
    phrase = "";
  }

  function removeCustom(index: number) {
    session.saveVoiceSettings({ custom: settings.custom.filter((_, at) => at !== index) });
  }

  const prefix = $derived(settings.wake ? "studio " : "");
  const SAY = $derived([
    { title: msg("Move"), phrases: ["next", "next verse", "go to the next verse", "move on", "previous", "go back", "the verse before"] },
    { title: msg("Find"), phrases: ["turn to John 3:16", "go to Romans 8", "find the song Amazing Grace", "open songs", "open the bible"] },
    {
      title: msg("Translation"),
      phrases: ["give me King James", "give me KJV", "read it in the American Standard", ...session.translations.slice(0, 4).map((translation) => `switch to ${translation.abbreviation}`)],
    },
    { title: msg("Program"), phrases: ["go live", "clear the screen", "black screen", "show the logo", "pause the timer"] },
  ]);
  const actionLabel = (id: string) => VOICE_ACTIONS.find((entry) => entry.id === id)?.label ?? id;
</script>

<p class="section-label">{t("Noise filter")}</p>
<section class="rows">
  <div class="row stack">
    <div class="row-copy">
      <strong>{t("Clean the microphone before listening")}</strong>
      <span>{t(FILTERS.find((entry) => entry.id === filter)?.detail ?? "")} {t("It runs on this computer; no sound leaves it.")}</span>
    </div>
    <div class="filter-seg" role="radiogroup" aria-label={t("Noise filter")}>
      {#each FILTERS as entry (entry.id)}
        <button type="button" role="radio" aria-checked={filter === entry.id} class:on={filter === entry.id} onclick={() => void chooseFilter(entry.id)}>{t(entry.label)}</button>
      {/each}
    </div>
  </div>
  {#if desktop}
    <div class="row">
      <div class="row-copy"><strong>{t("Check it in your room")}</strong><span>{t("Play the room as it is on a Sunday (fans, music, the PA) and speak. Compare the two meters.")}</span></div>
      <button type="button" class="btn" class:primary={!checking} onclick={() => (checking ? stopCheck?.() : void startCheck())}>{checking ? t("Stop check") : t("Start check")}</button>
    </div>
    <div class="row">
      <div class="row-copy"><strong>{t("Room")}</strong><span>{t("What the microphone hears")}</span></div>
      <div class="meter" role="meter" aria-label={t("Room level")} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(room * 100)}>
        {#each Array.from({ length: bars }) as _, index (index)}<i class:on={checking && index < Math.round(room * bars)} class:loud={index >= bars - 3}></i>{/each}
      </div>
    </div>
    <div class="row">
      <div class="row-copy"><strong>{t("After the filter")}</strong><span>{t("What listening hears")}</span></div>
      <div class="meter" role="meter" aria-label={t("Level after the filter")} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(clean * 100)}>
        {#each Array.from({ length: bars }) as _, index (index)}<i class:on={checking && index < Math.round(clean * bars)} class:loud={index >= bars - 3}></i>{/each}
      </div>
    </div>
    {#if cut !== null && filter !== "off"}
      <div class="row"><p class="verdict" data-status="ok" role="status">{t("Background noise is about {cut} dB quieter after the filter.", { cut })}{cut < 3 ? ` ${t("Little to remove here: the room is quiet, or the noise sounds like speech (music, the PA).")}` : ""}</p></div>
    {/if}
    {#if checkError}<div class="row"><p class="verdict" data-status="cut-out" role="alert">! {checkError}</p></div>{/if}
  {:else}
    <div class="row"><div class="row-copy"><strong>{t("In this browser")}</strong><span>{t("Light and Strong turn on the browser's own noise suppression. The desktop app has the stronger filter and the room check.")}</span></div></div>
  {/if}
  <div class="row">
    <div class="row-copy">
      <strong>{t("Best results")}</strong>
      <span>{t("A filter removes steady noise, not the PA. If the preacher's voice comes back through the speakers mixed with music, take a feed from the sound desk (an aux send) or put a microphone near the pulpit. That helps detection more than any filter.")}</span>
    </div>
  </div>
</section>

<p class="section-label">{t("Microphone")}</p>
<section class="rows">
  <div class="row">
    <div class="row-copy"><strong>{t("Test microphone")}</strong><span>{t("Listens for 20 seconds, long enough to catch a microphone that cuts out shortly after it starts.")}</span></div>
    <button type="button" class="btn" class:primary={!testing} onclick={() => (testing ? stopTest?.() : void startTest())}>
      {testing ? t("Stop ({remaining}s)", { remaining }) : t("Start test")}
    </button>
  </div>
  <div class="row">
    <div class="row-copy"><strong>{t("Input level")}</strong>{#if testing && level < MIC_SIGNAL_LEVEL}<span>{t("Speak now…")}</span>{/if}</div>
    <div class="meter" role="meter" aria-label={t("Input level")} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(level * 100)}>
      {#each Array.from({ length: bars }) as _, index (index)}
        <i class:on={testing && index < lit} class:loud={index >= bars - 3}></i>
      {/each}
    </div>
  </div>
  {#if verdict}
    <div class="row"><p class="verdict" data-status={verdict.status} role="status">{verdict.status === "ok" ? "✓ " : "! "}{verdict.message}</p></div>
  {/if}
  {#if testError}<div class="row"><p class="verdict" data-status="cut-out" role="alert">! {testError}</p></div>{/if}
</section>

<p class="section-label">{t("Voice commands")}</p>
<section class="rows">
  <div class="row">
    <div class="row-copy"><strong>{t("Voice commands")}</strong><span>{t("Control the desk hands-free. Spoken verses still go to Preview either way.")}</span></div>
    <input type="checkbox" class="switch" role="switch" aria-label={t("Voice commands")} checked={settings.commands} onchange={(event) => session.saveVoiceSettings({ commands: event.currentTarget.checked })} />
  </div>
  <div class="row" class:dim={!settings.commands}>
    <div class="row-copy"><strong>{t("Require “Studio” first")}</strong><span>{t("Off: just say the words (“next verse”, “give me King James”). A command counts only when it is said on its own, so sermon sentences never act. On: every command starts with “Studio”.")}</span></div>
    <input type="checkbox" class="switch" role="switch" aria-label={t("Require Studio wake word")} disabled={!settings.commands} checked={settings.wake} onchange={(event) => session.saveVoiceSettings({ wake: event.currentTarget.checked, wakeChosen: true })} />
  </div>
  <div class="row" class:dim={!settings.commands}>
    <div class="row-copy"><strong>{t("Live voice commands")}</strong><span>{t("Let voice change Program (go live, cut, clear, black, logo, timer). Off every time Church Studio starts.")}</span></div>
    <input type="checkbox" class="switch" role="switch" aria-label={t("Live voice commands")} disabled={!settings.commands} checked={session.voice.allowLive} onchange={(event) => session.setVoiceAllowLive(event.currentTarget.checked)} />
  </div>
  <div class="row stack">
    <div class="row-copy"><strong>{t("Just say")}</strong><span>{t("Plain words work. These are examples; similar phrasings work too.")}</span></div>
    {#each SAY as group (group.title)}
      <div class="say">
        <span class="say-title">{t(group.title)}</span>
        <div class="chips">
          {#each group.phrases as example (example)}<code>{prefix}{example}</code>{/each}
        </div>
      </div>
    {/each}
  </div>
</section>

<p class="section-label">{t("Custom commands")}</p>
<section class="rows">
  {#each settings.custom as entry, index (entry.phrase)}
    <div class="row">
      <div class="row-copy"><strong><code>{prefix}{entry.phrase}</code></strong><span>{t(actionLabel(entry.action))}</span></div>
      <button type="button" class="btn danger" aria-label={t("Remove {phrase}", { phrase: entry.phrase })} onclick={() => removeCustom(index)}>{t("Remove")}</button>
    </div>
  {/each}
  <form class="row" onsubmit={addCustom}>
    <input class="field grow" aria-label={t("Custom phrase")} placeholder={t("Phrase, e.g. next slide")} maxlength="60" bind:value={phrase} disabled={!settings.commands} />
    <select class="field" aria-label={t("Custom action")} bind:value={action} disabled={!settings.commands}>
      {#each VOICE_ACTIONS as entry (entry.id)}
        <option value={entry.id}>{t(entry.label)}</option>
      {/each}
    </select>
    <button type="submit" class="btn primary" disabled={!settings.commands || !phrase.trim()}>{t("Add")}</button>
  </form>
</section>

<style>
  .meter { display: flex; gap: 3px; flex: none; }
  .meter i { width: 6px; height: 20px; border-radius: 2px; background: var(--line); }
  .meter i.on { background: #3ccf6e; }
  .filter-seg { display: inline-flex; align-self: flex-start; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: var(--field); }
  .filter-seg button { height: 28px; padding: 0 16px; border: 0; border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .filter-seg button:hover { color: var(--ink); }
  .filter-seg button.on { background: var(--accent); color: var(--on-accent); }
  .meter i.on.loud { background: #e0b341; }
  .verdict { margin: 0; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, #3ccf6e 14%, transparent); font-size: 13px; flex: 1; }
  .verdict[data-status="quiet"], .verdict[data-status="cut-out"] { background: color-mix(in srgb, #ff5a5a 14%, transparent); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .say { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 10px; align-items: start; }
  .say-title { padding-top: 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  code { padding: 4px 8px; border-radius: 6px; background: var(--panel); border: 1px solid var(--line); font-size: 12px; font-weight: 500; }
  form.row select.field { width: 190px; }
</style>
