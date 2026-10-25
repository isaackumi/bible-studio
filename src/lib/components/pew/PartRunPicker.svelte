<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { partDesks, partKey, type PartDesk, type PartRun, type PresenterPage } from "../../domain/service";
  import type { ServiceSection } from "../../domain/types";
  import Icon from "../Icon.svelte";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import { SCREEN_ROLES, screenLetter, type ScreenRole } from "../../display/screens";
  import { msg, t } from "../../i18n/core";

  // Where one part of the service runs, chosen by the church: the running order, the Presenter desk,
  // the Production desk, or any of them together (one opens first; the strip goes between them).
  // Changes apply at once; the service keeps time on any.
  let { sectionId, onclose }: { sectionId: string; onclose: () => void } = $props();

  const section = $derived(session.service?.sections.find((entry) => entry.id === sectionId) ?? null);
  const run = $derived(section ? session.partRunOf(section) : null);
  const learned = $derived(section ? session.workspace.partDesks?.[partKey(section.name)] : undefined);
  const sameForAll = $derived(!!run && !!learned && learned.desk === run.desk && learned.page === run.page && (learned.also ?? []).join() === (run.also ?? []).join());
  const chosen = $derived(run ? partDesks(run) : []);
  const screens = $derived(session.workspace.screens ?? []);
  const JOBS: Record<ScreenRole, string> = { program: msg("Program"), scripture: msg("Scripture"), lyrics: msg("Lyrics"), slides: msg("Slides"), timer: msg("Timer"), stage: msg("Stage"), blank: msg("Dark") };

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

  /** Save a choice: the desk it opens on first, every desk it uses, and the Presenter page. */
  function save(first: PartDesk, desks: PartDesk[], page?: PresenterPage) {
    if (!section) return;
    const keep = sameForAll;
    const usesPresenter = desks.includes("presenter");
    const pageNow = usesPresenter ? (page ?? run?.page ?? "scriptures") : undefined;
    const also = desks.filter((desk) => desk !== first);
    session.setPartDesk(section.id, first, pageNow, true, also);
    // Already the rule for this name: the rule follows the new choice.
    if (keep) session.learnPartDesk(section.name, { desk: first, ...(pageNow ? { page: pageNow } : {}), ...(also.length ? { also } : {}) } as PartRun);
  }

  /** Tick or untick a desk (at least one stays; untick the first and the next one opens first). */
  function toggle(desk: PartDesk) {
    if (!run) return;
    const on = chosen.includes(desk);
    if (on && chosen.length === 1) return;
    const desks = on ? chosen.filter((entry) => entry !== desk) : [...chosen, desk];
    const first = desks.includes(run.desk) ? run.desk : desks[0]!;
    save(first, desks);
  }

  function toggleSame(on: boolean) {
    if (!section || !run) return;
    session.learnPartDesk(section.name, on ? { desk: run.desk, ...(run.page ? { page: run.page } : {}), ...(run.also?.length ? { also: run.also } : {}) } : { desk: "service" });
  }
</script>

