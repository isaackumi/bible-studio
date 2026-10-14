<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { COMMANDS } from "../../commands/registry";
  import { resolveAudience, sameScreen } from "../../display/profiles";
  import type { DeskStyle, DisplayAssignment, OutputRole } from "../../domain/types";
  import { defaultShortcuts, shortcutLabel } from "../../keyboard/manager";
  import { canUse } from "../../platform/capabilities";
  import Icon from "../Icon.svelte";
  import OutputControls from "../OutputControls.svelte";
  import { isDesktop } from "../../platform/runtime";

  const sections = [
    ["general", "Church", "church"],
    ["appearance", "Look", "look"],
    ["workspace", "Layouts", "layout"],
    ["displays", "Displays", "screens"],
    ["audience", "Output", "cast"],
    ["stage", "Stage", "stage"],
    ["keyboard", "Keys", "keys"],
    ["bible", "Bible", "bible"],
    ["lyrics", "Songs", "lyrics"],
    ["media", "Media", "media"],
    ["audio", "Audio", "audio"],
    ["performance", "Speed", "speed"],
    ["storage", "Files", "files"],
    ["updates", "Updates", "refresh"],
    ["account", "Account", "user"],
    ["license", "License", "key"],
  ] as const;

  let section = $state<(typeof sections)[number][0]>(
    sections.some((item) => item[0] === session.settingsSection) ? (session.settingsSection as (typeof sections)[number][0]) : "appearance",
  );
  let layoutName = $state("");
  let layoutSeen = $state("");
  let profileName = $state("");
  let profileSeen = $state("");
  let newLayout = $state("");
  let newProfile = $state("");
  let churchName = $state("");
  let logoText = $state("");
  let fileInput = $state<HTMLInputElement | null>(null);
  let fileMessage = $state("");

  async function downloadLibrary() {
    const snapshot = await session.exportLibrary();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "church-studio-library.json";
    link.click();
    URL.revokeObjectURL(url);
    fileMessage = "Exported.";
  }

  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      await session.importLibrary(JSON.parse(await file.text()) as unknown);
      fileMessage = session.message;
    } catch (error) {
      fileMessage = error instanceof Error ? error.message : String(error);
    }
  }

  const layout = $derived(
    session.workspace.layouts.find((item) => item.id === session.workspace.activeLayoutId) ?? session.workspace.layouts[0],
  );
  const profile = $derived(
    session.workspace.displayProfiles.find((item) => item.id === session.workspace.activeDisplayProfileId) ??
      session.workspace.displayProfiles[0],
  );
  const audience = $derived(resolveAudience(profile.assignments.audience, session.output.displays));
  const shortcuts = $derived(session.workspace.shortcuts ?? defaultShortcuts);
  const accents = [
    { name: "Signal", value: "#fa4f00" },
    { name: "Mustard", value: "#e2cc9d" },
    { name: "Ember", value: "#ff8f55" },
    { name: "Crimson", value: "#be2119" },
  ];

  $effect(() => {
    churchName = session.workspace.churchName;
    logoText = session.workspace.logoText;
  });

  $effect(() => {
    if (layout.id !== layoutSeen) {
      layoutSeen = layout.id;
      layoutName = layout.name;
    }
  });

  $effect(() => {
    if (profile.id !== profileSeen) {
      profileSeen = profile.id;
      profileName = profile.name;
    }
  });

  function assignments(role: OutputRole, value: string): DisplayAssignment {
    return { ...profile.assignments, [role]: value || null };
  }

  function close() {
    session.settingsOpen = false;
  }
</script>

