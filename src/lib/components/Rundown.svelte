<script lang="ts">
  import { session } from "../app/session.svelte";

  const suggestions = ["Opening", "Worship", "Word", "Offering", "Announcements", "Closing"];
  let sectionName = $state("");
  let name = $state("Sunday Service");
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
    {#each session.service.sections as section (section.id)}
      <div class="section-block">
        <div class="section-head">
          <input
            class="field"
            value={section.name}
            aria-label="Rename section"
            onchange={(event) => session.renameSection(section.id, event.currentTarget.value)}
          />
          <button class="ghost" type="button" onclick={() => session.moveSection(section.id, -1)} aria-label="Move section up">↑</button>
          <button class="ghost" type="button" onclick={() => session.moveSection(section.id, 1)} aria-label="Move section down">↓</button>
          <button class="ghost" type="button" onclick={() => session.removeSection(section.id)} aria-label="Remove section">✕</button>
        </div>
        {#each section.items as item (item.id)}
          <div class="item-row" class:selected={session.cursor.itemId === item.id}>
            <span class="on-air-mark" class:live={session.live.program.sourceId === item.id || (item.kind === "composition" && (session.live.program.sourceId === item.composition?.compositionId || session.live.program.sourceId === `composition:${item.composition?.compositionId}`))}></span>
            <button type="button" class="text-button" onclick={(event) => { event.currentTarget.blur(); void session.selectItem(item.id); }}>
              <div>{item.title}</div>
              <div class="kind">{item.kind}</div>
            </button>
            <span class="row-actions">
              <button class="ghost" type="button" onclick={() => session.moveItem(item.id, -1)} aria-label="Move item up">↑</button>
              <button class="ghost" type="button" onclick={() => session.moveItem(item.id, 1)} aria-label="Move item down">↓</button>
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
