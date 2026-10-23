<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { CHOICE_STYLES, ordinal, playerColor, say, sayCount, type GamePlayer, type GameScreenData } from "../../domain/game-screen";
  import { GameSound } from "../../game/sounds";
  import QrView from "../QrView.svelte";

  // The game show on the screen. Each stage has its own moves: names pop into the lobby, the clock
  // runs down over the colour tiles, answers grow into bars, players slide up the leaderboard as
  // their scores roll, and the top three rise on the podium. Only the audience screen makes sound.
  let { data, audio = false }: { data: GameScreenData; audio?: boolean } = $props();

  const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Whether this screen makes sound is fixed for its life (the audience window, never a monitor).
  const sound = untrack(() => audio) && typeof window !== "undefined" ? new GameSound() : null;
  onDestroy(() => sound?.close());

  // --- The clock ------------------------------------------------------------------------------
  // Ticks only while a question is up: the other stages have nothing timed, so nothing to redraw.
  let now = $state(Date.now());
  $effect(() => {
    if (data.stage !== "question") return;
    now = Date.now();
    const clock = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(clock);
  });
  /** Reading time: the question alone, then the answers open and the clock starts. */
  const reading = $derived(data.stage === "question" && data.opensAt !== null && now < data.opensAt);
  const readLeft = $derived(reading && data.opensAt ? Math.max(1, Math.ceil((data.opensAt - now) / 1000)) : 0);
  const left = $derived(data.stage === "question" && !reading && data.endsAt ? Math.max(0, Math.ceil((data.endsAt - now) / 1000)) : null);
  const ringShare = $derived(data.endsAt && data.seconds ? Math.max(0, Math.min(1, (data.endsAt - now) / (data.seconds * 1000))) : 1);

  // --- Sound follows the stage ------------------------------------------------------------------
  let heardKey = "";
  let lastTick = -1;
  let joinedCount = -1;
  $effect(() => {
    const { key, stage, sounds } = data;
    if (!sound) return;
    if (!sounds) {
      sound.stop();
      heardKey = key;
      return;
    }
    if (key === heardKey) return;
    heardKey = key;
    lastTick = -1;
    if (stage === "lobby") sound.play("lobby");
    else if (stage === "question") {
      if (reading) sound.stop();
      else sound.play("question");
    } else if (stage === "results") {
      sound.stop();
      sound.chime();
    } else if (stage === "leaderboard") {
      sound.stop();
      sound.drumroll();
    } else if (stage === "podium") {
      sound.stop();
      sound.fanfare();
    }
  });
  // Get ready: a tick for each second of reading, then the music starts as the answers open.
  let lastRead = -1;
  $effect(() => {
    if (!sound || !data.sounds || data.stage !== "question") return;
    if (!reading) {
      sound.play("question");
      return;
    }
    if (readLeft !== lastRead) {
      lastRead = readLeft;
      sound.tick();
    }
  });
  // The last five seconds tick and the music hurries; at zero, the gong.
  $effect(() => {
    if (!sound || !data.sounds || data.stage !== "question" || left === null || left === lastTick) return;
    lastTick = left;
    sound.urgent(left <= 5);
    if (left > 0 && left <= 5) sound.tick();
    if (left === 0) {
      sound.stop();
      sound.gong();
    }
  });
  // A pop for each new name in the lobby.
  $effect(() => {
    const count = data.joined.length;
    if (sound && data.sounds && data.stage === "lobby" && joinedCount >= 0 && count > joinedCount) sound.pop();
    joinedCount = count;
  });

  // --- The leaderboard climbs -------------------------------------------------------------------
  /** "before": players in last round's order, scores as they were; "after": the new order, scores rolling up. */
  let climb = $state<"before" | "after">("after");
  let shown = $state<Record<number, number>>({});
  let climbTimer: ReturnType<typeof setTimeout> | undefined;
  let rolling = 0;
  // With teams on the board too, three players fit beneath them.
  const board = $derived(data.top.slice(0, data.teams ? 3 : 5));
  $effect(() => {
    const { key, stage } = data;
    void key;
    clearTimeout(climbTimer);
    cancelAnimationFrame(rolling);
    if (stage !== "leaderboard" && stage !== "podium") return;
    const players = [...data.top, ...data.bottom];
    if (still || stage === "podium") {
      climb = "after";
      shown = Object.fromEntries(players.map((player) => [player.n, player.score]));
      return;
    }
    climb = "before";
    shown = Object.fromEntries(players.map((player) => [player.n, player.before]));
    climbTimer = setTimeout(() => {
      climb = "after";
      const start = performance.now();
      const roll = (at: number) => {
        const p = Math.min(1, (at - start) / 1500);
        const ease = 1 - Math.pow(1 - p, 3);
        shown = Object.fromEntries(players.map((player) => [player.n, Math.round(player.before + (player.score - player.before) * ease)]));
        if (p < 1) rolling = requestAnimationFrame(roll);
      };
      rolling = requestAnimationFrame(roll);
    }, 1500);
  });
  onDestroy(() => {
    clearTimeout(climbTimer);
    cancelAnimationFrame(rolling);
  });
  /** Where a row sits in the list: last round's place among these five, then its new place. */
  function slot(player: GamePlayer): number {
    if (climb === "after") return board.indexOf(player);
    return [...board].sort((a, b) => a.was - b.was).indexOf(player);
  }

  // --- Confetti for the podium ------------------------------------------------------------------
  let confetti = $state<HTMLCanvasElement | null>(null);
  let confettiFrame = 0;
  $effect(() => {
    const canvas = confetti;
    if (!canvas || data.stage !== "podium" || still) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    const colors = ["#ff5a5f", "#2f80ed", "#f5a524", "#27ae60", "#9b51e0", "#ffd166", "#ffffff"];
    const bits = Array.from({ length: 180 }, () => ({ x: Math.random() * width, y: -Math.random() * height * 0.6, w: 6 + Math.random() * 8, h: 10 + Math.random() * 12, vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 3.5, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.25, c: colors[Math.floor(Math.random() * colors.length)]! }));
    const started = performance.now();
    const draw = (at: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const bit of bits) {
        bit.x += bit.vx;
        bit.y += bit.vy;
        bit.r += bit.vr;
        if (bit.y > height + 20 && at - started < 6000) bit.y = -20;
        ctx.save();
        ctx.translate(bit.x, bit.y);
        ctx.rotate(bit.r);
        ctx.fillStyle = bit.c;
        ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
        ctx.restore();
      }
      if (at - started < 9000) confettiFrame = requestAnimationFrame(draw);
    };
    confettiFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(confettiFrame);
  });

  const totalAnswers = $derived(data.counts.reduce((sum, count) => sum + count, 0));
  const rightCount = $derived(data.correct !== null ? (data.counts[data.correct] ?? 0) : 0);
  /** How the room did, as a game show would say it. */
  const verdict = $derived(
    totalAnswers === 0 ? "" : say(data, rightCount === totalAnswers ? "Everyone got it!" : rightCount === 0 ? "Nobody got that one." : rightCount / totalAnswers >= 0.75 ? "Most of you got it." : rightCount / totalAnswers >= 0.4 ? "A tricky one." : "A hard one!"),
  );
  /** "23 players are in", with the number set apart (it stands out in gold). */
  const joinedWords = $derived(sayCount(data, data.players, "{n} player is in", "{n} players are in", { n: "\u0000" }).split("\u0000"));
  /** Team mode: the bars' scale, and the winning team for the podium. */
  const teamMost = $derived(Math.max(1, ...(data.teams ?? []).map((team) => team.score)));
  const winningTeam = $derived(data.teams?.length && data.teams[0]!.score > 0 ? data.teams[0]! : null);
  /** The lobby shows the newest names; past that, a count. */
  const MOST_NAMES = 30;
  const names = $derived(data.joined.slice(-MOST_NAMES));
  const moreNames = $derived(Math.max(0, data.players - names.length));
  const most = $derived(Math.max(1, ...data.counts));
  const promptSize = $derived(data.prompt.length > 180 ? 4.2 : data.prompt.length > 110 ? 5 : data.prompt.length > 60 ? 6 : 7);
  const podium = $derived([data.top[1], data.top[0], data.top[2]]);

  function shape(kind: (typeof CHOICE_STYLES)[number]["shape"]): string {
    switch (kind) {
      case "triangle": return "M12 3 22 20H2Z";
      case "diamond": return "M12 2 22 12 12 22 2 12Z";
      case "circle": return "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z";
      case "square": return "M3 3h18v18H3Z";
      case "star": return "M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6Z";
      default: return "M7 3h10l5 9-5 9H7l-5-9Z";
    }
  }
