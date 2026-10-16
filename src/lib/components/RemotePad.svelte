<script lang="ts">
  import { onMount } from "svelte";
  import { isLanRemoteOrigin, REMOTE_COMMANDS, remoteEnvelope, type RemoteCommandId, type RemoteEnvelope } from "../domain/remote";
  import { publishRemote, subscribeRemote } from "../remote/channel";
  import { postRemoteEnvelope } from "../remote/http";

  let code = $state("");
  let token = $state("");
  let note = $state("The desk is showing a six-digit code.");
  let cue = $state("");
  let body = $state("");
  let attribution = $state("");
  let layout = $state("");
  let last = $state("");
  let busy = $state(false);
  const lan = typeof location !== "undefined" && isLanRemoteOrigin(location.href);

  const labels: Record<RemoteCommandId, string> = {
    take: "LIVE",
    next: "Next",
    previous: "Previous",
    clear: "Clear",
    black: "Black",
    logo: "Logo",
  };

  function applyReply(envelope: RemoteEnvelope | null) {
    if (!envelope) return;
    if (envelope.type === "welcome" && envelope.payload.token) {
      token = envelope.payload.token;
      note = "This phone takes Program. Next and Previous send the following cue.";
      applyCue(envelope.payload);
      return;
    }
    if (envelope.type === "denied") {
      note = envelope.payload.reason || "That remote is not paired.";
      if (/not paired|did not answer/i.test(envelope.payload.reason || "")) token = "";
      return;
    }
    if (envelope.type === "ack") {
      last = envelope.payload.id ?? "";
      applyCue(envelope.payload);
    }
  }

  function applyCue(payload: Record<string, string>) {
    if (payload.cue) cue = payload.cue;
    if (payload.body) body = payload.body;
    if (payload.layout) layout = payload.layout;
    if (payload.attribution !== undefined) attribution = payload.attribution;
  }

  onMount(() => {
    if (lan) {
      const tick = window.setInterval(() => {
        if (!token) return;
        void fetch("/v1/program")
          .then((response) => response.json())
          .then((packet) => {
            const model = packet?.frame?.model;
            if (!model) return;
            cue = model.reference || model.lines?.[0]?.text || cue;
            body = Array.isArray(model.lines)
              ? model.lines.map((line: { marker?: string; text?: string }) => `${line.marker ? `${line.marker} ` : ""}${line.text ?? ""}`.trim()).filter(Boolean).join("\n")
              : body;
            layout = model.layout || layout;
            attribution = model.attribution || "";
          })
          .catch(() => {});
      }, 1000);
      return () => window.clearInterval(tick);
    }
    return subscribeRemote(applyReply);
  });

  async function emit(type: string, payload: Record<string, string>) {
    const envelope = remoteEnvelope(type, payload);
    if (lan) {
      applyReply(await postRemoteEnvelope(location.origin + "/", envelope));
      return;
    }
    publishRemote(type, payload);
  }

  function pair() {
    void emit("pair", { code: code.trim() });
  }

  function send(id: RemoteCommandId) {
    if (!token || busy) return;
    busy = true;
    last = id;
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
    void emit("command", { token, id }).finally(() => {
      busy = false;
    });
  }

  const kicker = $derived(cue ? "On air" : "Ready");
</script>

