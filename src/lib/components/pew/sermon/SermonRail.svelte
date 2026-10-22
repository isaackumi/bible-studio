<script lang="ts">
  import { sermonClock } from "../../../app/sermon-clock.svelte";
  import { sectionSpent } from "../../../domain/sermon-clock";
  import { sermonAudienceItem } from "../../../domain/sermon";
  import type { Sermon } from "../../../domain/types";
  import { t } from "../../../i18n/core";

  // The sermon as one bar: a segment per section, as wide as its planned minutes (equal when none
  // are planned), filled as the time on it runs. Preview has a ring, Program is red; click to preview.
  let { sermon, previewId = null, liveId = null, onpick, big = false }: { sermon: Sermon; previewId?: string | null; liveId?: string | null; onpick: (sectionId: string) => void; big?: boolean } = $props();

  const planned = $derived(sermon.sections.filter((section) => section.minutes).map((section) => section.minutes!));
  const fallback = $derived(planned.length ? planned.reduce((a, b) => a + b, 0) / planned.length : 1);
  const clock = $derived(sermonClock.value?.sermonId === sermon.id ? sermonClock.value : null);

  function kindOf(sectionId: string): string {
    const section = sermon.sections.find((entry) => entry.id === sectionId);
    return section ? sermonAudienceItem(section).kind : "slide";
  }

  function fill(sectionId: string, minutes: number | undefined): number {
    if (!clock) return 0;
    const spent = sectionSpent(clock, sectionId, sermonClock.now);
    if (!spent) return 0;
    return minutes ? Math.min(1, spent / (minutes * 60_000)) : 1;
  }
</script>

<div class="rail" class:big role="group" aria-label={t("Sermon timeline")}>
  {#each sermon.sections as section, n (section.id)}
    {@const share = fill(section.id, section.minutes)}
    {@const over = !!clock && !!section.minutes && sectionSpent(clock, section.id, sermonClock.now) > section.minutes * 60_000}
    <button
      type="button"
      class="seg {kindOf(section.id)}"
      class:preview={previewId === section.id}
      class:live={liveId === section.id}
      class:over
      style:flex-grow={section.minutes ?? fallback}
      title={`${n + 1}. ${section.name}${section.minutes ? ` · ${t("{n} min", { n: section.minutes })}` : ""}`}
      onclick={() => onpick(section.id)}
    >
      <span class="bar"><span class="done" style:width="{share * 100}%"></span></span>
      {#if big}<span class="label"><b>{n + 1}</b> {section.name}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .rail { display: flex; gap: 3px; width: 100%; min-width: 0; }
  .seg { flex: 1 1 0; min-width: 10px; display: grid; gap: 5px; padding: 0; border: 0; background: none; color: var(--muted); font: inherit; text-align: left; cursor: pointer; }
  .bar { position: relative; display: block; height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--tone) 28%, var(--field)); overflow: hidden; transition: box-shadow 0.15s ease; }
  .big .bar { height: 12px; border-radius: 6px; }
  .done { position: absolute; inset: 0 auto 0 0; background: var(--tone); transition: width 1s linear; }
  .seg { --tone: var(--accent); }
  .seg.bible { --tone: #d4a017; }
  .seg.image { --tone: #30a46c; }
  .seg:hover .bar { box-shadow: 0 0 0 2px color-mix(in srgb, var(--ink) 30%, transparent); }
  .seg.preview .bar { box-shadow: 0 0 0 2px var(--accent); }
  .seg.live .bar { box-shadow: 0 0 0 2px var(--live, #e5484d); }
  .seg.live .done { background: var(--live, #e5484d); }
  .seg.over .done { background: #f5a524; }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .label b { color: var(--ink); }
  .seg.live .label, .seg.preview .label { color: var(--ink); font-weight: 650; }
  @media (prefers-reduced-motion: reduce) { .done, .bar { transition: none; } }
</style>
