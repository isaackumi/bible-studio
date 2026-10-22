<script lang="ts">
  import { audienceRoom } from "../../app/rooms.svelte";
  import { session } from "../../app/session.svelte";
  import { blankQuestion, BUILT_IN_GAMES, MOST_CHOICES, newGame, ready, type Game } from "../../domain/games";
  import { t, tn } from "../../i18n/core";

  // Quizzes and polls on people's phones: pick a game (built in, made from the Bible on this
  // computer, or the church's own), run it a question at a time, and put the question, the results
  // or the leaderboard on Preview when the room should see them.
  let editing = $state<Game | null>(null);
  let making = $state("");
  let note = $state("");

  const mine = $derived(session.workspace.games ?? []);
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
  }
</script>

{#if editing}
  {@const game = editing}
  <section class="edit">
    <label>{t("Title")}<input bind:value={game.title} maxlength="80" /></label>
    <label>{t("Description")}<input bind:value={game.description} maxlength="300" placeholder={t("Shown with the game")} /></label>
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
      <button type="button" class="btn" onclick={() => (editing = null)}>{t("Cancel")}</button>
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
      {:else if run.index + 1 < run.game.questions.length}
        <button type="button" class="btn accent" onclick={() => audienceRoom.next()}>{t("Next question")}</button>
      {:else}
        <button type="button" class="btn accent" onclick={() => audienceRoom.finish()}>{t("Finish game")}</button>
      {/if}
    </div>
    <div class="screen">
      <span>{t("On Preview:")}</span>
      <button type="button" class="btn" onclick={() => audienceRoom.questionOnScreen()}>{t("Question")}</button>
      <button type="button" class="btn" disabled={!live} onclick={() => audienceRoom.resultsOnScreen()}>{t("Results")}</button>
      {#if run.game.kind === "quiz"}<button type="button" class="btn" onclick={() => audienceRoom.leaderboardOnScreen()}>{t("Leaderboard")}</button>{/if}
      <button type="button" class="btn" onclick={() => audienceRoom.qrOnPreview(t("Scan to play"))}>{t("Join QR")}</button>
    </div>
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
    </div>
    {#if note}<p class="note">{note}</p>{/if}
    {#if mine.length}
      <h3>{t("Your games")}</h3>
      {#each mine as game (game.id)}
        <div class="game">
          <div><strong>{game.title}</strong><span>{game.kind === "poll" ? t("Poll") : t("Quiz")} · {tn(game.questions.length, "{n} question", "{n} questions")}</span></div>
          <button type="button" class="btn accent" onclick={() => audienceRoom.play(game)}>{t("Play")}</button>
          <button type="button" class="btn" onclick={() => (editing = structuredClone($state.snapshot(game)) as Game)}>{t("Edit")}</button>
          <button type="button" class="btn" onclick={() => session.removeGame(game.id)}>{t("Delete")}</button>
        </div>
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
  .btn { height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .btn:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.accent { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  .game { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }
  .game > div { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .game strong { font-size: 13px; }
  .game span { color: var(--muted); font-size: 12px; }
  .note { margin: 0; color: var(--muted); font-size: 12px; }
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
