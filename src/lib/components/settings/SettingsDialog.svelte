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
  import { isDesktop, openExternal } from "../../platform/runtime";
  import { openPrivacySettings, prepareListening } from "../../voice/listen";
  import Icon from "../Icon.svelte";
  import { BIBLE_CATALOG } from "../../bible/texts";
  import { checkoutUrl, FEATURE_LABELS, initials, PLANS, planById, TRIAL_DAYS, yearlyDeal } from "../../domain/plans";
  import ThemeLibrary from "./ThemeLibrary.svelte";

  type SettingsSectionId =
    | "general"
    | "system"
    | "appearance"
    | "workspace"
    | "keyboard"
    | "audience"
    | "themes"
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
      label: "General",
      items: [
        { id: "general", title: "Church", icon: "church", color: "#f08a24", about: "Your church's name, logo text and CCLI license.", keywords: "name logo ccli license copyright" },
        { id: "appearance", title: "Appearance", icon: "look", color: "#a259e6", about: "Desk, theme, accent color and type size on this computer.", keywords: "theme dark light accent color size spacing desk verse font performance density" },
        { id: "workspace", title: "Layouts", icon: "layout", color: "#5b5bd6", about: "How the operator desk is arranged.", keywords: "workspace panels arrange reset" },
        { id: "keyboard", title: "Keyboard", icon: "keys", color: "#636366", about: "Keys that drive the desk.", keywords: "shortcuts keys hotkeys" },
      ],
    },
    {
      label: "Presenting",
      items: [
        { id: "themes", title: "Themes", icon: "themes", color: "#c2410c", about: "How verses, songs and slides look on the screen.", keywords: "theme background color font animation motion video photo image wash gradient premium library look" },
        { id: "audience", title: "Audience output", icon: "cast", color: "#e5484d", about: "What the congregation sees, and on which screen.", keywords: "projector window fullscreen program open test" },
        { id: "displays", title: "Displays", icon: "screens", color: "#0a84ff", about: "Which screen is the desk, and which is the audience.", keywords: "monitor screen profile second assign" },
        { id: "stage", title: "Stage display", icon: "stage", color: "#ff9f0a", about: "A private confidence screen for the people on stage.", keywords: "confidence platform next clock" },
      ],
    },
    {
      label: "Library",
      items: [
        { id: "bible", title: "Bible", icon: "bible", color: "#a07a52", about: "Scripture translations on this computer.", keywords: "translation kjv scripture" },
        { id: "lyrics", title: "Songs", icon: "lyrics", color: "#e93d82", about: "Songs, folders, imports and copyright.", keywords: "lyrics hymns ccli songselect openlyrics" },
        { id: "media", title: "Media", icon: "media", color: "#12a5b8", about: "Pictures and videos for backgrounds and the logo.", keywords: "images video background logo camera" },
        { id: "storage", title: "Backup", icon: "files", color: "#2f80ed", about: "Export or import the whole library.", keywords: "export import backup files library" },
      ],
    },
    {
      label: "Devices",
      items: [
        { id: "audio", title: "Sound & voice", icon: "audio", color: "#3e63dd", about: "Microphone, listening and voice commands.", keywords: "microphone voice speech listen detection" },
        { id: "remote", title: "Phone remote", icon: "phone", color: "#30a46c", about: "Pair a phone as a controller. It is never a display.", keywords: "phone tablet pair qr lan" },
      ],
    },
    {
      label: "About",
      items: [
        { id: "system", title: "This computer", icon: "laptop", color: "#8e8e93", about: "What works in this window, and why some things do not.", keywords: "capabilities browser desktop features" },
        { id: "updates", title: "Updates", icon: "refresh", color: "#0a84ff", about: "Which version is running.", keywords: "version update release" },
      ],
    },
  ];

  /** Opened from the account card at the top of the sidebar, like the profile in System Settings. */
  const ACCOUNT: SettingsEntry = {
    id: "account",
    title: "Plan & account",
    icon: "user",
    color: "#8e8e93",
    about: "Your plan, the Premium trial, and what each plan includes.",
    keywords: "sign in user cloud plan premium free church trial upgrade billing license",
  };
  /** Older links: these pages were folded into others. */
  const ALIASES: Partial<Record<string, SettingsSectionId>> = { license: "account", performance: "appearance" };

  let search = $state("");
  let billing = $state<"monthly" | "yearly">("yearly");
  let code = $state("");
  let codeError = $state("");
  let signInName = $state("");
  let signInEmail = $state("");
  let signInError = $state("");
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

  const sections: SettingsEntry[] = [...groups.flatMap((group) => group.items), ACCOUNT];
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

  const requested = ALIASES[session.settingsSection] ?? session.settingsSection;
  let section = $state<SettingsSectionId>(isSettingsSection(requested) ? requested : "appearance");
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

  let mediaInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (section === "media") void session.loadCameras();
  });

  async function importMedia() {
    if (!isDesktop()) {
      mediaInput?.click();
      return;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false, filters: [{ name: "Image or video", extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "m4v", "mov", "webm"] }] });
    if (typeof picked === "string") await session.importImage(picked);
  }

  async function importMediaFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) await session.importImage(file);
  }

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
      <button type="button" class="account-card" class:active={section === "account"} onclick={() => (section = "account")}>
        {#if session.workspace.profile}
          <span class="set-brand-mark avatar-mark" style:background={planById(session.plan).color}>{initials(session.workspace.profile.name)}</span>
        {:else}
          <span class="set-brand-mark" style:background={session.workspace.appearance.accent}><Icon name="church" size={18} /></span>
        {/if}
        <span class="account-copy">
          <strong id="settings-title">{session.workspace.profile?.name || session.workspace.churchName || "Church Studio"}</strong>
          <span>
            <b class="plan-chip" style:color={planById(session.plan).color}>{planById(session.plan).name}{session.trialDays > 0 && session.workspace.entitlement.plan === "free" ? " trial" : ""}</b>
            · {session.workspace.profile ? session.workspace.churchName || "Plan & account" : "Sign in"}
          </span>
        </span>
        <Icon name="chevron-right" size={14} />
      </button>
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
        <CapabilityList />
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
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Screen theme</strong><span>{session.theme().name}. Colors, fonts and backgrounds for the audience screen live in Themes.</span></div>
            <button type="button" class="btn" onclick={() => (section = "themes")}>Open Themes</button>
          </div>
        </section>
      {:else if section === "workspace"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Current layout</strong><span>{layout.builtin ? "Built in. Rearrange it freely; Reset brings it back." : "Your own layout."}</span></div>
            <select class="field" aria-label="Current layout" value={layout.id} onchange={(event) => session.useLayout(event.currentTarget.value)}>
              {#each session.workspace.layouts as item (item.id)}
                <option value={item.id}>{item.name}{item.builtin ? " · built in" : ""}</option>
              {/each}
            </select>
          </div>
          <div class="row">
            <div class="row-copy"><strong>Name</strong><span>Rename the layout you are using.</span></div>
            <input class="field" aria-label="Layout name" bind:value={layoutName} onchange={() => session.renameActiveLayout(layoutName)} />
          </div>
          <div class="row">
            <div class="row-copy"><strong>This layout</strong><span>Save keeps panel sizes. Duplicate makes a personal copy.</span></div>
            <div class="row-end">
              <button type="button" class="btn primary" onclick={() => session.saveLayout()}>Save</button>
              <button type="button" class="btn" onclick={() => session.duplicateActiveLayout()}>Duplicate</button>
              <button type="button" class="btn" onclick={() => session.resetActiveLayout()} disabled={!layout.builtin}>Reset</button>
              <button type="button" class="btn danger" onclick={() => session.deleteLayoutById(layout.id)} disabled={layout.builtin}>Delete</button>
            </div>
          </div>
        </section>
        <p class="section-label">New layout</p>
        <section class="rows">
          <form
            class="row"
            onsubmit={(event) => {
              event.preventDefault();
              session.saveLayoutAs(newLayout);
              newLayout = "";
            }}
          >
            <div class="row-copy"><strong>Save as</strong><span>Keep the current arrangement under a new name.</span></div>
            <div class="row-end">
              <input class="field" placeholder="Layout name" bind:value={newLayout} aria-label="New layout name" />
              <button type="submit" class="btn primary" disabled={!newLayout.trim()}>Save as</button>
            </div>
          </form>
          <div class="row">
            <div class="row-copy"><strong>Built-in layouts</strong><span>Put back any built-in layout that was deleted or changed.</span></div>
            <button type="button" class="btn" onclick={() => session.restoreBuiltinWorkspaces()}>Restore</button>
          </div>
        </section>
      {:else if section === "themes"}
        <ThemeLibrary />
      {:else if section === "audience"}
        <section class="status-card" class:on={session.output.online}>
          <span class="lamp" class:on={session.output.online}></span>
          <div class="head-copy">
            <p class="eyebrow">{session.output.online ? "Showing" : status.detail.startsWith("External display detected") ? "Detected" : "Output"}</p>
            <h3>{status.title}</h3>
            <p>{status.detail}</p>
          </div>
          <div class="row-end">
            {#if session.output.desired}
              <button type="button" class="btn" onclick={() => session.closeAudience()}>Close</button>
            {:else}
              <button type="button" class="btn primary" onclick={() => session.openAudience()}>Open output</button>
            {/if}
          </div>
        </section>
        <section class="rows">
          {#if session.output.desired && !session.output.online}
            <div class="row">
              <div class="row-copy"><strong>Output was closed</strong><span>The audience window is not showing. Open it again.</span></div>
              <button type="button" class="btn primary" onclick={() => session.openAudience()}>Reopen</button>
            </div>
          {/if}
          <div class="row">
            <div class="row-copy"><strong>Fullscreen</strong><span>Cover the whole audience screen. The desk stays on its own display.</span></div>
            <input type="checkbox" class="switch" role="switch" aria-label="Fullscreen output" checked={profile.outputMode === "fullscreen"} onchange={(event) => setMode(event.currentTarget.checked ? "fullscreen" : "window")} />
          </div>
          <div class="row">
            <div class="row-copy"><strong>Test the output</strong><span>Flashes the audience window. Program does not change.</span></div>
            <button type="button" class="btn" onclick={() => session.testOutput()}>Test</button>
          </div>
          {#if !session.controlsAudience}
            <div class="row">
              <div class="row-copy"><strong>Another window is in control</strong><span>Send to the audience from this window instead.</span></div>
              <button type="button" class="btn" onclick={() => session.claimAudience()}>Take control</button>
            </div>
          {/if}
        </section>
        <p class="section-label">Screen</p>
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
        {:else}
          <section class="rows">
            <div class="row">
              <div class="row-copy">
                <strong>{isDesktop() ? "No displays detected" : "Choose the screen yourself"}</strong>
                <span>{isDesktop() ? "Connect a monitor, then refresh." : "This browser cannot list monitors. Open output, drag the window to the screen, then choose Fill this screen."}</span>
              </div>
              {#if isDesktop()}<button type="button" class="btn" onclick={() => session.refreshDisplays()}>Refresh</button>{/if}
            </div>
          </section>
        {/if}
        <p class="note stand">The audience window shows Program only. Preview, theme edits and Next stay on this desk until LIVE, Clear or Black. <button type="button" class="link" onclick={() => (section = "displays")}>Arrange desk and audience</button></p>
      {:else if section === "displays"}
        {#if !isDesktop()}
          <section class="rows">
            <div class="row">
              <div class="row-copy"><strong>Browser window</strong><span>A browser cannot list monitors or move a window onto one. Open output, drag it to the external display, then choose Fill this screen.</span></div>
              <button type="button" class="btn" onclick={() => (section = "audience")}>Audience output</button>
            </div>
          </section>
        {:else if session.output.displays.length === 0}
          <section class="rows">
            <div class="row">
              <div class="row-copy"><strong>No displays detected</strong><span>Refresh after a monitor is connected. The operator window stays here.</span></div>
              <button type="button" class="btn" onclick={() => session.refreshDisplays()}>Refresh</button>
            </div>
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
          <button type="button" class="btn" onclick={() => session.refreshDisplays()}>Refresh displays</button>
        {/if}
        <p class="section-label">Profile</p>
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Display profile</strong><span>Save a setup per room or per computer.</span></div>
            <select class="field" aria-label="Display profile" value={profile.id} onchange={(event) => session.useDisplayProfile(event.currentTarget.value)}>
              {#each session.workspace.displayProfiles as item (item.id)}
                <option value={item.id}>{item.name}</option>
              {/each}
            </select>
          </div>
          <div class="row">
            <div class="row-copy"><strong>Name</strong></div>
            <input class="field" aria-label="Profile name" bind:value={profileName} onchange={() => session.renameDisplayProfile(profileName)} />
          </div>
        </section>
        <p class="section-label">Screens</p>
        <section class="rows">
          <div class="row">
            <div class="row-lead"><span class="row-icon"><Icon name="laptop" size={16} /></span><div class="row-copy"><strong>Desk</strong><span>Where you operate.</span></div></div>
            <select class="field" aria-label="Desk display" value={profile.assignments.operator ?? ""} onchange={(event) => session.setAssignments(assignments("operator", event.currentTarget.value))}>
              <option value="">Automatic · primary display</option>
              {#each session.output.displays as display (display.key)}<option value={display.key}>{display.name}</option>{/each}
            </select>
          </div>
          <div class="row">
            <div class="row-lead"><span class="row-icon"><Icon name="cast" size={16} /></span><div class="row-copy"><strong>Audience</strong><span>{audience.missing && audience.mode === "assigned" ? "Disconnected. Program is held until it returns." : audience.missing ? "Connect an external display, or assign this screen." : sameScreen(profile.assignments) ? "Same display as the desk." : "What the congregation sees."}</span></div></div>
            <select class="field" aria-label="Audience display" value={profile.assignments.audience ?? ""} onchange={(event) => session.setAssignments(assignments("audience", event.currentTarget.value))}>
              <option value="">Automatic · external display</option>
              {#each session.output.displays as display (display.key)}<option value={display.key}>{display.name}</option>{/each}
              {#if profile.assignments.audience && audience.missing}<option value={profile.assignments.audience}>Saved display is disconnected</option>{/if}
            </select>
          </div>
          <div class="row">
            <div class="row-lead"><span class="row-icon"><Icon name="stage" size={16} /></span><div class="row-copy"><strong>Stage</strong><span>The confidence screen for the platform.</span></div></div>
            <select class="field" aria-label="Stage display" value={profile.assignments.stage ?? ""} onchange={(event) => session.setAssignments(assignments("stage", event.currentTarget.value))}>
              <option value="">Off</option>
              {#each session.output.displays as display (display.key)}<option value={display.key}>{display.name}</option>{/each}
            </select>
          </div>
        </section>
        <p class="section-label">Save</p>
        <section class="rows">
          <form
            class="row"
            onsubmit={(event) => {
              event.preventDefault();
              session.saveDisplayProfileAs(newProfile);
              newProfile = "";
            }}
          >
            <div class="row-copy"><strong>Save as a new profile</strong></div>
            <div class="row-end">
              <input class="field" placeholder="Profile name" bind:value={newProfile} aria-label="New display profile" />
              <button type="submit" class="btn primary" disabled={!newProfile.trim()}>Save</button>
            </div>
          </form>
          <div class="row">
            <div class="row-copy"><strong>Delete this profile</strong><span>{profile.builtin ? "Built-in profiles stay." : "Removes the saved screen choices."}</span></div>
            <button type="button" class="btn danger" onclick={() => session.deleteDisplayProfile(profile.id)} disabled={profile.builtin}>Delete</button>
          </div>
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
        {#if session.entitled("phone-remote")}
          <RemotePanel />
        {:else}
          <section class="rows">
            <div class="row">
              <div class="row-copy"><strong>Phone remote is part of Premium</strong><span>Pair a phone to move through the service and go live from anywhere in the room.</span></div>
              <button type="button" class="btn primary" onclick={() => session.requireFeature("phone-remote")}>Unlock</button>
            </div>
          </section>
        {/if}
      {:else if section === "stage"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Stage display</strong><span>What is live now, what is next (Preview), the time and any timer. It never sends anything to the audience.</span></div>
            <button type="button" class="btn primary" onclick={() => void session.openStage()}>Open</button>
          </div>
          <div class="row">
            <div class="row-copy"><strong>Which screen</strong><span>With three screens it opens on the one that is neither the desk nor the audience. Otherwise drag it to the platform screen.</span></div>
            <button type="button" class="btn" onclick={() => (section = "displays")}>Displays</button>
          </div>
        </section>
      {:else if section === "storage"}
        <section class="rows">
          <div class="row">
            <div class="row-lead"><span class="row-icon"><Icon name="files" size={16} /></span><div class="row-copy"><strong>Export library</strong><span>Songs, services and themes as one file. Program is not included.</span></div></div>
            <button type="button" class="btn primary" onclick={() => downloadLibrary()}>Export</button>
          </div>
          <div class="row">
            <div class="row-lead"><span class="row-icon"><Icon name="refresh" size={16} /></span><div class="row-copy"><strong>Import</strong><span>A Church Studio library, or a text or Markdown file as slides. A record is replaced only when its id matches.</span></div></div>
            <button type="button" class="btn" onclick={() => fileInput?.click()}>Choose file…</button>
            <input bind:this={fileInput} type="file" accept={IMPORT_ACCEPT} hidden onchange={(event) => void importFile(event)} />
          </div>
        </section>
        {#if fileMessage}<p class="note stand">{fileMessage}</p>{/if}
        <p class="note stand">Pictures and videos import in Media. Songs import and export in the Songs window.</p>
      {:else if section === "bible"}
        {@const installedIds = session.translations.map((entry) => entry.id)}
        <p class="section-label">On this computer</p>
        <section class="rows">
          {#each BIBLE_CATALOG.filter((entry) => installedIds.includes(entry.id)) as entry (entry.id)}
            <div class="row">
              <div class="row-lead">
                <span class="bible-badge">{entry.abbreviation}</span>
                <div class="row-copy"><strong>{entry.name}</strong><span>{entry.language} · {entry.licenseNote ?? "Public domain"}{entry.default ? " · included" : ""}</span></div>
              </div>
              <div class="row-end">
                <span class="pill ok"><Icon name="check" size={11} /> Installed</span>
                {#if installedIds.length > 1}
                  <button type="button" class="btn icon-btn" aria-label={`Remove ${entry.name}`} title="Remove from this computer" onclick={() => void session.removeBible(entry.id)}><Icon name="trash" size={14} /></button>
                {/if}
              </div>
            </div>
          {/each}
        </section>
        {#if BIBLE_CATALOG.some((entry) => !installedIds.includes(entry.id))}
          <p class="section-label">Available to download</p>
          <section class="rows">
            {#each BIBLE_CATALOG.filter((entry) => !installedIds.includes(entry.id)) as entry (entry.id)}
              {@const busy = session.bibleBusy.includes(entry.id)}
              <div class="row">
                <div class="row-lead">
                  <span class="bible-badge muted">{entry.abbreviation}</span>
                  <div class="row-copy"><strong>{entry.name}</strong><span>{entry.language} · {entry.licenseNote ?? "Public domain"} · {entry.sizeMb} MB</span></div>
                </div>
                <button type="button" class="btn" class:primary={!busy} disabled={busy} onclick={() => void session.installBible(entry.id)}>
                  {#if busy}<span class="spinner" aria-hidden="true"></span> Downloading…{:else}<Icon name="download" size={14} /> Download{/if}
                </button>
              </div>
            {/each}
          </section>
        {/if}
        <p class="note stand">King James and the World English Bible come with Church Studio. Download others when you need them; scripture stays on this computer, and Search, Listen and the next verse stay on Preview until LIVE.</p>
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
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Pictures and videos</strong><span>{session.media.length} item{session.media.length === 1 ? "" : "s"} on this computer. Use them as backgrounds, the logo, or sources in a scene.</span></div>
            <button type="button" class="btn primary" onclick={() => void importMedia()}>Import…</button>
            <input bind:this={mediaInput} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mov,.m4v" hidden onchange={(event) => void importMediaFile(event)} />
          </div>
          {#each session.media as asset (asset.id)}
            <div class="row">
              <div class="row-lead"><span class="row-icon"><Icon name="media" size={16} /></span><div class="row-copy"><strong>{asset.name}</strong><span>{asset.kind === "video" ? "Video" : "Image"}{session.workspace.logoAssetId === asset.id ? " · logo" : ""}</span></div></div>
              {#if asset.kind === "image"}
                <button type="button" class="btn" disabled={session.workspace.logoAssetId === asset.id} onclick={() => session.setLogo(asset.id)}>{session.workspace.logoAssetId === asset.id ? "Logo" : "Use as logo"}</button>
              {/if}
            </div>
          {/each}
        </section>
        <p class="section-label">Cameras</p>
        <section class="rows">
          {#each session.cameras as camera (camera.deviceId)}
            <div class="row">
              <div class="row-lead"><span class="row-icon"><Icon name="cast" size={16} /></span><div class="row-copy"><strong>{camera.label}</strong></div></div>
              <button type="button" class="btn" onclick={() => void session.previewCamera(camera.deviceId)}>Preview</button>
            </div>
          {:else}
            <div class="row"><div class="row-copy"><strong>No cameras listed</strong><span>{session.cameraNote || "Connect a camera, then refresh."}</span></div></div>
          {/each}
          <div class="row">
            <div class="row-copy"><span>Preview only. A camera reaches Program and the audience on LIVE.</span></div>
            <button type="button" class="btn" onclick={() => void session.loadCameras()}>Refresh</button>
          </div>
        </section>
      {:else if section === "audio"}
        <AudioSettings />
        <p class="section-label">Verse detection</p>
        <section class="rows">
          <div class="row">
            <div class="row-copy">
              <strong>{canUse("voice-detect") ? "Listen for scripture" : "Not in this release"}</strong>
              <span>{canUse("voice-detect") ? "Press Listen on the Scriptures desk. A match goes to Preview only; LIVE still sends Program. Recognition stays on this computer." : "Audio recognition is not connected. Nothing here starts a microphone."}</span>
            </div>
            <span class="pill" class:ok={canUse("voice-detect")} class:muted={!canUse("voice-detect")}>{canUse("voice-detect") ? "On" : "Off"}</span>
          </div>
          {#if canUse("voice-detect") && isDesktop()}
            <div class="row">
              <div class="row-copy"><strong>Microphone permission</strong><span>{audioNote || "If macOS refused the mic, turn Church Studio on under Microphone and Speech Recognition."}</span></div>
              <div class="row-end">
                <button type="button" class="btn primary" onclick={() => void allowMicrophone()}>Allow</button>
                <button type="button" class="btn" onclick={() => void openPrivacySettings()}>Privacy settings</button>
              </div>
            </div>
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
          <div class="row">
            <div class="row-copy"><strong>First-run setup</strong><span>Walk through church name, look, scripture and voice again.</span></div>
            <button type="button" class="btn" onclick={() => session.restartOnboarding()}>Run setup again</button>
          </div>
        </section>
      {:else if section === "account"}
        {@const current = planById(session.plan)}
        {@const ent = session.workspace.entitlement}
        {@const profile = session.workspace.profile}
        <section class="rows">
          {#if profile}
            <div class="row">
              <div class="row-lead">
                <span class="avatar" style:background={current.color}>{initials(profile.name)}</span>
                <div class="row-copy"><strong>{profile.name}</strong><span>{profile.email} · signed in on this computer</span></div>
              </div>
              <div class="row-end">
                <span class="pill" style:background={`color-mix(in srgb, ${current.color} 20%, transparent)`} style:color={current.color}>{current.name}</span>
                <button type="button" class="btn" onclick={() => session.signOut()}>Sign out</button>
              </div>
            </div>
          {:else}
            <form
              class="row stack"
              onsubmit={(event) => {
                event.preventDefault();
                signInError = session.signIn(signInName, signInEmail) ?? "";
              }}
            >
              <div class="row-copy"><strong>Sign in</strong><span>Your name and email, kept on this computer. Online accounts arrive with purchasing and cloud sync.</span></div>
              <div class="sign-in">
                <input class="field grow" aria-label="Your name" placeholder="Your name" autocomplete="name" bind:value={signInName} />
                <input class="field grow" aria-label="Email" placeholder="you@church.org" type="email" autocomplete="email" bind:value={signInEmail} />
                <button type="submit" class="btn primary" disabled={!signInEmail.trim()}>Sign in</button>
              </div>
              {#if signInError}<p class="form-error" role="alert">{signInError}</p>{/if}
              {#if import.meta.env.DEV}
                <button
                  type="button"
                  class="link"
                  onclick={() => {
                    session.signIn("Test User", "test@churchstudio.app");
                    session.redeemCode("PREMIUM-TEST");
                  }}
                >Development: sign in as a Premium test user</button>
              {/if}
            </form>
          {/if}
        </section>

        <section class="plan-hero" style:--plan={current.color}>
          <span class="plan-badge"><Icon name="key" size={20} /></span>
          <div class="head-copy">
            <p class="eyebrow">Your plan</p>
            <h3>
              {current.name}
              {#if session.trialDays > 0 && ent.plan === "free"}<span class="pill">Trial · {session.trialDays} day{session.trialDays === 1 ? "" : "s"} left</span>
              {:else if ent.source === "promo" && session.plan !== "free"}<span class="pill">Test code {ent.code}</span>
              {:else if ent.source === "license" && session.plan !== "free"}<span class="pill">{ent.expiresAt ? `Until ${new Date(ent.expiresAt).toLocaleDateString()}` : "No end date"}</span>{/if}
            </h3>
            <p>{ent.source === "license" && ent.holder && session.plan !== "free" ? `Licensed to ${ent.holder}.` : current.tagline}</p>
          </div>
          {#if ent.plan === "free" && !ent.trialUsed}
            <button type="button" class="btn primary" onclick={() => session.startTrial()}>Try Premium free · {TRIAL_DAYS} days</button>
          {:else if (ent.source === "promo" || ent.source === "license") && session.plan !== "free"}
            <button type="button" class="btn" onclick={() => session.useFreePlan()}>{ent.source === "license" ? "Remove license" : "Return to Free"}</button>
          {/if}
        </section>
        {#if ent.trialUsed && session.trialDays === 0 && session.plan === "free"}
          <p class="note stand">Your Premium trial on this computer has ended. Everything you made stays; Premium features are paused.</p>
        {/if}

        <div class="pricing-head">
          <p class="section-label">Plans</p>
          <div class="billing" role="radiogroup" aria-label="Billing">
            <button type="button" role="radio" aria-checked={billing === "monthly"} class:on={billing === "monthly"} onclick={() => (billing = "monthly")}>Monthly</button>
            <button type="button" role="radio" aria-checked={billing === "yearly"} class:on={billing === "yearly"} onclick={() => (billing = "yearly")}>Yearly <em>save {yearlyDeal(PLANS[1]!.price).savePercent}%</em></button>
          </div>
        </div>
        <div class="plan-grid">
          {#each PLANS as plan, i (plan.id)}
            {@const deal = yearlyDeal(plan.price)}
            <article class="plan-card" class:current={plan.id === session.plan} class:popular={plan.popular} style:--plan={plan.color}>
              {#if plan.popular}<span class="ribbon">Most popular</span>{/if}
              <header>
                <strong>{plan.name}</strong>
                {#if plan.id === session.plan}<span class="pill ok">Current</span>{/if}
              </header>
              <p class="price">
                {#if plan.price.monthly === 0}
                  <b>$0</b><span>forever</span>
                {:else if billing === "monthly"}
                  <b>${plan.price.monthly}</b><span>/ month</span>
                {:else}
                  <b>${deal.perMonth}</b><span>/ month, billed ${plan.price.yearly} a year</span>
                {/if}
              </p>
              <p class="tag">{plan.tagline}</p>
              {#if i > 0}<p class="plus">Everything in {PLANS[i - 1]!.name}, plus</p>{/if}
              <ul>
                {#each i > 0 ? plan.features.filter((entry) => !PLANS[i - 1]!.features.includes(entry)) : plan.features as feature (feature)}
                  <li class:soon={FEATURE_LABELS[feature].soon}>
                    <Icon name="check" size={13} />
                    <span>{FEATURE_LABELS[feature].label}{#if FEATURE_LABELS[feature].soon}<em>soon</em>{/if}</span>
                  </li>
                {/each}
              </ul>
              {#if plan.id === session.plan}
                <span class="plan-cta muted">Your plan</span>
              {:else if plan.id === "free"}
                <span class="plan-cta muted">Always free</span>
              {:else if plan.id === "premium" && ent.plan === "free" && !ent.trialUsed}
                <button type="button" class="btn primary plan-cta" style:background={plan.color} style:border-color={plan.color} onclick={() => session.startTrial()}>Start free trial</button>
              {:else if checkoutUrl(plan.id, billing)}
                <button type="button" class="btn primary plan-cta" style:background={plan.color} style:border-color={plan.color} onclick={() => void openExternal(checkoutUrl(plan.id, billing, session.workspace.profile?.email)!)}>Buy {plan.name}</button>
              {:else}
                <button type="button" class="btn plan-cta" disabled title="Purchasing is coming soon">Upgrade · coming soon</button>
              {/if}
            </article>
          {/each}
        </div>
        <p class="note stand">Prices are placeholders while pricing is decided. Your songs, sermons and settings stay yours on every plan.</p>

        <p class="section-label">License key</p>
        <section class="rows">
          <form
            class="row"
            onsubmit={(event) => {
              event.preventDefault();
              codeError = session.redeemCode(code) ?? "";
              if (!codeError) code = "";
            }}
          >
            <div class="row-copy"><strong>Add a license key</strong><span class:form-error={!!codeError}>{codeError || "Paste the key from your purchase email. It starts with CS1 and is checked on this computer, no internet needed."}</span></div>
            <div class="row-end">
              <input class="field license-field" aria-label="License key" placeholder="CS1-…" autocapitalize="characters" autocomplete="off" spellcheck="false" bind:value={code} />
              <button type="submit" class="btn primary" disabled={!code.trim()}>Add key</button>
            </div>
          </form>
        </section>
      {:else}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{planById(session.plan).name}</strong><span>{session.trialDays > 0 ? `Premium trial on this computer · ${session.trialDays} day${session.trialDays === 1 ? "" : "s"} left.` : session.plan === "free" ? "Free forever. Presentation, the library and audience output run offline." : "Licensed on this computer."}</span></div>
            <span class="pill" class:ok={session.plan !== "free"} class:muted={session.plan === "free"}>{session.plan === "free" ? "Free" : "Active"}</span>
          </div>
          <div class="row">
            <div class="row-copy"><strong>Plans and features</strong><span>See what each plan includes.</span></div>
            <button type="button" class="btn" onclick={() => (section = "account")}>Compare plans</button>
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
  .account-card {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin: 0 0 10px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--field);
    color: var(--ink);
    font: inherit;
    text-align: left;
    flex: none;
  }
  .account-card:hover { border-color: color-mix(in srgb, var(--ink) 25%, var(--line)); }
  .account-card.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--field)); }
  .account-card > :global(svg) { color: var(--muted); flex: none; }
  .set-brand-mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; color: #fff; flex: none; box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.2); }
  .account-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .account-copy strong { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .account-copy span { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  /* The list scrolls; rows keep their height instead of being squeezed. */
  .nav-list > * { flex: none; }
  .nav-group { margin: 12px 10px 3px; font-size: 11px; font-weight: 600; color: var(--muted); }
  .nav-group:first-child { margin-top: 4px; }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 30px;
    padding: 0 8px 0 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    text-align: left;
  }
  .nav-item:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .nav-item.active { background: var(--accent); color: #fff; }
  .nav-item.active .tile { box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.55); }
  .nav-item.active .nav-title { font-weight: 600; }
  .nav-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .nav-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 6px;
    color: #fff;
    box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.18), 0 1px 2px rgba(0, 0, 0, 0.25);
  }
  .tile.big { width: 44px; height: 44px; border-radius: 12px; }
  .nav-empty { margin: 12px 10px; font-size: 12px; color: var(--muted); }

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
  /* Shared pieces for every page, including child components (Remote, Audio, Capabilities). */
  .settings-body :global(.section-label) { margin: 8px 4px -4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .settings-body :global(.note) { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .settings-body :global(.note.stand) { padding: 0 4px; }
  .settings-body :global(.text), .settings-body :global(.link) { border: 0; background: none; padding: 0; color: var(--accent); font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; width: fit-content; }
  .settings-body :global(.text:hover), .settings-body :global(.link:hover) { text-decoration: underline; }

  /* Rows: label and help on the left, control on the right */
  .settings-body :global(.rows) { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 12px; background: var(--field); overflow: hidden; flex: none; }
  .settings-body :global(.rows.inset) { background: var(--panel); }
  .settings-body :global(.row) { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 56px; padding: 10px 16px; }
  .settings-body :global(.row + .row) { border-top: 1px solid var(--line); }
  .settings-body :global(.row.stack) { flex-direction: column; align-items: stretch; gap: 10px; }
  .settings-body :global(.row.dim) { opacity: 0.55; }
  .settings-body :global(.row-copy) { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .settings-body :global(.row-copy strong) { font-size: 13px; font-weight: 600; color: var(--ink); }
  .settings-body :global(.row-copy span), .settings-body :global(.row-copy small) { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .settings-body :global(.row-icon) { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border-radius: 8px; background: var(--panel); color: var(--muted); }
  .settings-body :global(.row-lead) { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
  .settings-body :global(.row-end) { display: flex; align-items: center; gap: 8px; flex: none; }
  .settings-body :global(.row .field), .settings-body :global(.row select.field) { width: min(300px, 45%); height: 34px; flex: none; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--ink); font: inherit; font-size: 13px; }
  .settings-body :global(.row .field:focus) { border-color: var(--accent); outline: none; }
  .settings-body :global(.row .field.grow) { width: auto; flex: 1; }
  .settings-body :global(.pill) { flex: none; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; }
  .settings-body :global(.pill.ok) { background: color-mix(in srgb, var(--presence, #3fb950) 18%, transparent); color: var(--presence, #3fb950); }
  .settings-body :global(.pill.muted) { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--muted); }

  /* Toggle switch: <input type="checkbox" class="switch" role="switch"> */
  .settings-body :global(input.switch) {
    appearance: none;
    position: relative;
    width: 40px;
    height: 24px;
    flex: none;
    margin: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink) 18%, transparent);
    cursor: pointer;
    transition: background 150ms;
  }
  .settings-body :global(input.switch::after) {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    transition: transform 150ms;
  }
  .settings-body :global(input.switch:checked) { background: var(--accent); }
  .settings-body :global(input.switch:checked::after) { transform: translateX(16px); }
  .settings-body :global(input.switch:disabled) { opacity: 0.45; cursor: default; }
  .settings-body :global(input.switch:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* Cards */
  .settings-body :global(.card) { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); flex: none; }
  .settings-body :global(.card h3) { margin: 0; font-size: 13px; font-weight: 650; color: var(--ink); }
  .status-card { display: flex; flex-direction: row; align-items: center; gap: 14px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--field); }
  .status-card.on { border-color: color-mix(in srgb, var(--presence, #3fb950) 60%, var(--line)); }
  .status-card .eyebrow { margin: 0; font-size: 11px; font-weight: 600; color: var(--muted); }
  .status-card h3 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
  .status-card p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
  .lamp { width: 12px; height: 12px; border-radius: 50%; background: var(--line); flex: none; }
  .lamp.on { background: var(--presence, #3fb950); box-shadow: 0 0 0 5px color-mix(in srgb, var(--presence, #3fb950) 22%, transparent); }

  /* Bible */
  .bible-badge { display: grid; place-items: center; min-width: 42px; height: 30px; padding: 0 6px; flex: none; border-radius: 8px; background: color-mix(in srgb, #a07a52 25%, var(--panel)); color: #e7c9a3; font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }
  .bible-badge.muted { background: var(--panel); color: var(--muted); }
  .icon-btn { width: 32px !important; padding: 0 !important; }
  .spinner { width: 12px; height: 12px; border: 2px solid color-mix(in srgb, var(--ink) 25%, transparent); border-top-color: var(--ink); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Account */
  .avatar, .avatar-mark { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 50%; color: #fff; font-size: 13px; font-weight: 800; letter-spacing: 0.02em; }
  .avatar-mark { border-radius: 50%; }
  .plan-chip { font-weight: 700; }
  .sign-in { display: flex; gap: 8px; flex-wrap: wrap; }
  .sign-in .field { min-width: 160px; }
  .form-error { margin: 0; font-size: 12px; color: var(--live, #e5484d); }
  .license-field { width: 280px; letter-spacing: 0.02em; }
  .pricing-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; margin-top: 6px; }
  .billing { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: var(--field); }
  .billing button { height: 28px; padding: 0 14px; border: 0; border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .billing button.on { background: var(--ink); color: var(--panel); }
  .billing em { margin-left: 4px; font-style: normal; color: var(--presence, #3fb950); }
  .billing button.on em { color: inherit; opacity: 0.8; }
  .plan-card { position: relative; }
  .plan-card.popular { border-color: color-mix(in srgb, var(--plan) 60%, var(--line)); background: linear-gradient(180deg, color-mix(in srgb, var(--plan) 10%, var(--field)), var(--field) 45%); }
  .ribbon { position: absolute; top: -10px; right: 12px; padding: 2px 10px; border-radius: 999px; background: var(--plan); color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
  .price { display: flex; align-items: baseline; gap: 6px; margin: 2px 0 0; min-height: 0 !important; }
  .price b { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); }
  .price span { font-size: 12px; color: var(--muted); }
  .plan-card > p.tag { min-height: 34px; }

  /* Plans */
  .plan-hero { display: flex; align-items: center; gap: 14px; padding: 18px; border: 1px solid color-mix(in srgb, var(--plan) 50%, var(--line)); border-radius: 14px; background: linear-gradient(135deg, color-mix(in srgb, var(--plan) 18%, var(--field)), var(--field) 70%); flex: none; }
  .plan-badge { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border-radius: 12px; background: var(--plan); color: #fff; }
  .plan-hero .eyebrow { margin: 0; font-size: 11px; font-weight: 600; color: var(--muted); }
  .plan-hero h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 20px; font-weight: 700; }
  .plan-hero p { margin: 2px 0 0; font-size: 13px; color: var(--muted); }
  .plan-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; flex: none; }
  .plan-card { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--line); border-top: 3px solid var(--plan); border-radius: 12px; background: var(--field); }
  .plan-card.current { box-shadow: 0 0 0 1px var(--plan); }
  .plan-card header { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .plan-card header strong { font-size: 15px; }
  .plan-card > p { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.4; min-height: 34px; }
  .plan-card > p.plus { min-height: 0; font-weight: 700; color: var(--ink); }
  .plan-card ul { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .plan-card li { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; line-height: 1.35; }
  .plan-card li :global(svg) { flex: none; margin-top: 1px; color: var(--plan); }
  .plan-card li.soon { color: var(--muted); }
  .plan-card li em { margin-left: 6px; font-style: normal; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .plan-card :global(.btn.plan-cta) { width: 100%; }
  span.plan-cta { display: block; padding: 7px 0; text-align: center; font-size: 12px; font-weight: 600; }
  .plan-cta.muted { color: var(--muted); }

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

  /* Forms and buttons */
  label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .settings-body :global(.actions) { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .settings-body :global(.btn), .settings-body :global(.actions button:not(.text):not(.link)), .settings-body :global(.card > button:not(.text):not(.link)) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    width: fit-content;
    white-space: nowrap;
    cursor: pointer;
  }
  .settings-body :global(.btn:hover:not(:disabled)), .settings-body :global(.actions button:not(.text):not(.link):hover:not(:disabled)) { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .settings-body :global(.btn.primary), .settings-body :global(.actions button.primary), .settings-body :global(button.primary) { background: var(--accent); border-color: var(--accent); color: #fff; }
  .settings-body :global(.btn.danger) { color: var(--live, #e5484d); }
  .settings-body :global(.btn:disabled), .settings-body :global(.actions button:disabled) { opacity: 0.4; cursor: default; }

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
    .theme-row, .split, .choice-row, .plan-grid { grid-template-columns: 1fr 1fr; }
    .row { flex-direction: column; align-items: stretch; }
    .row .field { width: 100%; }
  }
</style>
