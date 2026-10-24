<script lang="ts">
  import { blankQuestion, MOST_CHOICES, questionsFromText, ready, type Game } from "../../domain/games";
  import { t, tn } from "../../i18n/core";
  import Icon from "../Icon.svelte";
  import ChoiceMark from "./ChoiceMark.svelte";

  // Making or changing a quiz or poll: each question a card, its answers in the colours and shapes
  // the phones show, and in a quiz one press marks the right answer. Questions written elsewhere
  // can be pasted in as plain text.
  let {
    game = $bindable(),
    fromAi = false,
    seriesNames = [],
    onsave,
    oncancel,
  }: { game: Game; fromAi?: boolean; seriesNames?: string[]; onsave: () => void; oncancel: () => void } = $props();

  const quiz = $derived(game.kind === "quiz");
  const readyCount = $derived(game.questions.filter((question) => ready(question, game.kind)).length);
  const TIMES = [0, 10, 20, 30, 45, 60, 90];
  const POINTS = [0, 500, 1000, 2000];

  // A new game opens on its first question card; pasting many at once is one click away.
  let pasting = $state(false);
  let pasted = $state("");
  const preview = $derived(questionsFromText(pasted, game.kind));

  function addPasted() {
    if (!preview.length) return;
    // An empty first question gives way to the pasted ones.
    const kept = game.questions.filter((question) => question.prompt.trim() || question.choices.some((choice) => choice.trim()));
    game.questions = [...kept, ...preview];
    pasted = "";
    pasting = false;
  }

  function move(index: number, by: number) {
    const to = index + by;
    if (to < 0 || to >= game.questions.length) return;
    const list = [...game.questions];
    [list[index], list[to]] = [list[to]!, list[index]!];
    game.questions = list;
  }

  function duplicate(index: number) {
    const copy = { ...$state.snapshot(game.questions[index]!), id: `q:${Math.random().toString(36).slice(2, 10)}` };
    game.questions.splice(index + 1, 0, copy);
  }

  function addQuestion() {
    game.questions.push(blankQuestion());
    // The new card comes into view, its question box ready to type in.
    requestAnimationFrame(() => {
      const boxes = document.querySelectorAll<HTMLTextAreaElement>(".game-editor .prompt");
      boxes[boxes.length - 1]?.focus();
    });
  }
</script>