<div class="stage">
  <div class="glow" aria-hidden="true"></div>
  <header>
    <p class="mark">Church Studio</p>
    <p class="link">{token ? "Paired" : "Pair the desk"}</p>
  </header>

  {#if !token}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        pair();
      }}
    >
      <label>
        <span>Desk code</span>
        <input aria-label="Pairing code" inputmode="numeric" maxlength="6" placeholder="000000" bind:value={code} />
      </label>
      <button type="submit" class="pair">Open the pad</button>
    </form>
    <p class="foot">{note} This phone is a clicker, not a display.</p>
  {:else}
    <section class="air" aria-live="polite">
      <p class="kicker">{layout === "scripture" ? "Scripture" : kicker}</p>
      <p class="cue">{cue || "Waiting for the first cue"}</p>
      {#if body}
        <p class="verse">{body}</p>
      {/if}
      {#if attribution}
        <p class="attr">{attribution}</p>
      {/if}
    </section>
    <div class="clicker">
      <div class="arrows">
        <button type="button" class="prev" class:hot={last === "previous"} onclick={() => send("previous")}>{labels.previous}</button>
        <button type="button" class="next" class:hot={last === "next"} onclick={() => send("next")}>{labels.next}</button>
      </div>
      <button type="button" class="lamp" class:hot={last === "take"} onclick={() => send("take")}>
        <span>{labels.take}</span>
      </button>
      <div class="busk">
        {#each REMOTE_COMMANDS.filter((id) => id !== "take" && id !== "next" && id !== "previous") as id (id)}
          <button type="button" class:hot={last === id} onclick={() => send(id)}>{labels[id]}</button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .stage {
    --nave: #0b1018;
    --pew: #141b26;
    --gilt: #d4a056;
    --ember: #e23d2e;
    --linen: #f3ead8;
    --mist: #9aa7b8;
    position: relative;
    isolation: isolate;
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0;
    padding: max(20px, env(safe-area-inset-top)) 20px max(28px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 20px;
    background:
      radial-gradient(120% 70% at 50% 115%, rgba(226, 61, 46, 0.28), transparent 55%),
      radial-gradient(80% 50% at 80% 0%, rgba(212, 160, 86, 0.12), transparent 50%),
      var(--nave);
    color: var(--linen);
    font-family: "SF Pro Display", "Avenir Next", "Segoe UI Variable", system-ui, sans-serif;
    overflow: hidden;
  }
  .glow {
    pointer-events: none;
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(
      -18deg,
      transparent 0 11px,
      rgba(255, 255, 255, 0.015) 11px 12px
    );
    mix-blend-mode: overlay;
  }
  header, form, .air, .clicker, .foot { position: relative; }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .mark {
    margin: 0;
    font-family: "New York", "Iowan Old Style", Palatino, "Palatino Linotype", "Times New Roman", serif;
    font-style: italic;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  .link, .kicker, .foot, label span {
    margin: 0;
    color: var(--mist);
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  form, .clicker {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
  }
  label { display: flex; flex-direction: column; gap: 10px; }
  input {
    height: 88px;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--gilt) 55%, transparent);
    border-radius: 0;
    background: transparent;
    color: var(--linen);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 48px;
    letter-spacing: 0.28em;
    text-align: center;
  }
  button {
    appearance: none;
    border: 0;
    color: inherit;
    font: inherit;
    touch-action: manipulation;
  }
  .pair, .prev, .next, .busk button {
    min-height: 56px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--pew) 88%, #000);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 30px rgba(0, 0, 0, 0.28);
  }
  .pair {
    margin-top: auto;
    background: var(--linen);
    color: var(--nave);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .air { margin-top: 8px; }
  .cue {
    margin: 8px 0 10px;
    font-family: "New York", "Iowan Old Style", Palatino, "Palatino Linotype", "Times New Roman", serif;
    font-size: clamp(28px, 8vw, 44px);
    line-height: 1.05;
    letter-spacing: -0.03em;
  }
  .verse {
    margin: 0 0 8px;
    max-height: 22vh;
    overflow: auto;
    font-family: "New York", "Iowan Old Style", Palatino, "Palatino Linotype", "Times New Roman", serif;
    font-size: 18px;
    line-height: 1.45;
    color: var(--linen);
    white-space: pre-wrap;
  }
  .attr { margin: 0 0 8px; color: var(--gilt); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }
  .arrows {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: 12px;
    min-height: 18vh;
  }
  .prev, .next {
    min-height: 18vh;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .next {
    background: color-mix(in srgb, var(--gilt) 18%, var(--pew));
    color: var(--linen);
  }
  .lamp {
    align-self: center;
    width: min(42vw, 168px);
    height: min(42vw, 168px);
    margin: 4px 0 8px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 50% 42%, #ff6a55 0%, var(--ember) 42%, #7a1c16 78%);
    box-shadow:
      0 0 0 10px color-mix(in srgb, var(--gilt) 35%, transparent),
      0 0 40px rgba(226, 61, 46, 0.45),
      inset 0 -18px 24px rgba(0, 0, 0, 0.35);
    color: #fff7f2;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.22em;
    animation: breathe 3.6s ease-in-out infinite;
  }
  .lamp.hot, .next.hot, .prev.hot, .busk button.hot {
    outline: 2px solid var(--gilt);
    outline-offset: 3px;
  }
  .busk { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: auto; }
  .busk button {
    min-height: 64px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-size: 13px;
    color: var(--mist);
  }
  .foot { margin-top: auto; line-height: 1.6; }
  button:active { transform: translateY(1px) scale(0.985); }
  @keyframes breathe {
    0%, 100% { box-shadow: 0 0 0 10px color-mix(in srgb, var(--gilt) 28%, transparent), 0 0 34px rgba(226, 61, 46, 0.32), inset 0 -18px 24px rgba(0, 0, 0, 0.35); }
    50% { box-shadow: 0 0 0 14px color-mix(in srgb, var(--gilt) 48%, transparent), 0 0 54px rgba(226, 61, 46, 0.55), inset 0 -18px 24px rgba(0, 0, 0, 0.35); }
  }
  @media (prefers-reduced-motion: reduce) {
    .lamp { animation: none; }
    button:active { transform: none; }
  }
</style>
