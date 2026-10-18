<script lang="ts">
  import { session } from "../app/session.svelte";
  import Icon from "./Icon.svelte";

  const suggestions = ["Opening", "Worship", "Word", "Offering", "Announcements", "Closing"];
  let sectionName = $state("");
  let name = $state("Sunday Service");
  // Drag a part or an item by its handle; an item can go into any part. Alt+arrows move it too.
  let dragSection = $state<string | null>(null);
  let dragItem = $state<string | null>(null);
  let over = $state<string | null>(null);

  function end() {
    dragSection = null;
    dragItem = null;
    over = null;
  }

  function key(event: KeyboardEvent, move: (direction: 1 | -1) => void) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    move(event.key === "ArrowUp" ? -1 : 1);
  }
</script>

<div class="rundown">
  {#if session.service}
    <form
      class="section-head"
      onsubmit={(event) => {
        event.preventDefault();
        session.addSection(sectionName);
        sectionName = "";
      }}
    >
      <input class="field" placeholder="Add section" bind:value={sectionName} aria-label="Section name" />
      <button class="primary" type="submit">Add</button>
    </form>
    <div class="books" style="margin: 8px 0 12px">
      {#each suggestions as name}
        <button type="button" onclick={() => session.addSection(name)}>{name}</button>
      {/each}
    </div>
    {#each session.service.sections as section, sectionIndex (section.id)}
      <div
        class="section-block"
        role="group"
        aria-label={section.name}
        class:drop-on={over === `section:${section.id}`}
        ondragover={(event) => { if (dragSection || dragItem) { event.preventDefault(); over = `section:${section.id}`; } }}
        ondrop={(event) => {
          event.preventDefault();
          if (dragSection) session.moveSectionTo(dragSection, sectionIndex);
          else if (dragItem) session.moveItemTo(dragItem, section.id, section.items.length);
          end();
        }}
      >
        <div class="section-head">
          <button
            type="button"
            class="grip"
            draggable="true"
            aria-label="Move {section.name}: drag, or Alt+arrow keys"
            title="Drag to move"
            ondragstart={(event) => { dragSection = section.id; event.dataTransfer?.setData("text/plain", section.id); }}
            ondragend={end}
            onkeydown={(event) => key(event, (direction) => session.moveSection(section.id, direction))}
          ><Icon name="grip" size={14} /></button>
          <input
            class="field"
            value={section.name}
            aria-label="Rename section"
            onchange={(event) => session.renameSection(section.id, event.currentTarget.value)}
          />
          <button class="ghost del" type="button" onclick={() => session.removeSection(section.id)} aria-label="Remove section" title="Delete this part"><Icon name="trash" size={14} /></button>
        </div>
        {#each section.items as item, itemIndex (item.id)}
          <div
            class="item-row"
            role="listitem"
            class:selected={session.cursor.itemId === item.id}
            class:drop-on={over === `item:${item.id}`}
            ondragover={(event) => { if (dragItem) { event.preventDefault(); event.stopPropagation(); over = `item:${item.id}`; } }}
            ondrop={(event) => { event.preventDefault(); event.stopPropagation(); if (dragItem) session.moveItemTo(dragItem, section.id, itemIndex); end(); }}
          >
            <button
              type="button"
              class="grip"
              draggable="true"
              aria-label="Move {item.title}: drag, or Alt+arrow keys"
              title="Drag to move"
              ondragstart={(event) => { dragItem = item.id; event.dataTransfer?.setData("text/plain", item.id); }}
              ondragend={end}
              onkeydown={(event) => key(event, (direction) => session.moveItem(item.id, direction))}
            ><Icon name="grip" size={14} /></button>
            <span class="on-air-mark" class:live={session.live.program.sourceId === item.id || (item.kind === "composition" && (session.live.program.sourceId === item.composition?.compositionId || session.live.program.sourceId === `composition:${item.composition?.compositionId}`))}></span>
            <button type="button" class="text-button" onclick={(event) => { event.currentTarget.blur(); void session.selectItem(item.id); }}>
              <div>{item.title}</div>
              <div class="kind">{item.kind}</div>
            </button>
            <span class="row-actions">
              <button class="ghost del" type="button" onclick={() => session.removeItem(item.id)} aria-label="Remove {item.title}" title="Delete"><Icon name="trash" size={14} /></button>
            </span>
          </div>
        {/each}
      </div>
    {/each}
  {:else}
    <form
      class="create"
      onsubmit={(event) => {
        event.preventDefault();
        void session.createService(name);
      }}
    >
      <p class="hint">Service</p>
      <h1>Name this service</h1>
      <input class="field" bind:value={name} aria-label="New service name" />
      <button class="primary" type="submit">Create service</button>
    </form>
  {/if}
</div>

<style>
  .grip { flex: none; display: grid; place-items: center; width: 22px; height: 26px; border: 0; background: none; color: var(--muted); cursor: grab; }
  .grip:hover { color: var(--ink); }
  .drop-on { box-shadow: 0 -2px 0 var(--accent); }
</style>