</script>

<div class="game" class:still>
  <div class="bg" aria-hidden="true"><i></i><i></i><i></i><span class="shp s1"></span><span class="shp s2"></span><span class="shp s3"></span><span class="shp s4"></span></div>

  <header class="top">
    <span class="title">{data.stage === "podium" ? "" : data.title}</span>
    {#if data.stage === "question" || data.stage === "results"}<span class="pill">{say(data, "Question {n} of {total}", { n: data.round, total: data.total })}</span>{/if}
    <span class="pill people">{sayCount(data, data.players, "{n} player", "{n} players")}</span>
  </header>

  {#if data.stage === "lobby"}
    <section class="lobby">
      <div class="join">
        <p class="kicker">{say(data, "Join the game")}</p>
        {#if data.join}
          {@const [before, after] = say(data, "Go to {at} and enter").split("{at}")}
          <p class="at">{before}<b>{data.join.at}</b>{after}</p>
          <div class="code">{#each data.join.code.split("") as char, i (i)}<span>{char}</span>{/each}</div>
        {/if}
        <p class="count">{joinedWords[0]}<b>{data.players}</b>{joinedWords[1]}</p>
        {#if data.teams}
          <div class="team-chips">{#each [...data.teams].sort((a, b) => a.team - b.team) as team (team.team)}<span style:--c={team.color}>{team.name} · {team.players}</span>{/each}</div>
        {/if}
      </div>
      {#if data.join}<div class="qr"><QrView qr={{ data: data.join.url, style: "rounded", dark: "#111111", light: "#ffffff", caption: "" }} /></div>{/if}
      <div class="names">
        {#each names as person (person.n)}
          <span class="bubble" style:--c={playerColor(person.n)}>{person.name}</span>
        {:else}
          <span class="waiting">{say(data, "Waiting for the first player…")}</span>
        {/each}
        {#if moreNames > 0}<span class="bubble more">{say(data, "+{n} more", { n: moreNames })}</span>{/if}
      </div>
    </section>
  {:else if data.stage === "question" || data.stage === "results"}
    <section class="ask">
      <div class="prompt-row" class:reading>
        {#if data.stage === "question" && !reading}
          <div class="ring" class:urgent={left !== null && left <= 5} aria-label={say(data, "Seconds left")}>
            <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="track" /><circle cx="50" cy="50" r="44" class="run" style:stroke-dashoffset={276.5 * (1 - ringShare)} /></svg>
            <b>{left ?? "∞"}</b>
          </div>
        {/if}
        <h1 class="prompt" style:font-size="{reading ? promptSize + 1 : promptSize}cqmin">{data.prompt}</h1>
        {#if data.stage === "question" && !reading}<div class="answered"><b>{data.answered}</b><span>{say(data, (data.lang === "fr" ? data.answered < 2 : data.answered === 1) ? "answer" : "answers")}</span></div>{/if}
      </div>
      {#if reading}
        <div class="ready" aria-live="polite"><span>{say(data, "Get ready…")}</span>{#key readLeft}<b>{readLeft}</b>{/key}</div>
      {/if}
      {#if data.stage === "results"}
        <div class="bars">
          {#each data.choices as _choice, i (i)}
            {@const style = CHOICE_STYLES[i]!}
            <div class="bar" class:right={data.correct === i} class:dim={data.correct !== null && data.correct !== i}>
              <b>{data.counts[i] ?? 0}</b>
              <i style:height="{((data.counts[i] ?? 0) / most) * 72}%" style:background={style.color}></i>
              <svg viewBox="0 0 24 24"><path d={shape(style.shape)} fill="#fff" /></svg>
            </div>
          {/each}
        </div>
      {/if}
      <div class="tiles" class:three={data.choices.length > 4} class:hidden={reading}>
        {#each data.choices as choice, i (i)}
          {@const style = CHOICE_STYLES[i]!}
          <div class="tile" style:--c={style.color} class:right={data.stage === "results" && data.correct === i} class:dim={data.stage === "results" && data.correct !== null && data.correct !== i}>
            <svg viewBox="0 0 24 24"><path d={shape(style.shape)} fill="#fff" /></svg>
            <span>{choice}</span>
            {#if data.stage === "results" && data.correct === i}<em>✓</em>{/if}
          </div>
        {/each}
      </div>
      {#if data.stage === "results"}
        <p class="foot">
          {#if data.correct === null}{sayCount(data, totalAnswers, "{n} vote", "{n} votes")}
          {:else}<span>{say(data, "{right} of {total} got it right.", { right: rightCount, total: totalAnswers })}</span> {#if verdict}<span>{verdict}</span>{/if}{/if}
          {#if data.fastest}<span class="fast">⚡ {say(data, "Fastest: {name} · {seconds}s", { name: data.fastest.name, seconds: (data.fastest.ms / 1000).toLocaleString(data.lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</span>{/if}
        </p>
      {/if}
    </section>
  {:else if data.stage === "leaderboard"}
    <section class="board">
      <h1>{say(data, "Leaderboard")}</h1>
      {#if data.teams}
        <div class="teams" class:after={climb === "after"}>
          {#each data.teams as team, i (team.team)}
            <div class="team-row" style:--c={team.color} style:--share={climb === "after" ? team.score / teamMost : Math.max(0, team.score - team.gain) / teamMost} class:lead={i === 0 && climb === "after"}>
              <span class="team-name">{team.name}</span><i></i><b>{team.score.toLocaleString()}</b>{#if climb === "after" && team.gain > 0}<em>+{team.gain.toLocaleString()}</em>{/if}
            </div>
          {/each}
        </div>
      {/if}
      <div class="rows" style:--rows={board.length}>
        {#each board as player (player.n)}
          <div class="row" style:--c={playerColor(player.n)} style:--slot={slot(player)} class:lead={player.rank === 1 && climb === "after"}>
            <span class="rank">{climb === "after" ? player.rank : player.was}</span>
            <span class="dot"></span>
            <span class="name">{player.name}</span>
            {#if climb === "after" && player.was > player.rank}<span class="up">▲ {player.was - player.rank}</span>{/if}
            {#if player.streak >= 2}<span class="streak" title={say(data, "Right answers in a row")}><svg viewBox="0 0 24 24"><path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9Z" fill="currentColor" /></svg>{player.streak}</span>{/if}
            {#if climb === "after" && player.gain > 0}<span class="gain">+{player.gain}</span>{/if}
            <b class="score">{(shown[player.n] ?? player.score).toLocaleString()}</b>
          </div>
        {/each}
      </div>
      {#if data.bottom.length}
        <p class="catching">{say(data, "Catching up")}</p>
        <div class="tail">
          {#each data.bottom as player (player.n)}
            <span style:--c={playerColor(player.n)}><i></i>{ordinal(player.rank, data.lang)} · {player.name} · {(shown[player.n] ?? player.score).toLocaleString()}</span>
          {/each}
        </div>
      {/if}
    </section>
  {:else if data.stage === "podium"}
    <section class="podium">
      <canvas bind:this={confetti} aria-hidden="true"></canvas>
      <h1>{data.title}</h1>
      {#if winningTeam}<p class="team-win" style:--c={winningTeam.color}>{say(data, "Team {name} wins!", { name: winningTeam.name })}</p>{/if}
      {#if data.players > 3}<p class="foot">{sayCount(data, data.players - 3, "and {n} more player. Well played, everyone!", "and {n} more players. Well played, everyone!")}</p>{/if}
      <div class="steps">
        {#each podium as player, i (i)}
          {#if player}
            {@const place = player.rank}
            <div class="step p{place}" style:--c={playerColor(player.n)} style:--d="{place === 1 ? 1.2 : place === 2 ? 0.6 : 0}s">
              {#if place === 1}<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l1.5-11-5.5 4L12 4l-5 7-5.5-4Z" fill="#ffd166" /><path d="M3 19h18v2H3z" fill="#f5a524" /></svg>{/if}
              <span class="who">{player.name}</span>
              <span class="pts">{player.score.toLocaleString()}</span>
              <div class="block"><b>{place}</b></div>
            </div>
          {/if}
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .game { position: absolute; inset: 0; container-type: size; overflow: hidden; color: #fff; font-family: "Inter Variable", Inter, system-ui, sans-serif; background: #1a0b3d; }
  /* A moving night of colour behind it all. */
  .bg { position: absolute; inset: 0; overflow: hidden; }
  /* Soft-edged discs drawn as gradients (a blur filter would be re-rendered on every frame of the drift). */
  .bg i { position: absolute; width: 90cqmax; height: 90cqmax; border-radius: 50%; opacity: 0.6; background: radial-gradient(circle, var(--g) 0%, color-mix(in srgb, var(--g) 70%, transparent) 30%, transparent 68%); animation: drift 18s ease-in-out infinite alternate; will-change: transform; }
  .bg i:nth-child(1) { left: -30cqw; top: -40cqh; --g: #6d28d9; }
  .bg i:nth-child(2) { right: -35cqw; top: -20cqh; --g: #db2777; animation-duration: 22s; }
  .bg i:nth-child(3) { left: 10cqw; bottom: -60cqh; --g: #2563eb; animation-duration: 26s; }
  @keyframes drift { to { transform: translate(8cqw, 6cqh) scale(1.15); } }
  .shp { position: absolute; width: 7cqmin; height: 7cqmin; opacity: 0.12; background: #fff; animation: float 14s ease-in-out infinite; }
  .s1 { left: 6cqw; top: 70cqh; clip-path: polygon(50% 0, 100% 100%, 0 100%); }
  .s2 { right: 8cqw; top: 22cqh; transform: rotate(45deg); animation-duration: 17s; }
  .s3 { left: 46cqw; top: 8cqh; border-radius: 50%; animation-duration: 12s; }
  .s4 { right: 30cqw; bottom: 8cqh; animation-duration: 19s; }
  @keyframes float { 50% { translate: 0 -4cqh; rotate: 25deg; } }
  .still .bg i, .still .shp { animation: none; }

  .top { position: absolute; z-index: 2; left: 3cqw; right: 3cqw; top: 3cqh; display: flex; align-items: center; gap: 1.4cqmin; }
  .title { font-size: 3.2cqmin; font-weight: 800; letter-spacing: -0.02em; margin-right: auto; text-shadow: 0 0.4cqmin 2cqmin rgb(0 0 0 / 0.35); }
  .pill { padding: 0.9cqmin 2cqmin; border-radius: 99px; background: rgb(0 0 0 / 0.28); font-size: 2.2cqmin; font-weight: 700; }

  /* Lobby */
  .lobby { position: absolute; inset: 12cqh 4cqw 4cqh; display: grid; grid-template-columns: 1.2fr 0.8fr; grid-template-rows: auto 1fr; gap: 3cqmin 4cqw; z-index: 1; }
  .join { align-self: center; }
  .kicker { margin: 0; font-size: 3cqmin; font-weight: 700; opacity: 0.8; letter-spacing: 0.08em; text-transform: uppercase; }
  .at { margin: 1cqmin 0 2cqmin; font-size: 4cqmin; }
  .at b { color: #ffd166; }
  .code { display: flex; gap: 1.2cqmin; }
  .code span { display: grid; place-items: center; width: 10cqmin; height: 13cqmin; border-radius: 1.6cqmin; background: #fff; color: #1a0b3d; font-size: 9cqmin; font-weight: 900; box-shadow: 0 1cqmin 0 rgb(0 0 0 / 0.25); animation: bounce 2.4s ease-in-out infinite; }
  .code span:nth-child(2) { animation-delay: 0.1s; } .code span:nth-child(3) { animation-delay: 0.2s; } .code span:nth-child(4) { animation-delay: 0.3s; } .code span:nth-child(5) { animation-delay: 0.4s; } .code span:nth-child(6) { animation-delay: 0.5s; }
  @keyframes bounce { 10% { transform: translateY(-1.4cqmin); } 20% { transform: none; } }
  .count { margin: 3cqmin 0 0; font-size: 3.4cqmin; } .count b { font-size: 6cqmin; font-weight: 900; color: #ffd166; }
  .qr { align-self: center; justify-self: center; width: 34cqmin; height: 34cqmin; box-sizing: border-box; padding: 1.6cqmin; border-radius: 2cqmin; background: #fff; box-shadow: 0 2cqmin 6cqmin rgb(0 0 0 / 0.35); }
  .names { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 1.4cqmin; overflow: hidden; }
  .bubble { padding: 1.2cqmin 2.6cqmin; border-radius: 99px; background: var(--c); font-size: 3cqmin; font-weight: 800; box-shadow: 0 0.8cqmin 0 rgb(0 0 0 / 0.25); animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  @keyframes pop { from { transform: scale(0.3); opacity: 0; } }
  .bubble.more { background: rgb(255 255 255 / 0.18); box-shadow: none; }
  .waiting { font-size: 3cqmin; opacity: 0.7; }

  /* A question */
  .ask { position: absolute; inset: 11cqh 3cqw 3cqh; display: flex; flex-direction: column; gap: 2.4cqmin; z-index: 1; }
  .prompt-row { display: flex; align-items: center; gap: 2.4cqmin; min-height: 0; flex: 1; }
  .prompt { flex: 1; margin: 0; padding: 3cqmin 3.4cqmin; border-radius: 2.2cqmin; background: #fff; color: #111; text-align: center; font-weight: 800; line-height: 1.18; letter-spacing: -0.02em; box-shadow: 0 1cqmin 0 rgb(0 0 0 / 0.2); animation: rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  @keyframes rise { from { transform: translateY(3cqh) scale(0.96); opacity: 0; } }
  .prompt-row.reading { justify-content: center; padding: 0 8cqw; }
  .prompt-row.reading .prompt { flex: none; width: 100%; }
  .ready { display: flex; align-items: center; justify-content: center; gap: 3cqmin; flex: 1; font-size: 4cqmin; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.9; }
  .ready b { display: grid; place-items: center; width: 16cqmin; height: 16cqmin; border-radius: 50%; background: #ffd166; color: #1a0b3d; font-size: 9cqmin; font-weight: 900; animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  .tiles.hidden { visibility: hidden; }
  .ring { position: relative; flex: none; width: 15cqmin; height: 15cqmin; }
  .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .ring circle { fill: rgb(0 0 0 / 0.25); stroke-width: 9; }
  .ring .track { stroke: rgb(255 255 255 / 0.15); }
  .ring .run { fill: none; stroke: #ffd166; stroke-dasharray: 276.5; stroke-linecap: round; transition: stroke-dashoffset 0.2s linear; }
  .ring b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 6cqmin; font-weight: 900; font-variant-numeric: tabular-nums; }
  .ring.urgent .run { stroke: #ff5a5f; }
  .ring.urgent b { color: #ff8a8d; animation: beat 1s ease-in-out infinite; }
  @keyframes beat { 50% { transform: scale(1.12); } }
  .answered { flex: none; display: grid; justify-items: center; min-width: 13cqmin; }
  .answered b { font-size: 7cqmin; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
  .answered span { font-size: 2.2cqmin; opacity: 0.8; font-weight: 700; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 1.6cqmin; }
  .tiles.three { grid-template-columns: 1fr 1fr 1fr; }
  .tile { position: relative; display: flex; align-items: center; gap: 2cqmin; min-height: 12cqh; padding: 1.6cqmin 2.6cqmin; border-radius: 1.6cqmin; background: var(--c); font-size: 3.4cqmin; font-weight: 800; box-shadow: 0 0.8cqmin 0 rgb(0 0 0 / 0.28); transition: opacity 0.6s, transform 0.6s; animation: rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  .tile:nth-child(2) { animation-delay: 0.08s; } .tile:nth-child(3) { animation-delay: 0.16s; } .tile:nth-child(4) { animation-delay: 0.24s; } .tile:nth-child(5) { animation-delay: 0.32s; } .tile:nth-child(6) { animation-delay: 0.4s; }
  .tile svg { flex: none; width: 5cqmin; height: 5cqmin; }
  .tile.dim { opacity: 0.28; transform: scale(0.97); }
  .tile.right { transform: scale(1.03); box-shadow: 0 0 0 0.6cqmin #fff, 0 0.8cqmin 0 rgb(0 0 0 / 0.28); }
  .tile em { margin-left: auto; font-style: normal; font-size: 5cqmin; }
  .bars { display: flex; justify-content: center; align-items: flex-end; gap: 3cqmin; height: 26cqh; }
  .bar { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 0.8cqmin; width: 12cqmin; height: 100%; transition: opacity 0.6s; }
  .bar b { font-size: 3.6cqmin; font-weight: 900; }
  .bar i { display: block; width: 100%; min-height: 1.2cqmin; border-radius: 1cqmin 1cqmin 0 0; animation: grow 1s cubic-bezier(0.2, 0.8, 0.2, 1) both; transform-origin: bottom; }
  @keyframes grow { from { transform: scaleY(0); } }
  .bar svg { flex: none; width: 4cqmin; height: 4cqmin; }
  .bar b { flex: none; }
  .bar.dim { opacity: 0.35; }
  .foot { display: flex; justify-content: center; flex-wrap: wrap; gap: 0.6cqmin 2.4cqmin; margin: 0; text-align: center; font-size: 2.8cqmin; font-weight: 700; opacity: 0.9; }
  .foot .fast { color: #ffd166; animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: 0.8s; }

  /* Leaderboard */
  .board { position: absolute; inset: 11cqh 14cqw 3cqh; display: flex; flex-direction: column; z-index: 1; }
  .board h1, .podium h1 { margin: 0 0 2.4cqmin; text-align: center; font-size: 6cqmin; font-weight: 900; letter-spacing: -0.03em; text-shadow: 0 0.6cqmin 2cqmin rgb(0 0 0 / 0.3); }
  .rows { position: relative; height: calc(var(--rows) * 11cqh); }
  .row { position: absolute; left: 0; right: 0; top: 0; height: 9.6cqh; display: flex; align-items: center; gap: 2cqmin; padding: 0 2.8cqmin; border-radius: 1.6cqmin; background: rgb(255 255 255 / 0.95); color: #1a1a1a; box-shadow: 0 0.8cqmin 0 rgb(0 0 0 / 0.22); transform: translateY(calc(var(--slot) * 11cqh)); transition: transform 1s cubic-bezier(0.34, 1.3, 0.64, 1), box-shadow 0.4s; border-left: 1.4cqmin solid var(--c); }
  .row.lead { box-shadow: 0 0 0 0.5cqmin #ffd166, 0 0.8cqmin 0 rgb(0 0 0 / 0.22); }
  .rank { width: 5cqmin; font-size: 3.6cqmin; font-weight: 900; color: #666; font-variant-numeric: tabular-nums; }
  .dot { width: 3cqmin; height: 3cqmin; border-radius: 50%; background: var(--c); }
  .name { flex: 1; min-width: 0; font-size: 3.6cqmin; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .up { padding: 0.4cqmin 1.2cqmin; border-radius: 99px; background: #27ae60; color: #fff; font-size: 2.2cqmin; font-weight: 800; animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  .streak { display: inline-flex; align-items: center; gap: 0.4cqmin; color: #f97316; font-size: 2.6cqmin; font-weight: 900; } .streak svg { width: 3cqmin; height: 3cqmin; }
  .gain { color: #27ae60; font-size: 2.8cqmin; font-weight: 900; animation: float-up 1.6s ease-out both; }
  @keyframes float-up { 0% { transform: translateY(2cqh); opacity: 0; } 30% { opacity: 1; } 100% { transform: none; } }
  .score { min-width: 14cqmin; text-align: right; font-size: 4.2cqmin; font-weight: 900; font-variant-numeric: tabular-nums; }
  .teams { display: grid; gap: 1cqmin; margin: -0.6cqmin 0 2cqmin; }
  .team-row { display: grid; grid-template-columns: 14cqmin 1fr auto auto; align-items: center; gap: 1.6cqmin; font-weight: 900; font-size: 2.8cqmin; }
  .team-row i { height: 3.4cqmin; border-radius: 99px; background: rgb(255 255 255 / 0.12); position: relative; overflow: hidden; }
  .team-row i::after { content: ""; position: absolute; inset: 0 auto 0 0; width: calc(var(--share) * 100%); background: var(--c); border-radius: inherit; transition: width 1.2s cubic-bezier(0.2, 0.8, 0.2, 1); }
  .team-row b { min-width: 12cqmin; text-align: right; font-variant-numeric: tabular-nums; }
  .team-row em { font-style: normal; color: #7ee2a8; font-size: 2.4cqmin; }
  .team-row.lead .team-name { color: #ffd166; }
  .team-chips { display: flex; flex-wrap: wrap; gap: 1cqmin; margin-top: 2cqmin; }
  .team-chips span { padding: 0.8cqmin 2cqmin; border-radius: 99px; background: var(--c); font-size: 2.6cqmin; font-weight: 800; }
  .team-win { align-self: center; margin: 0 0 1.4cqmin; padding: 1cqmin 3.4cqmin; border-radius: 99px; background: var(--c); color: #fff; font-size: 4cqmin; font-weight: 900; box-shadow: 0 0.8cqmin 0 rgb(0 0 0 / 0.25); animation: pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: 1.8s; }
  .catching { margin: 2.4cqmin 0 1.2cqmin; font-size: 2.4cqmin; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.75; text-align: center; }
  .tail { display: flex; justify-content: center; gap: 1.4cqmin; flex-wrap: wrap; }
  .tail span { display: inline-flex; align-items: center; gap: 1cqmin; padding: 1cqmin 2cqmin; border-radius: 99px; background: rgb(255 255 255 / 0.14); font-size: 2.6cqmin; font-weight: 700; }
  .tail i { width: 2cqmin; height: 2cqmin; border-radius: 50%; background: var(--c); }

  /* Podium */
  .podium { position: absolute; inset: 9cqh 6cqw 0; display: flex; flex-direction: column; z-index: 1; }
  .podium canvas { position: absolute; inset: -9cqh -6cqw 0; width: calc(100% + 12cqw); height: calc(100% + 9cqh); pointer-events: none; z-index: 3; }
  .steps { flex: 1; display: flex; justify-content: center; align-items: flex-end; gap: 2cqmin; }
  .step { display: flex; flex-direction: column; align-items: center; width: 26cqmin; animation: rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both; animation-delay: var(--d); }
  .crown { width: 7cqmin; height: 7cqmin; margin-bottom: -0.6cqmin; filter: drop-shadow(0 0.4cqmin 0.6cqmin rgb(0 0 0 / 0.3)); animation: pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: 2s; }
  .who { max-width: 100%; padding: 1cqmin 2.2cqmin; border-radius: 99px; background: var(--c); font-size: 3.4cqmin; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 0.8cqmin 0 rgb(0 0 0 / 0.25); }
  .pts { margin: 1cqmin 0 1.4cqmin; font-size: 3.2cqmin; font-weight: 800; opacity: 0.9; font-variant-numeric: tabular-nums; }
  .block { width: 100%; display: grid; place-items: start center; padding-top: 2cqmin; border-radius: 1.6cqmin 1.6cqmin 0 0; background: linear-gradient(180deg, rgb(255 255 255 / 0.95), rgb(255 255 255 / 0.75)); color: #1a0b3d; }
  .block b { font-size: 10cqmin; font-weight: 900; }
  .p1 .block { height: 40cqh; background: linear-gradient(180deg, #ffe08a, #f5a524); }
  .p2 .block { height: 30cqh; background: linear-gradient(180deg, #f1f5f9, #b8c2cc); }
  .p3 .block { height: 22cqh; background: linear-gradient(180deg, #f7c79b, #c97b3d); }
  .podium .foot { margin: -1cqmin 0 0; text-align: center; font-size: 3cqmin; font-weight: 700; opacity: 0.85; }
  .still * { animation: none !important; transition: none !important; }
</style>
