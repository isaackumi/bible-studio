<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { SCREEN_FONTS } from "../../domain/fonts";
  import { TEXT_SIZE_MAX, TEXT_SIZE_MIN } from "../../domain/text-style";
  import type { Theme } from "../../domain/types";
  import { msg, t } from "../../i18n/core";
  import Icon from "../Icon.svelte";

  // Everything the screen's look needs mid-service, on one line: text size, font, where the words
  // sit, the theme and the Bible version. "More" opens the rest (the reference, darkening a photo,
  // the countdown, captions, a message to the platform, a notice on the screen). With "Live too" on,
  // a change shows on the screen at once; off, it waits on Next for the lever.

  let { onversion }: { onversion: (id: string, liveToo: boolean) => void } = $props();

  const theme = $derived(session.theme());
  let liveToo = $state(true);
  let more = $state(false);

  function restyle(patch: Partial<Theme>) {
    session.saveTheme({ ...$state.snapshot(theme), ...patch } as Theme);
    if (liveToo) void session.restyleProgram();
  }

  const size = (step: number) => restyle({ fontSize: Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, theme.fontSize + step)) });

  function useTheme(id: string) {
    session.useTheme(id);
    if (liveToo) void session.restyleProgram();
  }

  const versions = $derived(session.translations.slice(0, 5));
  const deskVersion = $derived(session.workspace.deskTranslationId ?? "kjv");

  // More: the rarer things.
  const countdown = $derived(session.workspace.overlays.find((overlay) => overlay.kind === "countdown")?.on ?? false);
  let platform = $state("");
  let notice = $state("");
  const dim = $derived(theme.dim ?? 0);

  const ALIGNS: Array<{ id: Theme["align"]; label: string }> = [
    { id: "left", label: msg("Words to the left") },
    { id: "center", label: msg("Words in the centre") },
    { id: "right", label: msg("Words to the right") },
  ];
  const PLACES: Array<{ id: Theme["vertical"]; label: string }> = [
    { id: "top", label: msg("Words at the top") },
    { id: "middle", label: msg("Words in the middle") },
    { id: "bottom", label: msg("Words at the bottom") },
  ];
</script>

