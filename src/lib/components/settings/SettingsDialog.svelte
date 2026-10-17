<script lang="ts">
  import AudioSettings from "../AudioSettings.svelte";
  import CapabilityList from "../CapabilityList.svelte";
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
    | "system"
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
  type SettingsEntry = { id: SettingsSectionId; title: string; icon: string; color: string; about: string; keywords: string };
  type SettingsGroup = { label: string; items: SettingsEntry[] };

  let audioNote = $state("");

  async function allowMicrophone() {
    audioNote = "macOS may ask for the microphone…";
    const blocked = await prepareListening();
    audioNote = blocked ?? "Microphone and Speech Recognition are allowed for Church Studio.";
    if (blocked) void openPrivacySettings();
  }

  // Each page: a colored icon tile (System Settings style), a one-line description and search words.
  const groups: SettingsGroup[] = [
    {
      label: "Studio",
      items: [
        { id: "general", title: "Church", icon: "church", color: "#f08a24", about: "Your church's name, logo text and CCLI license.", keywords: "name logo ccli license copyright" },
        { id: "system", title: "This computer", icon: "laptop", color: "#8e8e93", about: "What works in this window, and why some things do not.", keywords: "capabilities browser desktop features" },
        { id: "appearance", title: "Appearance", icon: "look", color: "#a259e6", about: "Desk, theme, accent color and type size on this computer.", keywords: "theme dark light accent color size spacing desk verse font" },
        { id: "workspace", title: "Layouts", icon: "layout", color: "#5b5bd6", about: "How the operator desk is arranged.", keywords: "workspace panels arrange reset" },
        { id: "keyboard", title: "Keyboard", icon: "keys", color: "#636366", about: "Keys that drive the desk.", keywords: "shortcuts keys hotkeys" },
      ],
    },
    {
      label: "Output",
      items: [
        { id: "audience", title: "Audience output", icon: "cast", color: "#e5484d", about: "What the congregation sees, and on which screen.", keywords: "projector window fullscreen program open test" },
        { id: "displays", title: "Displays", icon: "screens", color: "#0a84ff", about: "Which screen is the desk, and which is the audience.", keywords: "monitor screen profile second assign" },
        { id: "stage", title: "Stage display", icon: "stage", color: "#ff9f0a", about: "A private confidence screen for the people on stage.", keywords: "confidence platform next clock" },
        { id: "remote", title: "Phone remote", icon: "phone", color: "#30a46c", about: "Pair a phone as a controller. It is never a display.", keywords: "phone tablet pair qr lan" },
      ],
    },
    {
      label: "Library",
      items: [
        { id: "bible", title: "Bible", icon: "bible", color: "#a07a52", about: "Scripture translations on this computer.", keywords: "translation kjv scripture" },
        { id: "lyrics", title: "Songs", icon: "lyrics", color: "#e93d82", about: "Songs, folders, imports and copyright.", keywords: "lyrics hymns ccli songselect openlyrics" },
        { id: "media", title: "Media", icon: "media", color: "#12a5b8", about: "Pictures and videos for backgrounds and the logo.", keywords: "images video background logo camera" },
        { id: "audio", title: "Sound & voice", icon: "audio", color: "#3e63dd", about: "Microphone, listening and voice commands.", keywords: "microphone voice speech listen detection" },
        { id: "storage", title: "Backup", icon: "files", color: "#2f80ed", about: "Export or import the whole library.", keywords: "export import backup files library" },
      ],
    },
    {
      label: "System",
      items: [
        { id: "performance", title: "Performance", icon: "speed", color: "#30a46c", about: "How much of the desk is on screen.", keywords: "speed density size" },
        { id: "updates", title: "Updates", icon: "refresh", color: "#0a84ff", about: "Which version is running.", keywords: "version update release" },
        { id: "account", title: "Account", icon: "user", color: "#8e8e93", about: "Who is signed in.", keywords: "sign in user cloud" },
        { id: "license", title: "License", icon: "key", color: "#d4a017", about: "How this copy of Church Studio is entitled.", keywords: "license plan" },
      ],
    },
  ];

  let search = $state("");
  const visibleGroups = $derived.by(() => {
    const needle = search.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            (item.id !== "remote" || canUse("remote-control")) &&
            (!needle || `${item.title} ${item.about} ${item.keywords} ${group.label}`.toLowerCase().includes(needle)),
        ),
      }))
      .filter((group) => group.items.length > 0);
  });

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
    return sections.some((entry) => entry.id === value);
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
  const IMPORT_ACCEPT = ".json,.txt,.md,.markdown,.text,.pdf,application/json,text/plain,text/markdown,application/pdf";

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
      if (name.endsWith(".pdf")) await session.importPdf(file);
      else {
        const text = await file.text();
        if (name.endsWith(".json")) await session.importLibrary(JSON.parse(text) as unknown);
        else await session.importDocument(file.name, text);
      }
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
  const page = $derived(sections.find((item) => item.id === section));
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
      <div class="set-brand">
        <span class="set-brand-mark" style:background={session.workspace.appearance.accent}><Icon name="church" size={18} /></span>
        <div>
          <p id="settings-title">Settings</p>
          <span>{session.workspace.churchName || "Church Studio"}</span>
        </div>
      </div>
      <label class="nav-search">
        <Icon name="search" size={14} />
        <input type="search" placeholder="Search settings" aria-label="Search settings" bind:value={search} />
      </label>
      <div class="nav-list">
        {#each visibleGroups as group (group.label)}
          <p class="nav-group">{group.label}</p>
          {#each group.items as item (item.id)}
            <button type="button" class="nav-item" class:active={section === item.id} aria-current={section === item.id ? "page" : undefined} onclick={() => (section = item.id)}>
              <span class="tile" style:background={item.color}><Icon name={item.icon} size={14} /></span>
              <span class="nav-title">{item.title}</span>
            </button>
          {/each}
        {:else}
          <p class="nav-empty">No settings match “{search}”.</p>
        {/each}
      </div>
      <p class="nav-foot">Church Studio 0.1.0 · offline</p>
    </nav>

    <div class="settings-body">
      <header class="set-head">
        <span class="tile big" style:background={page?.color}><Icon name={page?.icon ?? "settings"} size={22} /></span>
        <div class="head-copy">
          <h2>{page?.title}</h2>
          <p>{page?.about}</p>
        </div>
        <button type="button" class="icon-close" aria-label="Close settings" title="Close (Esc)" onclick={close}><Icon name="close" size={16} /></button>
      </header>

      {#if section === "general"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Church name</strong><span>Shown in Settings and used for the logo slide.</span></div>
            <input class="field" aria-label="Church name" placeholder="Grace Chapel" bind:value={churchName} onchange={() => session.setChurchName(churchName)} />
          </div>
          <div class="row">
            <div class="row-copy"><strong>Logo text</strong><span>The Logo button sends this to Program. Pick the picture in Media.</span></div>
            <input class="field" aria-label="Logo text" bind:value={logoText} onchange={() => session.setLogoText(logoText)} />
          </div>
        </section>
        <p class="section-label">Copyright</p>
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>CCLI license #</strong><span>Shown with each song's © line on its first and last slide, as the CCLI license asks.</span></div>
            <input
              class="field"
              aria-label="CCLI license number"
              inputmode="numeric"
              placeholder="Church Copyright License number"
              value={session.workspace.ccliLicense}
              onchange={(event) => session.setCcliLicense(event.currentTarget.value)}
            />
          </div>
        </section>
      {:else if section === "system"}
        <section class="card">
          <h3>On this computer</h3>
          <CapabilityList />
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
                  <kbd class="kbd">{command.shortcut ? shortcutLabel(shortcuts, command.shortcut) : command.id === "open-settings" ? "⌘," : "—"}</kbd>
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
          <h3>Stage display</h3>
          <p class="note">
            A confidence screen for the platform: what is live now, what is next (Preview), the time, and any timer. It never
            sends anything to the audience. With three screens it opens on the one that is neither this desk nor the audience;
            otherwise drag it to the platform screen.
          </p>
          <div class="actions">
            <button type="button" class="primary" onclick={() => void session.openStage()}>Open stage display</button>
          </div>
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
          <div class="rows inset">
            {#each session.translations as translation (translation.id)}
              <div class="row">
                <div class="row-copy"><strong>{translation.name}</strong><span>{translation.licenseNote ?? "Public domain"}</span></div>
                <span class="pill">{translation.abbreviation}</span>
              </div>
            {/each}
          </div>
        </section>
      {:else if section === "lyrics"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Song library</strong><span>{session.songs.length} song{session.songs.length === 1 ? "" : "s"} in {session.workspace.songFolders.length} folder{session.workspace.songFolders.length === 1 ? "" : "s"}. Write, import and organize them in the Songs window.</span></div>
            <span class="pill">{session.songs.length}</span>
          </div>
          <div class="row">
            <div class="row-copy"><strong>Imports</strong><span>Plain text, ChordPro, SongSelect (.usr / .txt) and OpenLyrics (.xml / .zip).</span></div>
          </div>
          <div class="row">
            <div class="row-copy"><strong>CCLI license #</strong><span>{session.workspace.ccliLicense ? `CCLI License # ${session.workspace.ccliLicense} is shown with song copyright.` : "Not set. Songs show their © line and CCLI song number only."}</span></div>
            <button type="button" class="link" onclick={() => (section = "general")}>{session.workspace.ccliLicense ? "Change" : "Add"}</button>
          </div>
        </section>
      {:else if section === "media"}
        <section class="card">
          <h3>Pictures</h3>
          <p class="note">Import stays on this computer. Preview and Use as logo do not change Program. A camera reaches Program and the audience only on LIVE. Permission denied is a desk message. A missing picture shows the empty frame instead of crashing. If the audience window cannot open a camera, it shows the camera card.</p>
          <MediaPane />
        </section>
      {:else if section === "audio"}
        <AudioSettings />
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
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Desk size</strong><span>Spacing and type size for the operator window. The audience window draws Program only.</span></div>
            <button type="button" class="link" onclick={() => (section = "appearance")}>Open Appearance</button>
          </div>
        </section>
      {:else if section === "updates"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Church Studio 0.1.0</strong><span>The copy you launched is the one that is running.</span></div>
            <span class="pill">Current</span>
          </div>
          <div class="row">
            <div class="row-copy"><strong>Automatic updates</strong><span>Not configured in this release.</span></div>
            <span class="pill muted">Off</span>
          </div>
        </section>
      {:else if section === "account"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Offline</strong><span>Church Studio runs without an account. Sign-in is not part of this release.</span></div>
            <span class="pill muted">No account</span>
          </div>
        </section>
      {:else}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Included</strong><span>Presentation, the library and audience output run offline. No license check is needed in this release.</span></div>
            <span class="pill">Active</span>
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Layer and window */
  .settings-layer { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; }
  .settings-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
    cursor: default;
  }
  .settings {
    position: relative;
    width: min(1040px, calc(100% - 32px));
    height: min(740px, calc(100% - 32px));
    display: grid;
    grid-template-columns: 248px minmax(0, 1fr);
    background: var(--panel);
    color: var(--ink);
    border: 1px solid color-mix(in srgb, var(--ink) 12%, var(--line));
    border-radius: 18px;
    font-family: var(--font-ui);
    box-shadow: 0 40px 120px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }
  .settings :global(svg) { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

  /* Sidebar */
  .settings-nav {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 18px 12px 12px;
    border-right: 1px solid var(--line);
    background: color-mix(in srgb, var(--desk) 80%, var(--panel));
  }
  .set-brand { display: flex; align-items: center; gap: 10px; padding: 0 6px 14px; }
  .set-brand-mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; color: #fff; flex: none; box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.2); }
  .set-brand p { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
  .set-brand div span { display: block; font-size: 11px; color: var(--muted); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    margin: 0 4px 10px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--field);
    color: var(--muted);
    flex-direction: row;
  }
  .nav-search:focus-within { border-color: var(--accent); color: var(--ink); }
  .nav-search input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; color: var(--ink); font: inherit; font-size: 13px; outline: none; }
  .nav-search input::-webkit-search-cancel-button { display: none; }
  .nav-list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; padding: 0 2px; }
  .nav-group { margin: 10px 10px 3px; font-size: 11px; font-weight: 600; color: var(--muted); }
  .nav-group:first-child { margin-top: 2px; }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 31px;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  .nav-item:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .nav-item.active { background: color-mix(in srgb, var(--accent) 20%, transparent); }
  .nav-item.active .nav-title { font-weight: 600; }
  .nav-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .nav-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: none;
    border-radius: 7px;
    color: #fff;
    box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.18), 0 1px 2px rgba(0, 0, 0, 0.25);
  }
  .tile.big { width: 44px; height: 44px; border-radius: 12px; }
  .nav-empty { margin: 12px 10px; font-size: 12px; color: var(--muted); }
  .nav-foot { margin: 8px 10px 0; padding-top: 10px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); }

  /* Page */
  .settings-body { min-width: 0; overflow: auto; display: flex; flex-direction: column; gap: 14px; padding: 0 28px 32px; }
  .set-head {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 -28px;
    padding: 20px 28px 16px;
    background: color-mix(in srgb, var(--panel) 92%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .head-copy { flex: 1; min-width: 0; }
  .set-head h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .set-head p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
  .icon-close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: none;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--field);
    color: var(--muted);
  }
  .icon-close:hover { color: var(--ink); }
  .section-label { margin: 6px 4px -6px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .note { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .note.stand { padding: 0 4px; }
  .text, .link { border: 0; background: none; padding: 0; color: var(--accent); font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; }
  .text:hover, .link:hover { text-decoration: underline; }

  /* Rows: label and help on the left, control on the right */
  .rows { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 12px; background: var(--field); overflow: hidden; }
  .rows.inset { background: var(--panel); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 56px; padding: 10px 16px; }
  .row + .row { border-top: 1px solid var(--line); }
  .row-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .row-copy strong { font-size: 13px; font-weight: 600; }
  .row-copy span { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .row .field { width: min(300px, 45%); height: 34px; flex: none; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--ink); font: inherit; font-size: 13px; }
  .row .field:focus { border-color: var(--accent); outline: none; }
  .pill {
    flex: none;
    padding: 3px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .pill.muted { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--muted); }

  /* Cards */
  .card, .status-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--field);
  }
  .card h3 { margin: 0; font-size: 13px; font-weight: 650; }
  .card :global(.field), .card select, .card input:not([type]) { background: var(--panel); }
  .status-card { flex-direction: row; align-items: center; gap: 14px; }
  .status-card.on { border-color: color-mix(in srgb, var(--presence, #3fb950) 60%, var(--line)); }
  .status-card .eyebrow { margin: 0; font-size: 11px; font-weight: 600; color: var(--muted); }
  .status-card h3 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
  .status-card p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
  .lamp { width: 12px; height: 12px; border-radius: 50%; background: var(--line); flex: none; }
  .lamp.on { background: var(--presence, #3fb950); box-shadow: 0 0 0 5px color-mix(in srgb, var(--presence, #3fb950) 22%, transparent); }

  /* Appearance */
  .choice-row, .theme-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .theme-row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .choice, .theme-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    min-height: 88px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    color: var(--ink);
    text-align: left;
    font: inherit;
    transition: border-color 120ms, box-shadow 120ms;
  }
  .choice:hover, .theme-card:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .choice strong, .theme-card strong { font-size: 13px; font-weight: 650; }
  .choice span, .theme-card span { color: var(--muted); font-size: 12px; }
  .choice.active, .theme-card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .choice :global(svg) { color: var(--accent); margin-bottom: 4px; }
  .chip { position: relative; display: grid; place-items: center; width: 100%; height: 60px; margin-bottom: 8px; border-radius: 8px; overflow: hidden; font-family: var(--font-scripture); font-size: 22px; box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.25); }
  .chip-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; }
  .accent-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px; }
  .swatch { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0; border: 0; background: transparent; color: var(--muted); font-size: 11px; }
  .dot { width: 30px; height: 30px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2); }
  .swatch.active { color: var(--ink); }
  .swatch.active .dot { outline: 2px solid var(--ink); outline-offset: 3px; }
  .custom-accent { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); }
  .custom-accent input { width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: transparent; }
  .segment { display: inline-flex; flex-wrap: wrap; gap: 2px; width: fit-content; max-width: 100%; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .segment button { height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; }
  .segment button:hover:not(.active) { color: var(--ink); }
  .segment button.active { background: var(--accent); color: #fff; }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .split > div { display: flex; flex-direction: column; gap: 10px; }

  /* Forms */
  label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .actions button, .settings-body > button, .card > button:not(.text):not(.link) {
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--panel);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    width: fit-content;
  }
  .actions button:hover:not(:disabled), .card > button:not(.text):not(.link):hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .actions .primary, button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .actions button:disabled, .card > button:disabled { opacity: 0.4; }

  /* Displays */
  .monitor-list { display: flex; flex-direction: column; gap: 8px; }
  .monitor {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--field);
    color: var(--ink);
    font: inherit;
    text-align: left;
  }
  button.monitor { grid-template-columns: 76px minmax(0, 1fr); }
  button.monitor:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .monitor.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .monitor.static { cursor: default; }
  .mini { display: grid; place-items: center; height: 44px; border: 2px solid color-mix(in srgb, var(--ink) 25%, transparent); border-radius: 6px; background: #050505; color: #f5f5f5; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .monitor-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; color: var(--muted); font-size: 12px; }
  .monitor-copy strong { color: var(--ink); font-size: 14px; }
  .monitor-actions { display: flex; gap: 4px; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); }
  .monitor-actions button { height: 26px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; }
  .monitor-actions button.on { background: var(--accent); color: #fff; }

  /* Keyboard */
  .keys { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .keys li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  .keys li:last-child { border-bottom: 0; }
  .kbd {
    min-width: 28px;
    padding: 2px 8px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 6px;
    background: var(--panel);
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 760px) {
    .settings { grid-template-columns: 1fr; height: min(92dvh, 760px); }
    .settings-nav { border-right: 0; border-bottom: 1px solid var(--line); max-height: 220px; }
    .theme-row, .split, .choice-row { grid-template-columns: 1fr 1fr; }
    .row { flex-direction: column; align-items: stretch; }
    .row .field { width: 100%; }
  }
</style>
