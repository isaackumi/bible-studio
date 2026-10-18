<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { t } from "../../i18n/core";
  import Icon from "../Icon.svelte";
  import { deckSource } from "../../domain/decks";

  // Follow the sermon: the slide deck follows what the preacher says. Suggest puts the matching
  // slide on Preview; Auto-advance shows it while that deck is on the screen.
  const follow = $derived(session.sermonFollow);
  const listening = $derived(session.voice.status === "listening");
  const hasDeck = $derived((session.service?.sections ?? []).some((section) => section.items.some((item) => item.kind === "deck")) || !!session.live.program.sourceId?.startsWith("deck:"));

  function show() {
    const target = deckSource(follow.match?.key);
    if (!target) return;
    session.previewDeckPage(target.deckId, target.index);
    void session.take();
  }
</script>

<section class="follow" aria-label={t("Follow the sermon")}>
  <header>
    <span class="title"><Icon name="mic" size={13} /> {t("Follow the sermon")}</span>
    <div class="seg" role="radiogroup" aria-label={t("Follow the sermon")}>
      {#each [["off", t("Off")], ["suggest", t("Suggest")], ["auto", t("Auto")]] as [mode, label] (mode)}
        <button type="button" role="radio" aria-checked={follow.mode === mode} class:on={follow.mode === mode} onclick={() => session.setSermonFollow(mode as "off" | "suggest" | "auto")}>{label}</button>
      {/each}
    </div>
  </header>
  {#if follow.mode !== "off"}
    <p class="hint">
      {#if !hasDeck}{t("Add a slide deck to the service; the slides follow what the preacher says.")}
      {:else if follow.mode === "auto"}{t("The matching slide goes on the screen by itself while that deck is showing.")}
      {:else}{t("The slide that matches what is preached goes to Preview; LIVE shows it.")}{/if}
    </p>
    {#if !listening}
      <button type="button" class="listen" onclick={() => void session.toggleVoice()}><Icon name="mic" size={13} /> {t("Start listening")}</button>
    {:else if follow.match}
      <div class="match">
        <span><small>{t("Sounds like")}</small><strong>{follow.match.label}</strong></span>
        {#if session.live.program.sourceId !== follow.match.key}<button type="button" class="show" onclick={show}>{t("Show")}</button>{/if}
      </div>
    {:else}
      <p class="hint listening"><span class="dot"></span>{t("Listening for the slide being preached…")}</p>
    {/if}
  {/if}
</section>

<style>
  .follow { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--field) 40%, var(--panel)); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .title { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--muted); }
  .seg { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
  .seg button { height: 24px; padding: 0 9px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
  .seg button.on { background: var(--accent); color: var(--on-accent, #fff); }
  .hint { margin: 0; font-size: 12px; line-height: 1.4; color: var(--muted); }
  .listening { display: flex; align-items: center; gap: 6px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #30a46c; box-shadow: 0 0 6px #30a46c; }
  .listen { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; border: 1px solid var(--line); border-radius: 8px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .match { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 9px; background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .match span { display: grid; min-width: 0; }
  .match small { font-size: 11px; color: var(--muted); }
  .match strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .show { flex: none; height: 28px; padding: 0 12px; border: 0; border-radius: 7px; background: var(--live, #e5484d); color: #fff; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
</style>
