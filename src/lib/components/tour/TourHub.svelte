<script lang="ts">
  import { fly } from "svelte/transition";
  import { session } from "../../app/session.svelte";
  import { TOUR_GROUPS, TOURS, tourStatus, type TourId } from "../../tour/steps";
  import Icon from "../Icon.svelte";
  import { t, tn } from "../../i18n/core";

  // Guided tours, grouped by desk: what is done, what is left, and a way back into any step.
  let open = $state<TourId | null>(null);
  let confirmReset = $state(false);

  const progress = $derived(session.workspace.tours);
  const all = $derived(TOUR_GROUPS.flatMap((group) => group.tours));
  const doneCount = $derived(all.filter((id) => progress[id].done).length);
  // Groups fold up: the first with a tour still to do starts open, the rest closed, so the list
  // stays short as tours are added.
  const firstToDo = TOUR_GROUPS.find((group) => group.tours.some((id) => !session.workspace.tours[id].done))?.name ?? TOUR_GROUPS[0]!.name;
  let openGroups = $state<Set<string>>(new Set([firstToDo]));
  const toggleGroup = (name: string) => {
    const next = new Set(openGroups);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    openGroups = next;
  };
  const doneIn = (tours: TourId[]) => tours.filter((id) => progress[id].done).length;

  function close() {
    session.tourHubOpen = false;
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<button type="button" class="hub-scrim" aria-label={t("Close tours")} tabindex="-1" onclick={close}></button>
<div class="hub" role="dialog" aria-modal="true" aria-labelledby="hub-title" transition:fly={{ y: -8, duration: 160 }}>
  <header>
    <div>
      <h2 id="hub-title">{t("Guided tours")}</h2>
      <p>{t("{doneCount} of {length} complete. Start any tour from any step.", { doneCount, length: all.length })}</p>
    </div>
    <button type="button" class="icon-btn" aria-label={t("Close")} onclick={close}><Icon name="close" size={16} /></button>
  </header>
  <div class="meter" aria-hidden="true"><i style:width="{(doneCount / all.length) * 100}%"></i></div>

  <div class="groups">
    {#each TOUR_GROUPS as group (group.name)}
      <section class:closed={!openGroups.has(group.name)}>
        <button type="button" class="group" aria-expanded={openGroups.has(group.name)} onclick={() => toggleGroup(group.name)}>
          <span>{t(group.name)}</span>
          <em>{doneIn(group.tours) === group.tours.length ? t("Done") : tn(group.tours.length, "{n} tour", "{n} tours") + (doneIn(group.tours) ? ` · ${t("{n} done", { n: doneIn(group.tours) })}` : "")}</em>
          <Icon name={openGroups.has(group.name) ? "chevron-up" : "chevron-down"} size={13} />
        </button>
        {#if openGroups.has(group.name)}
        {#each group.tours as id (id)}
          {@const tour = TOURS[id]}
          {@const status = tourStatus(progress, id)}
          {@const locked = id === "production" && !session.entitled("production")}
          <div class="tour" class:expanded={open === id}>
            <div class="tour-row">
              <button type="button" class="expand" aria-expanded={open === id} aria-label={open === id ? t("Hide steps of the {name} tour", { name: t(tour.name) }) : t("Show steps of the {name} tour", { name: t(tour.name) })} onclick={() => (open = open === id ? null : id)}>
                <span class="state {status.state}">
                  {#if status.state === "done"}<Icon name="check" size={13} />{:else}<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" /><circle class="arc" cx="10" cy="10" r="8" style:stroke-dasharray="{(status.seen / status.total) * 50.3} 50.3" /></svg>{/if}
                </span>
                <span class="name">
                  <strong>{t(tour.name)}</strong>
                  <em>{locked ? t("{label} · Premium", { label: status.label }) : status.label}</em>
                </span>
                <Icon name={open === id ? "chevron-up" : "chevron-down"} size={14} />
              </button>
              <button type="button" class="go" class:primary={status.state !== "done"} onclick={() => session.startTour(id, status.state === "partial" ? status.seen : 0)}>
                {status.state === "done" ? t("Restart") : status.state === "partial" ? t("Resume") : t("Start")}
              </button>
            </div>
            {#if open === id}
              <ol class="steps">
                {#each tour.steps as step, n (n)}
                  <li>
                    <button type="button" class:seen={progress[id].done || n <= progress[id].seen} onclick={() => session.startTour(id, n)} title={t("Start the tour here")}>
                      <span class="dot"></span>
                      <span class="step-title">{t(step.title)}</span>
                      <span class="here">{t("Start here")}</span>
                    </button>
                  </li>
                {/each}
              </ol>
            {/if}
          </div>
        {/each}
        {/if}
      </section>
    {/each}
  </div>

  <footer>
    {#if confirmReset}
      <span>{t("Mark every tour as not started?")}</span>
      <button type="button" class="link" onclick={() => (confirmReset = false)}>{t("Keep")}</button>
      <button type="button" class="link danger" onclick={() => { session.resetTours(); confirmReset = false; }}>{t("Reset")}</button>
    {:else}
      <button type="button" class="link" onclick={() => (confirmReset = true)}>{t("Reset progress")}</button>
    {/if}
  </footer>
</div>

<style>
  .hub-scrim { position: fixed; inset: 0; z-index: 78; padding: 0; border: 0; background: rgba(0, 0, 0, 0.35); cursor: default; }
  .hub {
    position: fixed;
    top: 56px;
    right: 16px;
    z-index: 79;
    display: flex;
    flex-direction: column;
    width: min(440px, calc(100vw - 32px));
    max-height: calc(100vh - 80px);
    border: 1px solid color-mix(in srgb, var(--ink) 14%, var(--line));
    border-radius: 14px;
    background: var(--panel);
    color: var(--ink);
    font-family: var(--font-ui);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }
  header { display: flex; align-items: flex-start; gap: 12px; padding: 16px 16px 10px; }
  header div { flex: 1; }
  h2 { margin: 0; font-size: 16px; font-weight: 750; }
  header p { margin: 3px 0 0; font-size: 12px; color: var(--muted); }
  .icon-btn { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 7px; background: none; color: var(--muted); cursor: pointer; }
  .icon-btn:hover { background: var(--field); color: var(--ink); }
  .meter { height: 4px; margin: 0 16px 6px; border-radius: 4px; background: color-mix(in srgb, var(--ink) 10%, transparent); overflow: hidden; }
  .meter i { display: block; height: 100%; border-radius: 4px; background: var(--presence, #3fb950); transition: width 240ms ease; }
  .groups { overflow: auto; padding: 4px 10px 8px; }
  .group { display: flex; align-items: center; gap: 8px; width: 100%; margin: 6px 0 4px; padding: 6px 6px; border: 0; border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 700; text-align: left; text-transform: none; letter-spacing: normal; cursor: pointer; }
  .group:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .group span { flex: 1; }
  .group em { font-style: normal; font-size: 11px; font-weight: 600; color: var(--muted); }
  section.closed .group { color: var(--muted); }
  .tour { border: 1px solid var(--line); border-radius: 10px; background: var(--field); margin-bottom: 6px; overflow: hidden; }
  .tour.expanded { border-color: color-mix(in srgb, var(--ink) 22%, var(--line)); }
  .tour-row { display: flex; align-items: center; gap: 6px; padding: 6px 8px 6px 6px; }
  .expand { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; padding: 4px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; text-align: left; text-transform: none; letter-spacing: normal; cursor: pointer; }
  .expand:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .name { flex: 1; display: grid; gap: 1px; min-width: 0; }
  .name strong { font-size: 13px; color: var(--ink); }
  .name em { font-style: normal; font-size: 11.5px; }
  .state { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 50%; }
  .state.done { background: color-mix(in srgb, var(--presence, #3fb950) 20%, transparent); color: var(--presence, #3fb950); }
  .state svg { width: 22px; height: 22px; transform: rotate(-90deg); }
  .state circle { fill: none; stroke: color-mix(in srgb, var(--ink) 16%, transparent); stroke-width: 2.5; }
  .state circle.arc { stroke: var(--accent); stroke-linecap: round; }
  .go { flex: none; height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; text-transform: none; letter-spacing: normal; cursor: pointer; }
  .go.primary { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
  .steps { list-style: none; margin: 0; padding: 2px 8px 8px 40px; display: grid; gap: 1px; }
  .steps button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 8px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: inherit; font-size: 12.5px; text-align: left; text-transform: none; letter-spacing: normal; cursor: pointer; }
  .steps button.seen { color: var(--ink); }
  .steps button:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--ink) 30%, transparent); }
  .seen .dot { border-color: var(--presence, #3fb950); background: var(--presence, #3fb950); }
  .step-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .here { flex: none; font-size: 11px; font-weight: 650; color: var(--accent); opacity: 0; }
  .steps button:hover .here, .steps button:focus-visible .here { opacity: 1; }
  footer { display: flex; align-items: center; gap: 10px; padding: 10px 16px 12px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
  footer span { margin-right: auto; }
  .link { padding: 0; border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; text-transform: none; letter-spacing: normal; cursor: pointer; }
  .link:hover { color: var(--ink); }
  .link.danger { color: var(--live); }
  :is(.expand, .go, .steps button, .link, .icon-btn):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
