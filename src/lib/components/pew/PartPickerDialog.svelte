<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { t, tn } from "../../i18n/core";
  import Icon from "../Icon.svelte";
  import DeskDialog from "../sources/DeskDialog.svelte";

  // "Add to service" from anywhere: which service, and which part of it. Nothing is added until a
  // part is chosen, and a thing already in the service says where, so nothing goes in twice by mistake.

  const asked = $derived(session.partPicker);
  const service = $derived(session.service);
  const others = $derived(session.services.filter((entry) => entry.id !== service?.id).slice(0, 20));
  let newPart = $state("");
  let newService = $state("");

  const plain = (text: string) => text.trim().toLowerCase();
  /** Parts that already hold something with this title. */
  const holding = $derived(asked && service ? service.sections.filter((section) => section.items.some((item) => plain(item.title) === plain(asked.title))) : []);
  const preferred = $derived(service?.sections.find((section) => section.id === session.cursor.sectionId)?.id ?? service?.sections.at(-1)?.id ?? null);

  function choose(sectionId: string) {
    session.answerPartPicker(sectionId);
    newPart = "";
  }

  function cancel() {
    session.answerPartPicker(null);
    newPart = "";
  }

  function addPart(event: SubmitEvent) {
    event.preventDefault();
    const name = newPart.trim();
    if (!name || !service) return;
    session.addSection(name);
    const made = session.service?.sections.at(-1);
    if (made) choose(made.id);
  }

  async function startService(event: SubmitEvent) {
    event.preventDefault();
    await session.createService(newService.trim() || t("Sunday Service"));
    newService = "";
  }

  async function switchTo(id: string) {
    if (id === "__new") await session.createService(t("Sunday Service"));
    else if (id) await session.openService(id);
  }

  function partKey(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("button.part")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }
</script>

{#if asked}
  <DeskDialog title={t("Add to service")} onclose={cancel}>
    <div class="picker">
      <p class="what"><Icon name="queue" size={14} /> <strong>{asked.title}</strong></p>

      {#if service}
        <div class="svc">
          <span class="lbl">{t("Service")}</span>
          <div class="svc-row">
            <Icon name="list" size={14} />
            <strong>{service.name}</strong>
            <select aria-label={t("Switch to another service")} value="" onchange={(event) => void switchTo(event.currentTarget.value)}>
              <option value="">{t("Switch service…")}</option>
              {#each others as entry (entry.id)}<option value={entry.id}>{entry.name}</option>{/each}
              <option value="__new">{t("New service")}</option>
            </select>
          </div>
        </div>

        {#if holding.length}
          <p class="warn" role="status"><Icon name="alerts" size={13} /> {t("Already in {part}. Choose a part to add it again.", { part: holding.map((section) => section.name).join(", ") })}</p>
        {/if}

        <span class="lbl">{t("Which part?")}</span>
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="parts" role="group" aria-label={t("Parts of the service")} onkeydown={partKey}>
          {#each service.sections as section, n (section.id)}
            <!-- svelte-ignore a11y_autofocus -->
            <button type="button" class="part" class:here={section.id === preferred} autofocus={section.id === preferred} onclick={() => choose(section.id)}>
              <i>{n + 1}</i>
              <span class="part-copy">
                <strong>{section.name}</strong>
                <span>{tn(section.items.length, "{n} item", "{n} items")}{section.id === session.cursor.sectionId ? ` · ${t("selected")}` : ""}</span>
              </span>
              {#if holding.some((entry) => entry.id === section.id)}<em class="tag">{t("Already here")}</em>{/if}
              <Icon name="plus" size={15} />
            </button>
          {:else}
            <p class="empty">{t("This service has no parts yet. Name the first one below.")}</p>
          {/each}
        </div>

        <form class="newpart" onsubmit={addPart}>
          <input aria-label={t("New part name")} placeholder={t("Or a new part, e.g. Worship")} bind:value={newPart} />
          <button type="submit" class="go" disabled={!newPart.trim()}>{t("Add to new part")}</button>
        </form>
      {:else}
        <p class="empty">{t("There is no service open yet. Start one, and this goes into it.")}</p>
        <form class="newpart" onsubmit={startService}>
          <!-- svelte-ignore a11y_autofocus -->
          <input aria-label={t("Service name")} placeholder={t("Sunday Service")} bind:value={newService} autofocus />
          <button type="submit" class="go">{t("Start a service")}</button>
        </form>
        {#if session.services.length}
          <select class="open" aria-label={t("Open a service")} value="" onchange={(event) => void switchTo(event.currentTarget.value)}>
            <option value="">{t("Or open one…")}</option>
            {#each session.services as entry (entry.id)}<option value={entry.id}>{entry.name}</option>{/each}
          </select>
        {/if}
      {/if}
    </div>
    {#snippet footer()}
      <button type="button" class="desk-btn ghost" onclick={cancel}>{t("Cancel")}</button>
    {/snippet}
  </DeskDialog>
{/if}

<style>
  .picker { display: grid; gap: 12px; min-width: min(420px, 100%); }
  .what { display: flex; align-items: center; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--accent) 10%, var(--field)); color: var(--accent); }
  .what strong { color: var(--ink); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lbl { font-size: 11px; font-weight: 700; color: var(--muted); }
  .svc { display: grid; gap: 6px; }
  .svc-row { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 6px 0 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--muted); }
  .svc-row strong { flex: 1; min-width: 0; color: var(--ink); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  select { height: 28px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--ink); font: inherit; font-size: 12px; }
  .open { height: 32px; }
  .warn { display: flex; align-items: center; gap: 6px; margin: 0; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, #f5a524 14%, var(--field)); color: var(--ink); font-size: 12px; }
  .warn :global(svg) { color: #f5a524; flex: none; }
  .parts { display: grid; gap: 4px; max-height: min(46vh, 380px); overflow: auto; }
  .part { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .part i { display: grid; place-items: center; width: 22px; height: 22px; flex: none; border-radius: 6px; background: var(--panel); font-style: normal; font-size: 11px; font-weight: 750; }
  .part-copy { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .part-copy strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .part-copy span { font-size: 11px; color: var(--muted); }
  .part :global(svg) { flex: none; color: var(--muted); }
  .part:hover, .part:focus-visible { border-color: var(--accent); outline: none; background: color-mix(in srgb, var(--accent) 8%, var(--field)); }
  .part:hover :global(svg), .part:focus-visible :global(svg) { color: var(--accent); }
  .part.here { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .tag { flex: none; padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, #f5a524 18%, transparent); color: #f5a524; font-size: 10px; font-style: normal; font-weight: 750; }
  .newpart { display: flex; gap: 6px; }
  .newpart input { flex: 1; min-width: 0; height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; }
  .go { flex: none; height: 34px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  .go:disabled { opacity: 0.45; cursor: default; }
  .empty { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.45; }
</style>
