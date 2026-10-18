<script lang="ts">
  import { session } from "../app/session.svelte";
  import type { PanelId } from "../domain/types";
  import { PANEL_IDS, PANEL_TITLES } from "../workspace/layout";
  import { t } from "../i18n/core";

  let serviceName = $state("");
  const layout = $derived(
    session.workspace.layouts.find((item) => item.id === session.workspace.activeLayoutId) ?? session.workspace.layouts[0],
  );

  $effect(() => {
    serviceName = session.service?.name ?? "";
  });

  function visible(id: PanelId): boolean {
    return layout?.panels.find((panel) => panel.panelId === id)?.visible ?? false;
  }
</script>

<header class="top">
  <div class="brand">
    <strong>{t("Church Studio")}</strong>
    <span>{session.matchesProgram() ? t("Program matches preview") : t("Preview is not on program")}</span>
  </div>
  <label class="chrome-label">
    {t("Workspace")}
    <select
      class="chrome-select"
      aria-label={t("Workspace")}
      value={session.workspace.activeLayoutId}
      onchange={(event) => session.useLayout(event.currentTarget.value)}
    >
      {#each session.workspace.layouts as item (item.id)}
        <option value={item.id}>{item.name}</option>
      {/each}
    </select>
  </label>
  {#if session.service}
    <input
      class="field service-name"
      aria-label={t("Service name")}
      bind:value={serviceName}
      onchange={() => session.renameService(serviceName)}
    />
  {/if}
  <div class="status">
    <span class="dot" class:on={session.output.online} class:off={!session.output.online && session.output.desired}></span>
    <span class="status-text">{session.output.message || session.message}</span>
    <details class="panel-menu">
      <summary>{t("Panels")}</summary>
      <div class="panel-menu-list">
        {#if session.liveMode}
          <p class="hint">{t("Live mode keeps the library off the screen until you return to Prepare.")}</p>
        {/if}
        {#each PANEL_IDS as id (id)}
          <label>
            <input type="checkbox" checked={visible(id)} onchange={() => session.togglePanel(id)} />
            {t(PANEL_TITLES[id])}
          </label>
        {/each}
      </div>
    </details>
    <button type="button" class="ghost" onclick={() => (session.settingsOpen = true)}>{t("Settings")}</button>
    <button type="button" class="ghost" onclick={() => (session.liveMode = !session.liveMode)}>{session.liveMode ? t("Prepare") : t("Live")}</button>
  </div>
</header>
