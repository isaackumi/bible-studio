<script lang="ts">
  import { audienceRoom } from "../../app/rooms.svelte";
  import { session } from "../../app/session.svelte";
  import { MOST_TEAMS, TEAMS } from "../../domain/game-colors";
  import { questionsAsText, ready, type Game } from "../../domain/games";
  import { MUSIC_STYLE_INFO, type MusicStyle } from "../../game/music-styles";
  import { t, tn } from "../../i18n/core";
  import Icon from "../Icon.svelte";
  import ChoiceMark from "./ChoiceMark.svelte";

  // One quiz or poll, read in full before it is played: every question, its answers, and (in a
  // quiz) the right one. Play, change it, copy it out as text, or delete it from here.
  let {
    game,
    builtIn = false,
    played = null,
    onplay,
    onedit,
    oncopy,
    ondelete,
    onback,
  }: { game: Game; builtIn?: boolean; played?: { times: number; when: string } | null; onplay: () => void; onedit: () => void; oncopy: () => void; ondelete?: () => void; onback: () => void } = $props();

  const title = $derived(builtIn ? t(game.title) : game.title);
  const description = $derived(builtIn && game.description ? t(game.description) : game.description);
  const quiz = $derived(game.kind === "quiz");
  const notReady = $derived(game.questions.filter((question) => !ready(question, game.kind)).length);
  const pool = $derived(game.questions.filter((question) => ready(question, game.kind)).length);
  const play = $derived(audienceRoom.playSettings(game));
  /** The questions one play asks: all, or the number chosen from the pool. */
  const perPlay = $derived(play.count > 0 ? Math.min(play.count, pool) : pool);
  const COUNTS = [5, 10, 15, 20, 25, 30];
  const seconds = $derived(Math.round((game.questions.reduce((sum, question) => sum + (question.seconds || 20) + 8, 0) * perPlay) / Math.max(1, game.questions.length)));
  let armed = $state(false);
  let copied = $state(false);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${questionsAsText(game)}`);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }

  // Esc goes back to the list, unless someone is typing.
  function onkeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (event.key !== "Escape" || session.findOpen || session.settingsOpen || (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable))) return;
    event.preventDefault();
    onback();
  }
</script>

<svelte:window {onkeydown} />

<!-- Opens at its top, whatever the list was scrolled to. -->
<article class="view" {@attach (node) => node.scrollIntoView({ block: "start" })}>
  <nav class="bar" aria-label={t("Where you are")}>
    <button type="button" class="back" onclick={onback} title={t("Back to all quizzes and polls (Esc)")}><Icon name="chevron-left" size={15} /> {t("Back")}</button>
    <span class="trail"><button type="button" class="crumb" onclick={onback}>{t("Quizzes and polls")}</button><Icon name="chevron-right" size={12} /><span class="here">{title}</span></span>
  </nav>

  <header>
    <span class="tags"><span class="kind" class:poll={!quiz}>{quiz ? t("Quiz") : t("Poll")}</span>{#if !quiz && game.anonymous}<span class="kind anon">{t("Anonymous")}</span>{/if}{#if builtIn}<span class="kind sample">{t("Sample")}</span>{/if}</span>
    <h3>{title}</h3>
    {#if description}<p class="about">{description}</p>{/if}
    <p class="facts">
      {tn(game.questions.length, "{n} question", "{n} questions")}
      {#if played}<span class="played-fact">{tn(played.times, "Played once, {when}", "Played {n} times, last {when}", { when: played.when })}</span>{/if}
      <span>{t("about {n} min", { n: Math.max(1, Math.round(seconds / 60)) })}</span>
      {#if game.series}<span>{game.series}</span>{/if}
      {#if notReady}<span class="warn">{tn(notReady, "{n} question is not finished and will be left out", "{n} questions are not finished and will be left out")}</span>{/if}
    </p>
  </header>

  <div class="play">
    {#if quiz}
      <div class="teams" role="radiogroup" aria-label={t("Play as")}>
        <span>{t("Play as")}</span>
        <button type="button" role="radio" aria-checked={audienceRoom.teams === 0} class:on={audienceRoom.teams === 0} onclick={() => audienceRoom.setTeams(0)}>{t("Everyone for themselves")}</button>
        {#each Array.from({ length: MOST_TEAMS - 1 }, (_, i) => i + 2) as count (count)}
          <button type="button" role="radio" aria-checked={audienceRoom.teams === count} class:on={audienceRoom.teams === count} onclick={() => audienceRoom.setTeams(count)}>
            {#each TEAMS.slice(0, count) as team (team.name)}<i style:background={team.color}></i>{/each}{t("{n} teams", { n: count })}
          </button>
        {/each}
      </div>
    {/if}
    {#if pool > 1}
      <div class="teams" role="radiogroup" aria-label={t("Questions each time")}>
        <span>{t("Questions each time")}</span>
        <button type="button" role="radio" aria-checked={perPlay === pool} class:on={perPlay === pool} onclick={() => audienceRoom.setPlaySettings(game, { ...play, count: 0 })}>{t("All {n}", { n: pool })}</button>
        {#each COUNTS.filter((count) => count < pool) as count (count)}
          <button type="button" role="radio" aria-checked={perPlay === count} class:on={perPlay === count} onclick={() => audienceRoom.setPlaySettings(game, { mix: true, count })}>{count}</button>
        {/each}
        <label class="mix"><input type="checkbox" checked={play.mix} onchange={(event) => audienceRoom.setPlaySettings(game, { ...play, mix: event.currentTarget.checked })} /> {t("New order each time")}</label>
      </div>
      {#if perPlay < pool}
        <p class="hint">{t("Each play picks {n} of the {total} questions at random, ones the room has not had lately first, so a replay feels new.", { n: perPlay, total: pool })}</p>
      {/if}
    {/if}
    {#if audienceRoom.sounds}
      <label class="teams">
        <span>{t("Music style")}</span>
        <select class="style-pick" value={audienceRoom.musicStyle} onchange={(event) => audienceRoom.setMusicStyle(event.currentTarget.value as MusicStyle)}>
          {#each Object.entries(MUSIC_STYLE_INFO) as [id, info] (id)}<option value={id}>{t(info.name)}</option>{/each}
        </select>
        {#if audienceRoom.musicStyle !== "surprise"}<button type="button" class:on={audienceRoom.hearing === audienceRoom.musicStyle} onclick={() => audienceRoom.hearMusic(audienceRoom.musicStyle)}>{audienceRoom.hearing === audienceRoom.musicStyle ? t("Stop") : t("Listen")}</button>{/if}
      </label>
    {/if}
    <div class="buttons">
      <button type="button" class="btn accent big" onclick={onplay}><Icon name={played ? "reset" : "play"} size={14} /> {played ? t("Play again") : quiz ? t("Play this quiz") : t("Run this poll")}</button>
      {#if builtIn}
        <button type="button" class="btn" onclick={oncopy}><Icon name="copy" size={14} /> {t("Make a copy to change")}</button>
      {:else}
        <button type="button" class="btn" onclick={onedit}><Icon name="pencil" size={14} /> {t("Edit")}</button>
        <button type="button" class="btn" onclick={oncopy}><Icon name="copy" size={14} /> {t("Duplicate")}</button>
      {/if}
      <button type="button" class="btn" onclick={copyText}>{copied ? t("Copied") : t("Copy as text")}</button>
      {#if ondelete}
        <button type="button" class="btn danger" class:armed title={builtIn ? t("Removes this sample from your list. Bring samples back at the foot of the list.") : undefined} onclick={() => { if (armed) ondelete?.(); else { armed = true; setTimeout(() => (armed = false), 3000); } }}><Icon name="trash" size={14} /> {armed ? (builtIn ? t("Click again to remove") : t("Click again to delete")) : builtIn ? t("Remove sample") : t("Delete")}</button>
      {/if}
    </div>
    {#if audienceRoom.teams && quiz}<p class="hint">{t("Players are split into teams as they join, evenly. A team's score is its players' average, so a small team can win.")}</p>{/if}
  </div>

  <ol class="questions">
    {#each game.questions as question, index (question.id)}
      {@const done = ready(question, game.kind)}
      <li class:unfinished={!done}>
        <div class="q-head">
          <span class="num">{index + 1}</span>
          <p>{question.prompt || t("No question written yet")}</p>
          <span class="time" title={t("Seconds to answer")}>{question.seconds ? t("{n} s", { n: question.seconds }) : t("no clock")}{#if quiz}{` · ${t("{n} pts", { n: question.points })}`}{/if}</span>
        </div>
        <ul class="choices">
          {#each question.choices as choice, choiceIndex (choiceIndex)}
            {#if choice.trim()}
              {@const right = quiz && question.correct === choiceIndex}
              <li class:right>
                <ChoiceMark index={choiceIndex} size={20} muted={quiz && !right} />
                <span>{choice}</span>
                {#if right}<b><Icon name="check" size={13} /> {t("Right answer")}</b>{/if}
              </li>
            {/if}
          {/each}
        </ul>
        {#if !done}<p class="todo">{quiz ? t("Needs a question, two answers and the right one marked.") : t("Needs a question and two answers.")}</p>{/if}
      </li>
    {/each}
  </ol>
</article>

<style>
  .view { display: grid; gap: 14px; }
  /* Stays at the top while the questions scroll, so the way back is always in reach. */
  .bar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px; margin: -2px -2px 2px; padding: 6px 2px 8px; background: var(--panel, var(--bg)); border-bottom: 1px solid var(--line); }
  .back { flex: none; display: inline-flex; align-items: center; gap: 3px; height: 30px; padding: 0 12px 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--field, transparent); color: var(--ink); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
  .back:hover { border-color: var(--accent); }
  .trail { display: flex; align-items: center; gap: 4px; min-width: 0; color: var(--muted); font-size: 12px; }
  .crumb { flex: none; padding: 0; border: 0; background: none; color: var(--muted); font: inherit; cursor: pointer; }
  .crumb:hover { color: var(--ink); text-decoration: underline; }
  .here { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-weight: 600; }
  header { display: grid; gap: 4px; }
  .kind { justify-self: start; padding: 2px 9px; border-radius: 99px; background: color-mix(in srgb, #d89e00 22%, transparent); color: #e8b53a; font-size: 11.5px; font-weight: 750; }
  .tags { display: flex; gap: 6px; }
  .kind.anon { background: color-mix(in srgb, #8e4ec6 22%, transparent); color: #b58be0; }
  .kind.sample { background: color-mix(in srgb, currentColor 10%, transparent); color: var(--muted); }
  .kind.poll { background: color-mix(in srgb, #1368ce 22%, transparent); color: #6aa6f0; }
  h3 { margin: 2px 0 0; font-size: 19px; font-weight: 750; line-height: 1.25; }
  .about { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
  .facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .facts .played-fact { color: var(--ok, #3fb950); }
  .facts .warn { color: var(--warn, #e8a33a); }
  .play { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--field, transparent); }
  .teams { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .teams > span { color: var(--muted); font-size: 12px; margin-right: 2px; }
  .teams button { display: inline-flex; align-items: center; gap: 3px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .teams button.on { border-color: var(--accent); color: var(--ink); box-shadow: inset 0 0 0 1px var(--accent); }
  .style-pick { height: 28px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); font: inherit; font-size: 12px; padding: 0 6px; }
  .mix { display: inline-flex; align-items: center; gap: 5px; margin-left: 6px; color: var(--muted); font-size: 12px; cursor: pointer; }
  .teams i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
  .buttons { display: flex; flex-wrap: wrap; gap: 6px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .btn:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
  .btn.accent { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  .btn.big { height: 34px; padding: 0 16px; font-size: 13px; }
  .btn.danger.armed { border-color: var(--danger, #ff6b6b); color: var(--danger, #ff6b6b); }
  .hint { margin: 0; color: var(--muted); font-size: 11.5px; }
  .questions { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .questions > li { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; }
  .questions > li.unfinished { border-style: dashed; }
  .q-head { display: flex; align-items: flex-start; gap: 10px; }
  .num { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: color-mix(in srgb, currentColor 10%, transparent); font-size: 12px; font-weight: 750; }
  .q-head p { flex: 1; margin: 2px 0 0; font-size: 14px; font-weight: 650; line-height: 1.4; overflow-wrap: anywhere; }
  .time { flex: none; margin-top: 3px; color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .choices { list-style: none; margin: 0 0 0 34px; padding: 0; display: grid; gap: 5px; }
  .choices li { display: flex; align-items: center; gap: 9px; min-height: 30px; padding: 4px 8px 4px 5px; border-radius: 8px; font-size: 13px; }
  .choices li span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .choices li.right { background: color-mix(in srgb, var(--good, #3ccf7a) 14%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--good, #3ccf7a) 55%, transparent); font-weight: 650; }
  .choices b { flex: none; display: inline-flex; align-items: center; gap: 4px; color: var(--good, #3ccf7a); font-size: 11.5px; }
  .todo { margin: 0 0 0 34px; color: var(--warn, #e8a33a); font-size: 12px; }
</style>
