<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { clockLabel, LENGTH_PRESETS, lengthLabel, planSchedule } from "../../domain/schedule";
  import type { ServiceTemplate, TemplatePart } from "../../domain/service-templates";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Icon from "../Icon.svelte";

  // Service templates: the usual parts of a service with their times. Edit them here; a new
  // service starts from one in a click and keeps its own copy to change that week.
  let { initialId = null, onclose }: { initialId?: string | null; onclose: () => void } = $props();

  const templates = $derived(session.workspace.serviceTemplates);
  let selectedId = $state<string | null>(untrack(() => initialId ?? session.workspace.serviceTemplates[0]?.id ?? null));
  const selected = $derived(templates.find((entry) => entry.id === selectedId) ?? null);
  const plan = $derived(
    selected
      ? planSchedule({ startTime: selected.startTime, sections: selected.parts.map((part, index) => ({ ...part, id: String(index), items: [] })) })
      : null,
  );
  let armed = $state<string | null>(null);

  function save(change: Partial<ServiceTemplate>) {
    if (!selected) return;
    session.updateTemplate({ ...selected, ...change });
  }

  function setPart(index: number, part: TemplatePart) {
    if (!selected) return;
    save({ parts: selected.parts.map((entry, n) => (n === index ? part : entry)) });
  }

  function movePart(index: number, step: number) {
    if (!selected) return;
    const to = index + step;
    if (to < 0 || to >= selected.parts.length) return;
    const parts = [...selected.parts];
    const [part] = parts.splice(index, 1);
    parts.splice(to, 0, part!);
    save({ parts });
  }

  function remove(id: string) {
    if (armed !== id) {
      armed = id;
      return;
    }
    armed = null;
    session.removeTemplate(id);
    selectedId = session.workspace.serviceTemplates[0]?.id ?? null;
  }

  async function start() {
    if (!selected) return;
    await session.createServiceFromTemplate(selected.id);
    onclose();
  }

  const TONES = ["#5aa0d6", "#b07cc6", "#e0884e", "#58b3a4", "#d9677a", "#c9a35b", "#7d8fe0", "#7fa36b"];
</script>

