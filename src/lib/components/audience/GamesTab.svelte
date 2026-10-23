<script lang="ts">
  import { audienceRoom } from "../../app/rooms.svelte";
  import { session } from "../../app/session.svelte";
  import { blankQuestion, BUILT_IN_GAMES, MOST_CHOICES, newGame, ready, seriesFinal, type Game } from "../../domain/games";
  import { MOST_TEAMS, TEAMS } from "../../domain/game-colors";
  import { reportSummary } from "../../domain/game-report";
  import ReportCard from "./ReportCard.svelte";
  import { msg, t, tn } from "../../i18n/core";
  import { GAME_COUNTS, type GameAudience, type GameLevel, type GameSource } from "../../ai/games";
  import Icon from "../Icon.svelte";

  // Quizzes and polls on people's phones: pick a game (built in, made from the Bible on this
  // computer, or the church's own), run it a question at a time, and put the question, the results
  // or the leaderboard on Preview when the room should see them.
  let editing = $state<Game | null>(null);
  let making = $state("");
  let note = $state("");

  const mine = $derived(session.workspace.games ?? []);
  // The quiz bank: games grouped by sermon series (named ones first, by name), then the rest.
  const seriesNames = $derived([...new Set(mine.map((game) => game.series).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b)));
  const loose = $derived(mine.filter((game) => !game.series));
  const reports = $derived(session.workspace.gameReports ?? []);
  let openReport = $state<string | null>(null);
  const shownReport = $derived(reports.find((report) => report.id === openReport) ?? null);
  const percent = (share: number | null) => (share === null ? "–" : `${Math.round(share * 100)}%`);

  function playSeries(name: string) {
    const game = seriesFinal(mine, name);
    if (game) audienceRoom.play({ ...game, title: t("{series}: series final", { series: name }) });
  }
  const run = $derived(audienceRoom.playing);
  const question = $derived(audienceRoom.question);
  const activity = $derived(audienceRoom.view?.activity ?? { kind: "none" as const });
  const live = $derived(activity.kind !== "none" && question && activity.question.id === question.id ? activity : null);
  const answers = $derived(audienceRoom.view?.answers ?? []);
  const marks = ["A", "B", "C", "D", "E", "F"];

  async function make(kind: "which-book" | "finish-verse") {
    making = kind;
    note = "";
    const game = await audienceRoom.makeFromBible(kind);
    making = "";
    if (game) audienceRoom.play(game);
    else note = t("No Bible text could be read on this computer. Install a Bible in Settings › Bible.");
  }

  function saveEdit() {
    if (!editing) return;
    session.saveGame($state.snapshot(editing) as Game);
    editing = null;
    fromAi = false;
  }

  // The AI quiz maker: from a sermon (who was listening?), a book the church is reading (its
  // summary pasted in), a Bible passage or a topic. What it writes opens in the editor to check.
  let asking = $state(false);
  let aiSource = $state<GameSource>("sermon");
  let sermonId = $state(session.sermonFocus?.sermonId ?? "");
  let aiTitle = $state("");
  let aiText = $state("");
  let aiCount = $state(8);
  let aiLevel = $state<GameLevel>("mixed");
  let aiAudience = $state<GameAudience>("everyone");
  let aiBusy = $state(false);
  let aiError = $state("");
  let fromAi = $state(false);

  const sermons = $derived([...session.sermons].sort((a, b) => (b.date ?? b.updatedAt).localeCompare(a.date ?? a.updatedAt)));
  const sermon = $derived(sermons.find((entry) => entry.id === sermonId) ?? sermons[0] ?? null);
  const SOURCES: Array<{ id: GameSource; label: string; icon: string }> = [
    { id: "sermon", label: msg("Today's sermon"), icon: "book" },
    { id: "reading", label: msg("Book reading"), icon: "bible" },
    { id: "text", label: msg("Pasted text"), icon: "pencil" },
    { id: "passage", label: msg("Bible passage"), icon: "bible" },
    { id: "topic", label: msg("A topic"), icon: "sparkles" },
  ];

  async function writeWithAi() {
    aiBusy = true;
    aiError = "";
    try {
      const text = aiSource === "sermon" ? [sermon ? session.sermonText(sermon) : "", aiText.trim()].filter(Boolean).join("\n\n") : aiText;
      const title = aiSource === "sermon" ? (sermon?.title ?? "") : aiTitle.trim();
      const game = await session.makeGameWithAi({ source: aiSource, title, text, count: aiCount, level: aiLevel, audience: aiAudience });
      // From a sermon: the quiz joins the sermon's series in the quiz bank.
      editing = aiSource === "sermon" && sermon ? { ...game, ...(sermon.series ? { series: sermon.series } : {}), sermonId: sermon.id } : game;
      fromAi = true;
      asking = false;
    } catch (error) {
      aiError = error instanceof Error ? error.message : String(error);
    } finally {
      aiBusy = false;
    }
  }
