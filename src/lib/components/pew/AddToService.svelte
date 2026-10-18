<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { t, tn } from "../../i18n/core";
  import Icon from "../Icon.svelte";

  // "Add to service" that says where: the service (rename it right here, or switch to another)
  // and the part it goes into. One click on a part adds it; a note confirms with Undo.
  let {
    onadd,
    label = t("Add to service"),
    disabled = false,
    className = "desk-btn",
  }: { onadd: (sectionId: string) => void; label?: string; disabled?: boolean; className?: string } = $props();

  let open = $state(false);
  /** Opens upward when the button sits low on the screen. */
  let up = $state(false);

  function toggle() {
    if (!open && root) up = root.getBoundingClientRect().bottom > window.innerHeight * 0.55;
    open = !open;
  }
  let root = $state<HTMLDivElement | undefined>();
  let newPart = $state("");
  let newService = $state("");

  const service = $derived(session.service);
  const current = $derived(service?.sections.find((section) => section.id === session.cursor.sectionId) ?? null);
  const others = $derived(session.services.filter((entry) => entry.id !== service?.id).slice(0, 12));

  function add(sectionId: string) {
    onadd(sectionId);
    open = false;
  }

  function addToNewPart(event: SubmitEvent) {
    event.preventDefault();
    const name = newPart.trim();
    if (!name || !service) return;
    session.addSection(name);
    const made = session.service?.sections.at(-1);
    newPart = "";
    if (made) add(made.id);
  }

  async function startService(event: SubmitEvent) {
    event.preventDefault();
    await session.createService(newService.trim() || t("Sunday Service"));
    newService = "";
  }

  async function switchTo(id: string) {
    if (id === "__new") {
      await session.createService(t("Sunday Service"));
      return;
    }
    if (id) await session.openService(id);
  }

  function onWindowPointer(event: PointerEvent) {
    if (open && root && !root.contains(event.target as Node)) open = false;
  }
</script>

<svelte:window onpointerdown={onWindowPointer} onkeydown={(event) => { if (open && event.key === "Escape") { event.stopPropagation(); open = false; } }} />

<div class="ats" bind:this={root}>
  <button type="button" class={className} class:on={open} {disabled} aria-expanded={open} aria-haspopup="dialog" data-tip={open ? undefined : service ? t("Add to {service}", { service: service.name }) : t("Add to a service")} onclick={toggle}>
    <Icon name="queue" size={14} /> {label} <Icon name="chevron-down" size={12} />
  </button>
  {#if open}
    <div class="panel" class:up role="dialog" aria-label={t("Add to service")}>
      {#if service}
        <div class="svc">
          <span class="lbl">{t("Service")}</span>
          <div class="svc-row">
            <Icon name="list" size={14} />
            <input class="svc-name" aria-label={t("Service name")} value={service.name} onchange={(event) => session.renameService(event.currentTarget.value.trim() || service.name)} />
            <Icon name="pencil" size={12} />
          </div>
          <select class="switch" aria-label={t("Switch to another service")} value="" onchange={(event) => void switchTo(event.currentTarget.value)}>
              <option value="">{t("Switch service…")}</option>
              {#each others as entry (entry.id)}<option value={entry.id}>{entry.name}</option>{/each}
              <option value="__new">{t("New service")}</option>
            </select>
        </div>
        <span class="lbl">{t("Into part")}</span>
        <div class="parts">
          {#each service.sections as section (section.id)}
            <button type="button" class="part" class:here={current?.id === section.id} onclick={() => add(section.id)}>
              <strong>{section.name}</strong>
              <span>{tn(section.items.length, "{n} item", "{n} items")}{current?.id === section.id ? ` · ${t("selected")}` : ""}</span>
              <Icon name="plus" size={14} />
            </button>
          {:else}
            <p class="empty">{t("This service has no parts yet.")}</p>
          {/each}
        </div>
        <form class="newpart" onsubmit={addToNewPart}>
          <input aria-label={t("New part name")} placeholder={t("Or a new part, e.g. Worship")} bind:value={newPart} />
          <button type="submit" class="go" disabled={!newPart.trim()}>{t("Add")}</button>
        </form>
      {:else}
        <p class="empty">{t("There is no service open yet. Start one, and this goes into it.")}</p>
        <form class="newpart" onsubmit={startService}>
          <input aria-label={t("Service name")} placeholder={t("Sunday Service")} bind:value={newService} />
          <button type="submit" class="go">{t("Start a service")}</button>
        </form>
        {#if session.services.length}
          <select class="switch" aria-label={t("Open a service")} value="" onchange={(event) => void switchTo(event.currentTarget.value)}>
            <option value="">{t("Or open one…")}</option>
            {#each session.services as entry (entry.id)}<option value={entry.id}>{entry.name}</option>{/each}
          </select>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .ats { position: relative; display: inline-flex; }
  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 60;
    width: 320px;
    max-height: min(70vh, 520px);
    overflow: auto;
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    box-shadow: 0 18px 44px rgb(0 0 0 / 0.4);
  }
  .panel.up { top: auto; bottom: calc(100% + 6px); }
  .lbl { font-size: 11px; font-weight: 700; color: var(--muted); }
  .svc { display: grid; gap: 6px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
  .svc-row { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--muted); }
  .svc-row:focus-within { border-color: var(--accent); }
  .svc-name { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 14px; font-weight: 700; outline: none; }
  .switch { height: 30px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 12px; }
  .parts { display: grid; gap: 4px; }
  .part { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; column-gap: 8px; align-items: center; padding: 8px 10px; border: 1px solid transparent; border-radius: 8px; background: color-mix(in srgb, var(--field) 60%, transparent); color: var(--ink); font: inherit; text-align: left; }
  .part strong { font-size: 13px; }
  .part span { grid-row: 2; font-size: 11px; color: var(--muted); }
  .part :global(svg) { grid-row: 1 / 3; grid-column: 2; color: var(--muted); }
  .part:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .part:hover :global(svg) { color: var(--accent); }
  .part.here { border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); }
  .newpart { display: flex; gap: 6px; }
  .newpart input { flex: 1; min-width: 0; height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; }
  .go { flex: none; height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-size: 12px; font-weight: 700; }
  .go:disabled { opacity: 0.45; }
  .empty { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.45; }
</style>