<DeskDialog title="Service templates" wide {onclose}>
  <div class="tpl">
    <nav class="list" aria-label="Templates">
      {#each templates as template (template.id)}
        <button type="button" class="pick" class:on={template.id === selectedId} onclick={() => (selectedId = template.id)}>
          <strong>{template.name}</strong>
          <span>{template.parts.length} parts · starts {clockLabel(planSchedule({ startTime: template.startTime, sections: [] }).start)}</span>
        </button>
      {:else}
        <p class="empty">No templates yet.</p>
      {/each}
      <button type="button" class="add" onclick={() => (selectedId = session.addTemplate().id)}><Icon name="plus" size={14} /> New template</button>
      {#if session.service}
        <button type="button" class="add" title="Its parts and times, not this week's songs" onclick={() => { const made = session.saveServiceAsTemplate(session.service?.name ?? "Service"); if (made) selectedId = made.id; }}><Icon name="copy" size={14} /> From this service</button>
      {/if}
    </nav>

    {#if selected && plan}
      <section class="edit">
        <div class="head">
          <input class="name" aria-label="Template name" value={selected.name} onchange={(event) => save({ name: event.currentTarget.value.trim() || selected.name })} />
          <label class="start">
            <span>Starts</span>
            <input type="time" aria-label="Starts at" value={selected.startTime} onchange={(event) => event.currentTarget.value && save({ startTime: event.currentTarget.value })} />
          </label>
        </div>

        <div class="strip" aria-hidden="true">
          {#each plan.slots as slot, index (index)}
            {#if slot.minutes > 0}<span style:flex-grow={slot.minutes} style:--tone={TONES[index % TONES.length]} title="{slot.name} {clockLabel(slot.start)}">{slot.name}</span>{/if}
          {/each}
        </div>
        <p class="sum">{clockLabel(plan.start)} – {clockLabel(plan.end)} · {lengthLabel(plan.end - plan.start)}</p>

        <ol class="parts">
          {#each selected.parts as part, index (index)}
            {@const slot = plan.slots[index]!}
            <li class="part" style:--tone={TONES[index % TONES.length]}>
              <span class="when">{clockLabel(slot.start)}</span>
              <input class="part-name" aria-label="Part name" value={part.name} onchange={(event) => setPart(index, { ...part, name: event.currentTarget.value.trim() || part.name })} />
              <select
                aria-label="How long"
                value={part.until ? "until" : part.minutes === undefined ? "none" : LENGTH_PRESETS.includes(part.minutes) ? String(part.minutes) : "custom"}
                onchange={(event) => {
                  const value = event.currentTarget.value;
                  if (value === "until") setPart(index, { name: part.name, until: "11:00" });
                  else if (value === "none") setPart(index, { name: part.name });
                  else if (value === "custom") setPart(index, { name: part.name, minutes: part.minutes ?? 25 });
                  else setPart(index, { name: part.name, minutes: Number(value) });
                }}
              >
                {#each LENGTH_PRESETS as minutes (minutes)}<option value={String(minutes)}>{lengthLabel(minutes)}</option>{/each}
                <option value="custom">Other length…</option>
                <option value="until">Until a time…</option>
                <option value="none">No time</option>
              </select>
              {#if part.until}
                <input type="time" class="small" aria-label="Until" value={part.until} onchange={(event) => event.currentTarget.value && setPart(index, { name: part.name, until: event.currentTarget.value })} />
              {:else if part.minutes !== undefined && !LENGTH_PRESETS.includes(part.minutes)}
                <input type="number" class="small" min="0" max="600" aria-label="Minutes" value={part.minutes} onchange={(event) => setPart(index, { name: part.name, minutes: Number(event.currentTarget.value) || 0 })} />
              {/if}
              <span class="tools">
                <button type="button" aria-label="Move {part.name} up" disabled={index === 0} onclick={() => movePart(index, -1)}><Icon name="chevron-up" size={13} /></button>
                <button type="button" aria-label="Move {part.name} down" disabled={index === selected.parts.length - 1} onclick={() => movePart(index, 1)}><Icon name="chevron-down" size={13} /></button>
                <button type="button" aria-label="Remove {part.name}" onclick={() => save({ parts: selected.parts.filter((_, n) => n !== index) })}><Icon name="close" size={13} /></button>
              </span>
            </li>
          {/each}
        </ol>
        <div class="row-add">
          <button type="button" class="ghost" onclick={() => save({ parts: [...selected.parts, { name: "New part", minutes: 15 }] })}><Icon name="plus" size={13} /> Add a part</button>
          {#each ["Welcome", "Prayer", "Worship", "Bible reading", "Preaching", "Offering", "Announcements", "Benediction"].filter((name) => !selected.parts.some((part) => part.name === name)).slice(0, 5) as name (name)}
            <button type="button" class="chip" onclick={() => save({ parts: [...selected.parts, { name, minutes: 10 }] })}>{name}</button>
          {/each}
        </div>
      </section>
    {/if}
  </div>

  {#snippet footer()}
    {#if selected}
      <button type="button" class="btn danger" onclick={() => remove(selected.id)}>{armed === selected.id ? "Delete? Click again" : "Delete template"}</button>
      <span class="grow"></span>
      <button type="button" class="btn" onclick={onclose}>Close</button>
      <button type="button" class="btn primary" onclick={() => void start()}>Start a service from this</button>
    {/if}
  {/snippet}
</DeskDialog>

<style>
  .tpl { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; min-height: min(60vh, 560px); }
  .list { display: flex; flex-direction: column; gap: 4px; padding-right: 12px; border-right: 1px solid var(--line); }
  .pick { display: grid; gap: 2px; padding: 9px 10px; border: 0; border-radius: 8px; background: none; color: var(--ink); font: inherit; text-align: left; }
  .pick strong { font-size: 13px; }
  .pick span { font-size: 11px; color: var(--muted); }
  .pick.on { background: var(--field); }
  .add { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 1px dashed var(--line); border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; margin-top: 4px; }
  .empty { margin: 4px; font-size: 12px; color: var(--muted); }
  .edit { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .head { display: flex; align-items: center; gap: 12px; }
  .name { flex: 1; min-width: 0; height: 38px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 18px; font-weight: 750; }
  .name:hover, .name:focus { border-color: var(--line); background: var(--field); }
  .start { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .start input, .small { height: 32px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 700; }
  .small { flex: none; width: 110px; }
  .strip { display: flex; gap: 2px; height: 26px; }
  .strip span { flex-basis: 0; min-width: 4px; padding: 0 6px; border-radius: 5px; background: color-mix(in srgb, var(--tone) 32%, var(--field)); box-shadow: inset 0 -2px 0 var(--tone); font-size: 11px; font-weight: 650; line-height: 26px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sum { margin: -4px 0 0; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .parts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; overflow: auto; max-height: 40vh; }
  .part { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--line); border-left: 3px solid var(--tone); border-radius: 8px; background: color-mix(in srgb, var(--field) 50%, transparent); }
  .when { width: 70px; flex: none; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .part-name { flex: 1; min-width: 0; height: 30px; padding: 0 8px; border: 1px solid transparent; border-radius: 6px; background: none; color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; }
  .part-name:hover, .part-name:focus { border-color: var(--line); background: var(--field); }
  .part select { flex: none; width: 150px; height: 30px; padding: 0 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; }
  .tools { display: inline-flex; gap: 2px; }
  .tools button { width: 26px; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--muted); display: grid; place-items: center; }
  .tools button:disabled { opacity: 0.3; }
  .tools button:hover:not(:disabled) { color: var(--ink); background: var(--field); }
  .row-add { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .ghost { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border: 1px dashed var(--line); border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; }
  .chip { height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 13px; background: none; color: var(--ink); font: inherit; font-size: 12px; }
  .grow { flex: 1; }
  .btn { height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.danger { color: var(--danger, #e5484d); background: none; }
  @media (max-width: 720px) {
    .tpl { grid-template-columns: 1fr; }
    .list { border-right: 0; padding-right: 0; }
  }
</style>
