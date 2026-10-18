<script lang="ts">
  import { untrack } from "svelte";
  import { session } from "../app/session.svelte";
  import { describeStep, STEP_KINDS, type Macro, type MacroStep } from "../domain/macros";
  import DeskDialog from "./sources/DeskDialog.svelte";
  import Icon from "./Icon.svelte";

  // Macros: a button for a run of steps (fade the music, begin the part, show its first item).
  // Build them here; run them from the Service page or here.
  let { onclose }: { onclose: () => void } = $props();

  const macros = $derived(session.workspace.macros);
  let selectedId = $state<string | null>(untrack(() => session.workspace.macros[0]?.id ?? null));
  const selected = $derived(macros.find((entry) => entry.id === selectedId) ?? null);
  let adding = $state(false);
  let armed = $state<string | null>(null);
  let dragFrom = $state<number | null>(null);
  let dragOver = $state<number | null>(null);

  const playlistName = (id: string) => session.workspace.playlists.find((list) => list.id === id)?.name ?? "a playlist";

  function save(change: Partial<Macro>) {
    if (!selected) return;
    session.saveMacros(macros.map((entry) => (entry.id === selected.id ? { ...entry, ...change } : entry)));
  }

  function setStep(index: number, step: MacroStep) {
    if (!selected) return;
    save({ steps: selected.steps.map((entry, n) => (n === index ? step : entry)) });
  }

  function moveStep(from: number, to: number) {
    if (!selected || from === to || to < 0 || to >= selected.steps.length) return;
    const steps = [...selected.steps];
    const [step] = steps.splice(from, 1);
    steps.splice(to, 0, step!);
    save({ steps });
  }

  function newMacro() {
    const macro: Macro = { id: crypto.randomUUID(), name: "New macro", steps: [] };
    session.saveMacros([...macros, macro]);
    selectedId = macro.id;
  }

  function remove(id: string) {
    if (armed !== id) {
      armed = id;
      return;
    }
    armed = null;
    session.saveMacros(macros.filter((entry) => entry.id !== id));
    selectedId = session.workspace.macros[0]?.id ?? null;
  }
</script>

