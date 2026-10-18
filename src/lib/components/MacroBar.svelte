<script lang="ts">
  import { session } from "../app/session.svelte";
  import { describeStep } from "../domain/macros";
  import Icon from "./Icon.svelte";
  import { t } from "../i18n/core";

  // The macro buttons: one click runs the steps in order; the button shows its progress.
  const playlistName = (id: string) => session.workspace.playlists.find((list) => list.id === id)?.name ?? t("a playlist");
</script>

<section class="macro-bar" aria-label={t("Macros")}>
  <header>
    <span>{t("Macros")}</span>
    <button type="button" class="edit" title={t("Make and change macros")} onclick={() => (session.macrosOpen = true)}><Icon name="pencil" size={12} /> {t("Edit")}</button>
  </header>
  <div class="buttons">
    {#each session.workspace.macros as macro (macro.id)}
      {@const running = session.runningMacro?.id === macro.id}
      <button
        type="button"
        class="macro"
        class:running
        disabled={!!session.runningMacro && !running}
        title={macro.steps.map((step, n) => `${n + 1}. ${describeStep(step, { playlist: playlistName })}`).join("\n") || t("No steps yet")}
        onclick={() => void session.runMacro(macro.id)}
      >
        <Icon name="play" size={12} />
        <span>{macro.name}</span>
        {#if running}<em>{(session.runningMacro?.step ?? 0) + 1}/{macro.steps.length}</em>{/if}
      </button>
    {:else}
      <button type="button" class="macro empty" onclick={() => (session.macrosOpen = true)}><Icon name="plus" size={12} /> {t("Make a macro")}</button>
    {/each}
  </div>
</section>

<style>
  .macro-bar { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--field) 40%, var(--panel)); }
  header { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 700; color: var(--muted); }
  .edit { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; }
  .edit:hover { color: var(--ink); background: var(--field); }
  .buttons { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px; }
  .macro { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; text-align: left; }
  .macro span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .macro:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .macro:disabled { opacity: 0.45; }
  .macro.running { border-color: #30a46c; background: color-mix(in srgb, #30a46c 16%, var(--field)); }
  .macro em { font-style: normal; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .macro.empty { border-style: dashed; background: none; color: var(--muted); }
</style>
