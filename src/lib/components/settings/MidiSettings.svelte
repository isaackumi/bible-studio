<script lang="ts">
  import { onMount } from "svelte";
  import { midi } from "../../app/midi.svelte";
  import { MIDI_ACTIONS, describeBinding, type MidiBinding } from "../../domain/midi";
  import { t } from "../../i18n/core";

  // Settings › MIDI controller: the input to listen to, and for each desk action the press that runs
  // it, learned from the device (Learn, then press the pad).

  onMount(() => {
    void midi.refreshInputs().then(() => midi.start());
    // Leaving Settings ends a Learn still waiting, so a later press runs its action as usual.
    return () => (midi.learning = null);
  });

  function label(binding: MidiBinding): string {
    const { kind, value, channel } = describeBinding(binding);
    if (kind === "note") return t("Note {note} · channel {channel}", { note: value, channel });
    if (kind === "cc") return t("Control {number} · channel {channel}", { number: value, channel });
    return t("Program {number} · channel {channel}", { number: value, channel });
  }
</script>

{#if !midi.supported}
  <section class="rows">
    <div class="row"><div class="row-copy"><span>{t("MIDI works in the desktop app.")}</span></div></div>
  </section>
{:else}
  <section class="rows">
    <div class="row">
      <div class="row-copy">
        <strong>{t("Listen to")}</strong>
        <span>
          {#if midi.status === "on"}<b class="ok">{t("Listening")}</b> · {t("Presses run the actions below, like their keys do.")}
          {:else if midi.status === "missing"}<b class="bad">{t("Not connected")}</b> · {t("Plug it in, then Refresh.")}
          {:else if midi.status === "error"}<b class="bad">{midi.error}</b>
          {:else}{t("A pad, footswitch or keyboard plugged into this computer, or the band's software through a virtual port (loopMIDI on Windows, IAC on a Mac).")}{/if}
        </span>
      </div>
      <div class="row-end">
        <select class="field" aria-label={t("MIDI input")} value={midi.settings.device ?? ""} onchange={(event) => void midi.choose(event.currentTarget.value || null)}>
          <option value="">{t("None")}</option>
          {#each midi.inputs as name (name)}<option value={name}>{name}</option>{/each}
          {#if midi.settings.device && !midi.inputs.includes(midi.settings.device)}<option value={midi.settings.device}>{t("{name} (not connected)", { name: midi.settings.device })}</option>{/if}
        </select>
        <button type="button" class="btn" onclick={() => void midi.refreshInputs().then(() => midi.start())}>{t("Refresh")}</button>
      </div>
    </div>
  </section>

  <p class="section-label">{t("What each press does")}</p>
  <section class="rows">
    {#each MIDI_ACTIONS as action (action.id)}
      {@const binding = midi.settings.bindings[action.id]}
      <div class="row" class:waiting={midi.learning === action.id}>
        <div class="row-copy">
          <strong>{t(action.label)}</strong>
          <span>{midi.learning === action.id ? t("Press the pad, key or pedal now…") : binding ? label(binding) : t("Not set")}</span>
        </div>
        <div class="row-end">
          {#if binding && midi.learning !== action.id}<button type="button" class="btn" onclick={() => midi.forget(action.id)}>{t("Clear")}</button>{/if}
          <button type="button" class="btn" class:primary={midi.learning === action.id} disabled={midi.status !== "on"} onclick={() => midi.startLearning(action.id)}>{midi.learning === action.id ? t("Cancel") : t("Learn")}</button>
        </div>
      </div>
    {/each}
  </section>
  <p class="hint">{t("Learn listens for the next press on the chosen input. A press already used by another action moves to this one, so each press does one thing.")}</p>
{/if}

<style>
  .ok { color: var(--presence-text); font-weight: 650; }
  .bad { color: var(--live-text, #ff6b6b); font-weight: 650; }
  .waiting { background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .hint { margin: 8px 4px 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
</style>