</script>

{#if editing}
  {@const game = editing}
  <section class="edit">
    {#if fromAi}<p class="ai-check"><Icon name="sparkles" size={14} /> {t("Written by the AI. Read each question and check the right answer before you save: the AI can be wrong.")}</p>{/if}
    <label>{t("Title")}<input bind:value={game.title} maxlength="80" /></label>
    <label>{t("Description")}<input bind:value={game.description} maxlength="300" placeholder={t("Shown with the game")} /></label>
    <label>{t("Sermon series (optional)")}<input bind:value={game.series} maxlength="80" list="game-series" placeholder={t("Groups the quiz with the rest of its series")} /></label>
    <datalist id="game-series">{#each seriesNames as name (name)}<option value={name}></option>{/each}</datalist>
    <div class="kind" role="radiogroup" aria-label={t("Kind")}>
      <button type="button" role="radio" aria-checked={game.kind === "quiz"} class:on={game.kind === "quiz"} onclick={() => (game.kind = "quiz")}>{t("Quiz (right answers, points)")}</button>
      <button type="button" role="radio" aria-checked={game.kind === "poll"} class:on={game.kind === "poll"} onclick={() => (game.kind = "poll")}>{t("Poll (no right answer)")}</button>
    </div>
    {#each game.questions as item, index (item.id)}
      <fieldset class:unready={!ready(item, game.kind)}>
        <legend>{t("Question {n}", { n: index + 1 })}</legend>
        <textarea bind:value={item.prompt} maxlength="300" placeholder={t("The question")}></textarea>
        {#each item.choices as _choice, choiceIndex (choiceIndex)}
          <div class="choice-row">
            {#if game.kind === "quiz"}
              <input type="radio" name="correct-{item.id}" aria-label={t("Right answer")} checked={item.correct === choiceIndex} onchange={() => (item.correct = choiceIndex)} />
            {/if}
            <span class="mark">{marks[choiceIndex]}</span>
            <input bind:value={item.choices[choiceIndex]} maxlength="120" placeholder={t("Answer {mark}", { mark: marks[choiceIndex] ?? "" })} />
            {#if item.choices.length > 2}<button type="button" class="x" aria-label={t("Remove answer")} onclick={() => { item.choices.splice(choiceIndex, 1); if (item.correct !== null && item.correct >= item.choices.length) item.correct = 0; }}>×</button>{/if}
          </div>
        {/each}
        <div class="q-tools">
          {#if item.choices.length < MOST_CHOICES}<button type="button" class="btn" onclick={() => item.choices.push("")}>{t("Add answer")}</button>{/if}
          <label class="small">{t("Seconds")}<input type="number" min="0" max="120" bind:value={item.seconds} /></label>
          {#if game.kind === "quiz"}<label class="small">{t("Points")}<input type="number" min="0" max="5000" step="100" bind:value={item.points} /></label>{/if}
          <button type="button" class="btn" disabled={game.questions.length <= 1} onclick={() => game.questions.splice(index, 1)}>{t("Remove")}</button>
        </div>
      </fieldset>
    {/each}
    <button type="button" class="btn" onclick={() => game.questions.push(blankQuestion())}>{t("Add question")}</button>
    <div class="row">
      <button type="button" class="btn accent" onclick={saveEdit}>{t("Save game")}</button>
      <button type="button" class="btn" onclick={() => { editing = null; fromAi = false; }}>{t("Cancel")}</button>
    </div>
  </section>
{:else if asking}
  <section class="maker">
    <div class="maker-head">
      <strong><Icon name="sparkles" size={15} /> {t("Make a quiz with AI")}</strong>
      <button type="button" class="link" onclick={() => (asking = false)}>{t("Cancel")}</button>
    </div>
    <div class="sources" role="radiogroup" aria-label={t("Made from")}>
      {#each SOURCES as source (source.id)}
        <button type="button" role="radio" aria-checked={aiSource === source.id} class:on={aiSource === source.id} onclick={() => { aiSource = source.id; aiError = ""; }}><Icon name={source.icon} size={16} /> {t(source.label)}</button>
      {/each}
    </div>
    {#if aiSource === "sermon"}
      {#if sermons.length}
        <label>{t("Sermon")}<select bind:value={sermonId}>{#each sermons as entry (entry.id)}<option value={entry.id}>{entry.title || t("Untitled sermon")}{entry.date ? ` · ${entry.date}` : ""}</option>{/each}</select></label>
        <p class="hint">{t("Made from its notes and slides. See who was listening!")}</p>
      {:else}
        <p class="hint">{t("No sermons yet. Paste the sermon's summary or notes below.")}</p>
      {/if}
      <label>{t("The AI summary or anything else said (optional)")}<textarea bind:value={aiText} maxlength="30000" placeholder={t("Paste the summary from Sermon › Summarize, or notes taken during the sermon")}></textarea></label>
    {:else if aiSource === "reading"}
      <label>{t("Book and chapters")}<input bind:value={aiTitle} maxlength="120" placeholder={t("The Pilgrim's Progress, chapters 1 to 3")} /></label>
      <label>{t("Summary of what was read")}<textarea class="tall" bind:value={aiText} maxlength="30000" placeholder={t("Paste or type the summary. The questions come only from it.")}></textarea></label>
    {:else if aiSource === "text"}
      <label>{t("Title (optional)")}<input bind:value={aiTitle} maxlength="120" placeholder={t("Youth camp recap")} /></label>
      <label>{t("The text")}<textarea class="tall" bind:value={aiText} maxlength="30000" placeholder={t("Paste a summary, an article, notes, or questions you have written: the quiz is made from it.")}></textarea></label>
    {:else if aiSource === "passage"}
      <label>{t("Bible passage")}<input bind:value={aiText} maxlength="200" placeholder={t("Jonah 1 to 4, or the story of Ruth")} /></label>
    {:else}
      <label>{t("Topic")}<input bind:value={aiText} maxlength="300" placeholder={t("The miracles of Jesus, or prayer")} /></label>
    {/if}
    <div class="maker-opts">
      <label>{t("Questions")}<select bind:value={aiCount}>{#each GAME_COUNTS as n (n)}<option value={n}>{n}</option>{/each}</select></label>
      <label>{t("How hard")}<select bind:value={aiLevel}><option value="easy">{t("Easy")}</option><option value="mixed">{t("Mixed")}</option><option value="hard">{t("Hard")}</option></select></label>
      <label>{t("For")}<select bind:value={aiAudience}><option value="everyone">{t("Everyone")}</option><option value="youth">{t("Youth")}</option><option value="children">{t("Children")}</option></select></label>
    </div>
    {#if aiError}<p class="error" role="alert">{aiError}</p>{/if}
    <div class="row">
      {#if !session.aiReady}<button type="button" class="btn" onclick={() => session.openSettings("ai")}>{t("Open AI settings")}</button>{/if}
      <button type="button" class="btn accent" disabled={aiBusy} onclick={writeWithAi}><Icon name="sparkles" size={14} /> {aiBusy ? t("Writing the questions…") : t("Write the quiz")}</button>
      <span class="hint">{t("You check every question before anyone plays.")}</span>
    </div>
  </section>
{:else if run && question}
  <section class="run">
    <div class="run-head">
      <strong>{run.game.title}</strong>
      <span>{t("Question {n} of {total}", { n: run.index + 1, total: run.game.questions.length })}</span>
    </div>
    <p class="prompt">{question.prompt}</p>
    <ol class="answers">
      {#each question.choices.filter((choice) => choice.trim()) as choice, index (index)}
        {@const count = live ? (answers[index] ?? 0) : 0}
        {@const total = answers.reduce((sum, n) => sum + n, 0)}
        <li class:right={question.correct === index}>
          <i style:width="{live && total ? (count / total) * 100 : 0}%"></i>
          <span class="mark">{marks[index]}</span><span class="label">{choice}</span>{#if live}<b>{count}</b>{/if}
        </li>
      {/each}
    </ol>
    <p class="status">
      {#if !live}{t("Not asked yet.")}
      {:else if live.phase === "open"}{tn(audienceRoom.view?.answered ?? 0, "{n} answer in", "{n} answers in")}{question.seconds ? ` · ${t("{n} seconds", { n: question.seconds })}` : ""}
      {:else if live.phase === "closed"}{t("Answers closed.")}
      {:else}{run.game.kind === "quiz" ? t("Answer shown on phones.") : t("Results shown on phones.")}{/if}
    </p>
    <div class="row">
      {#if !live}
        <button type="button" class="btn accent" onclick={() => audienceRoom.ask()}>{t("Ask on phones")}</button>
      {:else if live.phase === "open"}
        <button type="button" class="btn accent" onclick={() => audienceRoom.stopAnswers()}>{t("Stop answers")}</button>
      {:else if live.phase === "closed"}
        <button type="button" class="btn accent" onclick={() => audienceRoom.reveal()}>{run.game.kind === "quiz" ? t("Show the answer") : t("Show the results")}</button>
      {:else}
        {#if run.game.kind === "quiz"}<button type="button" class="btn" onclick={() => audienceRoom.showGame("leaderboard", audienceRoom.follow)}>{t("Leaderboard")}</button>{/if}
        {#if run.index + 1 < run.game.questions.length}
          <button type="button" class="btn accent" onclick={() => audienceRoom.next()}>{t("Next question")}</button>
        {:else}
          <button type="button" class="btn accent" onclick={() => audienceRoom.finish()}>{run.game.kind === "quiz" ? t("Finish with the podium") : t("Finish game")}</button>
        {/if}
      {/if}
    </div>
    <div class="screen">
      <span>{audienceRoom.follow ? t("On the screen:") : t("On Preview:")}</span>
      <button type="button" class="btn" class:on={audienceRoom.screenStage === "lobby"} onclick={() => audienceRoom.showGame("lobby", audienceRoom.follow)}>{t("Lobby")}</button>
      <button type="button" class="btn" class:on={audienceRoom.screenStage === "question"} onclick={() => audienceRoom.showGame("question", audienceRoom.follow)}>{t("Question")}</button>
      <button type="button" class="btn" class:on={audienceRoom.screenStage === "results"} disabled={!live} onclick={() => audienceRoom.showGame("results", audienceRoom.follow)}>{t("Results")}</button>
      {#if run.game.kind === "quiz"}
        <button type="button" class="btn" class:on={audienceRoom.screenStage === "leaderboard"} onclick={() => audienceRoom.showGame("leaderboard", audienceRoom.follow)}>{t("Leaderboard")}</button>
        <button type="button" class="btn" class:on={audienceRoom.screenStage === "podium"} onclick={() => audienceRoom.showGame("podium", audienceRoom.follow)}>{t("Podium")}</button>
      {/if}
    </div>
    <div class="switches">
      <label><input type="checkbox" class="switch" checked={audienceRoom.follow} onchange={(event) => audienceRoom.setFollow(event.currentTarget.checked)} /> <span>{t("Screen follows the game")}<small>{t("Each question, answer and the podium go to the screen as they happen; when time is up, the answer shows by itself.")}</small></span></label>
      <label><input type="checkbox" class="switch" checked={audienceRoom.sounds} onchange={(event) => audienceRoom.setSounds(event.currentTarget.checked)} /> <span>{t("Game sounds")}<small>{t("Music while people join and answer, ticks, a gong, a drumroll and a fanfare, on the audience screen.")}</small></span></label>
      <label><input type="checkbox" class="switch" checked={audienceRoom.ready} onchange={(event) => audienceRoom.setReady(event.currentTarget.checked)} /> <span>{t("Get ready countdown")}<small>{t("Each question shows alone for 4 seconds to read, then the answers open and the clock starts.")}</small></span></label>
      <label><input type="checkbox" class="switch" checked={audienceRoom.auto} disabled={!audienceRoom.follow} onchange={(event) => audienceRoom.setAuto(event.currentTarget.checked)} /> <span>{t("Runs by itself")}<small>{t("After each answer, the leaderboard, then the next question, with no clicks; the podium at the end. Needs the screen to follow the game.")}</small></span></label>
    </div>
    {#if audienceRoom.view?.teams}
      <ol class="board teams-board">
        {#each audienceRoom.view.teams as team (team.team)}<li><span><i style:background={TEAMS[team.team]?.color}></i>{t(TEAMS[team.team]?.name ?? "")} · {tn(team.players, "{n} player", "{n} players")}</span><b>{team.score}</b></li>{/each}
      </ol>
    {/if}
    {#if audienceRoom.view?.leaderboard.length}
      <ol class="board">
        {#each audienceRoom.view.leaderboard.slice(0, 5) as entry, index (index)}<li><span>{index + 1}. {entry.name}</span><b>{entry.score}</b></li>{/each}
      </ol>
    {/if}
    <button type="button" class="link" onclick={() => audienceRoom.finish()}>{t("End the game")}</button>
  </section>
{:else}
  <section class="library">
    <div class="row">
      <button type="button" class="btn accent" onclick={() => (editing = newGame(t("New game")))}>{t("Make a game")}</button>
      {#if session.aiOn("games")}<button type="button" class="btn ai" onclick={() => { asking = true; aiError = ""; }}><Icon name="sparkles" size={14} /> {t("Make with AI")}</button>{/if}
    </div>
    {#if note}<p class="note">{note}</p>{/if}
    <div class="teams-pick" role="radiogroup" aria-label={t("Teams")}>
      <span>{t("Teams")}</span>
      <button type="button" role="radio" aria-checked={audienceRoom.teams === 0} class:on={audienceRoom.teams === 0} onclick={() => audienceRoom.setTeams(0)}>{t("Off")}</button>
      {#each Array.from({ length: MOST_TEAMS - 1 }, (_, i) => i + 2) as count (count)}
        <button type="button" role="radio" aria-checked={audienceRoom.teams === count} class:on={audienceRoom.teams === count} onclick={() => audienceRoom.setTeams(count)}>
          {#each TEAMS.slice(0, count) as team (team.name)}<i style:background={team.color}></i>{/each}{count}
        </button>
      {/each}
    </div>
    {#if audienceRoom.teams}<p class="note">{t("Players are split into teams as they join, evenly. A team's score is its players' average, so a small team can win.")}</p>{/if}
    {#if audienceRoom.lastReport}
      <ReportCard report={audienceRoom.lastReport} onclose={() => (audienceRoom.lastReport = null)} />
    {/if}
    {#each seriesNames as name (name)}
      {@const games = mine.filter((game) => game.series === name)}
      {@const quizzes = games.filter((game) => game.kind === "quiz").length}
      <div class="series-head">
        <h3>{name}</h3>
        {#if quizzes >= 2}<button type="button" class="btn" title={t("Questions from every quiz in the series, mixed")} onclick={() => playSeries(name)}>{t("Play the series final")}</button>{/if}
      </div>
      {#each games as game (game.id)}
        <div class="game">
          <div><strong>{game.title}</strong><span>{game.kind === "poll" ? t("Poll") : t("Quiz")} · {tn(game.questions.length, "{n} question", "{n} questions")}</span></div>
          <button type="button" class="btn accent" onclick={() => audienceRoom.play(game)}>{t("Play")}</button>
          <button type="button" class="btn" onclick={() => (editing = structuredClone($state.snapshot(game)) as Game)}>{t("Edit")}</button>
          <button type="button" class="btn" onclick={() => session.removeGame(game.id)}>{t("Delete")}</button>
        </div>
      {/each}
    {/each}
    {#if loose.length}
      <h3>{seriesNames.length ? t("Other games") : t("Your games")}</h3>
      {#each loose as game (game.id)}
        <div class="game">
          <div><strong>{game.title}</strong><span>{game.kind === "poll" ? t("Poll") : t("Quiz")} · {tn(game.questions.length, "{n} question", "{n} questions")}</span></div>
          <button type="button" class="btn accent" onclick={() => audienceRoom.play(game)}>{t("Play")}</button>
          <button type="button" class="btn" onclick={() => (editing = structuredClone($state.snapshot(game)) as Game)}>{t("Edit")}</button>
          <button type="button" class="btn" onclick={() => session.removeGame(game.id)}>{t("Delete")}</button>
        </div>
      {/each}
    {/if}
    {#if reports.length}
      <h3>{t("Who was listening")}</h3>
      {#if shownReport}
        <ReportCard report={shownReport} onclose={() => (openReport = null)} ondelete={() => { session.removeGameReport(shownReport.id); openReport = null; }} />
      {/if}
      {#each reports.slice(0, 10) as report (report.id)}
        {#if report.id !== openReport}
          <button type="button" class="game report-row" onclick={() => (openReport = report.id)}>
            <div><strong>{report.title}</strong><span>{new Date(report.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {tn(report.players, "{n} player", "{n} players")}</span></div>
            <b>{percent(reportSummary(report).right)}</b>
          </button>
        {/if}
      {/each}
    {/if}
    <h3>{t("Made from your Bible")}</h3>
    <div class="game">
      <div><strong>{t("Which book?")}</strong><span>{t("Name the book each verse comes from. Different every time.")}</span></div>
      <button type="button" class="btn accent" disabled={!!making} onclick={() => make("which-book")}>{making === "which-book" ? t("Making…") : t("Play")}</button>
    </div>
    <div class="game">
      <div><strong>{t("Finish the verse")}</strong><span>{t("Choose how each verse ends. Different every time.")}</span></div>
      <button type="button" class="btn accent" disabled={!!making} onclick={() => make("finish-verse")}>{making === "finish-verse" ? t("Making…") : t("Play")}</button>
    </div>
    <h3>{t("Ready to play")}</h3>
    {#each BUILT_IN_GAMES as game (game.id)}
      <div class="game">
        <div><strong>{t(game.title)}</strong><span>{t(game.description)}</span></div>
        <button type="button" class="btn accent" onclick={() => audienceRoom.play(game)}>{t("Play")}</button>
        <button type="button" class="btn" title={t("Make your own copy to change")} onclick={() => (editing = { ...structuredClone(game), id: `game:${Math.random().toString(36).slice(2, 10)}`, title: t("{title} (copy)", { title: t(game.title) }) })}>{t("Copy")}</button>
      </div>
    {/each}
  </section>
{/if}

<style>
  section { display: grid; gap: 10px; }
  h3 { margin: 8px 0 0; font-size: 12px; font-weight: 700; color: var(--muted); }
  .row, .screen { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .screen span { color: var(--muted); font-size: 12px; margin-right: 2px; }
  .screen .btn.on { border-color: var(--accent); color: var(--accent); }
  .switches { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; }
  .switches label { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; font-weight: 650; cursor: pointer; }
  .switches small { display: block; margin-top: 2px; color: var(--muted); font-size: 11.5px; font-weight: 500; line-height: 1.4; }
  .btn { height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .btn:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.accent { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  .game { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }
  .game > div { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .game strong { font-size: 13px; }
  .game span { color: var(--muted); font-size: 12px; }
  .note { margin: 0; color: var(--muted); font-size: 12px; }
  .teams-pick { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .teams-pick > span { color: var(--muted); font-size: 12px; margin-right: 2px; }
  .teams-pick button { display: inline-flex; align-items: center; gap: 3px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .teams-pick button.on { border-color: var(--accent); color: var(--ink); box-shadow: inset 0 0 0 1px var(--accent); }
  .teams-pick i, .teams-board i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
  .teams-board i { margin-right: 6px; }
  .series-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 8px; }
  .series-head h3 { margin: 0; }
  .report-row { width: 100%; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .report-row:hover { background: color-mix(in srgb, currentColor 5%, transparent); }
  .report-row b { font-size: 15px; font-variant-numeric: tabular-nums; }
  .btn { display: inline-flex; align-items: center; gap: 6px; }
  .btn.ai { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); color: var(--accent); }
  .maker { padding: 12px; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 12px; background: color-mix(in srgb, var(--accent) 5%, transparent); }
  .maker-head { display: flex; justify-content: space-between; align-items: center; }
  .maker-head strong { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
  .sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px; }
  .sources button { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; text-align: left; }
  .sources button.on { border-color: var(--accent); color: var(--ink); box-shadow: inset 0 0 0 1px var(--accent); }
  .maker label { display: grid; gap: 4px; color: var(--muted); font-size: 12px; }
  .maker input, .maker textarea, .maker select { padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--field, var(--panel)); color: var(--ink); font: inherit; }
  .maker textarea { min-height: 70px; resize: vertical; }
  .maker textarea.tall { min-height: 140px; }
  .maker-opts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .hint { margin: 0; color: var(--muted); font-size: 11.5px; }
  .error { margin: 0; color: var(--danger, #ff6b6b); font-size: 12px; }
  .ai-check { display: flex; align-items: flex-start; gap: 6px; margin: 0; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--ink); font-size: 12px; line-height: 1.4; }
  .run-head { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 12px; }
  .run-head strong { color: var(--ink); }
  .prompt { margin: 0; font-size: 16px; font-weight: 650; line-height: 1.35; }
  .answers { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .answers li { position: relative; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .answers li i { position: absolute; inset: 0 auto 0 0; background: color-mix(in srgb, var(--accent) 22%, transparent); transition: width 0.3s; }
  .answers li.right { border-color: var(--good, #3ccf7a); }
  .answers .mark { position: relative; font-weight: 800; color: var(--muted); }
  .answers .label { position: relative; flex: 1; }
  .answers b { position: relative; }
  .status { margin: 0; color: var(--muted); font-size: 12.5px; }
  .board { list-style: none; margin: 0; padding: 0; }
  .board li { display: flex; justify-content: space-between; padding: 5px 2px; border-bottom: 1px solid var(--line); }
  .link { justify-self: start; border: 0; background: none; color: var(--muted); font: inherit; cursor: pointer; padding: 2px 0; }
  .edit label { display: grid; gap: 4px; color: var(--muted); font-size: 12px; }
  .edit input, .edit textarea { padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--field, transparent); color: var(--ink); font: inherit; }
  .edit textarea { min-height: 54px; resize: vertical; }
  .kind { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .kind button { min-height: 30px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
  .kind button.on { border-color: var(--accent); color: var(--ink); }
  fieldset { display: grid; gap: 6px; margin: 0; padding: 10px; border: 1px solid var(--line); border-radius: 10px; }
  fieldset.unready { border-style: dashed; }
  legend { padding: 0 4px; color: var(--muted); font-size: 12px; }
  .choice-row { display: flex; align-items: center; gap: 6px; }
  .choice-row input:not([type="radio"]) { flex: 1; min-width: 0; }
  .choice-row .mark { width: 14px; font-weight: 800; color: var(--muted); }
  .x { width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }
  .q-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .q-tools .small { display: flex; align-items: center; gap: 4px; }
  .q-tools .small input { width: 64px; }
  @media (prefers-reduced-motion: reduce) { .answers li i { transition: none; } }
</style>