{#if section && run}
  <DeskDialog title={t("Where {part} runs", { part: section.name })} {onclose}>
    <div class="picker">
      <p class="lead">{t("Tick every desk this part uses. One opens when the part begins; the service strip goes between them.")}</p>
      <div class="desks" role="group" aria-label={t("Where it runs")}>
        {#each DESKS as option (option.desk)}
          <button type="button" role="checkbox" class="desk" aria-checked={chosen.includes(option.desk)} onclick={() => toggle(option.desk)}>
            <span class="tick" aria-hidden="true"><Icon name="check" size={12} /></span>
            <span class="desk-icon"><Icon name={option.icon} size={18} /></span>
            <strong>{t(option.name)}</strong>
            <em>{t(option.hint)}</em>
          </button>
        {/each}
      </div>

      {#if chosen.length > 1}
        <div class="row">
          <span class="row-name">{t("Opens first")}</span>
          <div class="seg" role="radiogroup" aria-label={t("Opens first")}>
            {#each DESKS.filter((option) => chosen.includes(option.desk)) as option (option.desk)}
              <button type="button" role="radio" aria-checked={run.desk === option.desk} onclick={() => save(option.desk, chosen)}><Icon name={option.icon} size={13} /> {t(option.name)}</button>
            {/each}
          </div>
        </div>
      {/if}
      {#if chosen.includes("presenter")}
        <div class="row">
          <span class="row-name">{t("Presenter page")}</span>
          <div class="seg" role="radiogroup" aria-label={t("Presenter page")}>
            {#each PAGES as option (option.page)}
              <button type="button" role="radio" aria-checked={(run.page ?? "scriptures") === option.page} onclick={() => save(run.desk, chosen, option.page)}><Icon name={option.icon} size={13} /> {t(option.name)}</button>
            {/each}
          </div>
        </div>
      {/if}

      {#if screens.length}
        <div class="screens">
          <span class="row-name">{t("Screens during this part")}</span>
          {#each screens as screen, index (screen.id)}
            {@const own = t(JOBS[screen.role])}
            <label class="screen-row">
              <span class="letter" class:locked={screen.locked}>{screenLetter(index)}</span>
              <span class="screen-name">{screen.name || t("Screen {letter}", { letter: screenLetter(index) })}</span>
              {#if screen.locked}
                <span class="kept"><Icon name="lock" size={12} /> {t("Locked: keeps {job}", { job: own })}</span>
              {:else}
                <select class="field" aria-label={t("Job for {name} during this part", { name: screen.name || screenLetter(index) })} value={section.screens?.[screen.id] ?? ""} onchange={(event) => session.setPartScreen(section.id, screen.id, (event.currentTarget.value || null) as ScreenRole | null)}>
                  <option value="">{t("Its own job ({job})", { job: own })}</option>
                  {#each SCREEN_ROLES as role (role.id)}<option value={role.id}>{t(JOBS[role.id])}</option>{/each}
                </select>
              {/if}
            </label>
          {/each}
        </div>
      {/if}

      <label class="same" class:dim={run.desk === "service" && !run.also?.length && !learned}>
        <span class="same-copy">
          <strong>{t("Same for every part called {part}", { part: section.name })}</strong>
          <em>{t("In this service, new services and templates. Your church's own word for it.")}</em>
        </span>
        <input type="checkbox" class="switch" role="switch" checked={sameForAll} disabled={run.desk === "service" && !run.also?.length && !learned} onchange={(event) => toggleSame(event.currentTarget.checked)} />
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
  .lead { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--muted); }
  .desk { position: relative; display: grid; align-content: start; gap: 6px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease; }
  .desk:hover { background: var(--field); }
  .desk[aria-checked="true"] { border-color: color-mix(in srgb, var(--accent) 70%, var(--line)); background: color-mix(in srgb, var(--accent) 10%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent); }
  .tick { position: absolute; top: 10px; right: 10px; display: grid; place-items: center; width: 18px; height: 18px; border: 1.5px solid var(--line); border-radius: 5px; color: transparent; }
  .desk[aria-checked="true"] .tick { border-color: var(--accent); background: var(--accent); color: #fff; }
  .desk-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: var(--field); color: var(--muted); }
  .desk[aria-checked="true"] .desk-icon { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent-text); }
  .desk strong { font-size: 13.5px; font-weight: 750; }
  .desk em { font-style: normal; font-size: 12px; line-height: 1.4; color: var(--muted); }
  .row { display: flex; align-items: center; gap: 12px; }
  .row-name { width: 96px; flex: none; font-size: 12px; font-weight: 700; color: var(--muted); white-space: nowrap; }
  .seg { flex: 1; display: flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; }
  .seg button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
  .seg button:hover { color: var(--ink); }
  .seg button[aria-checked="true"] { background: var(--field); color: var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / 0.25); }
  .screens { display: grid; gap: 6px; }
  .screen-row { display: flex; align-items: center; gap: 10px; }
  .letter { display: grid; place-items: center; width: 24px; height: 24px; flex: none; border-radius: 6px; background: var(--accent); color: var(--on-accent, #fff); font-size: 12px; font-weight: 800; }
  .letter.locked { background: var(--muted); }
  .screen-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 650; }
  .screen-row .field { width: 190px; flex: none; }
  .kept { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); }
  .same { display: flex; align-items: center; gap: 14px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; }
  .same.dim { opacity: 0.55; cursor: default; }
  .same-copy { flex: 1; display: grid; gap: 2px; min-width: 0; }
  .same-copy strong { font-size: 13px; font-weight: 700; }
  .same-copy em { font-style: normal; font-size: 12px; color: var(--muted); }
  .note { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 12px; color: var(--muted); }
  .done { height: 34px; padding: 0 18px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  @media (max-width: 560px) { .desks { grid-template-columns: 1fr; } }
</style>
