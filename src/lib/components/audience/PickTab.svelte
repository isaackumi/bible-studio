<script lang="ts">
  import { audienceRoom } from "../../app/rooms.svelte";
  import { t, tn } from "../../i18n/core";
  import Icon from "../Icon.svelte";

  // The random picker: someone (or a few) from the people in the room, on the screen with a
  // spinning reel; or everyone split into groups. Each spin picks someone new until all have had a
  // turn, unless picking twice is allowed.
  let mode = $state<"pick" | "groups">("pick");
  let count = $state(1);
  let groups = $state(4);
  let again = $state(false);

  const people = $derived(audienceRoom.roomPeople);
  /** Looking after names: the player being renamed (and the name typed), or the one Remove was pressed for once. */
  let renaming = $state<number | null>(null);
  let newName = $state("");
  let removing = $state<number | null>(null);

  async function saveName(n: number) {
    if (newName.trim() && (await audienceRoom.player(n, { name: newName }))) renaming = null;
  }
  function remove(n: number) {
    if (removing !== n) {
      removing = n;
      setTimeout(() => (removing = removing === n ? null : removing), 4000);
      return;
    }
    removing = null;
    void audienceRoom.player(n, { remove: true });
  }
  const left = $derived(people.filter((person) => !audienceRoom.picked.includes(person.n)).length);
</script>

<section class="pick">
  <p class="here"><strong>{tn(people.length, "{n} person here", "{n} people here")}</strong>{#if mode === "pick" && audienceRoom.picked.length && !again} · {tn(left, "{n} not picked yet", "{n} not picked yet")}{/if}</p>

  {#if people.length}
    <!-- A name not for the screen: the desk renames the player, or takes them out of the room. -->
    <details class="names">
      <summary>{t("Names")}</summary>
      <ul>
        {#each people as person (person.n)}
          <li>
            {#if renaming === person.n}
              <form onsubmit={(event) => { event.preventDefault(); void saveName(person.n); }}>
                <input bind:value={newName} maxlength="40" aria-label={t("New name for {name}", { name: person.name })} />
                <button type="submit" class="link">{t("Save")}</button>
                <button type="button" class="link" onclick={() => (renaming = null)}>{t("Cancel")}</button>
              </form>
            {:else}
              <span>{person.name}</span>
              <button type="button" class="link" onclick={() => { renaming = person.n; newName = person.name; }}>{t("Rename")}</button>
              <button type="button" class="link danger" onclick={() => remove(person.n)}>{removing === person.n ? t("Click again to remove") : t("Remove")}</button>
            {/if}
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  <div class="modes" role="radiogroup" aria-label={t("What to do")}>
    <button type="button" role="radio" aria-checked={mode === "pick"} class:on={mode === "pick"} onclick={() => (mode = "pick")}><strong>{t("Pick at random")}</strong><span>{t("A winner, a volunteer, who reads next")}</span></button>
    <button type="button" role="radio" aria-checked={mode === "groups"} class:on={mode === "groups"} onclick={() => (mode = "groups")}><strong>{t("Make groups")}</strong><span>{t("Everyone split up at random")}</span></button>
  </div>

  {#if mode === "pick"}
    <div class="row">
      <span>{t("How many")}</span>
      {#each [1, 2, 3, 5] as n (n)}<button type="button" class="chip" class:on={count === n} onclick={() => (count = n)}>{n}</button>{/each}
    </div>
    <label class="check"><input type="checkbox" bind:checked={again} /> {t("Someone can be picked more than once")}</label>
    <button type="button" class="btn accent big" data-tour="pick-go" disabled={!people.length} onclick={() => void audienceRoom.pick(count, again)}><Icon name="sparkles" size={15} /> {count > 1 ? t("Pick {n} people", { n: count }) : t("Pick someone")}</button>
    <p class="hint">{audienceRoom.follow ? t("The screen spins through everyone's names and lands on who is picked.") : t("The spin goes to Preview; press LIVE to show it.")}</p>
    {#if audienceRoom.pickHistory.length}
      <div class="history">
        <div class="history-head"><strong>{t("Picked")}</strong><button type="button" class="link" onclick={() => audienceRoom.resetPicks()}>{t("Start again")}</button></div>
        <ol>
          {#each audienceRoom.pickHistory as entry (entry.at)}
            <li>{entry.people.map((person) => person.name).join(", ")}<time>{new Date(entry.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></li>
          {/each}
        </ol>
      </div>
    {/if}
  {:else}
    <div class="row">
      <span>{t("Groups")}</span>
      {#each [2, 3, 4, 5, 6, 8] as n (n)}<button type="button" class="chip" class:on={groups === n} onclick={() => (groups = n)}>{n}</button>{/each}
    </div>
    <button type="button" class="btn accent big" disabled={people.length < 2} onclick={() => void audienceRoom.makeGroups(groups)}><Icon name="users" size={15} /> {audienceRoom.lastGroups ? t("Shuffle the groups again") : t("Make {n} groups", { n: groups })}</button>
    {#if people.length >= 2}<p class="hint">{t("About {n} in each group.", { n: Math.max(1, Math.round(people.length / Math.min(groups, people.length))) })}</p>{/if}
    {#if audienceRoom.lastGroups}
      <div class="groups">
        {#each audienceRoom.lastGroups as group, g (g)}
          <div><strong>{t("Group {n}", { n: g + 1 })}</strong><span>{group.map((person) => person.name).join(", ")}</span></div>
        {/each}
      </div>
    {/if}
  {/if}
  {#if !people.length}<p class="hint">{t("Nobody has joined yet. People join with the code on the screen.")}</p>{/if}
</section>

<style>
  .pick { display: grid; gap: 10px; }
  .here { margin: 0; color: var(--muted); font-size: 12.5px; }
  .names summary { cursor: pointer; color: var(--muted); font-size: 12.5px; font-weight: 650; }
  .names ul { display: grid; gap: 2px; max-height: 220px; overflow: auto; margin: 6px 0 0; padding: 0; list-style: none; }
  .names li, .names form { display: flex; align-items: center; gap: 8px; min-height: 28px; font-size: 12.5px; }
  .names li > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .names input { flex: 1; min-width: 0; height: 26px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--field); color: var(--ink); font: inherit; }
  .link.danger { color: #ff6b4a; }
  .here strong { color: var(--ink); }
  .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .modes button { display: grid; gap: 3px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: transparent; color: var(--muted); font: inherit; text-align: left; cursor: pointer; }
  .modes strong { color: var(--ink); font-size: 13px; }
  .modes span { font-size: 11.5px; line-height: 1.35; }
  .modes .on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .row > span { color: var(--muted); font-size: 12px; margin-right: 2px; }
  .chip { min-width: 32px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
  .chip.on { border-color: var(--accent); color: var(--ink); box-shadow: inset 0 0 0 1px var(--accent); }
  .check { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12.5px; cursor: pointer; }
  .big { justify-content: center; }
  .hint { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .history, .groups { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; }
  .history-head { display: flex; justify-content: space-between; align-items: baseline; }
  .history-head strong { font-size: 12.5px; }
  .link { padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  li { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
  time { flex: none; color: var(--muted); font-size: 11.5px; }
  .groups div { display: grid; gap: 1px; font-size: 12.5px; }
  .groups span { color: var(--muted); }
</style>
