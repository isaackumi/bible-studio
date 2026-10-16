<script lang="ts">
  import RemotePanel from "../RemotePanel.svelte";
  import { session } from "../../app/session.svelte";
  import { COMMANDS } from "../../commands/registry";
  import { audienceStatus } from "../../display/status";
  import { resolveAudience, sameScreen } from "../../display/profiles";
  import type { DeskStyle, DisplayAssignment, OperatorTheme, OutputMode, OutputRole } from "../../domain/types";
  import { defaultShortcuts, shortcutLabel } from "../../keyboard/manager";
  import { canUse } from "../../platform/capabilities";
  import { isDesktop } from "../../platform/runtime";
  import { openPrivacySettings, prepareListening } from "../../voice/listen";
  import Icon from "../Icon.svelte";
  import MediaPane from "../MediaPane.svelte";
  import OutputType from "../OutputType.svelte";

  type SettingsSectionId =
    | "general"
    | "appearance"
    | "workspace"
    | "keyboard"
    | "audience"
    | "displays"
    | "stage"
    | "remote"
    | "bible"
    | "lyrics"
    | "media"
    | "audio"
    | "storage"
    | "performance"
    | "updates"
    | "account"
    | "license";
  type SettingsEntry = readonly [SettingsSectionId, string, string];
  type SettingsGroup = { label: string; items: SettingsEntry[] };

  let audioNote = $state("");

  async function allowMicrophone() {
    audioNote = "macOS may ask for the microphone…";
    const blocked = await prepareListening();
    audioNote = blocked ?? "Microphone and Speech Recognition are allowed for Church Studio.";
    if (blocked) void openPrivacySettings();
  }

  const groups: SettingsGroup[] = [
    {
      label: "Studio",
      items: [
        ["general", "Church", "church"],
        ["appearance", "Look", "look"],
        ["workspace", "Layouts", "layout"],
        ["keyboard", "Keys", "keys"],
      ],
    },
    {
      label: "Output",
      items: [
        ["audience", "Output", "cast"],
        ["displays", "Displays", "screens"],
        ["stage", "Stage", "stage"],
        ["remote", "Remote", "cast"],
      ],
    },
    {
      label: "Library",
      items: [
        ["bible", "Bible", "bible"],
        ["lyrics", "Songs", "lyrics"],
        ["media", "Media", "media"],
        ["audio", "Audio", "audio"],
        ["storage", "Files", "files"],
      ],
    },
    {
      label: "System",
      items: [
        ["performance", "Speed", "speed"],
        ["updates", "Updates", "refresh"],
        ["account", "Account", "user"],
        ["license", "License", "key"],
      ],
    },
  ];

  const sections: SettingsEntry[] = groups.flatMap((group) => group.items);
  const themes: { id: OperatorTheme; name: string; note: string; ground: string; ink: string }[] = [
    { id: "dark", name: "Night", note: "Black desk, white type", ground: "#050505", ink: "#f5f5f5" },
    { id: "vespers", name: "Vespers", note: "Warm black, bone type", ground: "#0c0a09", ink: "#f6f1e7" },
    { id: "nave", name: "Nave", note: "Blue black, paper white", ground: "#070b12", ink: "#f4f7fb" },
    { id: "light", name: "Day", note: "White desk, black type", ground: "#f7f5f3", ink: "#050505" },
  ];
  const accents = [
    { name: "Signal", value: "#fa4f00" },
    { name: "Mustard", value: "#e2cc9d" },
    { name: "Ember", value: "#ff8f55" },
    { name: "Crimson", value: "#be2119" },
  ];

  function isSettingsSection(value: string): value is SettingsSectionId {
    return sections.some(([id]) => id === value);
  }

  let section = $state<SettingsSectionId>(
    isSettingsSection(session.settingsSection) ? session.settingsSection : "appearance",
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
  const IMPORT_ACCEPT = ".json,.txt,.md,.markdown,.text,application/json,text/plain,text/markdown";

  async function downloadLibrary() {
    const snapshot = await session.exportLibrary();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "church-studio-library.json";
    link.click();
    URL.revokeObjectURL(url);
    fileMessage = "Library exported.";
  }

  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const name = file.name.toLowerCase();
      const text = await file.text();
      if (name.endsWith(".json")) await session.importLibrary(JSON.parse(text) as unknown);
      else await session.importDocument(file.name, text);
      fileMessage = session.message;
    } catch (error) {
      fileMessage = error instanceof Error ? error.message : "The file was not imported.";
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
  const status = $derived(audienceStatus(session.output, isDesktop()));
  const page = $derived(sections.find((item) => item[0] === section));
  const shortcutGroups = $derived([...new Set(COMMANDS.map((command) => command.group))]);

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

  function setMode(mode: OutputMode) {
    if (profile.outputMode !== mode) void session.setOutputMode(mode);
  }
</script>

<div class="settings-layer">
  <button type="button" class="settings-backdrop" aria-label="Close settings" onclick={close}></button>
  <div class="settings" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="settings-title">
    <nav class="settings-nav" aria-label="Settings">
      <p id="settings-title">Settings</p>
      {#each groups as group (group.label)}
        <p class="group">{group.label}</p>
        {#each group.items as [id, title, icon] (id)}
          {#if id !== "remote" || canUse("remote-control")}
            <button type="button" class:active={section === id} onclick={() => (section = id)}>
              <Icon name={icon} size={15} />
              <span>{title}</span>
            </button>
          {/if}
        {/each}
      {/each}
    </nav>

    <div class="settings-body">
      <header class="set-head">
        <div>
          <h2>{page?.[1]}</h2>
          <p>
            {#if section === "general"}The name on the logo slide.{:else if section === "appearance"}Desk, color, and type size for this computer.{:else if section === "workspace"}How the operator desk is arranged.{:else if section === "keyboard"}Keys that drive the desk.{:else if section === "audience"}What the congregation sees.{:else if section === "displays"}Which screen is the desk, and which screen is the audience.{:else if section === "stage"}A private screen for the people on stage.{:else if section === "remote"}A paired phone is a controller, not a display.{:else if section === "bible"}Scripture on this computer.{:else if section === "lyrics"}Songs in the library.{:else if section === "media"}Pictures for backgrounds and the logo.{:else if section === "audio"}Sound and recognition.{:else if section === "storage"}A copy of the library on this device.{:else if section === "performance"}How much of the desk is on screen.{:else if section === "updates"}How this app is replaced.{:else if section === "account"}Who is signed in.{:else}How this copy of Church Studio is entitled.{/if}
          </p>
        </div>
        <button type="button" class="icon-close" aria-label="Close" onclick={close}><Icon name="close" size={16} /></button>
      </header>

      {#if section === "general"}
        <section class="card">
          <label>Church name <input class="field" bind:value={churchName} onchange={() => session.setChurchName(churchName)} /></label>
          <label>Logo text <input class="field" bind:value={logoText} onchange={() => session.setLogoText(logoText)} /></label>
          <p class="note">The logo picture is chosen in Media. The Logo button sends this name to Program.</p>
        </section>
      {:else if section === "appearance"}
        <section class="card">
          <h3>Desk</h3>
          <div class="choice-row" role="group" aria-label="Desk">
            {#each [{ id: "pewbeam", name: "Presenter Desk", icon: "pew", note: "Scripture, songs and service presentation." }, { id: "obs", name: "Production Desk", icon: "obs", note: "Live production, cameras, compositions and output control." }] as style (style.id)}
              <button type="button" class="choice" class:active={session.workspace.appearance.desk === style.id} onclick={() => session.setAppearance({ desk: style.id as DeskStyle })}>
                <Icon name={style.icon} size={18} />
                <strong>{style.name}</strong>
                <span>{style.note}</span>
              </button>
            {/each}
          </div>
        </section>
        <section class="card">
          <h3>Theme</h3>
          <div class="theme-row" role="group" aria-label="Theme">
            {#each themes as theme (theme.id)}
              <button type="button" class="theme-card" class:active={session.workspace.appearance.theme === theme.id} onclick={() => session.setAppearance({ theme: theme.id })}>
                <span class="chip" style:background={theme.ground} style:color={theme.ink}>
                  <span class="chip-bar" style:background={session.workspace.appearance.accent}></span>
                  Aa
                </span>
                <strong>{theme.name}</strong>
                <span>{theme.note}</span>
              </button>
            {/each}
          </div>
        </section>
        <section class="card">
          <h3>Accent</h3>
          <div class="accent-row" role="group" aria-label="Accent">
            {#each accents as accent (accent.value)}
              <button type="button" class="swatch" class:active={session.workspace.appearance.accent === accent.value} aria-label={accent.name} onclick={() => session.setAppearance({ accent: accent.value })}>
                <span class="dot" style:background={accent.value}></span>
                <span>{accent.name}</span>
              </button>
            {/each}
            <label class="custom-accent">
              Custom
              <input type="color" aria-label="Custom accent" value={session.workspace.appearance.accent} oninput={(event) => session.setAppearance({ accent: event.currentTarget.value })} />
            </label>
          </div>
        </section>
        <section class="card split">
          <div>
            <h3>Spacing</h3>
            <div class="segment" role="group" aria-label="Spacing">
              <button type="button" class:active={session.workspace.appearance.density === "comfortable"} onclick={() => session.setAppearance({ density: "comfortable" })}>Comfortable</button>
              <button type="button" class:active={session.workspace.appearance.density === "compact"} onclick={() => session.setAppearance({ density: "compact" })}>Compact</button>
            </div>
          </div>
          <div>
            <h3>Size</h3>
            <div class="segment" role="group" aria-label="Size">
              {#each [["0.9", "90%"], ["1", "100%"], ["1.1", "110%"], ["1.25", "125%"]] as [value, label] (value)}
                <button type="button" class:active={String(session.workspace.appearance.scale) === value} onclick={() => session.setAppearance({ scale: Number(value) })}>{label}</button>
              {/each}
            </div>
          </div>
        </section>
        <section class="card">
          <h3>Verse on the screen</h3>
          <OutputType />
        </section>
      {:else if section === "workspace"}
        <section class="card">
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
          <p class="note">Built-in layouts can be rearranged. Reset returns the selected one. Save as keeps a personal copy.</p>
          <button type="button" class="text" onclick={() => session.restoreBuiltinWorkspaces()}>Restore built-in layouts</button>
        </section>
      {:else if section === "audience"}
        <section class="status-card" class:on={session.output.online}>
          <span class="lamp" class:on={session.output.online}></span>
          <div>
            <p class="eyebrow">{session.output.online ? "Showing" : status.detail.startsWith("External display detected") ? "Detected" : "Output"}</p>
            <h3>{status.title}</h3>
            <p>{status.detail}</p>
          </div>
        </section>
        <section class="card">
          <h3>Audience window</h3>
          <div class="actions">
            {#if session.output.desired}
              <button type="button" class="primary" onclick={() => session.closeAudience()}>Close output</button>
            {:else}
              <button type="button" class="primary" onclick={() => session.openAudience()}>Open output</button>
            {/if}
            {#if session.output.desired && !session.output.online}
              <button type="button" onclick={() => session.openAudience()}>Reopen</button>
            {/if}
            <button type="button" onclick={() => session.testOutput()}>Test</button>
            {#if !session.controlsAudience}
              <button type="button" onclick={() => session.claimAudience()}>Take control</button>
            {/if}
          </div>
          <p class="note">Test flashes the audience window. It does not change Program.</p>
        </section>
        <section class="card">
          <h3>How it fills the screen</h3>
          <div class="segment" role="group" aria-label="Output mode">
            <button type="button" class:active={profile.outputMode !== "fullscreen"} onclick={() => setMode("window")}>Window</button>
            <button type="button" class:active={profile.outputMode === "fullscreen"} onclick={() => setMode("fullscreen")}>Fullscreen</button>
          </div>
          <p class="note">Fullscreen covers the audience screen. The desk stays on its own display.</p>
        </section>
        <section class="card">
          <h3>Which screen</h3>
          {#if isDesktop() && session.output.displays.length > 0}
            <div class="monitor-list">
              {#each session.output.displays as display (display.key)}
                <button
                  type="button"
                  class="monitor"
                  class:on={profile.assignments.audience === display.key || (!profile.assignments.audience && display.audience)}
                  onclick={() => session.setAssignments(assignments("audience", display.key))}
                >
                  <span class="mini" aria-hidden="true"><span>Program</span></span>
                  <span class="monitor-copy">
                    <strong>{display.name}</strong>
                    <span>{display.width} × {display.height}{display.primary ? " · Primary" : " · External"}</span>
                  </span>
                </button>
              {/each}
            </div>
          {:else if !isDesktop()}
            <p class="note">This browser cannot list monitors. Open output, drag that window to the screen, then choose Fill this screen.</p>
          {:else}
            <p class="note">No displays were detected. Connect a monitor, then refresh.</p>
            <button type="button" onclick={() => session.refreshDisplays()}>Refresh displays</button>
          {/if}
          <button type="button" class="text" onclick={() => (section = "displays")}>Arrange desk and audience</button>
        </section>
        <p class="note stand">The audience window shows Program only. Preview, theme edits, and Next stay on this desk until LIVE, Clear, or Black.</p>
      {:else if section === "displays"}
        {#if !isDesktop()}
          <section class="card">
            <p class="note">This browser cannot list monitors or move a window onto one. Open output, drag that window to the external display, then choose Fill this screen on it.</p>
            <button type="button" class="text" onclick={() => (section = "audience")}>Open output</button>
          </section>
        {:else if session.output.displays.length === 0}
          <section class="card">
            <p class="note">No displays were detected. Refresh after a monitor is connected. The operator window stays here.</p>
            <button type="button" onclick={() => session.refreshDisplays()}>Refresh displays</button>
          </section>
        {:else}
          <div class="monitor-list">
            {#each session.output.displays as display (display.key)}
              <article class="monitor static">
                <span class="mini" aria-hidden="true"><span>{display.primary ? "Desk" : "Screen"}</span></span>
                <span class="monitor-copy">
                  <strong>{display.name}</strong>
                  <span>{display.width} × {display.height} · {display.scale}×{display.primary ? " · Primary" : ""}{display.audience ? " · Audience" : ""}</span>
                </span>
                <span class="monitor-actions">
                  <button type="button" class:on={profile.assignments.operator === display.key} onclick={() => session.setAssignments(assignments("operator", display.key))}>Desk</button>
                  <button type="button" class:on={profile.assignments.audience === display.key} onclick={() => session.setAssignments(assignments("audience", display.key))}>Audience</button>
                </span>
              </article>
            {/each}
          </div>
          <button type="button" onclick={() => session.refreshDisplays()}>Refresh displays</button>
        {/if}
        <section class="card">
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
            Desk
            <select class="field" value={profile.assignments.operator ?? ""} onchange={(event) => session.setAssignments(assignments("operator", event.currentTarget.value))}>
              <option value="">Automatic, primary display</option>
              {#each session.output.displays as display (display.key)}
                <option value={display.key}>{display.name}</option>
              {/each}
            </select>
          </label>
          <label>
            Audience
            <select class="field" value={profile.assignments.audience ?? ""} onchange={(event) => session.setAssignments(assignments("audience", event.currentTarget.value))}>
              <option value="">Automatic, external display</option>
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
            <p class="note">The assigned audience display is disconnected. Program is held until that display returns.</p>
          {:else if audience.missing}
            <p class="note">Connect an external display, or assign this screen as the audience.</p>
          {/if}
          {#if sameScreen(profile.assignments)}
            <p class="note">Audience and desk are the same display.</p>
          {/if}
          {#if profile.assignments.stage}
            <p class="note">Stage is saved on this profile. The stage window stays closed in this release.</p>
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
        </section>
      {:else if section === "keyboard"}
        {#each shortcutGroups as group (group)}
          <section class="card">
            <h3>{group}</h3>
            <ul class="keys">
              {#each COMMANDS.filter((command) => command.group === group) as command (command.id)}
                <li>
                  <span>{command.title}</span>
                  <span class="kbd">{command.shortcut ? shortcutLabel(shortcuts, command.shortcut) : command.id === "open-settings" ? "⌘," : "—"}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
        <p class="note stand">These keys call the command list. Remapping will use the same commands.</p>
      {:else if section === "remote"}
        <RemotePanel />
      {:else if section === "stage"}
        <section class="card">
          <h3>{canUse("stage-display") ? "Stage is available" : "Not in this release"}</h3>
          <p class="note">A profile can remember a stage screen. The window stays closed, and Program is unchanged. Choose that screen under Displays.</p>
          <button type="button" class="text" onclick={() => (section = "displays")}>Choose a stage screen</button>
        </section>
      {:else if section === "storage"}
        <section class="card">
          <p class="note">Songs, services, and themes stored on this device. Import a Church Studio library, or a text or Markdown file as slides. Import replaces a library record only when its id matches. Program is not included. Images import from Media.</p>
          <div class="actions">
            <button type="button" class="primary" onclick={() => downloadLibrary()}>Export library</button>
            <button type="button" onclick={() => fileInput?.click()}>Import</button>
            <input bind:this={fileInput} type="file" accept={IMPORT_ACCEPT} hidden onchange={(event) => void importFile(event)} />
          </div>
          {#if fileMessage}<p class="note">{fileMessage}</p>{/if}
        </section>
      {:else if section === "bible"}
        <section class="card">
          <h3>On this computer</h3>
          <p class="note">Public-domain scripture is stored locally. Search, Listen, and the next verse stay on Preview until LIVE.</p>
          <ul class="plain">
            {#each session.translations as translation (translation.id)}
              <li>{translation.abbreviation} — {translation.name}. {translation.licenseNote ?? "Public domain"}.</li>
            {/each}
          </ul>
        </section>
      {:else if section === "lyrics"}
        <section class="card">
          <h3>Library</h3>
          <p class="note">Write and reorder songs on the desk. A saved song can be queued into the service. Export them from Files.</p>
          <button type="button" class="text" onclick={() => (section = "storage")}>Open Files</button>
        </section>
      {:else if section === "media"}
        <section class="card">
          <h3>Pictures</h3>
          <p class="note">Import stays on this computer. Preview and Use as logo do not change Program. A camera reaches Program and the audience only on LIVE. Permission denied is a desk message. A missing picture shows the empty frame instead of crashing. If the audience window cannot open a camera, it shows the camera card.</p>
          <MediaPane />
        </section>
      {:else if section === "audio"}
        <section class="card">
          <h3>{canUse("voice-detect") ? "Voice detection" : "Not in this release"}</h3>
          <p class="note">
            {canUse("voice-detect")
              ? "Listen on Live transcript. A match is Preview only. LIVE still sends Program. Recognition stays on this computer. Cloud AI is off. If macOS already refused the mic, turn Church Studio on under Microphone and Speech Recognition."
              : "Audio recognition is not connected. Nothing here starts a microphone."}
          </p>
          {#if canUse("voice-detect") && isDesktop()}
            <div class="actions">
              <button type="button" class="primary" onclick={() => void allowMicrophone()}>Allow microphone</button>
              <button type="button" onclick={() => void openPrivacySettings()}>Open Privacy settings</button>
            </div>
            {#if audioNote}<p class="note">{audioNote}</p>{/if}
          {/if}
        </section>
      {:else if section === "performance"}
        <section class="card">
          <h3>Desk size</h3>
          <p class="note">Spacing and type size for the operator window live in Look. The audience window draws Program only.</p>
          <button type="button" class="text" onclick={() => (section = "appearance")}>Open Look</button>
        </section>
      {:else if section === "updates"}
        <section class="card">
          <h3>This build</h3>
          <p class="note">Church Studio 0.1.0. Updates are not configured. The copy you launched is the one that is running.</p>
        </section>
      {:else if section === "account"}
        <section class="card">
          <h3>Offline</h3>
          <p class="note">This desktop app runs without an account. Sign-in is not part of this release.</p>
        </section>
      {:else}
        <section class="card">
          <h3>Included</h3>
          <p class="note">Presentation, the library, and audience output run offline. A license check is not required for this release.</p>
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  .settings-layer {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
  }
  .settings-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(0, 0, 0, 0.72);
    cursor: default;
  }
  .settings {
    position: relative;
    width: min(980px, calc(100% - 28px));
    height: min(700px, calc(100% - 28px));
    background: color-mix(in srgb, var(--booth) 88%, #000);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 16px;
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    font-family: var(--font-ui);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }
  .settings-nav {
    border-right: 1px solid var(--line);
    overflow: auto;
    padding: 18px 12px 20px;
    background: color-mix(in srgb, var(--desk) 70%, #000);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .settings-nav > p {
    margin: 0 8px 12px;
    font-size: 15px;
    font-weight: 650;
    color: var(--ink);
  }
  .group {
    margin: 14px 8px 4px;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .settings-nav button {
    width: 100%;
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  .settings-nav button.active {
    color: var(--ink);
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .settings :global(svg) {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .settings-body {
    min-width: 0;
    overflow: auto;
    padding: 22px 26px 32px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .set-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }
  .set-head h2 {
    margin: 0;
    font-size: 28px;
    font-weight: 620;
    letter-spacing: -0.03em;
    color: var(--ink);
  }
  .set-head p, .note {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }
  .note.stand { margin-top: 0; }
  .plain {
    margin: 12px 0 0;
    padding: 0 0 0 18px;
    color: var(--ink);
    font-size: 13px;
    line-height: 1.5;
  }
  .icon-close, .text {
    border: 0;
    background: transparent;
    color: var(--ink);
    height: 32px;
    padding: 0 8px;
  }
  .text { color: var(--accent); padding: 0; height: auto; text-align: left; }
  .card, .status-card {
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--panel) 86%, #000);
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card h3, .status-card h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 620;
    color: var(--ink);
  }
  .status-card {
    flex-direction: row;
    align-items: center;
    gap: 14px;
  }
  .status-card .eyebrow {
    margin: 0;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .status-card h3 { font-size: 22px; letter-spacing: -0.03em; }
  .status-card p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
  .lamp {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--line);
    flex: none;
  }
  .lamp.on { background: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent); }
  .choice-row, .theme-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .theme-row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .choice, .theme-card {
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    border-radius: 10px;
    min-height: 88px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
  }
  .choice strong, .theme-card strong { font-size: 13px; font-weight: 620; }
  .choice span, .theme-card span { color: var(--muted); font-size: 12px; }
  .choice.active, .theme-card.active { border-color: var(--accent); }
  .chip {
    width: 100%;
    height: 54px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    font-family: var(--font-scripture);
    font-size: 22px;
    position: relative;
    overflow: hidden;
    margin-bottom: 6px;
  }
  .chip-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; }
  .accent-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .swatch {
    width: auto;
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 10px;
  }
  .dot { width: 28px; height: 28px; border-radius: 50%; }
  .swatch.active .dot { outline: 2px solid var(--ink); outline-offset: 3px; }
  .custom-accent { display: flex; flex-direction: column; gap: 6px; font-size: 10px; color: var(--muted); }
  .custom-accent input { width: 28px; height: 28px; padding: 0; border: 0; background: transparent; }
  .segment {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
    background: var(--field);
    border: 1px solid var(--line);
    width: fit-content;
    max-width: 100%;
    flex-wrap: wrap;
  }
  .segment button {
    border: 0;
    background: transparent;
    color: var(--muted);
    height: 30px;
    padding: 0 12px;
    border-radius: 7px;
  }
  .segment button.active { background: var(--ink); color: var(--booth); }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .actions button, .settings-body > button, .card > button:not(.text) {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--ink);
    height: 34px;
    padding: 0 12px;
    border-radius: 8px;
  }
  .actions .primary, button.primary { background: var(--ink); color: var(--booth); border-color: var(--ink); }
  .actions button:disabled { opacity: 0.4; }
  .monitor-list { display: flex; flex-direction: column; gap: 8px; }
  .monitor {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    width: 100%;
    text-align: left;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    border-radius: 12px;
    padding: 10px;
  }
  button.monitor { grid-template-columns: 72px minmax(0, 1fr); }
  .monitor.on { border-color: var(--accent); }
  .monitor.static { cursor: default; }
  .mini {
    height: 42px;
    border-radius: 6px;
    background: #050505;
    color: #f5f5f5;
    display: grid;
    place-items: center;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .monitor-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .monitor-copy strong { font-size: 14px; }
  .monitor-copy span, .monitor-copy { color: var(--muted); font-size: 12px; }
  .monitor-copy strong { color: var(--ink); }
  .monitor-actions { display: flex; gap: 6px; }
  .monitor-actions button {
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--ink);
    font-size: 12px;
  }
  .monitor-actions button.on { background: var(--ink); color: var(--booth); border-color: var(--ink); }
  .keys { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .keys li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
    color: var(--ink);
    font-size: 13px;
  }
  .keys li:last-child { border-bottom: 0; }
  .kbd {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 760px) {
    .settings { grid-template-columns: 1fr; height: min(92dvh, 760px); }
    .settings-nav { border-right: 0; border-bottom: 1px solid var(--line); max-height: 180px; }
    .theme-row, .split, .choice-row { grid-template-columns: 1fr 1fr; }
  }
</style>
