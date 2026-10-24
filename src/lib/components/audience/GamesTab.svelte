<script lang="ts">
  import { MUSIC_STYLE_INFO, type MusicStyle } from "../../game/sounds";
  import { audienceRoom } from "../../app/rooms.svelte";
  import { session } from "../../app/session.svelte";
  import { quizPacks } from "../../app/starter.svelte";
  import { BUILT_IN_GAMES, newGame, seriesFinal, type Game } from "../../domain/games";
  import { CHOICE_STYLES, TEAMS } from "../../domain/game-colors";
  import { reportSummary } from "../../domain/game-report";
  import ReportCard from "./ReportCard.svelte";
  import GameView from "./GameView.svelte";
  import GameEditor from "./GameEditor.svelte";
  import ChoiceMark from "./ChoiceMark.svelte";
  import { msg, t, tn } from "../../i18n/core";
  import { GAME_COUNTS, type GameAudience, type GameLevel, type GameSource } from "../../ai/games";
  import Icon from "../Icon.svelte";

  // Quizzes and polls on people's phones. The library shows each one as a card; opening it shows
  // every question with its answers (the right one marked); the editor makes new ones, typed one by
  // one or pasted as text; and a game runs a question at a time, with the screen following along.
  let editing = $state<Game | null>(null);
  let viewing = $state<string | null>(null);
  let making = $state("");
  let note = $state("");

  const mine = $derived(session.workspace.games ?? []);
  const everything = $derived([...mine, ...BUILT_IN_GAMES]);
  const viewed = $derived(viewing ? (everything.find((game) => game.id === viewing) ?? null) : null);
  const isBuiltIn = (game: Game) => game.id.startsWith("builtin:");
  const titleOf = (game: Game) => (isBuiltIn(game) ? t(game.title) : game.title);

  // The quiz bank: games grouped by sermon series (named ones first, by name), then quizzes, then polls.
  const seriesNames = $derived([...new Set(mine.map((game) => game.series).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b)));
  const looseQuizzes = $derived(mine.filter((game) => !game.series && game.kind === "quiz"));
  const loosePolls = $derived(mine.filter((game) => !game.series && game.kind === "poll"));
  const reports = $derived(session.workspace.gameReports ?? []);
  let openReport = $state<string | null>(null);
  const shownReport = $derived(reports.find((report) => report.id === openReport) ?? null);
  const percent = (share: number | null) => (share === null ? "–" : `${Math.round(share * 100)}%`);

  // Finding a game in a long list: words match titles, series, descriptions and question text.
  let query = $state("");
  let show = $state<"all" | "quiz" | "poll" | "mine">("all");
  const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const searching = $derived(query.trim() !== "" || show !== "all");
  const results = $derived.by(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return everything.filter((game) => {
      if (show === "mine" && isBuiltIn(game)) return false;
      if ((show === "quiz" || show === "poll") && game.kind !== show) return false;
      if (!words.length) return true;
      const text = fold([titleOf(game), isBuiltIn(game) ? t(game.description) : game.description, game.series ?? "", ...game.questions.flatMap((question) => [question.prompt, ...question.choices])].join(" "));
      return words.every((word) => text.includes(word));
    });
  });
  const recent = $derived(audienceRoom.recentGames.map((id) => everything.find((game) => game.id === id)).filter((game): game is Game => !!game).slice(0, 4));

  const run = $derived(audienceRoom.playing);
  const question = $derived(audienceRoom.question);
  const activity = $derived(audienceRoom.view?.activity ?? { kind: "none" as const });
  const live = $derived(activity.kind !== "none" && question && activity.question.id === question.id ? activity : null);
  const answers = $derived(audienceRoom.view?.answers ?? []);

  $effect(() => {
    void quizPacks.load();
  });

  /** Play: a room opens first when none is open, so phones can join. */
  async function play(game: Game) {
    note = "";
    if (!audienceRoom.current) {
      await audienceRoom.start();
      if (!audienceRoom.current) {
        note = audienceRoom.error || t("The room could not open. Check the internet and try again.");
        return;
      }
    }
    audienceRoom.play(game);
  }

  async function make(kind: "which-book" | "finish-verse") {
    making = kind;
    note = "";
    const game = await audienceRoom.makeFromBible(kind);
    making = "";
    if (game) await play(game);
    else note = t("No Bible text could be read on this computer. Install a Bible in Settings › Bible.");
  }

  const copyOf = (game: Game, title: string): Game => ({ ...structuredClone($state.snapshot(game) as Game), id: `game:${Math.random().toString(36).slice(2, 10)}`, title, updatedAt: new Date().toISOString() });

  function create(kind: Game["kind"]) {
    const game = newGame(kind === "quiz" ? t("New quiz") : t("New poll"));
    editing = { ...game, kind, questions: game.questions.map((question) => ({ ...question, correct: kind === "poll" ? null : 0 })) };
    fromAi = false;
  }

  function saveEdit() {
    if (!editing) return;
    const saved = $state.snapshot(editing) as Game;
    session.saveGame(saved);
    editing = null;
    fromAi = false;
    viewing = saved.id;
  }

  function playSeries(name: string) {
    const game = seriesFinal(mine, name);
    if (game) void play({ ...game, title: t("{series}: series final", { series: name }) });
  }

  // The AI quiz maker: from a sermon (who was listening?), a book the church is reading (its
  // summary pasted in), pasted text, a Bible passage or a topic. What it writes opens in the editor.
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
  <GameEditor bind:game={editing} {fromAi} {seriesNames} onsave={saveEdit} oncancel={() => { editing = null; fromAi = false; }} />
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
  {@const quiz = run.game.kind === "quiz"}
  {@const last = run.index + 1 >= run.game.questions.length}
  {@const people = audienceRoom.view?.people ?? 0}
  <section class="run">
    <div class="run-head">
      <strong>{run.game.title}</strong>
      <span>{t("Question {n} of {total}", { n: run.index + 1, total: run.game.questions.length })}</span>
    </div>
    <div class="progress" aria-hidden="true">{#each run.game.questions as _q, index (index)}<i class:done={index < run.index} class:now={index === run.index}></i>{/each}</div>
    <div class="next-step">
      {#if !live}
        <button type="button" class="btn accent big step" onclick={() => audienceRoom.ask()}>{t("Start question {n}", { n: run.index + 1 })}</button>
        <p>{audienceRoom.follow ? (question.seconds ? t("Shows it on the screen and on phones, and starts the {n}-second clock.", { n: question.seconds }) : t("Shows it on the screen and on phones.")) : t("Opens it on phones. The screen stays as it is; change it under How the game runs.")}{#if run.index === 0}{" "}<strong>{tn(people, "{n} person has joined.", "{n} people have joined.")}</strong>{/if}</p>
      {:else if live.phase === "open"}
        <button type="button" class="btn accent big step" onclick={() => audienceRoom.stopAnswers()}>{t("Stop answers now")}</button>
        <p>{tn(audienceRoom.view?.answered ?? 0, "{n} answer in.", "{n} answers in.")} {question.seconds ? t("Answers close by themselves when the clock runs out.") : ""}</p>
      {:else if live.phase === "closed"}
        <button type="button" class="btn accent big step" onclick={() => audienceRoom.reveal()}>{quiz ? t("Show the answer") : t("Show the results")}</button>
        <p>{quiz ? t("Answers are closed. Show which one was right, on the screen and on phones.") : t("Answers are closed. Show how the room voted.")}</p>
      {:else}
        <div class="step-row">
          {#if quiz}<button type="button" class="btn big" onclick={() => audienceRoom.showGame("leaderboard", audienceRoom.follow)}>{t("Leaderboard")}</button>{/if}
          {#if !last}
            <button type="button" class="btn accent big step" onclick={() => audienceRoom.next()}>{t("Next: question {n}", { n: run.index + 2 })}</button>
          {:else}
            <button type="button" class="btn accent big step" onclick={() => audienceRoom.finish()}>{quiz ? t("Finish with the podium") : t("Finish game")}</button>
          {/if}
        </div>
        <p>{quiz ? t("The answer is showing.") : t("The results are showing.")} {last ? t("That was the last question.") : t("Next shows the following question, ready to start.")}</p>
      {/if}
    </div>
    <p class="prompt">{question.prompt}</p>
    <ol class="answers">
      {#each question.choices.filter((choice) => choice.trim()) as choice, index (index)}
        {@const count = live ? (answers[index] ?? 0) : 0}
        {@const total = answers.reduce((sum, n) => sum + n, 0)}
        {@const right = question.correct === index}
        <li class:right>
          <i style:width="{live && total ? (count / total) * 100 : 0}%" style:background="color-mix(in srgb, {CHOICE_STYLES[index]?.color} 28%, transparent)"></i>
          <ChoiceMark {index} size={22} />
          <span class="label">{choice}</span>
          {#if right}<span class="right-tag"><Icon name="check" size={12} /> {t("Right")}</span>{/if}
          {#if live}<b>{count}</b>{/if}
        </li>
      {/each}
    </ol>
    <details class="switches">
      <summary>{t("How the game runs")}</summary>
      <div class="screen">
        <span>{audienceRoom.follow ? t("Put on the screen yourself:") : t("Put on Preview:")}</span>
        <button type="button" class="btn" class:on={audienceRoom.screenStage === "lobby"} onclick={() => audienceRoom.showGame("lobby", audienceRoom.follow)}>{t("Lobby")}</button>
        <button type="button" class="btn" class:on={audienceRoom.screenStage === "question"} onclick={() => audienceRoom.showGame("question", audienceRoom.follow)}>{t("Question")}</button>
        <button type="button" class="btn" class:on={audienceRoom.screenStage === "results"} disabled={!live} onclick={() => audienceRoom.showGame("results", audienceRoom.follow)}>{t("Results")}</button>
        {#if run.game.kind === "quiz"}
          <button type="button" class="btn" class:on={audienceRoom.screenStage === "leaderboard"} onclick={() => audienceRoom.showGame("leaderboard", audienceRoom.follow)}>{t("Leaderboard")}</button>
          <button type="button" class="btn" class:on={audienceRoom.screenStage === "podium"} onclick={() => audienceRoom.showGame("podium", audienceRoom.follow)}>{t("Podium")}</button>
        {/if}
      </div>
      <label><input type="checkbox" class="switch" checked={audienceRoom.follow} onchange={(event) => audienceRoom.setFollow(event.currentTarget.checked)} /> <span>{t("Screen follows the game")}<small>{t("Each question, answer and the podium go to the screen as they happen; when time is up, the answer shows by itself.")}</small></span></label>
      <label><input type="checkbox" class="switch" checked={audienceRoom.sounds} onchange={(event) => audienceRoom.setSounds(event.currentTarget.checked)} /> <span>{t("Game sounds")}<small>{t("Music while people join and answer, ticks, a gong, a drumroll and a fanfare, on the audience screen.")}</small></span></label>
      {#if audienceRoom.sounds}
        <div class="music" role="radiogroup" aria-label={t("Music style")}>
          <span>{t("Music style")}</span>
          {#each Object.entries(MUSIC_STYLE_INFO) as [id, info] (id)}
            <div class="style" class:on={audienceRoom.musicStyle === id}>
              <button type="button" role="radio" aria-checked={audienceRoom.musicStyle === id} onclick={() => audienceRoom.setMusicStyle(id as MusicStyle)}><strong>{t(info.name)}</strong><small>{t(info.hint)}</small></button>
              {#if id !== "surprise"}<button type="button" class="hear" aria-label={t("Listen to {name}", { name: t(info.name) })} title={t("Listen here, on this computer")} onclick={() => audienceRoom.hearMusic(id as MusicStyle)}>{audienceRoom.hearing === id ? "■" : "▶"}</button>{/if}
            </div>
          {/each}
        </div>
      {/if}
      <label><input type="checkbox" class="switch" checked={audienceRoom.ready} onchange={(event) => audienceRoom.setReady(event.currentTarget.checked)} /> <span>{t("Get ready countdown")}<small>{t("Each question shows alone for 4 seconds to read, then the answers open and the clock starts.")}</small></span></label>
      <label><input type="checkbox" class="switch" checked={audienceRoom.auto} disabled={!audienceRoom.follow} onchange={(event) => audienceRoom.setAuto(event.currentTarget.checked)} /> <span>{t("Runs by itself")}<small>{t("After each answer, the leaderboard, then the next question, with no clicks; the podium at the end. Needs the screen to follow the game.")}</small></span></label>
    </details>
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
{:else if viewed}
  <GameView
    game={viewed}
    builtIn={isBuiltIn(viewed)}
    onplay={() => void play(viewed)}
    onedit={() => (editing = structuredClone($state.snapshot(viewed)) as Game)}
    oncopy={() => (editing = copyOf(viewed, isBuiltIn(viewed) ? titleOf(viewed) : t("{title} (copy)", { title: viewed.title })))}
    ondelete={isBuiltIn(viewed) ? undefined : () => { session.removeGame(viewed.id); viewing = null; }}
    onback={() => (viewing = null)}
  />
{:else}
  <section class="games-lib">
    <div class="new-tiles">
      <button type="button" class="tile" onclick={() => create("quiz")}>
        <span class="glyph quiz" aria-hidden="true">{#each [0, 1, 2, 3] as index (index)}<ChoiceMark {index} size={14} />{/each}</span>
        <strong>{t("New quiz")}</strong><span>{t("Right answers and points")}</span>
      </button>
      <button type="button" class="tile" onclick={() => create("poll")}>
        <span class="glyph poll" aria-hidden="true"><i style:height="60%"></i><i style:height="100%"></i><i style:height="35%"></i></span>
        <strong>{t("New poll")}</strong><span>{t("Ask the room, see the votes")}</span>
      </button>
      {#if session.aiOn("games")}
        <button type="button" class="tile ai" onclick={() => { asking = true; aiError = ""; }}>
          <span class="glyph"><Icon name="sparkles" size={20} /></span>
          <strong>{t("Make with AI")}</strong><span>{t("From the sermon, a passage or text")}</span>
        </button>
      {/if}
    </div>
    {#if note}<p class="note" role="alert">{note}</p>{/if}
    {#if audienceRoom.lastReport}
      <ReportCard report={audienceRoom.lastReport} onclose={() => (audienceRoom.lastReport = null)} />
    {/if}

    <div class="find">
      <span class="search"><Icon name="search" size={14} /><input type="text" bind:value={query} placeholder={t("Search quizzes, polls and questions")} aria-label={t("Search games")} />{#if query}<button type="button" class="x" aria-label={t("Clear search")} onclick={() => (query = "")}>×</button>{/if}</span>
      <div class="chips" role="radiogroup" aria-label={t("Show")}>
        {#each [{ id: "all", label: t("All") }, { id: "quiz", label: t("Quizzes") }, { id: "poll", label: t("Polls") }, { id: "mine", label: t("Mine") }] as chip (chip.id)}
          <button type="button" role="radio" aria-checked={show === chip.id} class:on={show === chip.id} onclick={() => (show = chip.id as typeof show)}>{chip.label}</button>
        {/each}
      </div>
    </div>

    {#if searching}
      <h3>{tn(results.length, "{n} found", "{n} found")}</h3>
      <div class="cards">{#each results as game (game.id)}{@render card(game)}{:else}<p class="note">{t("Nothing matches. Try other words, or All.")}</p>{/each}</div>
    {:else}
      {#if recent.length}
        <h3>{t("Played lately")}</h3>
        <div class="cards">{#each recent as game (game.id)}{@render card(game)}{/each}</div>
      {/if}
      {#each seriesNames as name (name)}
        {@const games = mine.filter((game) => game.series === name)}
        <div class="series-head">
          <h3>{name}</h3>
          {#if games.filter((game) => game.kind === "quiz").length >= 2}<button type="button" class="btn" title={t("Questions from every quiz in the series, mixed")} onclick={() => playSeries(name)}>{t("Play the series final")}</button>{/if}
        </div>
        <div class="cards">{#each games as game (game.id)}{@render card(game)}{/each}</div>
      {/each}
      {#if looseQuizzes.length}
        <h3>{t("Your quizzes")}</h3>
        <div class="cards">{#each looseQuizzes as game (game.id)}{@render card(game)}{/each}</div>
      {/if}
      {#if loosePolls.length}
        <h3>{t("Your polls")}</h3>
        <div class="cards">{#each loosePolls as game (game.id)}{@render card(game)}{/each}</div>
      {/if}
      {#if !mine.length}
        <p class="empty">{t("Your own quizzes and polls will be here. Start with New quiz, or play one of the ready ones below.")}</p>
      {/if}

      <h3>{t("Ready to play")}</h3>
      <div class="cards">
        <div class="card fresh">
          <button type="button" class="open" disabled={!!making} onclick={() => make("which-book")}>
            <span class="glyph"><Icon name="bible" size={18} /></span>
            <span class="words"><strong>{t("Which book?")}</strong><span>{making === "which-book" ? t("Making…") : t("Name the book each verse comes from. Different every time.")}</span></span>
          </button>
        </div>
        <div class="card fresh">
          <button type="button" class="open" disabled={!!making} onclick={() => make("finish-verse")}>
            <span class="glyph"><Icon name="bible" size={18} /></span>
            <span class="words"><strong>{t("Finish the verse")}</strong><span>{making === "finish-verse" ? t("Making…") : t("Choose how each verse ends. Different every time.")}</span></span>
          </button>
        </div>
        {#each BUILT_IN_GAMES as game (game.id)}{@render card(game)}{/each}
      </div>

      {#if quizPacks.packs.length}
        <h3>{t("More to add")}</h3>
        <div class="cards">
          {#each quizPacks.packs as pack (pack.id)}
            {@const added = quizPacks.installed(pack.id)}
            <div class="card pack">
              <div class="open static">
                <span class="glyph"><Icon name="download" size={18} /></span>
                <span class="words"><strong>{pack.name}</strong><span>{pack.description}</span></span>
              </div>
              <button type="button" class="btn" class:accent={!added} disabled={added || quizPacks.busy === pack.id} onclick={() => quizPacks.install(pack)}>{added ? t("Added") : quizPacks.busy === pack.id ? t("Adding…") : tn(pack.count, "Add {n}", "Add {n}")}</button>
            </div>
          {/each}
        </div>
        {#if quizPacks.error}<p class="note" role="alert">{quizPacks.error}</p>{/if}
      {/if}

      {#if reports.length}
        <h3>{t("Who was listening")}</h3>
        {#if shownReport}
          <ReportCard report={shownReport} onclose={() => (openReport = null)} ondelete={() => { session.removeGameReport(shownReport.id); openReport = null; }} />
        {/if}
        {#each reports.slice(0, 10) as report (report.id)}
          {#if report.id !== openReport}
            <button type="button" class="report-row" onclick={() => (openReport = report.id)}>
              <span class="words"><strong>{report.title}</strong><span>{new Date(report.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {tn(report.players, "{n} player", "{n} players")}</span></span>
              <b title={t("Answers right")}>{percent(reportSummary(report).right)}</b>
            </button>
          {/if}
        {/each}
      {/if}
    {/if}
  </section>
{/if}

{#snippet card(game: Game)}
  {@const quiz = game.kind === "quiz"}
  <div class="card">
    <button type="button" class="open" onclick={() => (viewing = game.id)} title={t("See every question")}>
      {#if quiz}
        <span class="glyph quiz" aria-hidden="true">{#each [0, 1, 2, 3] as index (index)}<ChoiceMark {index} size={14} />{/each}</span>
      {:else}
        <span class="glyph poll" aria-hidden="true"><i style:height="60%"></i><i style:height="100%"></i><i style:height="35%"></i></span>
      {/if}
      <span class="words">
        <strong>{titleOf(game)}</strong>
        <span>{quiz ? t("Quiz") : t("Poll")} · {tn(game.questions.length, "{n} question", "{n} questions")}{game.series ? ` · ${game.series}` : ""}</span>
      </span>
    </button>
    <button type="button" class="btn play" aria-label={t("Play {title}", { title: titleOf(game) })} title={t("Play")} onclick={() => void play(game)}><Icon name="play" size={13} /></button>
  </div>
{/snippet}

<style>
  section { display: grid; gap: 10px; container-type: inline-size; }
  h3 { margin: 10px 0 0; font-size: 12.5px; font-weight: 700; color: var(--muted); }
  .row, .screen { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .screen span { color: var(--muted); font-size: 12px; margin-right: 2px; }
  .screen .btn.on { border-color: var(--accent); color: var(--accent); }
  .btn { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .btn:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.accent { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  .btn.big { height: 34px; padding: 0 16px; font-size: 13px; }
  .note { margin: 0; color: var(--muted); font-size: 12px; }
  .empty { margin: 4px 0 0; padding: 14px; border: 1px dashed var(--line); border-radius: 12px; color: var(--muted); font-size: 12.5px; line-height: 1.5; }

  .new-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  @container (min-width: 640px) { .new-tiles { grid-template-columns: repeat(3, 1fr); } .new-tiles .tile.ai { grid-column: auto; grid-template-columns: none; align-items: start; } .new-tiles .tile.ai .glyph { grid-row: auto; } .new-tiles .tile.ai strong { margin-top: 6px; } }
  .tile { display: grid; justify-items: start; gap: 3px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--field, transparent); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .tile:hover { border-color: var(--accent); }
  .tile strong { margin-top: 6px; font-size: 13.5px; }
  .tile > span:last-child { color: var(--muted); font-size: 11.5px; line-height: 1.35; }
  .tile.ai { grid-column: 1 / -1; display: grid; grid-template-columns: auto 1fr; column-gap: 12px; align-items: center; }
  .tile.ai .glyph { grid-row: span 2; }
  .tile.ai strong { margin-top: 0; }
  .tile.ai { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .tile.ai .glyph { color: var(--accent); }

  .glyph { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: color-mix(in srgb, currentColor 8%, transparent); }
  .glyph.quiz { grid-template-columns: 1fr 1fr; gap: 2px; padding: 2px; background: transparent; }
  .glyph.poll { display: flex; align-items: flex-end; justify-content: center; gap: 3px; padding: 7px; background: color-mix(in srgb, #1368ce 18%, transparent); }
  .glyph.poll i { display: block; width: 5px; border-radius: 2px; background: #5b9cf0; }

  .find { display: grid; gap: 10px; }
  .search { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 8px 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field, transparent); color: var(--muted); }
  .search:focus-within { border-color: var(--accent); color: var(--ink); }
  .search input { flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 13px; outline: none; }
  .search .x { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 16px; cursor: pointer; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips button { height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: 99px; background: transparent; color: var(--muted); font: inherit; font-size: 11.5px; font-weight: 650; cursor: pointer; }
  .chips button.on { background: var(--ink); border-color: var(--ink); color: var(--panel); }

  .cards { display: grid; gap: 6px; }
  @container (min-width: 640px) { .cards { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); } }
  .card { display: flex; align-items: center; gap: 6px; padding: 6px 8px 6px 6px; border: 1px solid var(--line); border-radius: 12px; }
  .card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 4px; border: 0; border-radius: 8px; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .open:disabled { cursor: progress; }
  .open.static { cursor: default; }
  .words { min-width: 0; display: grid; gap: 2px; }
  .words strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .words > span { color: var(--muted); font-size: 11.5px; line-height: 1.35; }
  .btn.play { width: 30px; height: 30px; padding: 0; justify-content: center; border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); border-radius: 50%; }
  .series-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 10px; }
  .series-head h3 { margin: 0; }
  .report-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .report-row .words { flex: 1; }
  .report-row b { font-size: 15px; font-variant-numeric: tabular-nums; }

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

  .run-head { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 12px; }
  .run-head strong { color: var(--ink); }
  .progress { display: flex; gap: 3px; }
  .progress i { flex: 1; height: 4px; border-radius: 2px; background: color-mix(in srgb, currentColor 12%, transparent); }
  .progress i.done { background: color-mix(in srgb, var(--accent) 55%, transparent); }
  .progress i.now { background: var(--accent); }
  .prompt { margin: 2px 0 0; font-size: 17px; font-weight: 700; line-height: 1.35; }
  .answers { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .answers li { position: relative; display: flex; align-items: center; gap: 10px; padding: 7px 10px 7px 7px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .answers li > i { position: absolute; inset: 0 auto 0 0; transition: width 0.3s; }
  .answers li.right { border-color: color-mix(in srgb, var(--good, #3ccf7a) 70%, transparent); }
  .answers .label { position: relative; flex: 1; font-size: 13.5px; }
  .right-tag { position: relative; display: inline-flex; align-items: center; gap: 3px; color: var(--good, #3ccf7a); font-size: 11.5px; font-weight: 700; }
  .answers b { position: relative; min-width: 22px; text-align: right; font-variant-numeric: tabular-nums; }
  .answers :global(.mark) { position: relative; }
  .next-step { display: grid; gap: 6px; padding: 10px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .next-step .step { width: 100%; justify-content: center; }
  .next-step p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .next-step strong { color: var(--ink); }
  .step-row { display: flex; gap: 6px; }
  .step-row .step { flex: 1; }
  .switches { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; }
  .switches summary { color: var(--muted); font-size: 12px; font-weight: 650; cursor: pointer; }
  .switches[open] summary { margin-bottom: 4px; }
  .switches label { display: flex; align-items: flex-start; gap: 10px; margin-top: 6px; font-size: 13px; font-weight: 650; cursor: pointer; }
  .switches small { display: block; margin-top: 2px; color: var(--muted); font-size: 11.5px; font-weight: 500; line-height: 1.4; }
  .board { list-style: none; margin: 0; padding: 0; }
  .board li { display: flex; justify-content: space-between; padding: 5px 2px; border-bottom: 1px solid var(--line); }
  .teams-board i { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; }
  .link { justify-self: start; border: 0; background: none; color: var(--muted); font: inherit; cursor: pointer; padding: 2px 0; }
  @media (prefers-reduced-motion: reduce) { .answers li > i { transition: none; } }
  .music { display: grid; gap: 6px; padding: 4px 0 6px; }
  .music > span { color: var(--muted); font-size: 12px; font-weight: 650; }
  .style { display: flex; align-items: stretch; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; }
  .style.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .style > button:first-child { flex: 1; display: grid; gap: 1px; padding: 6px 10px; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; }
  .style small { color: var(--muted); font-size: 11px; }
  .hear { width: 36px; border: 0; border-left: 1px solid var(--line); background: transparent; color: var(--accent); font-size: 12px; cursor: pointer; }
</style>
