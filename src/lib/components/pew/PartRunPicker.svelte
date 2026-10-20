<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { partKey, type PartDesk, type PresenterPage } from "../../domain/service";
  import type { ServiceSection } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import { msg, t } from "../../i18n/core";

  // Where one part of the service runs, chosen by the church: in the running order, on a page of the
  // Presenter desk, or on the Production desk. Changes apply at once; the service keeps time on any.
  let { sectionId, onclose }: { sectionId: string; onclose: () => void } = $props();

  const section = $derived(session.service?.sections.find((entry) => entry.id === sectionId) ?? null);
  const run = $derived(section ? session.partRunOf(section) : null);
  const learned = $derived(section ? session.workspace.partDesks?.[partKey(section.name)] : undefined);
  const sameForAll = $derived(!!run && !!learned && learned.desk === run.desk && learned.page === run.page);

  const DESKS: Array<{ desk: PartDesk; name: string; hint: string; icon: string }> = [
    { desk: "service", name: msg("Running order"), hint: msg("Its items, one after another, from the Service page."), icon: "list" },
    { desk: "presenter", name: msg("Presenter desk"), hint: msg("The Bible, songs and notes: every tool, for when anything can happen."), icon: "layout" },
    { desk: "production", name: msg("Production desk"), hint: msg("Cameras, scenes and looks."), icon: "obs" },
  ];
  const PAGES: Array<{ page: PresenterPage; name: string; icon: string }> = [
    { page: "scriptures", name: msg("Scriptures"), icon: "bible" },
    { page: "songs", name: msg("Songs"), icon: "lyrics" },
    { page: "sermon", name: msg("Sermon"), icon: "book" },
  ];

  function choose(desk: PartDesk, page?: PresenterPage) {
    if (!section) return;
    const keep = sameForAll;
    session.setPartDesk(section.id, desk, desk === "presenter" ? (page ?? run?.page ?? "scriptures") : undefined, true);
    // Already the rule for this name: the rule follows the new choice.
    if (keep) session.learnPartDesk(section.name, { desk, ...(desk === "presenter" ? { page: page ?? run?.page ?? "scriptures" } : {}) });
  }

  function toggleSame(on: boolean) {
    if (!section || !run) return;
    session.learnPartDesk(section.name, on ? { desk: run.desk, ...(run.page ? { page: run.page } : {}) } : { desk: "service" });
  }
</script>

{#if section && run}
  <DeskDialog title={t("Where {part} runs", { part: section.name })} {onclose}>
    <div class="picker">
      <div class="desks" role="radiogroup" aria-label={t("Where it runs")}>
        {#each DESKS as option (option.desk)}
          <button type="button" role="radio" class="desk" aria-checked={run.desk === option.desk} onclick={() => choose(option.desk)}>
            <span class="desk-icon"><Icon name={option.icon} size={18} /></span>
            <strong>{t(option.name)}</strong>
            <em>{t(option.hint)}</em>
          </button>
        {/each}
      </div>

      {#if run.desk === "presenter"}
        <div class="row">
          <span class="row-name">{t("Opens on")}</span>
          <div class="seg" role="radiogroup" aria-label={t("Opens on")}>
            {#each PAGES as option (option.page)}
              <button type="button" role="radio" aria-checked={(run.page ?? "scriptures") === option.page} onclick={() => choose("presenter", option.page)}><Icon name={option.icon} size={13} /> {t(option.name)}</button>
            {/each}
          </div>
        </div>
      {/if}

      <label class="same" class:dim={run.desk === "service" && !learned}>
        <span class="same-copy">
          <strong>{t("Same for every part called {part}", { part: section.name })}</strong>
          <em>{t("In this service, new services and templates. Your church's own word for it.")}</em>
        </span>
        <input type="checkbox" class="switch" role="switch" checked={sameForAll} disabled={run.desk === "service" && !learned} onchange={(event) => toggleSame(event.currentTarget.checked)} />
      </label>

      <p class="note"><Icon name="timer" size={13} /> {t("The service keeps time wherever it runs: the countdown, Next part and the report all carry on.")}</p>
    </div>
    {#snippet footer()}
      <button type="button" class="done" onclick={onclose}>{t("Done")}</button>
    {/snippet}
  </DeskDialog>
{/if}

<style>
  .picker { display: grid; gap: 14px; }
  .desks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .desk { display: grid; align-content: start; gap: 6px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease; }
  .desk:hover { background: var(--field); }
  .desk[aria-checked="true"] { border-color: color-mix(in srgb, var(--accent) 70%, var(--line)); background: color-mix(in srgb, var(--accent) 10%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent); }
  .desk-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: var(--field); color: var(--muted); }
  .desk[aria-checked="true"] .desk-icon { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
  .desk strong { font-size: 13.5px; font-weight: 750; }
  .desk em { font-style: normal; font-size: 12px; line-height: 1.4; color: var(--muted); }
  .row { display: flex; align-items: center; gap: 12px; }
  .row-name { font-size: 12px; font-weight: 700; color: var(--muted); white-space: nowrap; }
  .seg { flex: 1; display: flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; }
  .seg button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
  .seg button:hover { color: var(--ink); }
  .seg button[aria-checked="true"] { background: var(--field); color: var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / 0.25); }
  .same { display: flex; align-items: center; gap: 14px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; }
  .same.dim { opacity: 0.55; cursor: default; }
  .same-copy { flex: 1; display: grid; gap: 2px; min-width: 0; }
  .same-copy strong { font-size: 13px; font-weight: 700; }
  .same-copy em { font-style: normal; font-size: 12px; color: var(--muted); }
  .note { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 12px; color: var(--muted); }
  .done { height: 34px; padding: 0 18px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  @media (max-width: 560px) { .desks { grid-template-columns: 1fr; } }
</style>