<section class="game-editor">
  <nav class="ed-top" aria-label={t("Where you are")}>
    <button type="button" class="back" onclick={oncancel} title={t("Back without saving")}><Icon name="chevron-left" size={15} /> {t("Back")}</button>
    <strong class="what">{game.title.trim() || (quiz ? t("New quiz") : t("New poll"))}</strong>
    <span class="count">{tn(readyCount, "{n} question ready", "{n} questions ready")}{readyCount < game.questions.length ? ` · ${t("{n} to finish", { n: game.questions.length - readyCount })}` : ""}</span>
  </nav>

  {#if fromAi}<p class="ai-check"><Icon name="sparkles" size={14} /> {t("Written by the AI. Read each question and check the right answer before you save: the AI can be wrong.")}</p>{/if}

  <div class="fld">
    <span class="label" id="game-name">{t("Name")}</span>
    <input class="title" bind:value={game.title} maxlength="80" placeholder={t("Name of the quiz or poll")} aria-labelledby="game-name" />
  </div>
  <span class="label">{t("Kind")}</span>

  <div class="kind" role="radiogroup" aria-label={t("Kind")}>
    <button type="button" role="radio" aria-checked={quiz} class:on={quiz} onclick={() => (game.kind = "quiz")}>
      <strong>{t("Quiz")}</strong><span>{t("Each question has a right answer. Points, a leaderboard and a podium.")}</span>
    </button>
    <button type="button" role="radio" aria-checked={!quiz} class:on={!quiz} onclick={() => (game.kind = "poll")}>
      <strong>{t("Poll")}</strong><span>{t("No right answer. The room sees how everyone voted.")}</span>
    </button>
  </div>
  {#if !quiz}
    <label class="anon"><input type="checkbox" class="switch" role="switch" checked={!!game.anonymous} onchange={(event) => (game.anonymous = event.currentTarget.checked || undefined)} /> <span><strong>{t("Anonymous")}</strong>{t("Nobody sees who chose what: no names on the screen, and phones say their answer is anonymous. Good for honest feedback.")}</span></label>
  {/if}

  <details class="more">
    <summary>{t("Description and sermon series")}</summary>
    <label>{t("Description")}<input bind:value={game.description} maxlength="300" placeholder={t("Shown with the game")} /></label>
    <label>{t("Sermon series (optional)")}<input bind:value={game.series} maxlength="80" list="game-series" placeholder={t("Groups the quiz with the rest of its series")} /></label>
    <datalist id="game-series">{#each seriesNames as name (name)}<option value={name}></option>{/each}</datalist>
  </details>

  {#if pasting}
    <div class="paste">
      <div class="paste-head">
        <strong>{t("Paste or type your questions")}</strong>
        <button type="button" class="link" onclick={() => (pasting = false)}>{t("Write them one by one instead")}</button>
      </div>
      <div class="paste-body">
        <textarea bind:value={pasted} placeholder={t("Who built the ark?\n* Noah\nMoses\nAbraham\n\nHow many disciples did Jesus choose?\nSeven\n* Twelve\nSeventy")}></textarea>
        <div class="how">
          <p>{t("The first line is the question, each line after it an answer.")}</p>
          <p>{t("Leave an empty line between questions.")}</p>
          {#if quiz}<p>{t("Put * before the right answer, or add a line like Answer: B.")}</p>{/if}
          <p>{t("Numbers and letters in front, like 1. or a), are fine.")}</p>
        </div>
      </div>
      <div class="row">
        <button type="button" class="btn accent" disabled={!preview.length} onclick={addPasted}><Icon name="plus" size={14} /> {preview.length ? tn(preview.length, "Add {n} question", "Add {n} questions") : t("Add questions")}</button>
        {#if pasted.trim() && !preview.length}<span class="hint warn">{t("No question found yet: each needs a line for the question and at least two answers.")}</span>{/if}
      </div>
    </div>
  {/if}

  <ol class="cards">
    {#each game.questions as item, index (item.id)}
      {@const done = ready(item, game.kind)}
      <li class="card" class:unfinished={!done}>
        <div class="card-head">
          <span class="num">{index + 1}</span>
          <div class="fld grow">
            <span class="label">{t("Question")}</span>
            <textarea class="prompt" bind:value={item.prompt} maxlength="300" rows="2" placeholder={t("Type the question")} aria-label={t("Question {n}", { n: index + 1 })}></textarea>
          </div>
        </div>
        <div class="answers">
          <span class="label">{quiz ? t("Answers · mark the right one") : t("Answers")}</span>
          {#each item.choices as _choice, choiceIndex (choiceIndex)}
            {@const right = quiz && item.correct === choiceIndex}
            <div class="answer" class:right>
              <ChoiceMark index={choiceIndex} size={26} />
              <input bind:value={item.choices[choiceIndex]} maxlength="120" placeholder={t("Answer {n}", { n: choiceIndex + 1 })} />
              {#if quiz}
                <button type="button" class="right-btn" class:on={right} aria-pressed={right} title={right ? t("The right answer") : t("Mark as the right answer")} onclick={() => (item.correct = choiceIndex)}>
                  <Icon name="check" size={13} /><span>{right ? t("Right") : t("Mark right")}</span>
                </button>
              {/if}
              <!-- The remove button keeps its place even when hidden, so every answer box lines up. -->
              <button type="button" class="x" style:visibility={item.choices.length > 2 ? "visible" : "hidden"} aria-label={t("Remove answer")} title={t("Remove answer")} onclick={() => { item.choices.splice(choiceIndex, 1); if (item.correct !== null && item.correct >= item.choices.length) item.correct = 0; else if (item.correct !== null && item.correct > choiceIndex) item.correct -= 1; }}><Icon name="close" size={13} /></button>
            </div>
          {/each}
          {#if item.choices.length < MOST_CHOICES}<button type="button" class="add-answer" onclick={() => item.choices.push("")}><Icon name="plus" size={13} /> {t("Add an answer")}</button>{/if}
        </div>
        <div class="card-foot">
          <label>{t("Time")}<select bind:value={item.seconds}>{#each TIMES as n (n)}<option value={n}>{n ? t("{n} seconds", { n }) : t("No clock")}</option>{/each}</select></label>
          {#if quiz}<label>{t("Points")}<select bind:value={item.points}>{#each [...new Set([...POINTS, item.points])].sort((a, b) => a - b) as n (n)}<option value={n}>{n === 2000 ? t("Double (2000)") : n}</option>{/each}</select></label>{/if}
          <span class="tools">
          <button type="button" class="icon" title={t("Move up")} aria-label={t("Move up")} disabled={index === 0} onclick={() => move(index, -1)}><Icon name="chevron-up" size={14} /></button>
          <button type="button" class="icon" title={t("Move down")} aria-label={t("Move down")} disabled={index === game.questions.length - 1} onclick={() => move(index, 1)}><Icon name="chevron-down" size={14} /></button>
          <button type="button" class="icon" title={t("Duplicate")} aria-label={t("Duplicate")} onclick={() => duplicate(index)}><Icon name="copy" size={14} /></button>
          <button type="button" class="icon" title={t("Remove question")} aria-label={t("Remove question")} disabled={game.questions.length <= 1} onclick={() => game.questions.splice(index, 1)}><Icon name="trash" size={14} /></button>
          </span>
        </div>
      </li>
    {/each}
  </ol>

  <div class="adds">
    <button type="button" class="add" onclick={addQuestion}><Icon name="plus" size={15} /> {t("Add a question")}</button>
    {#if !pasting}<button type="button" class="add" onclick={() => (pasting = true)}><Icon name="list" size={15} /> {t("Paste several questions")}</button>{/if}
  </div>

  <div class="save">
    <span class="hint">{!game.title.trim() ? t("Give it a name to save it.") : readyCount < game.questions.length ? t("Unfinished questions are kept but left out when you play.") : tn(readyCount, "{n} question, ready to play.", "{n} questions, ready to play.")}</span>
    <button type="button" class="btn" onclick={oncancel}>{t("Cancel")}</button>
    <button type="button" class="btn accent" disabled={!game.title.trim()} onclick={onsave}><Icon name="check" size={14} /> {quiz ? t("Save quiz") : t("Save poll")}</button>
  </div>
</section>

<style>
  .game-editor { display: grid; gap: 12px; container-type: inline-size; }
  .ed-top { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px; margin: -2px -2px 0; padding: 6px 2px 8px; background: var(--panel, var(--bg)); border-bottom: 1px solid var(--line); }
  .back { flex: none; display: inline-flex; align-items: center; gap: 3px; height: 30px; padding: 0 12px 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--field, transparent); color: var(--ink); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
  .back:hover { border-color: var(--accent); }
  .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .count { flex: none; margin-left: auto; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .label { display: block; color: var(--muted); font-size: 11.5px; font-weight: 650; letter-spacing: 0.02em; }
  .fld { display: grid; gap: 5px; min-width: 0; }
  .fld.grow { flex: 1; }
  .ai-check { display: flex; align-items: flex-start; gap: 6px; margin: 0; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 12%, transparent); font-size: 12px; line-height: 1.4; }
  input, textarea, select { min-height: 34px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--field, transparent); color: var(--ink); font: inherit; font-size: 13px; transition: border-color 0.15s, box-shadow 0.15s; }
  input::placeholder, textarea::placeholder { color: color-mix(in srgb, var(--muted) 75%, transparent); }
  input:hover, textarea:hover, select:hover { border-color: color-mix(in srgb, var(--ink) 22%, var(--line)); }
  input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
  /* Dropdowns drawn alike on every computer: a quiet chevron on the right. */
  select { appearance: none; padding-right: 28px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 9px center; cursor: pointer; }
  .title { padding: 10px 12px; font-size: 17px; font-weight: 700; }
  .anon { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
  .anon span { display: grid; gap: 2px; color: var(--muted); font-size: 12px; line-height: 1.4; }
  .anon strong { color: var(--ink); font-size: 13px; }
  .kind { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .kind button { display: grid; gap: 3px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: transparent; color: var(--muted); font: inherit; text-align: left; cursor: pointer; }
  .kind button strong { color: var(--ink); font-size: 13.5px; }
  .kind button span { font-size: 11.5px; line-height: 1.4; }
  .kind button.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .more { display: grid; gap: 8px; }
  .more summary { color: var(--muted); font-size: 12px; cursor: pointer; }
  .more[open] summary { margin-bottom: 8px; }
  .more label { display: grid; gap: 4px; margin-bottom: 8px; color: var(--muted); font-size: 12px; }
  .paste { display: grid; gap: 10px; padding: 12px; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 12px; background: color-mix(in srgb, var(--accent) 5%, transparent); }
  .paste-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
  .paste-head strong { font-size: 13.5px; }
  .paste-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .paste textarea { min-height: 170px; resize: vertical; font-size: 13px; line-height: 1.5; }
  .how { display: grid; gap: 4px; align-content: start; }
  .how p { margin: 0; color: var(--muted); font-size: 11.5px; line-height: 1.45; }
  @container (min-width: 620px) { .paste-body { grid-template-columns: minmax(0, 1fr) 220px; } }
  .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .card { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--field, transparent); }
  .card.unfinished { border-style: dashed; }
  .card-head { display: flex; align-items: flex-start; gap: 10px; }
  .num { flex: none; display: grid; place-items: center; width: 26px; height: 26px; margin-top: 4px; border-radius: 50%; background: var(--ink); color: var(--panel); font-size: 12px; font-weight: 800; }
  .prompt { flex: 1; min-width: 0; min-height: 44px; resize: vertical; font-size: 14px; font-weight: 600; line-height: 1.4; }
  .answers { display: grid; gap: 6px; padding-left: 36px; }
  /* Mark, words, right-answer button, remove: the same columns on every row. */
  .answer { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto 26px; align-items: center; gap: 8px; padding: 3px; border-radius: 10px; }
  .answer.right { background: color-mix(in srgb, var(--good, #3ccf7a) 13%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--good, #3ccf7a) 55%, transparent); }
  .answer input { min-width: 0; }
  .right-btn { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 98px; height: 30px; padding: 0 9px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--muted); font: inherit; font-size: 11.5px; font-weight: 650; cursor: pointer; }
  .right-btn:hover { color: var(--ink); }
  .right-btn.on { border-color: transparent; background: var(--good, #3ccf7a); color: #06210f; }
  .x { flex: none; display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }
  .x:hover { background: color-mix(in srgb, currentColor 10%, transparent); color: var(--ink); }
  .add-answer { justify-self: start; display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
  .add-answer:hover { color: var(--ink); background: color-mix(in srgb, currentColor 8%, transparent); }
  .card-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-top: 8px; border-top: 1px solid var(--line); }
  .card-foot label { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
  .card-foot select { width: auto; min-height: 30px; padding: 4px 26px 4px 8px; font-size: 12px; background-position: right 7px center; }
  .tools { display: inline-flex; gap: 2px; margin-left: auto; }
  .icon { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); cursor: pointer; }
  .icon:hover:not(:disabled) { background: color-mix(in srgb, currentColor 10%, transparent); color: var(--ink); }
  .icon:disabled { opacity: 0.35; cursor: default; }
  .adds { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
  .add { display: flex; align-items: center; justify-content: center; gap: 6px; height: 42px; border: 1px dashed var(--line); border-radius: 12px; background: transparent; color: var(--muted); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
  .add:hover { border-color: var(--accent); color: var(--ink); }
  .save { position: sticky; bottom: -16px; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 0; background: var(--panel); border-top: 1px solid var(--line); }
  .save .hint { margin-right: auto; }
  .btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 16px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.accent { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .hint { color: var(--muted); font-size: 11.5px; }
  .hint.warn { color: var(--warn, #e8a33a); }
  .link { border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; text-decoration: underline; }
</style>
