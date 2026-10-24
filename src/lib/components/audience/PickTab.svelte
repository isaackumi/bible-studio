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
  const left = $derived(people.filter((person) => !audienceRoom.picked.includes(person.n)).length);
</script>

<section class="pick">
  <p class="here"><strong>{tn(people.length, "{n} person here", "{n} people here")}</strong>{#if mode === "pick" && audienceRoom.picked.length && !again} · {tn(left, "{n} not picked yet", "{n} not picked yet")}{/if}</p>

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
    <button type="button" class="btn accent big" disabled={!people.length} onclick={() => void audienceRoom.pick(count, again)}><Icon name="sparkles" size={15} /> {count > 1 ? t("Pick {n} people", { n: count }) : t("Pick someone")}</button>
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