<div class="look" role="toolbar" aria-label={t("Screen look")}>
  <div class="seg" role="group" aria-label={t("Text size")}>
    <button type="button" class="key" aria-label={t("Smaller words")} title={t("Smaller words")} onclick={() => size(-4)}><span class="a small">A</span></button>
    <span class="value" aria-live="polite">{theme.fontSize}</span>
    <button type="button" class="key" aria-label={t("Bigger words")} title={t("Bigger words")} onclick={() => size(4)}><span class="a big">A</span></button>
  </div>

  <select class="pick font" aria-label={t("Font")} value={theme.fontFamily} style:font-family={theme.fontFamily} onchange={(event) => restyle({ fontFamily: event.currentTarget.value })}>
    {#if !SCREEN_FONTS.some((font) => font.family === theme.fontFamily)}<option value={theme.fontFamily}>{t("Theme font")}</option>{/if}
    {#each SCREEN_FONTS as font (font.id)}
      <option value={font.family} style:font-family={font.family}>{font.name}</option>
    {/each}
  </select>

  <div class="seg" role="group" aria-label={t("Line up the words")}>
    {#each ALIGNS as align (align.id)}
      <button type="button" class="key" class:on={theme.align === align.id} aria-pressed={theme.align === align.id} aria-label={t(align.label)} title={t(align.label)} onclick={() => restyle({ align: align.id })}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          {#each [3, 7, 11] as y, row (y)}
            {@const w = row === 1 ? 8 : 12}
            {@const x = align.id === "left" ? 2 : align.id === "right" ? 14 - w : 8 - w / 2}
            <rect {x} {y} width={w} height="2" rx="1" />
          {/each}
        </svg>
      </button>
    {/each}
  </div>

  <div class="seg" role="group" aria-label={t("Where the words sit")}>
    {#each PLACES as place (place.id)}
      <button type="button" class="key" class:on={theme.vertical === place.id} aria-pressed={theme.vertical === place.id} aria-label={t(place.label)} title={t(place.label)} onclick={() => restyle({ vertical: place.id })}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.5" />
          <rect x="4" y={place.id === "top" ? 4 : place.id === "middle" ? 7 : 10} width="8" height="2" rx="1" />
        </svg>
      </button>
    {/each}
  </div>

  <select class="pick" aria-label={t("Theme")} value={theme.id} onchange={(event) => useTheme(event.currentTarget.value)}>
    {#each session.themesByFavorite as item (item.id)}
      <option value={item.id}>{item.name}</option>
    {/each}
  </select>

  {#if versions.length > 1}
    <div class="seg" role="group" aria-label={t("Bible version")}>
      {#each versions as version (version.id)}
        <button type="button" class="key word" class:on={deskVersion === version.id} aria-pressed={deskVersion === version.id} title={version.name} onclick={() => onversion(version.id, liveToo)}>{version.abbreviation}</button>
      {/each}
    </div>
  {/if}

  <span class="grow"></span>

  <label class="live-too" title={t("On: changes show on the screen at once. Off: they wait on Next for the lever.")}>
    <input type="checkbox" bind:checked={liveToo} />
    <span>{t("Live too")}</span>
  </label>
  <button type="button" class="key word more-key" class:on={more} aria-expanded={more} onclick={() => (more = !more)}>
    {t("More")}<Icon name={more ? "chevron-down" : "chevron-up"} size={14} />
  </button>
</div>

{#if more}
  <div class="tray" role="group" aria-label={t("More for the screen")}>
    <label class="check">
      <input type="checkbox" checked={theme.reference.show} onchange={(event) => restyle({ reference: { ...theme.reference, show: event.currentTarget.checked } })} />
      <span>{t("Show the reference")}</span>
    </label>

    <div class="seg" role="group" aria-label={t("Darken the background")}>
      <span class="seg-label">{t("Darken")}</span>
      <button type="button" class="key" aria-label={t("Lighter background")} onclick={() => restyle({ dim: Math.max(0, Math.round((dim - 0.1) * 10) / 10) })}><Icon name="minus" size={14} /></button>
      <span class="value">{Math.round(dim * 100)}%</span>
      <button type="button" class="key" aria-label={t("Darker background")} onclick={() => restyle({ dim: Math.min(0.8, Math.round((dim + 0.1) * 10) / 10) })}><Icon name="plus" size={14} /></button>
    </div>

    {#if session.service}
      <button type="button" class="key word" class:on={countdown} aria-pressed={countdown} onclick={() => session.toggleCountdownOverlay()}><Icon name="timer" size={14} />{t("Countdown")}</button>
    {/if}
    <button type="button" class="key word" class:on={session.captionsOn} aria-pressed={session.captionsOn} onclick={() => void session.setCaptions(!session.captionsOn)}><Icon name="captions" size={14} />{t("Captions")}</button>

    <form class="say" onsubmit={(event) => { event.preventDefault(); session.sendStageMessage(platform.trim()); platform = ""; }}>
      <input bind:value={platform} placeholder={t("Message to the platform")} aria-label={t("Message to the platform")} />
      <button type="submit" class="key word" disabled={!platform.trim()}>{t("Send")}</button>
      {#if session.stageMessage}<button type="button" class="key word" onclick={() => session.sendStageMessage("")}>{t("Clear it")}</button>{/if}
    </form>

    <form class="say" onsubmit={(event) => { event.preventDefault(); void session.showAlert({ text: notice.trim(), style: "banner", position: "bottom", seconds: null }); notice = ""; }}>
      <input bind:value={notice} placeholder={t("A notice on the screen")} aria-label={t("A notice on the screen")} />
      <button type="submit" class="key word" disabled={!notice.trim()}>{t("Show")}</button>
      {#if session.alert}<button type="button" class="key word" onclick={() => void session.clearAlert()}>{t("Take it off")}</button>{/if}
    </form>
  </div>
{/if}

<style>
  .look, .tray { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
  .tray { padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
  .seg { display: flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); }
  .seg-label { padding: 0 6px 0 8px; font-size: 12px; color: var(--muted); }
  .key { min-width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 0 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  .key:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }
  .key.on { border-color: color-mix(in srgb, var(--ink) 40%, var(--line)); background: var(--panel); }
  .key:disabled { opacity: 0.45; cursor: default; }
  .key svg { fill: currentColor; }
  .word { border-color: var(--line); background: var(--field); }
  .seg .word { border-color: transparent; background: transparent; }
  .seg .word.on { border-color: color-mix(in srgb, var(--ink) 40%, var(--line)); background: var(--panel); }
  .a { font-weight: 800; line-height: 1; }
  .a.small { font-size: 11px; }
  .a.big { font-size: 17px; }
  .value { min-width: 34px; text-align: center; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .pick { height: 38px; max-width: 170px; padding: 0 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font-size: 13px; }
  .grow { flex: 1; }
  .live-too, .check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 650; color: var(--ink); cursor: pointer; }
  .live-too input, .check input { width: 15px; height: 15px; }
  /* Orange only for what touches the screen. */
  .live-too input { accent-color: var(--onair); }
  .check input { accent-color: var(--ink); }
  .more-key { gap: 4px; }
  .say { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 260px; }
  .say input { flex: 1; min-width: 0; height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; }
</style>
