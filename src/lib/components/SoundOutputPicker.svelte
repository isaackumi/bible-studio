<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { session } from "../app/session.svelte";
  import { isRoomOutput, TRANSPORT_LABELS } from "../audio/outputs";
  import { computerOs } from "../platform/os";
  import { t } from "../i18n/core";

  // Where the congregation hears Church Studio: Automatic (the room's sound system when one is
  // plugged in, this computer's otherwise) or one output by name. In the desktop app the list is
  // the computer's own, with how each output is connected; in a web browser it is what the browser
  // can offer for the music.
  let { compact = false }: { compact?: boolean } = $props();

  let note = $state("");
  const desktop = $derived(session.roomOutputs.length > 0);
  const audio = $derived(session.workspace.audio);
  const decision = $derived(session.roomOutput);
  /** Where the sound goes now: the computer's output on a Mac, the routed one elsewhere. */
  const active = $derived(session.canSetRoomOutput ? session.roomOutputs.find((output) => output.isDefault) ?? null : (decision?.output ?? null));
  const why = $derived.by(() => {
    if (!decision?.output) return "";
    if (decision.why === "chosen") return t("Chosen here.");
    if (decision.why === "interface") return t("An audio interface is plugged in, so the room hears it rather than this computer.");
    if (decision.why === "display") return t("The audience screen has its own sound.");
    if (decision.why === "default-external") return t("The computer already sends its sound there.");
    return t("Nothing for the room is plugged in, so this computer plays it.");
  });

  onMount(() => {
    if (session.roomOutputs.length) void session.checkRoomOutputs();
    else void session.loadAudioOutputs();
  });
</script>

<div class="picker" class:compact>
  {#if desktop}
    <select aria-label={t("Sound output")} value={audio.audience === "auto" || !session.roomOutputs.some((output) => output.id === audio.audience) ? "auto" : audio.audience} onchange={(event) => void session.setRoomOutput(event.currentTarget.value)}>
      <option value="auto">{decision?.output && audio.audience === "auto" ? t("Automatic: {name}", { name: decision.output.name }) : t("Automatic")}</option>
      {#each session.roomOutputs as output (output.id)}
        <option value={output.id}>{output.name} · {t(TRANSPORT_LABELS[output.transport])}</option>
      {/each}
    </select>
    {#if decision?.missing}
      <p class="warn" role="status">{t("{name} is not plugged in. Sound goes to {output} until it is.", { name: audio.audienceName || t("The chosen output"), output: decision.output?.name ?? t("this computer") })}</p>
    {:else if why}
      <p class="why">{why}</p>
    {/if}
    {#if !compact}
      <ul class="list" aria-label={t("Sound outputs on this computer")}>
        {#each session.roomOutputs as output (output.id)}
          <li class:on={active?.id === output.id}>
            <span class="tick" aria-hidden="true">{active?.id === output.id ? "✓" : ""}</span>
            <span class="name">{output.name}</span>
            <span class="tags">
              {#if audio.audienceSkip.includes(output.id)}<span class="tag" title={t("You moved away from it, so Automatic does not pick it. Choose it above to use it again.")}>{t("Not picked by Automatic")}</span>{/if}
              <span class="tag" class:room={isRoomOutput(output)}>{t(TRANSPORT_LABELS[output.transport])}</span>
            </span>
            {#if active?.id === output.id}<span class="sr">{t("In use")}</span>{/if}
          </li>
        {/each}
      </ul>
      {#if session.canSetRoomOutput}
        <p class="hint">{t("Church Studio sets this Mac's sound output, so music, videos and YouTube all play there, and puts back the one it had when Church Studio quits.")}</p>
      {:else}
        <p class="hint">{t("The music and sound pad play there. Videos and YouTube on the audience screen play through Windows' own sound output: set it to the same one in Windows Settings › System › Sound.")}</p>
        <button type="button" class="btn" onclick={() => void invoke("open_privacy_settings", { pane: "sound" }).catch(() => {})}>{t("Open sound settings")}</button>
      {/if}
    {/if}
  {:else if session.canChooseAudioOutput}
    <select aria-label={t("Sound output")} value={audio.outputId} onchange={async (event) => { note = (await session.setAudioOutput(event.currentTarget.value)) ?? ""; }}>
      <option value="">{t("Computer default")}</option>
      {#each session.audioOutputs as output (output.id)}<option value={output.id}>{output.label}</option>{/each}
    </select>
    {#if note}<p class="warn" role="status">{note}</p>{/if}
  {:else}
    <p class="hint">{computerOs() === "windows" ? t("This computer chooses the output in its own sound settings: Windows Settings › System › Sound › Output.") : computerOs() === "mac" ? t("This computer chooses the output in its own sound settings: System Settings › Sound › Output.") : t("This computer chooses the output in its own sound settings.")}</p>
  {/if}
</div>

<style>
  .picker { display: grid; gap: 8px; min-width: 0; }
  select { height: 34px; max-width: 100%; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 0 10px; font: inherit; font-size: 13px; }
  .why, .hint, .warn { margin: 0; font-size: 12px; line-height: 1.45; color: var(--muted); }
  .warn { color: var(--warn, #f5a524); }
  .list { list-style: none; margin: 2px 0 0; padding: 0; display: grid; gap: 2px; }
  .list li { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 30px; padding: 0 8px; border-radius: 8px; font-size: 13px; color: var(--muted); }
  .list li.on { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--ink); font-weight: 600; }
  .tick { color: var(--accent); }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tags { display: flex; gap: 4px; }
  .tag { padding: 1px 7px; border-radius: 999px; border: 1px solid var(--line); font-size: 11px; font-weight: 600; }
  .tag.room { border-color: color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .btn { justify-self: start; height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font: inherit; font-size: 12.5px; cursor: pointer; }
</style>
