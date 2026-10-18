<script lang="ts">
  import { session } from "../app/session.svelte";
  import { videoPosition } from "../domain/types";
  import { playPosition } from "../domain/video-play";
  import Icon from "./Icon.svelte";
  import { t } from "../i18n/core";

  // Play, pause, scrub, volume and fade for the video on Program. Every screen follows.
  const video = $derived(session.live.program.model.layout === "video" ? session.live.program.model.video : undefined);
  const control = $derived(video?.control ?? null);
  let duration = $state(0);
  let now = $state(Date.now());
  let fading = $state(false);

  $effect(() => {
    if (!video) return;
    const timer = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(timer);
  });

  // Read the length from the file's metadata (the monitors' players are muted copies).
  $effect(() => {
    const url = video?.url;
    duration = 0;
    if (!url) return;
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => (duration = Number.isFinite(probe.duration) ? probe.duration : 0);
    return () => probe.removeAttribute("src");
  });

  const position = $derived.by(() => {
    if (!control || !video) return 0;
    return playPosition(videoPosition(control, now), { start: video.start, stop: video.stop, loop: video.loop, duration });
  });
  /** The playable span: the trim points, or the whole file. */
  const from = $derived(video?.start ?? 0);
  const to = $derived(video?.stop ?? duration);

  function skip(seconds: number) {
    void session.controlVideo({ kind: "seek", at: Math.min(Math.max(from, position + seconds), to || position + seconds) });
  }

  function clock(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }

  async function fade() {
    fading = true;
    await session.fadeOutVideo(3);
    fading = false;
  }
</script>

{#if video}
  <div class="video-controls" role="group" aria-label={t("Video on Program")}>
    <button type="button" class="vc" aria-label={control?.playing === false ? t("Play") : t("Pause")} title={control?.playing === false ? t("Play") : t("Pause")} onclick={() => void session.controlVideo({ kind: control?.playing === false ? "play" : "pause" })}>
      {#if control?.playing === false}<Icon name="play" size={14} />{:else}<Icon name="square" size={12} />{/if}
    </button>
    <button type="button" class="vc" aria-label={t("From the start")} title={t("From the start")} onclick={() => void session.controlVideo({ kind: "restart" })}><Icon name="reset" size={13} /></button>
    <button type="button" class="vc text" aria-label={t("Back 10 seconds")} title={t("Back 10 seconds")} onclick={() => skip(-10)}>−10</button>
    <button type="button" class="vc text" aria-label={t("Forward 10 seconds")} title={t("Forward 10 seconds")} onclick={() => skip(10)}>+10</button>
    <span class="time">{clock(position)}</span>
    <input
      class="scrub"
      type="range"
      min={from}
      max={Math.max(from + 1, to)}
      step="0.1"
      value={position}
      aria-label={t("Video position")}
      onchange={(event) => void session.controlVideo({ kind: "seek", at: Number(event.currentTarget.value) })}
    />
    <span class="time">{to ? clock(to) : "–:––"}</span>
    {#if video.end && video.end !== "hold" && video.end !== "loop"}<span class="then" title={t("What happens when this video ends")}>{video.end === "clear" ? t("then clear") : video.end === "next" ? t("then next item") : t("then next in part")}</span>{/if}
    <input class="volume" type="range" min="0" max="1" step="0.05" value={control?.volume ?? 1} aria-label={t("Volume")} title={t("Volume")} onchange={(event) => void session.controlVideo({ kind: "volume", volume: Number(event.currentTarget.value) })} />
    <button type="button" class="vc text" disabled={fading || control?.playing === false} title={t("Bring the sound down over 3 seconds, then pause")} onclick={() => void fade()}>{fading ? t("Fading…") : t("Fade out")}</button>
  </div>
{/if}

<style>
  .video-controls { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--field) 70%, transparent); }
  .vc { display: grid; place-items: center; flex: none; min-width: 28px; height: 28px; padding: 0 6px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--ink); font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }
  .vc.text { padding: 0 8px; }
  .vc:disabled { opacity: 0.5; cursor: default; }
  .time { flex: none; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--muted); }
  .scrub { flex: 1; min-width: 60px; accent-color: var(--live); }
  .volume { width: 64px; flex: none; accent-color: var(--accent); }
  .then { flex: none; font-size: 11px; font-weight: 650; color: var(--accent); white-space: nowrap; }
</style>
