<script lang="ts">
  import { questionStats, reportSummary, reportText, type GameReport } from "../../domain/game-report";
  import { t, tn } from "../../i18n/core";

  // Who was listening: one quiz at a glance. How many played, the share right, each question with
  // its share right (the hardest and easiest marked), the teams and the top players.
  let { report, onclose, ondelete }: { report: GameReport; onclose?: () => void; ondelete?: () => void } = $props();

  const summary = $derived(reportSummary(report));
  const percent = (share: number | null) => (share === null ? "–" : `${Math.round(share * 100)}%`);
  const when = $derived(new Date(report.at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }));
  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(reportText(report));
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }
</script>

<section class="report">
  <header>
    <div><strong>{report.title}</strong><span>{when}{report.series ? ` · ${report.series}` : ""}</span></div>
    {#if onclose}<button type="button" class="link" onclick={onclose}>{t("Close")}</button>{/if}
  </header>
  <div class="facts">
    <div><b>{report.players}</b><span>{tn(report.players, "player", "players")}</span></div>
    <div><b>{percent(summary.right)}</b><span>{t("right on average")}</span></div>
    <div><b>{summary.answered}</b><span>{t("answered each question")}</span></div>
  </div>
  <ol class="questions">
    {#each report.questions as question, index (index)}
      {@const stat = questionStats(question)}
      <li class:hard={index === summary.hardest} class:easy={index === summary.easiest}>
        <div class="q-line">
          <span class="q-text">{index + 1}. {question.prompt}</span>
          <b>{stat.right === null ? stat.answered : percent(stat.right)}</b>
        </div>
        <i style:width="{(stat.right ?? 0) * 100}%"></i>
        {#if index === summary.hardest}<em>{t("hardest")}</em>{:else if index === summary.easiest}<em>{t("easiest")}</em>{/if}
        {#if question.correct !== null && question.choices[question.correct]}<small>{t("Answer: {answer}", { answer: question.choices[question.correct]! })} · {tn(stat.answered, "{n} answered", "{n} answered")}</small>{/if}
      </li>
    {/each}
  </ol>
  {#if report.teams?.length}
    <p class="label">{t("Teams")}</p>
    <ol class="people">{#each report.teams as team, index (index)}<li><span>{index + 1}. {team.name}</span><b>{team.score.toLocaleString()}</b></li>{/each}</ol>
  {/if}
  {#if report.top.length}
    <p class="label">{t("Top players")}</p>
    <ol class="people">{#each report.top as player, index (index)}<li><span>{index + 1}. {player.name}</span><b>{player.score.toLocaleString()}</b></li>{/each}</ol>
  {/if}
  <div class="row">
    <button type="button" class="btn" onclick={copy}>{copied ? t("Copied") : t("Copy as text")}</button>
    {#if ondelete}<button type="button" class="btn" onclick={ondelete}>{t("Delete")}</button>{/if}
  </div>
</section>

<style>
  .report { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  header div { display: grid; gap: 2px; }
  header strong { font-size: 14px; }
  header span { color: var(--muted); font-size: 12px; }
  .facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .facts div { display: grid; gap: 2px; padding: 8px; border-radius: 10px; background: color-mix(in srgb, currentColor 5%, transparent); text-align: center; }
  .facts b { font-size: 18px; font-variant-numeric: tabular-nums; }
  .facts span { color: var(--muted); font-size: 11px; line-height: 1.3; }
  .questions, .people { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .questions li { position: relative; display: grid; gap: 3px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; }
  .questions li i { position: absolute; inset: auto auto 0 0; height: 3px; background: var(--good, #3ccf7a); }
  .questions li.hard i { background: var(--danger, #ff6b6b); }
  .q-line { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; }
  .q-text { min-width: 0; overflow-wrap: anywhere; }
  .q-line b { flex: none; font-variant-numeric: tabular-nums; }
  .questions em { justify-self: start; padding: 1px 7px; border-radius: 99px; font-style: normal; font-size: 10.5px; font-weight: 700; background: color-mix(in srgb, var(--good, #3ccf7a) 20%, transparent); }
  .questions li.hard em { background: color-mix(in srgb, var(--danger, #ff6b6b) 22%, transparent); }
  .questions small { color: var(--muted); font-size: 11px; }
  .label { margin: 4px 0 0; color: var(--muted); font-size: 12px; font-weight: 700; }
  .people li { display: flex; justify-content: space-between; padding: 4px 2px; border-bottom: 1px solid var(--line); font-size: 12.5px; }
  .row { display: flex; gap: 6px; }
  .btn { height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .btn:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
  .link { border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; padding: 2px 0; }
</style>
