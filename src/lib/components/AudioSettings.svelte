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
  const SAY = $derived([
    { title: "Move", phrases: ["next", "next verse", "go to the next verse", "move on", "previous", "go back", "the verse before"] },
    { title: "Find", phrases: ["turn to John 3:16", "go to Romans 8", "find the song Amazing Grace", "open songs", "open the bible"] },
    {
      title: "Translation",
      phrases: ["give me King James", "give me KJV", "read it in the American Standard", ...session.translations.slice(0, 4).map((translation) => `switch to ${translation.abbreviation}`)],
    },
    { title: "Program", phrases: ["go live", "clear the screen", "black screen", "show the logo", "pause the timer"] },
  ]);
  const actionLabel = (id: string) => VOICE_ACTIONS.find((entry) => entry.id === id)?.label ?? id;
</script>

<section class="rows">
  <div class="row">
    <div class="row-copy"><strong>Test microphone</strong><span>Listens for 20 seconds, long enough to catch a microphone that cuts out shortly after it starts.</span></div>
    <button type="button" class="btn" class:primary={!testing} onclick={() => (testing ? stopTest?.() : void startTest())}>
      {testing ? `Stop (${remaining}s)` : "Start test"}
    </button>
  </div>
  <div class="row">
    <div class="row-copy"><strong>Input level</strong>{#if testing && level < MIC_SIGNAL_LEVEL}<span>Speak now…</span>{/if}</div>
    <div class="meter" role="meter" aria-label="Input level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(level * 100)}>
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

<p class="section-label">Voice commands</p>
<section class="rows">
  <div class="row">
    <div class="row-copy"><strong>Voice commands</strong><span>Control the desk hands-free. Spoken verses still go to Preview either way.</span></div>
    <input type="checkbox" class="switch" role="switch" aria-label="Voice commands" checked={settings.commands} onchange={(event) => session.saveVoiceSettings({ commands: event.currentTarget.checked })} />
  </div>
  <div class="row" class:dim={!settings.commands}>
    <div class="row-copy"><strong>Require “Studio” first</strong><span>Off: just say the words (“next verse”, “give me King James”). A command counts only when it is said on its own, so sermon sentences never act. On: every command starts with “Studio”.</span></div>
    <input type="checkbox" class="switch" role="switch" aria-label="Require Studio wake word" disabled={!settings.commands} checked={settings.wake} onchange={(event) => session.saveVoiceSettings({ wake: event.currentTarget.checked, wakeChosen: true })} />
  </div>
  <div class="row" class:dim={!settings.commands}>
    <div class="row-copy"><strong>Live voice commands</strong><span>Let voice change Program (go live, cut, clear, black, logo, timer). Off every time Church Studio starts.</span></div>
    <input type="checkbox" class="switch" role="switch" aria-label="Live voice commands" disabled={!settings.commands} checked={session.voice.allowLive} onchange={(event) => session.setVoiceAllowLive(event.currentTarget.checked)} />
  </div>
  <div class="row stack">
    <div class="row-copy"><strong>Just say</strong><span>Plain words work. These are examples; similar phrasings work too.</span></div>
    {#each SAY as group (group.title)}
      <div class="say">
        <span class="say-title">{group.title}</span>
        <div class="chips">
          {#each group.phrases as example (example)}<code>{prefix}{example}</code>{/each}
        </div>
      </div>
    {/each}
  </div>
</section>

<p class="section-label">Custom commands</p>
<section class="rows">
  {#each settings.custom as entry, index (entry.phrase)}
    <div class="row">
      <div class="row-copy"><strong><code>{prefix}{entry.phrase}</code></strong><span>{actionLabel(entry.action)}</span></div>
      <button type="button" class="btn danger" aria-label={`Remove ${entry.phrase}`} onclick={() => removeCustom(index)}>Remove</button>
    </div>
  {/each}
  <form class="row" onsubmit={addCustom}>
    <input class="field grow" aria-label="Custom phrase" placeholder="Phrase, e.g. next slide" maxlength="60" bind:value={phrase} disabled={!settings.commands} />
    <select class="field" aria-label="Custom action" bind:value={action} disabled={!settings.commands}>
      {#each VOICE_ACTIONS as entry (entry.id)}
        <option value={entry.id}>{entry.label}</option>
      {/each}
    </select>
    <button type="submit" class="btn primary" disabled={!settings.commands || !phrase.trim()}>Add</button>
  </form>
</section>

<style>
  .meter { display: flex; gap: 3px; flex: none; }
  .meter i { width: 6px; height: 20px; border-radius: 2px; background: var(--line); }
  .meter i.on { background: #3ccf6e; }
  .meter i.on.loud { background: #e0b341; }
  .verdict { margin: 0; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, #3ccf6e 14%, transparent); font-size: 13px; flex: 1; }
  .verdict[data-status="quiet"], .verdict[data-status="cut-out"] { background: color-mix(in srgb, #ff5a5a 14%, transparent); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .say { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 10px; align-items: start; }
  .say-title { padding-top: 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  code { padding: 4px 8px; border-radius: 6px; background: var(--panel); border: 1px solid var(--line); font-size: 12px; font-weight: 500; }
  form.row select.field { width: 190px; }
</style>