<div class="settings-backdrop" role="presentation" onclick={close} onkeydown={(event) => event.key === "Escape" && close()}>
  <div class="settings" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="settings-title" onclick={(event) => event.stopPropagation()}>
    <nav class="settings-nav" aria-label="Settings">
      <p id="settings-title">Settings</p>
      {#each sections as [id, title, icon] (id)}
        <button type="button" class:active={section === id} aria-label={title} onclick={() => (section = id)}>
          <Icon name={icon} size={16} />
          <span>{title}</span>
        </button>
      {/each}
    </nav>
    <div class="settings-body">
      <div class="settings-toolbar">
        <button type="button" class="ghost icon-button" data-tip="Close" aria-label="Close" onclick={close}><Icon name="close" size={16} /></button>
      </div>

      {#if section === "general"}
        <h2>Church</h2>
        <label>Church name <input class="field" bind:value={churchName} onchange={() => session.setChurchName(churchName)} /></label>
        <label>Logo text <input class="field" bind:value={logoText} onchange={() => session.setLogoText(logoText)} /></label>
        <p class="hint">The logo image is chosen in the Media panel. Logo sends it to program.</p>
      {:else if section === "appearance"}
        <h2>Look</h2>
        <div class="desk-row" role="group" aria-label="Display style">
          {#each [{ id: "pewbeam", name: "PewBeam", icon: "pew", tip: "PewBeam desk" }, { id: "obs", name: "OBS", icon: "obs", tip: "OBS studio desk" }] as style (style.id)}
            <button
              type="button"
              class="desk-card"
              class:active={session.workspace.appearance.desk === style.id}
              data-tip={style.tip}
              onclick={() => session.setAppearance({ desk: style.id as DeskStyle })}
            >
              <Icon name={style.icon} size={20} />
              <span>{style.name}</span>
            </button>
          {/each}
        </div>
        <label>
          Theme
          <select class="field" value={session.workspace.appearance.theme} onchange={(event) => session.setAppearance({ theme: event.currentTarget.value as "dark" | "light" })}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label>
          Density
          <select class="field" value={session.workspace.appearance.density} onchange={(event) => session.setAppearance({ density: event.currentTarget.value as "compact" | "comfortable" })}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label>
          UI scale
          <select class="field" value={String(session.workspace.appearance.scale)} onchange={(event) => session.setAppearance({ scale: Number(event.currentTarget.value) })}>
            <option value="0.9">90%</option>
            <option value="1">100%</option>
            <option value="1.1">110%</option>
            <option value="1.25">125%</option>
          </select>
        </label>
        <div class="accent-row" role="group" aria-label="Accent">
          {#each accents as accent (accent.value)}
            <button type="button" class="swatch" class:active={session.workspace.appearance.accent === accent.value} style:background={accent.value} aria-label={accent.name} onclick={() => session.setAppearance({ accent: accent.value })}></button>
          {/each}
          <input
            type="color"
            aria-label="Custom accent"
            data-tip="Accent"
            value={session.workspace.appearance.accent}
            oninput={(event) => session.setAppearance({ accent: event.currentTarget.value })}
          />
        </div>
        <label>
          Verse layout
          <select
            class="field"
            value={session.theme().layout}
            onchange={(event) => session.saveTheme({ ...session.theme(), layout: event.currentTarget.value === "lower-third" ? "lower-third" : "frame" })}
          >
            <option value="frame">Full frame</option>
            <option value="lower-third">Lower third</option>
          </select>
        </label>
        <p class="hint">This changes preview. Take sends it to the audience. Ask searches scripture on this computer.</p>
      {:else if section === "workspace"}
        <h2>Layouts</h2>
        <label>
          Current layout
          <select class="field" value={layout.id} onchange={(event) => session.useLayout(event.currentTarget.value)}>
            {#each session.workspace.layouts as item (item.id)}
              <option value={item.id}>{item.name}</option>
            {/each}
          </select>
        </label>
        <label>Name <input class="field" bind:value={layoutName} onchange={() => session.renameActiveLayout(layoutName)} /></label>
        <div class="actions">
          <button type="button" class="primary" onclick={() => session.saveLayout()}>Save layout</button>
          <button type="button" onclick={() => session.duplicateActiveLayout()}>Duplicate</button>
          <button type="button" onclick={() => session.resetActiveLayout()} disabled={!layout.builtin}>Reset</button>
          <button type="button" onclick={() => session.deleteLayoutById(layout.id)} disabled={layout.builtin}>Delete</button>
        </div>
        <form
          class="actions"
          onsubmit={(event) => {
            event.preventDefault();
            session.saveLayoutAs(newLayout);
            newLayout = "";
          }}
        >
          <input class="field" placeholder="New layout name" bind:value={newLayout} aria-label="New layout name" />
          <button type="submit" class="primary">Save as</button>
        </form>
        <button type="button" class="ghost" onclick={() => session.restoreBuiltinWorkspaces()}>Restore built-in layouts</button>
        <p class="hint">Built-in layouts can be rearranged. Reset returns the selected one. Save as keeps a personal copy.</p>
      {:else if section === "displays"}
        <h2>Displays</h2>
        <OutputControls />
        {#if !isDesktop()}
          <p class="hint">This browser cannot list monitors or move a window onto one. Open output, drag that window to the external display, then choose Fill this screen on it. The window shows Program only.</p>
        {:else if session.output.displays.length === 0}
          <p class="hint">No displays were detected. Refresh after a monitor is connected. The operator window stays here.</p>
          <button type="button" onclick={() => session.refreshDisplays()}>Refresh displays</button>
        {:else}
          <ul class="display-list">
            {#each session.output.displays as display (display.key)}
              <li>
                <strong>{display.name}</strong>
                <span>{display.width} × {display.height}</span>
                <span>{display.scale}×</span>
                {#if display.primary}<span>Primary</span>{/if}
                {#if display.audience}<span class="live-tag">Audience</span>{/if}
              </li>
            {/each}
          </ul>
          <button type="button" onclick={() => session.refreshDisplays()}>Refresh displays</button>
        {/if}
        <label>
          Profile
          <select class="field" value={profile.id} onchange={(event) => session.useDisplayProfile(event.currentTarget.value)}>
            {#each session.workspace.displayProfiles as item (item.id)}
              <option value={item.id}>{item.name}</option>
            {/each}
          </select>
        </label>
        <label>Profile name <input class="field" bind:value={profileName} onchange={() => session.renameDisplayProfile(profileName)} /></label>
        <label>
          Operator
          <select class="field" value={profile.assignments.operator ?? ""} onchange={(event) => session.setAssignments(assignments("operator", event.currentTarget.value))}>
            <option value="">Automatic (primary display)</option>
            {#each session.output.displays as display (display.key)}
              <option value={display.key}>{display.name}</option>
            {/each}
          </select>
        </label>
        <label>
          Audience
          <select class="field" value={profile.assignments.audience ?? ""} onchange={(event) => session.setAssignments(assignments("audience", event.currentTarget.value))}>
            <option value="">Automatic (external display)</option>
            {#each session.output.displays as display (display.key)}
              <option value={display.key}>{display.name}</option>
            {/each}
            {#if profile.assignments.audience && audience.missing}
              <option value={profile.assignments.audience}>Saved display is disconnected</option>
            {/if}
          </select>
        </label>
        <label>
          Stage
          <select class="field" value={profile.assignments.stage ?? ""} onchange={(event) => session.setAssignments(assignments("stage", event.currentTarget.value))}>
            <option value="">Off</option>
            {#each session.output.displays as display (display.key)}
              <option value={display.key}>{display.name}</option>
            {/each}
          </select>
        </label>
        {#if audience.missing && audience.mode === "assigned"}
          <p class="hint">The assigned audience display is disconnected. Program is held until that display returns.</p>
        {:else if audience.missing}
          <p class="hint">Connect an external display, or assign this screen as the audience.</p>
        {/if}
        {#if sameScreen(profile.assignments)}
          <p class="hint">Audience and operator are the same display.</p>
        {/if}
        {#if profile.assignments.stage}
          <p class="hint">Stage is saved on this profile. The stage window stays closed in this release.</p>
        {/if}
        <form
          class="actions"
          onsubmit={(event) => {
            event.preventDefault();
            session.saveDisplayProfileAs(newProfile);
            newProfile = "";
          }}
        >
          <input class="field" placeholder="Profile name" bind:value={newProfile} aria-label="New display profile" />
          <button type="submit" class="primary">Save profile</button>
        </form>
        <button type="button" onclick={() => session.deleteDisplayProfile(profile.id)} disabled={profile.builtin}>Delete profile</button>
      {:else if section === "audience"}
        <h2>Output</h2>
        <p>{session.audienceLabel()}</p>
        <OutputControls />
        {#if !session.controlsAudience}
          <button type="button" onclick={() => session.claimAudience()}>Take control</button>
        {/if}
        <p class="hint">The audience window shows Program only. Preview, theme edits, and Next stay on this desk until LIVE, Clear, or Black.</p>
      {:else if section === "keyboard"}
        <h2>Keys</h2>
        <ul class="shortcut-list">
          {#each COMMANDS as command (command.id)}
            <li>
              <span>{command.title}</span>
              <span class="kbd">{command.shortcut ? shortcutLabel(shortcuts, command.shortcut) : command.id === "open-settings" ? "⌘," : "—"}</span>
            </li>
          {/each}
        </ul>
        <p class="hint">Shortcuts call the command list. Command or Control with comma opens settings. Remapping will use the same commands.</p>
      {:else if section === "stage"}
        <h2>Stage</h2>
        <p class="hint">
          {#if canUse("stage-display")}
            Stage output is available.
          {:else}
            Stage display is reserved for a later release. A profile can remember the stage screen now. The window stays closed, and program is unchanged.
          {/if}
        </p>
      {:else if section === "storage"}
        <h2>Files</h2>
        <p class="hint">Songs, services, and themes stored on this device. Import replaces a record only when its id matches. Program is not included.</p>
        <div class="actions">
          <button type="button" class="primary" onclick={() => downloadLibrary()}>Export</button>
          <button type="button" onclick={() => fileInput?.click()}>Import</button>
          <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={importFile} />
        </div>
        {#if fileMessage}<p>{fileMessage}</p>{/if}
      {:else if section === "account" || section === "license"}
        <h2>{section === "account" ? "Account" : "License"}</h2>
        <p class="hint">The desktop app runs offline without an account. Subscription and license checks will sit behind canUse() when those services exist.</p>
      {:else}
        <h2>{sections.find((item) => item[0] === section)?.[1]}</h2>
        <p class="hint">This section is part of the settings shell. The controls for it come with that part of the product.</p>
      {/if}
    </div>
  </div>
</div>