<DeskDialog title="Macros" wide {onclose}>
  <div class="macros">
    <nav class="list" aria-label="Macros">
      {#each macros as macro (macro.id)}
        <button type="button" class="pick" class:on={macro.id === selectedId} onclick={() => (selectedId = macro.id)}>
          <strong>{macro.name}</strong>
          <span>{macro.steps.length} step{macro.steps.length === 1 ? "" : "s"}</span>
        </button>
      {/each}
      <button type="button" class="add" onclick={newMacro}><Icon name="plus" size={14} /> New macro</button>
    </nav>

    {#if selected}
      <section class="edit">
        <input class="name" aria-label="Macro name" value={selected.name} onchange={(event) => save({ name: event.currentTarget.value.trim() || selected.name })} />
        <ol class="steps">
          {#each selected.steps as step, index (index)}
            <li
              class="step"
              class:running={session.runningMacro?.id === selected.id && session.runningMacro.step === index}
              class:dragging={dragFrom === index}
              class:over={dragOver === index && dragFrom !== index}
              ondragover={(event) => { if (dragFrom !== null) { event.preventDefault(); dragOver = index; } }}
              ondrop={(event) => { event.preventDefault(); if (dragFrom !== null) moveStep(dragFrom, index); dragFrom = null; dragOver = null; }}
            >
              <button
                type="button"
                class="grip"
                draggable="true"
                aria-label="Move step {index + 1}: drag, or Alt+arrow keys"
                title="Drag to move"
                ondragstart={(event) => { dragFrom = index; event.dataTransfer?.setData("text/plain", String(index)); }}
                ondragend={() => { dragFrom = null; dragOver = null; }}
                onkeydown={(event) => { if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); moveStep(index, index + (event.key === "ArrowUp" ? -1 : 1)); } }}
              ><Icon name="grip" size={14} /></button>
              <span class="n">{index + 1}</span>
              <span class="what">{describeStep(step, { playlist: playlistName })}</span>
              <span class="opts">
                {#if step.kind === "fade-music" || step.kind === "wait"}
                  <input type="number" min="0" max="60" step="0.5" aria-label="Seconds" value={step.seconds} onchange={(event) => setStep(index, { ...step, seconds: Number(event.currentTarget.value) || 0 })} />
                  <span class="unit">s</span>
                {:else if step.kind === "play-playlist"}
                  <select aria-label="Playlist" value={step.playlistId} onchange={(event) => setStep(index, { kind: "play-playlist", playlistId: event.currentTarget.value })}>
                    {#each session.workspace.playlists as list (list.id)}<option value={list.id}>{list.name}</option>{/each}
                  </select>
                {:else if step.kind === "program"}
                  <select aria-label="Screen" value={step.action} onchange={(event) => setStep(index, { kind: "program", action: event.currentTarget.value as typeof step.action })}>
                    <option value="take">Go live</option><option value="clear-words">Clear words</option><option value="clear">Clear</option><option value="black">Black</option><option value="logo">Logo</option>
                  </select>
                {:else if step.kind === "show-item"}
                  <select aria-label="Which item" value={step.which} onchange={(event) => setStep(index, { ...step, which: event.currentTarget.value === "next" ? "next" : "first-of-part" })}>
                    <option value="first-of-part">First item of the part</option><option value="next">Next item</option>
                  </select>
                  <label class="check"><input type="checkbox" checked={step.live} onchange={(event) => setStep(index, { ...step, live: event.currentTarget.checked })} /> On the screen</label>
                {:else if step.kind === "start-part"}
                  <select aria-label="Which part" value={step.which} onchange={(event) => setStep(index, { kind: "start-part", which: event.currentTarget.value === "first" ? "first" : "next" })}>
                    <option value="next">The next part</option><option value="first">The first part</option>
                  </select>
                {:else if step.kind === "countdown"}
                  <select aria-label="Countdown" value={step.mode} onchange={(event) => setStep(index, { kind: "countdown", mode: event.currentTarget.value as typeof step.mode })}>
                    <option value="overlay-on">On the screen</option><option value="overlay-off">Off</option><option value="full">Full screen on Preview</option>
                  </select>
                {:else if step.kind === "captions"}
                  <select aria-label="Captions" value={step.on ? "on" : "off"} onchange={(event) => setStep(index, { kind: "captions", on: event.currentTarget.value === "on" })}>
                    <option value="on">On</option><option value="off">Off</option>
                  </select>
                {:else if step.kind === "stage-message"}
                  <input class="text" aria-label="Stage message" maxlength="140" placeholder="Empty clears it" value={step.text} onchange={(event) => setStep(index, { kind: "stage-message", text: event.currentTarget.value })} />
                {/if}
              </span>
              <button type="button" class="del" aria-label="Delete step {index + 1}" title="Delete this step" onclick={() => save({ steps: selected.steps.filter((_, n) => n !== index) })}><Icon name="trash" size={14} /></button>
            </li>
          {:else}
            <li class="empty">No steps yet. Add the first one below.</li>
          {/each}
        </ol>
        <div class="adder">
          <button type="button" class="ghost" aria-expanded={adding} onclick={() => (adding = !adding)}><Icon name="plus" size={13} /> Add a step</button>
          {#if adding}
            <div class="kinds">
              {#each STEP_KINDS as entry (entry.kind)}
                <button type="button" class="chip" onclick={() => { save({ steps: [...selected.steps, entry.make()] }); adding = false; }}>{entry.label}</button>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    {/if}
  </div>

  {#snippet footer()}
    {#if selected}
      <button type="button" class="btn danger" onclick={() => remove(selected.id)}>{armed === selected.id ? "Delete? Click again" : "Delete macro"}</button>
      <span class="grow"></span>
      <button type="button" class="btn" onclick={onclose}>Close</button>
      <button type="button" class="btn primary" disabled={!!session.runningMacro || !selected.steps.length} onclick={() => void session.runMacro(selected.id)}><Icon name="play" size={13} /> Run now</button>
    {/if}
  {/snippet}
</DeskDialog>

<style>
  .macros { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 16px; min-height: min(56vh, 520px); }
  .list { display: flex; flex-direction: column; gap: 4px; padding-right: 12px; border-right: 1px solid var(--line); }
  .pick { display: grid; gap: 2px; padding: 9px 10px; border: 0; border-radius: 8px; background: none; color: var(--ink); font: inherit; text-align: left; }
  .pick strong { font-size: 13px; }
  .pick span { font-size: 11px; color: var(--muted); }
  .pick.on { background: var(--field); }
  .add { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; margin-top: 4px; border: 1px dashed var(--line); border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; }
  .edit { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .name { height: 38px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 18px; font-weight: 750; }
  .name:hover, .name:focus { border-color: var(--line); background: var(--field); }
  .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
  .step { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 4px 6px; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--field) 50%, transparent); }
  .step.running { border-color: #30a46c; background: color-mix(in srgb, #30a46c 12%, var(--field)); }
  .step.dragging { opacity: 0.4; }
  .step.over { border-color: var(--accent); box-shadow: 0 -2px 0 var(--accent); }
  .grip { flex: none; width: 22px; height: 30px; border: 0; border-radius: 6px; background: none; color: var(--muted); display: grid; place-items: center; cursor: grab; }
  .n { width: 18px; flex: none; text-align: right; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .what { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; }
  .opts { display: inline-flex; align-items: center; gap: 6px; flex: none; }
  .opts select, .opts input { height: 30px; padding: 0 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; }
  .opts input[type="number"] { width: 64px; }
  .opts .text { width: 200px; }
  .unit { font-size: 12px; color: var(--muted); }
  .check { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; white-space: nowrap; }
  .del { flex: none; width: 30px; height: 30px; border: 0; border-radius: 7px; background: none; color: var(--muted); display: grid; place-items: center; }
  .del:hover { color: var(--danger, #e5484d); background: color-mix(in srgb, var(--danger, #e5484d) 12%, transparent); }
  .empty { padding: 14px; border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); font-size: 13px; }
  .adder { display: grid; gap: 8px; }
  .ghost { justify-self: start; display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 12px; border: 1px dashed var(--line); border-radius: 8px; background: none; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; }
  .kinds { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { height: 28px; padding: 0 11px; border: 1px solid var(--line); border-radius: 14px; background: none; color: var(--ink); font: inherit; font-size: 12px; }
  .chip:hover { background: var(--field); }
  .grow { flex: 1; }
  .btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.primary:disabled { opacity: 0.5; }
  .btn.danger { color: var(--danger, #e5484d); background: none; }
  @media (max-width: 760px) {
    .macros { grid-template-columns: 1fr; }
    .list { border-right: 0; padding-right: 0; }
  }
</style>
