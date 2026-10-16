<script lang="ts">
  import { onDestroy } from "svelte";
  import { session } from "../app/session.svelte";
  import { VOICE_ACTIONS, type VoiceAction } from "../voice/commands";
  import { MIC_SAMPLE_MS, MIC_SIGNAL_LEVEL, MIC_TEST_MS, micVerdict, type MicVerdict } from "../voice/mic-test";

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
        name === "NotFoundError" ? "No microphone is connected." : "The microphone is blocked for this window. Allow it in the browser or System Settings → Privacy & Security.";
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

  const bars = 16;
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
  const actionLabel = (id: string) => VOICE_ACTIONS.find((entry) => entry.id === id)?.label ?? id;
</script>

<section class="card audio">
  <div class="row">
    <div class="text">
      <h3>Test microphone</h3>
      <p class="note">Listens for 20 seconds, long enough to catch a microphone that cuts out shortly after it starts.</p>
    </div>
    <button type="button" class="test" onclick={() => (testing ? stopTest?.() : void startTest())}>
      {testing ? `Stop (${remaining}s)` : "Start test"}
    </button>
  </div>
  <div class="row">
    <span class="label">Input level</span>
    <div class="meter" role="meter" aria-label="Input level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(level * 100)}>
      {#each Array.from({ length: bars }) as _, index (index)}
        <i class:on={testing && index < lit} class:loud={index >= bars - 3}></i>
      {/each}
    </div>
  </div>
  {#if testing && level < MIC_SIGNAL_LEVEL}
    <p class="note">Speak now…</p>
  {/if}
  {#if verdict}
    <p class="verdict" data-status={verdict.status} role="status">{verdict.status === "ok" ? "✓ " : "! "}{verdict.message}</p>
  {/if}
  {#if testError}<p class="verdict" data-status="cut-out" role="alert">! {testError}</p>{/if}
</section>

<section class="card audio">
  <div class="row">
    <div class="text">
      <h3>Voice commands</h3>
      <p class="note">Control the desk hands-free. Spoken verses still go to Preview either way.</p>
    </div>
    <input type="checkbox" class="switch" role="switch" aria-label="Voice commands" checked={settings.commands} onchange={(event) => session.saveVoiceSettings({ commands: event.currentTarget.checked })} />
  </div>
  <div class="row" class:dim={!settings.commands}>
    <div class="text">
      <strong>Start commands with “Studio”</strong>
      <p class="note">Recommended. Stops sermon words such as “take this to heart” from acting. Off: only a phrase spoken on its own counts.</p>
    </div>
    <input type="checkbox" class="switch" role="switch" aria-label="Require Studio wake word" disabled={!settings.commands} checked={settings.wake} onchange={(event) => session.saveVoiceSettings({ wake: event.currentTarget.checked })} />
  </div>
  <div class="row" class:dim={!settings.commands}>
    <div class="text">
      <strong>Live voice commands</strong>
      <p class="note">Let voice change Program (Take, Cut, Clear, Black, Logo, timer). Off every time Church Studio starts.</p>
    </div>
    <input type="checkbox" class="switch" role="switch" aria-label="Live voice commands" disabled={!settings.commands} checked={session.voice.allowLive} onchange={(event) => session.setVoiceAllowLive(event.currentTarget.checked)} />
  </div>

  <h4>Commands</h4>
  <div class="chips">
    {#each ["next", "previous", "take", "show John 3 verse 16", "search song amazing grace", "open songs", "pause timer"] as example (example)}
      <code>{prefix}{example}</code>
    {/each}
  </div>
  {#if session.translations.length > 1}
    <h4>Switch translation</h4>
    <div class="chips">
      {#each session.translations as translation (translation.id)}
        <code>{prefix}use {translation.abbreviation}</code>
      {/each}
    </div>
  {/if}

  <h4>Custom commands</h4>
  {#if settings.custom.length}
    <ul class="custom">
      {#each settings.custom as entry, index (entry.phrase)}
        <li>
          <code>{prefix}{entry.phrase}</code>
          <span>→ {actionLabel(entry.action)}</span>
          <button type="button" class="link" aria-label={`Remove ${entry.phrase}`} onclick={() => removeCustom(index)}>Remove</button>
        </li>
      {/each}
    </ul>
  {/if}
  <form class="add" onsubmit={addCustom}>
    <input class="field" aria-label="Custom phrase" placeholder="Phrase, e.g. next slide" maxlength="60" bind:value={phrase} disabled={!settings.commands} />
    <select class="field" aria-label="Custom action" bind:value={action} disabled={!settings.commands}>
      {#each VOICE_ACTIONS as entry (entry.id)}
        <option value={entry.id}>{entry.label}</option>
      {/each}
    </select>
    <button type="submit" disabled={!settings.commands || !phrase.trim()}>+ Add</button>
  </form>
</section>

<style>
  .audio { display: flex; flex-direction: column; gap: 12px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .row.dim { opacity: 0.55; }
  .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .text h3, .text p, .text strong { margin: 0; }
  .label { font-weight: 600; }
  .test { flex: none; min-height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; font-weight: 600; }
  .meter { display: flex; gap: 3px; }
  .meter i { width: 6px; height: 20px; border-radius: 2px; background: var(--line); }
  .meter i.on { background: #3ccf6e; }
  .meter i.on.loud { background: #e0b341; }
  .verdict { margin: 0; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, #3ccf6e 14%, transparent); }
  .verdict[data-status="quiet"], .verdict[data-status="cut-out"] { background: color-mix(in srgb, #ff5a5a 14%, transparent); }
  .switch { width: 42px; height: 24px; flex: none; accent-color: var(--accent); cursor: pointer; }
  h4 { margin: 8px 0 0; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  code { padding: 5px 9px; border-radius: 6px; background: var(--field); border: 1px solid var(--line); font-size: 12px; }
  .custom { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .custom li { display: flex; align-items: center; gap: 10px; }
  .custom span { color: var(--muted); flex: 1; }
  .link { background: none; border: 0; color: var(--accent); cursor: pointer; min-height: 32px; }
  .add { display: grid; grid-template-columns: minmax(0, 1fr) 190px auto; gap: 8px; }
  .add button { min-height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; }
  .add button:disabled { opacity: 0.5; cursor: default; }
  :is(.test, .add button, .link, .switch):focus-visible { outline: 2px solid var(--focus, var(--accent)); outline-offset: 2px; }
</style>
