<script lang="ts">
  import { modalFocus } from "../../ui/modal-focus";
  import StageLinks from "./StageLinks.svelte";
  import SwitcherSettings from "./SwitcherSettings.svelte";
  import BroadcastSettings from "./BroadcastSettings.svelte";
  import CaptionsSettings from "./CaptionsSettings.svelte";
  import VoiceWords from "./VoiceWords.svelte";
  import ScreensSettings from "./ScreensSettings.svelte";
  import StorageSpace from "./StorageSpace.svelte";
  import AudioSettings from "../AudioSettings.svelte";
  import CapabilityList from "../CapabilityList.svelte";
  import RemotePanel from "../RemotePanel.svelte";
  import { session } from "../../app/session.svelte";
  import { COMMANDS } from "../../commands/registry";
  import { audienceStatus } from "../../display/status";
  import { resolveAudience, sameScreen } from "../../display/profiles";
  import type { DeskStyle, DisplayAssignment, OperatorTheme, OutputMode, OutputRole } from "../../domain/types";
  import { describeAspect, SCREEN_SHAPES, type ScreenShape } from "../../display/shape";
  import { canAssign, defaultShortcuts, shortcutLabel, shortcutLabels } from "../../keyboard/manager";
  import type { ShortcutAction } from "../../domain/types";
  import { canUse } from "../../platform/capabilities";
  import { APP_VERSION, isDesktop, openExternal } from "../../platform/runtime";
  import { SITE_URL } from "../../domain/billing";
  import { openPrivacySettings, prepareListening } from "../../voice/listen";
  import Icon from "../Icon.svelte";
  import BrandMark from "../BrandMark.svelte";
  import { BIBLE_CATALOG } from "../../bible/texts";
  import { usageCsv, usageReport, type UsageRow } from "../../domain/song-usage";
  import type { PcoPlan } from "../../integrations/pco";
  import { invoke } from "@tauri-apps/api/core";
  import { clearProblems, problemReport, readProblems } from "../../app/diagnostics";
  import { listOnlineBibles, type OnlineBible } from "../../bible/online";
  import type { OnlineBibleChoice } from "../../bible/online-bibles";
  import { checkoutUrl, FEATURE_LABELS, FREE_LISTEN_MINUTES, supportMailto, initials, PLANS, planById, TRIAL_DAYS, yearlyDeal } from "../../domain/plans";
  import ThemeLibrary from "./ThemeLibrary.svelte";
  import { AI_DEFAULTS } from "../../ai/summarize";
  import { WARN_CHOICES } from "../../domain/timer-cues";
  import { UI_LANGUAGES, msg, t, tn } from "../../i18n/core";

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
    | "screens"
    | "captions"
    | "remote"
    | "switcher"
    | "broadcast"
    | "bible"
    | "lyrics"
    | "media"
    | "audio"
    | "storage"
    | "planning"
    | "ai"
    | "performance"
    | "updates"
    | "account"
    | "license";
  type SettingsEntry = { id: SettingsSectionId; title: string; icon: string; color: string; about: string; keywords: string };
  type SettingsGroup = { label: string; items: SettingsEntry[] };

  let audioNote = $state("");

  // Settings › Bible: import a Bible file (Zefania, OSIS, OpenSong XML).
  let bibleImportNote = $state("");
  let bibleImportOk = $state(false);
  let bibleImportBusy = $state(false);
  let bibleFile = $state<HTMLInputElement | undefined>();
  async function importBible(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    bibleImportBusy = true;
    bibleImportNote = "";
    try {
      const error = await session.importBibleFile(await file.text(), file.name);
      bibleImportOk = !error;
      bibleImportNote = error ?? session.message;
    } catch (error) {
      bibleImportOk = false;
      bibleImportNote = error instanceof Error ? error.message : String(error);
    } finally {
      bibleImportBusy = false;
    }
  }

  async function allowMicrophone() {
    audioNote = "macOS may ask for the microphone…";
    const blocked = await prepareListening();
    audioNote = blocked ?? t("Microphone and Speech Recognition are allowed for Church Studio.");
    if (blocked) void openPrivacySettings();
  }

  // Each page: a colored icon tile (System Settings style), a one-line description and search words.
  const groups: SettingsGroup[] = [
    {
      label: msg("General"),
      items: [
        { id: "general", title: msg("Church"), icon: "church", color: "#f08a24", about: msg("Your church's name, logo text and CCLI license."), keywords: "name logo ccli license copyright" },
        { id: "appearance", title: msg("Appearance"), icon: "look", color: "#a259e6", about: msg("Desk, theme, accent color and type size on this computer."), keywords: "theme dark light accent color size spacing desk verse font performance density" },
        { id: "workspace", title: msg("Desk layouts"), icon: "layout", color: "#5b5bd6", about: msg("How the operator desk is arranged."), keywords: "workspace panels arrange reset" },
        { id: "keyboard", title: msg("Keyboard"), icon: "keys", color: "#636366", about: msg("Keys that drive the desk."), keywords: "shortcuts keys hotkeys" },
      ],
    },
    {
      label: msg("Screens"),
      items: [
        { id: "audience", title: msg("Audience output"), icon: "cast", color: "#e5484d", about: msg("What the congregation sees, and on which screen."), keywords: "projector window fullscreen program open test shape aspect 16:9 4:3 16:10 portrait led size resolution" },
        { id: "displays", title: msg("Displays"), icon: "screens", color: "#0a84ff", about: msg("Which screen is the desk, and which is the audience."), keywords: "monitor screen profile second assign" },
        { id: "themes", title: msg("Themes"), icon: "themes", color: "#c2410c", about: msg("How verses, songs and slides look on the screen."), keywords: "theme background color font animation motion video photo image wash gradient premium library look" },
        { id: "stage", title: msg("Stage display"), icon: "stage", color: "#ff9f0a", about: msg("A private confidence screen for the people on stage."), keywords: "confidence platform next clock" },
        { id: "screens", title: msg("Screens"), icon: "screens", color: "#0ea5e9", about: msg("Extra monitors, each with its own job: timer, scripture, lyrics or stage."), keywords: "monitors multiple screens outputs timer scripture lyrics lock assign" },
        { id: "captions", title: msg("Captions"), icon: "captions", color: "#0f9d8a", about: msg("Live captions on the screen and on phones, translated."), keywords: "captions subtitles deaf hard of hearing translate translation language phone qr live words transcript" },
      ],
    },
    {
      label: msg("Going live"),
      items: [
        { id: "broadcast", title: msg("Stream & record"), icon: "video", color: "#e5484d", about: msg("Stream to YouTube or Facebook, and record the service."), keywords: "stream live youtube facebook rtmp rtmps key record recording mp4 broadcast online" },
        { id: "switcher", title: msg("Production apps"), icon: "obs", color: "#475569", about: msg("Drive OBS or vMix from the desk: scenes, streaming, recording."), keywords: "obs vmix websocket stream record scene switcher live production youtube facebook" },
      ],
    },
    {
      label: msg("Library"),
      items: [
        { id: "bible", title: msg("Bible"), icon: "bible", color: "#a07a52", about: msg("Scripture translations on this computer."), keywords: "translation kjv scripture" },
        { id: "lyrics", title: msg("Songs"), icon: "lyrics", color: "#e93d82", about: msg("Songs, folders, imports and copyright."), keywords: "lyrics hymns ccli songselect openlyrics" },
        { id: "media", title: msg("Media"), icon: "media", color: "#12a5b8", about: msg("Pictures and videos for backgrounds and the logo."), keywords: "images video background logo camera" },
        { id: "storage", title: msg("Backup"), icon: "files", color: "#2f80ed", about: msg("Export or import the whole library."), keywords: "export import backup files library" },
      ],
    },
    {
      label: msg("Sound & devices"),
      items: [
        { id: "audio", title: msg("Sound & voice"), icon: "audio", color: "#3e63dd", about: msg("Microphone, listening and voice commands."), keywords: "microphone voice speech listen detection" },
        { id: "remote", title: msg("Phone remote"), icon: "phone", color: "#30a46c", about: msg("Pair a phone as a controller. It is never a display."), keywords: "phone tablet pair qr lan" },
      ],
    },
    {
      label: msg("Connected services"),
      items: [
        { id: "planning", title: msg("Planning Center"), icon: "list", color: "#2266e3", about: msg("Bring upcoming plans in as services."), keywords: "planning center pco services plan import" },
        { id: "ai", title: msg("AI assistant"), icon: "sparkles", color: "#7c3aed", about: msg("Your own AI key, for sermon summaries."), keywords: "ai llm claude anthropic openai gpt ollama key summary sermon notes" },
      ],
    },
    {
      label: msg("About"),
      items: [
        { id: "system", title: msg("This computer"), icon: "laptop", color: "#8e8e93", about: msg("What works in this window, and why some things do not."), keywords: "capabilities browser desktop features" },
        { id: "updates", title: msg("Updates"), icon: "refresh", color: "#0a84ff", about: msg("Which version is running."), keywords: "version update release" },
      ],
    },
  ];

  /** Opened from the account card at the top of the sidebar, like the profile in System Settings. */
  const ACCOUNT: SettingsEntry = {
    id: "account",
    title: msg("Plan & account"),
    icon: "user",
    color: "#8e8e93",
    about: msg("Your plan, the Premium trial, and what each plan includes."),
    keywords: "sign in user cloud plan premium free church trial upgrade billing license",
  };
  /** Older links: these pages were folded into others. */
  const ALIASES: Partial<Record<string, SettingsSectionId>> = { license: "account", performance: "appearance" };

  let search = $state("");
  let billing = $state<"monthly" | "yearly">("yearly");

  let stageText = $state("");
  /** A media file whose Delete was pressed once. */
  let armedMedia = $state<string | null>(null);

  // Updates (desktop): signed releases from GitHub, checked and installed by the session.
  let updateNote = $state("");
  let checkingUpdate = $state(false);
  const updateReady = $derived(session.availableUpdate?.version ?? null);
  const updateBusy = $derived(session.updateBusy || checkingUpdate);

  async function checkUpdate() {
    checkingUpdate = true;
    updateNote = await session.checkForUpdate();
    checkingUpdate = false;
  }

  async function installUpdate() {
    updateNote = await session.installUpdate();
  }
  let backupNote = $state("");

  async function chooseBackupFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false, title: t("Choose the backup folder") });
    if (typeof picked === "string" && picked) {
      session.setBackupFolder(picked);
      backupNote = (await session.backupNow()) ?? t("Backed up. New backups go here every 30 minutes.");
    }
  }

  // Problem reports.
  let problems = $state(readProblems());

  async function buildReport(): Promise<string> {
    const crashLog = isDesktop() ? await invoke<string>("crash_log").catch(() => "") : "";
    return problemReport({
      version: "0.1.0",
      platform: isDesktop() ? "Desktop app" : "Browser",
      userAgent: navigator.userAgent,
      counts: { songs: session.songs.length, services: session.services.length, sermons: session.sermons.length, decks: session.decks.length, media: session.media.length },
      problems: readProblems(),
      crashLog,
    });
  }

  let supportNote = $state("");

  /** Contact support: copy the problem report, then open an email with the plan filled in. */
  async function contactSupport() {
    const report = await buildReport();
    let copied = false;
    try {
      await navigator.clipboard.writeText(report);
      copied = true;
    } catch {
      copied = false;
    }
    const mail = supportMailto(session.plan, APP_VERSION);
    if (mail) await openExternal(mail);
    supportNote = copied ? (mail ? t("The problem report is copied: paste it into the email.") : t("The problem report is copied. Send it to Church Studio support.")) : t("Save the report below and attach it to your email.");
  }

  async function saveProblemReport() {
    const report = await buildReport();
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `Church Studio problem report ${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Planning Center.
  let pcoApp = $state(session.workspace.pco.appId);
  let pcoSecret = $state(session.workspace.pco.secret);
  let pcoBusy = $state(false);
  let aiBusy = $state(false);
  let aiNote = $state("");
  let aiOk = $state(false);
  let pcoError = $state("");
  let pcoTypes = $state<Array<{ id: string; name: string }>>([]);
  let pcoType = $state("");
  let pcoPlans = $state<PcoPlan[]>([]);

  async function connectPco() {
    pcoBusy = true;
    pcoError = "";
    session.setPcoToken(pcoApp, pcoSecret);
    try {
      pcoTypes = await session.pcoServiceTypes();
      pcoType = pcoTypes[0]?.id ?? "";
      await loadPcoPlans();
    } catch (error) {
      pcoTypes = [];
      pcoError = error instanceof Error ? error.message : t("Planning Center could not be reached.");
    } finally {
      pcoBusy = false;
    }
  }

  async function loadPcoPlans() {
    if (!pcoType) return;
    try {
      pcoPlans = await session.pcoPlans(pcoType);
    } catch (error) {
      pcoError = error instanceof Error ? error.message : t("Plans could not be loaded.");
    }
  }

  async function importPco(plan: PcoPlan) {
    pcoBusy = true;
    try {
      await session.importPcoPlan(plan);
      pcoError = "";
    } catch (error) {
      pcoError = error instanceof Error ? error.message : t("That plan could not be imported.");
    } finally {
      pcoBusy = false;
    }
  }

  // CCLI usage report.
  let usagePeriod = $state<"month" | "quarter" | "half" | "year">("quarter");
  const usageTo = $derived(new Date().toISOString().slice(0, 10));
  const usageFrom = $derived.by(() => {
    const now = new Date();
    if (usagePeriod === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const months = usagePeriod === "quarter" ? 3 : usagePeriod === "half" ? 6 : 12;
    return new Date(now.getFullYear(), now.getMonth() - months, now.getDate()).toISOString().slice(0, 10);
  });

  function exportUsage(rows: UsageRow[]) {
    const url = URL.createObjectURL(new Blob([usageCsv(rows, session.workspace.ccliLicense)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `CCLI usage ${usageFrom} to ${usageTo}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Licensed translations through API.Bible.
  let apiKey = $state(session.workspace.onlineBibles.key);
  let apiList = $state<OnlineBible[]>([]);
  let apiFilter = $state("");
  let apiBusy = $state(false);
  let apiError = $state("");

  async function connectApiBible() {
    apiBusy = true;
    apiError = "";
    try {
      apiList = await listOnlineBibles(apiKey.trim());
      await session.setOnlineBibles(apiKey, session.workspace.onlineBibles.bibles);
    } catch (error) {
      apiList = [];
      apiError = error instanceof Error ? error.message : t("API.Bible could not be reached.");
    } finally {
      apiBusy = false;
    }
  }

  function toggleApiBible(bible: OnlineBibleChoice, on: boolean) {
    const current = session.workspace.onlineBibles.bibles.filter((entry) => entry.id !== bible.id);
    const next = on ? [...current, { id: bible.id, abbreviation: bible.abbreviation, name: bible.name, language: bible.language }] : current;
    void session.setOnlineBibles(apiKey || session.workspace.onlineBibles.key, next);
  }
  let code = $state("");
  let codeError = $state("");
  let codeBusy = $state(false);
  let trialBusy = $state(false);
  let trialError = $state("");
  let signInError = $state("");
  let accountBusy = $state(false);
  const visibleGroups = $derived.by(() => {
    const needle = search.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            (item.id !== "remote" || canUse("remote-control")) &&
            (!needle || `${item.title} ${item.about} ${t(item.title)} ${t(item.about)} ${item.keywords} ${group.label}`.toLowerCase().includes(needle)),
        ),
      }))
      .filter((group) => group.items.length > 0)
      // Plan & account lives on the profile card, but searching "license" or "trial" must find it.
      .concat(
        needle && `${ACCOUNT.title} ${ACCOUNT.about} ${t(ACCOUNT.title)} ${t(ACCOUNT.about)} ${ACCOUNT.keywords}`.toLowerCase().includes(needle)
          ? [{ label: msg("Account"), items: [ACCOUNT] }]
          : [],
      );
  });

  const sections: SettingsEntry[] = [...groups.flatMap((group) => group.items), ACCOUNT];
  const themes: { id: OperatorTheme; name: string; note: string; ground: string; ink: string }[] = [
    { id: "dark", name: msg("Night"), note: msg("Black desk, white type"), ground: "#050505", ink: "#f5f5f5" },
    { id: "vespers", name: msg("Vespers"), note: msg("Warm black, bone type"), ground: "#0c0a09", ink: "#f6f1e7" },
    { id: "nave", name: msg("Nave"), note: msg("Blue black, paper white"), ground: "#070b12", ink: "#f4f7fb" },
    { id: "light", name: msg("Day"), note: msg("White desk, black type"), ground: "#f7f5f3", ink: "#050505" },
  ];
  const accents = [
    { name: msg("Signal"), value: "#fa4f00" },
    { name: msg("Mustard"), value: "#e2cc9d" },
    { name: msg("Ember"), value: "#ff8f55" },
    { name: msg("Crimson"), value: "#be2119" },
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
    const picked = await open({ multiple: false, filters: [{ name: t("Image or video"), extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "m4v", "mov", "webm"] }] });
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
    fileMessage = t("Library exported.");
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
      fileMessage = error instanceof Error ? error.message : t("The file was not imported.");
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
  /** The action waiting for its new key (Settings › Keyboard), and what changed last. */
  let capturing = $state<ShortcutAction | null>(null);
  let keyNote = $state("");
  $effect(() => {
    const action = capturing;
    if (!action) return;
    // Capture the next key before the desk sees it; Escape cancels.
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        capturing = null;
        keyNote = "";
        return;
      }
      if (!canAssign(event.code)) {
        keyNote = t("That key is kept for typing and moving around. Press another, or Esc.");
        return;
      }
      const title = COMMANDS.find((command) => command.shortcut === action)?.title ?? action;
      const taken = session.setShortcut(action, event.code);
      const lost = taken ? COMMANDS.find((command) => command.shortcut === taken)?.title ?? taken : null;
      keyNote = lost ? `${title} is now ${shortcutLabel(session.workspace.shortcuts ?? defaultShortcuts, action)}. ${lost} has no key now; give it one below.` : `${title} is now ${shortcutLabel(session.workspace.shortcuts ?? defaultShortcuts, action)}.`;
      capturing = null;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

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
  <button type="button" class="settings-backdrop" aria-label={t("Close settings")} onclick={close}></button>
  <div class="settings" role="dialog" tabindex="-1" aria-modal="true" aria-label={t("Settings")} use:modalFocus={'input[type="search"]'}>
    <nav class="settings-nav" aria-label={t("Settings")}>
      <button type="button" class="account-card" class:active={section === "account"} onclick={() => (section = "account")}>
        {#if session.workspace.profile}
          <span class="set-brand-mark avatar-mark" style:background={planById(session.plan).color}>{initials(session.workspace.profile.name)}</span>
        {:else}
          <span class="set-brand-mark app-tile"><BrandMark size={22} /></span>
        {/if}
        <span class="account-copy">
          <strong>{session.workspace.profile?.name || session.workspace.churchName || "Church Studio"}</strong>
          <span>
            <b class="plan-chip" style:color={planById(session.plan).color}>{planById(session.plan).name}{session.trialDays > 0 && session.workspace.entitlement.plan === "free" ? ` ${t("trial")}` : ""}</b>
            · {session.workspace.profile ? session.workspace.churchName || t("Plan & account") : t("Sign in")}
          </span>
        </span>
        <Icon name="chevron-right" size={14} />
      </button>
      <label class="nav-search">
        <Icon name="search" size={14} />
        <input type="search" placeholder={t("Search settings")} aria-label={t("Search settings")} bind:value={search} />
      </label>
      <div class="nav-list">
        {#each visibleGroups as group (group.label)}
          <p class="nav-group">{t(group.label)}</p>
          {#each group.items as item (item.id)}
            <button type="button" class="nav-item" class:active={section === item.id} aria-current={section === item.id ? "page" : undefined} onclick={() => (section = item.id)}>
              <span class="tile" style:background={item.color}><Icon name={item.icon} size={14} /></span>
              <span class="nav-title">{t(item.title)}</span>
            </button>
          {/each}
        {:else}
          <p class="nav-empty">{t("No settings match “{search}”.", { search })}</p>
        {/each}
      </div>
    </nav>

    <div class="settings-body">
      <header class="set-head">
        <span class="tile big" style:background={page?.color}><Icon name={page?.icon ?? "settings"} size={22} /></span>
        <div class="head-copy">
          <h2>{page ? t(page.title) : ""}</h2>
          <p>{page ? t(page.about) : ""}</p>
        </div>
        <button type="button" class="icon-close" aria-label={t("Close settings")} title={t("Close (Esc)")} onclick={close}><Icon name="close" size={16} /></button>
      </header>

      {#if section === "general"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Church name")}</strong><span>{t("Shown in Settings and used for the logo slide.")}</span></div>
            <input class="field" aria-label={t("Church name")} placeholder={t("Grace Chapel")} bind:value={churchName} onchange={() => session.setChurchName(churchName)} />
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Logo text")}</strong><span>{t("The Logo button sends this to Program. Pick the picture in Media.")}</span></div>
            <input class="field" aria-label={t("Logo text")} bind:value={logoText} onchange={() => session.setLogoText(logoText)} />
          </div>
        </section>
        <p class="section-label">{t("Copyright")}</p>
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("CCLI license #")}</strong><span>{t("Shown with each song's © line on its first and last slide, as the CCLI license asks.")}</span></div>
            <input
              class="field"
              aria-label={t("CCLI license number")}
              inputmode="numeric"
              placeholder={t("Church Copyright License number")}
              value={session.workspace.ccliLicense}
              onchange={(event) => session.setCcliLicense(event.currentTarget.value)}
            />
          </div>
        </section>
      {:else if section === "system"}
        <CapabilityList />
      {:else if section === "appearance"}
        <section class="card">
          <h3>{t("Language")}</h3>
          <p class="card-note">{t("The words on the desk: menus, buttons and settings. Scripture and songs keep their own language.")}</p>
          <div class="segment" role="radiogroup" aria-label={t("Language")}>
            {#each UI_LANGUAGES as language (language.id)}
              <button type="button" role="radio" aria-checked={(session.workspace.appearance.language ?? "en") === language.id} class:active={(session.workspace.appearance.language ?? "en") === language.id} lang={language.id} onclick={() => session.setAppearance({ language: language.id })}>{language.name}</button>
            {/each}
          </div>
        </section>
        <section class="card">
          <h3>{t("Desk")}</h3>
          <div class="choice-row" role="group" aria-label={t("Desk")}>
            {#each [{ id: "pewbeam", name: msg("Presenter Desk"), icon: "pew", note: msg("Scripture, songs and service presentation.") }, { id: "obs", name: msg("Production Desk"), icon: "obs", note: msg("Live production, cameras, compositions and output control.") }] as style (style.id)}
              <button type="button" class="choice" class:active={session.workspace.appearance.desk === style.id} onclick={() => session.setAppearance({ desk: style.id as DeskStyle })}>
                <Icon name={style.icon} size={18} />
                <strong>{t(style.name)}</strong>
                <span>{t(style.note)}</span>
              </button>
            {/each}
          </div>
        </section>
        <section class="card">
          <h3>{t("Desk colors")}</h3>
          <div class="theme-row" role="group" aria-label={t("Desk colors")}>
            {#each themes as theme (theme.id)}
              <button type="button" class="theme-card" class:active={session.workspace.appearance.theme === theme.id} onclick={() => session.setAppearance({ theme: theme.id })}>
                <span class="chip" style:background={theme.ground} style:color={theme.ink}>
                  <span class="chip-bar" style:background={session.workspace.appearance.accent}></span>
                  {t("Aa")}
                </span>
                <strong>{t(theme.name)}</strong>
                <span>{t(theme.note)}</span>
              </button>
            {/each}
          </div>
        </section>
        <section class="card">
          <h3>{t("Accent")}</h3>
          <div class="accent-row" role="group" aria-label={t("Accent")}>
            {#each accents as accent (accent.value)}
              <button type="button" class="swatch" class:active={session.workspace.appearance.accent === accent.value} aria-label={t(accent.name)} onclick={() => session.setAppearance({ accent: accent.value })}>
                <span class="dot" style:background={accent.value}></span>
                <span>{t(accent.name)}</span>
              </button>
            {/each}
            <label class="custom-accent">
              {t("Custom")}
              <input type="color" aria-label={t("Custom accent")} value={session.workspace.appearance.accent} oninput={(event) => session.setAppearance({ accent: event.currentTarget.value })} />
            </label>
          </div>
        </section>
        <section class="card">
          <label class="contrast-row">
            <span><h3>{t("Stronger borders")}</h3><span class="contrast-note">{t("Lines around panels, fields and buttons drawn brighter, so the desk is easier to read in a bright room or for tired eyes.")}</span></span>
            <input type="checkbox" class="switch" role="switch" checked={session.workspace.appearance.contrast === true} onchange={(event) => session.setAppearance({ contrast: event.currentTarget.checked })} />
          </label>
        </section>
        <section class="card split">
          <div>
            <h3>{t("Spacing")}</h3>
            <div class="segment" role="group" aria-label={t("Spacing")}>
              <button type="button" class:active={session.workspace.appearance.density === "comfortable"} onclick={() => session.setAppearance({ density: "comfortable" })}>{t("Comfortable")}</button>
              <button type="button" class:active={session.workspace.appearance.density === "compact"} onclick={() => session.setAppearance({ density: "compact" })}>{t("Compact")}</button>
            </div>
          </div>
          <div>
            <h3>{t("Size")}</h3>
            <div class="segment" role="group" aria-label={t("Size")}>
              {#each [["0.9", "90%"], ["1", "100%"], ["1.1", "110%"], ["1.25", "125%"]] as [value, label] (value)}
                <button type="button" class:active={String(session.workspace.appearance.scale) === value} onclick={() => session.setAppearance({ scale: Number(value) })}>{label}</button>
              {/each}
            </div>
          </div>
        </section>
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Screen theme")}</strong><span>{t("{name}. Colors, fonts and backgrounds for the audience screen live in Themes.", { name: session.theme().name })}</span></div>
            <button type="button" class="btn" onclick={() => (section = "themes")}>{t("Open Themes")}</button>
          </div>
        </section>
      {:else if section === "workspace"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Current layout")}</strong><span>{layout.builtin ? t("Built in. Rearrange it freely; Reset brings it back.") : t("Your own layout.")}</span></div>
            <select class="field" aria-label={t("Current layout")} value={layout.id} onchange={(event) => session.useLayout(event.currentTarget.value)}>
              {#each session.workspace.layouts as item (item.id)}
                <option value={item.id}>{item.name}{item.builtin ? ` · ${t("built in")}` : ""}</option>
              {/each}
            </select>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Name")}</strong><span>{t("Rename the layout you are using.")}</span></div>
            <input class="field" aria-label={t("Layout name")} bind:value={layoutName} onchange={() => session.renameActiveLayout(layoutName)} />
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("This layout")}</strong><span>{t("Save keeps panel sizes. Duplicate makes a personal copy.")}</span></div>
            <div class="row-end">
              <button type="button" class="btn primary" onclick={() => session.saveLayout()}>{t("Save")}</button>
              <button type="button" class="btn" onclick={() => session.duplicateActiveLayout()}>{t("Duplicate")}</button>
              <button type="button" class="btn" onclick={() => session.resetActiveLayout()} disabled={!layout.builtin}>{t("Reset")}</button>
              <button type="button" class="btn danger" onclick={() => session.deleteLayoutById(layout.id)} disabled={layout.builtin}>{t("Delete")}</button>
            </div>
          </div>
        </section>
        <p class="section-label">{t("New layout")}</p>
        <section class="rows">
          <form
            class="row"
            onsubmit={(event) => {
              event.preventDefault();
              session.saveLayoutAs(newLayout);
              newLayout = "";
            }}
          >
            <div class="row-copy"><strong>{t("Save as")}</strong><span>{t("Keep the current arrangement under a new name.")}</span></div>
            <div class="row-end">
              <input class="field" placeholder={t("Layout name")} bind:value={newLayout} aria-label={t("New layout name")} />
              <button type="submit" class="btn primary" disabled={!newLayout.trim()}>{t("Save as")}</button>
            </div>
          </form>
          <div class="row">
            <div class="row-copy"><strong>{t("Built-in layouts")}</strong><span>{t("Put back any built-in layout that was deleted or changed.")}</span></div>
            <button type="button" class="btn" onclick={() => session.restoreBuiltinWorkspaces()}>{t("Restore")}</button>
          </div>
        </section>
      {:else if section === "themes"}
        <ThemeLibrary />
      {:else if section === "audience"}
        <section class="status-card" class:on={session.output.online}>
          <span class="lamp" class:on={session.output.online}></span>
          <div class="head-copy">
            <p class="eyebrow">{session.output.online ? t("Showing") : status.detail.startsWith("External display detected") ? t("Detected") : t("Output")}</p>
            <h3>{status.title}</h3>
            <p>{status.detail}</p>
          </div>
          <div class="row-end">
            {#if session.output.desired}
              <button type="button" class="btn" onclick={() => session.closeAudience()}>{t("Close")}</button>
            {:else}
              <button type="button" class="btn primary" onclick={() => session.openAudience()}>{t("Open output")}</button>
            {/if}
          </div>
        </section>
        <section class="rows">
          {#if session.output.desired && !session.output.online}
            <div class="row">
              <div class="row-copy"><strong>{t("Output was closed")}</strong><span>{t("The audience window is not showing. Open it again.")}</span></div>
              <button type="button" class="btn primary" onclick={() => session.openAudience()}>{t("Reopen")}</button>
            </div>
          {/if}
          <div class="row">
            <div class="row-copy"><strong>{t("Fullscreen")}</strong><span>{t("Cover the whole audience screen. The desk stays on its own display.")}</span></div>
            <input type="checkbox" class="switch" role="switch" aria-label={t("Fullscreen output")} checked={profile.outputMode === "fullscreen"} onchange={(event) => setMode(event.currentTarget.checked ? "fullscreen" : "window")} />
          </div>
          <div class="row">
            <div class="row-copy">
              <strong>{t("Screen shape")}</strong>
              <span>
                {#if (session.workspace.appearance.screenShape ?? "auto") === "auto"}
                  {t("Fills any screen: TV, projector, LED wall or portrait.")} {session.workspace.appearance.measuredAspect ? t("The audience screen is {shape}; the monitors here show the same shape.", { shape: describeAspect(session.workspace.appearance.measuredAspect) }) : t("Open the output once so the desk learns its shape.")}
                {:else}
                  {t("Always {screenShape}. A screen of another shape shows bars at the sides or top.", { screenShape: session.workspace.appearance.screenShape })}
                {/if}
              </span>
            </div>
            <select class="field" aria-label={t("Screen shape")} value={session.workspace.appearance.screenShape ?? "auto"} onchange={(event) => session.setScreenShape(event.currentTarget.value as ScreenShape)}>
              {#each SCREEN_SHAPES as shape (shape.id)}<option value={shape.id} title={t(shape.detail)}>{t(shape.label)}</option>{/each}
            </select>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Test the output")}</strong><span>{t("Flashes the audience window. Program does not change.")}</span></div>
            <button type="button" class="btn" onclick={() => session.testOutput()}>{t("Test")}</button>
          </div>
          {#if !session.controlsAudience}
            <div class="row">
              <div class="row-copy"><strong>{t("Another window is in control")}</strong><span>{t("Send to the audience from this window instead.")}</span></div>
              <button type="button" class="btn" onclick={() => session.claimAudience()}>{t("Take control")}</button>
            </div>
          {/if}
        </section>
        <p class="section-label">{t("Network video (NDI®)")}</p>
        <section class="rows">
          <div class="row">
            <div class="row-copy">
              <strong>{t("Send Program over NDI")}</strong>
              <span>
                {#if session.ndi.status === "on"}
                  {session.ndi.pattern ? t("Sending a test pattern as “{name}”.", { name: session.ndi.name }) : t("Sending Program as “{name}”.", { name: session.ndi.name })} {session.ndi.connections === 0 ? t("Nothing is watching yet.") : tn(session.ndi.connections, "{n} receiver watching.", "{n} receivers watching.")}
                {:else if session.ndi.status === "starting"}{session.ndi.message}
                {:else if session.ndi.status === "error"}<span class="form-error">{session.ndi.message}</span>
                {:else if !isDesktop()}{t("OBS, vMix or an NDI monitor can take what the audience sees, over the network. This works in the Church Studio app for Mac.")}
                {:else}{t("Any app that takes NDI can show what the audience sees, over the network: vMix, OBS (with its NDI plugin), Wirecast, Resolume, TriCaster, NDI Studio Monitor, a streaming computer. It captures the audience window, which opens if it is closed.")}{/if}
              </span>
            </div>
            <input
              type="checkbox"
              class="switch"
              role="switch"
              aria-label={t("Send Program over NDI")}
              disabled={!isDesktop()}
              checked={session.ndi.status === "on" || session.ndi.status === "starting"}
              onchange={(event) => (event.currentTarget.checked ? void session.startNdi() : void session.stopNdi())}
            />
          </div>
          <div class="row">
            <div class="row-copy">
              <strong>{t("Send sound with the picture")}</strong>
              <span>{session.ndi.status === "on" && session.workspace.ndiAudio ? (session.ndi.audio ? t("On: videos and music on Program go out over NDI.") : t("This NDI or macOS version cannot send sound; the picture still goes out.")) : t("Videos and music on Program go out with the picture, so the sound desk or the stream gets them over the network too. Needs macOS 13 or later.")}</span>
            </div>
            <input type="checkbox" class="switch" role="switch" aria-label={t("Send sound with the picture")} disabled={!isDesktop()} checked={session.workspace.ndiAudio} onchange={(event) => void session.setNdiAudio(event.currentTarget.checked)} />
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Find it first")}</strong><span>{t("Sends colour bars, and a beep each second when sound is on, under the same name, so you can add the source in vMix, OBS or any NDI app and check the sound before the service.")}</span></div>
            <button type="button" class="btn" disabled={!isDesktop() || session.ndi.status === "starting"} onclick={() => (session.ndi.status === "on" && session.ndi.pattern ? void session.stopNdi() : void session.startNdi({ pattern: true }))}>
              {session.ndi.status === "on" && session.ndi.pattern ? t("Stop test") : t("Send test pattern")}
            </button>
          </div>
          <div class="row">
            <div class="row-copy">
              <strong>{t("Send the words for keying")}</strong>
              <span>
                {#if session.ndiKey.status === "on"}
                  {t("Sending the scripture and lyrics on Program as “{name}”, on a transparent background.", { name: session.ndiKey.name })} {session.ndiKey.connections === 0 ? t("Nothing is watching yet.") : tn(session.ndiKey.connections, "{n} receiver watching.", "{n} receivers watching.")}
                {:else if session.ndiKey.status === "starting"}{session.ndiKey.message}
                {:else if session.ndiKey.status === "error"}<span class="form-error">{session.ndiKey.message}</span>
                {:else}{t("A second source with only the scripture or lyrics on Program, as a lower third on a transparent background. Lay it over a camera in OBS or vMix. It needs no screen recording permission.")}{/if}
              </span>
            </div>
            <input
              type="checkbox"
              class="switch"
              role="switch"
              aria-label={t("Send the words for keying")}
              disabled={!isDesktop()}
              checked={session.ndiKey.status === "on" || session.ndiKey.status === "starting"}
              onchange={(event) => (event.currentTarget.checked ? void session.startNdiKey() : void session.stopNdiKey())}
            />
          </div>
        </section>
        <p class="note stand">{t("NDI needs the free NDI Tools or NDI Runtime on this computer:")} <a href="https://ndi.video/tools" target="_blank" rel="noreferrer">ndi.video/tools</a>. {t("The first time, macOS asks to allow Church Studio to record the screen; that is how it sees the audience window. NDI® is a registered trademark of Vizrt NDI AB.")} <a href="https://ndi.video" target="_blank" rel="noreferrer">ndi.video</a></p>
        <p class="section-label">{t("Second screen")}</p>
        {@const second = session.workspace.secondOutput}
        <section class="rows">
          <div class="row">
            <div class="row-copy">
              <strong>{t("{name} screen", { name: second.name })}</strong>
              <span>{session.secondOpen ? `Open. It follows Program${second.show === "words" ? t(", words only") : ""}.` : t("A lobby TV, an overflow room or a hallway screen with its own look. It follows Program; nothing you prepare reaches it until LIVE.")}</span>
            </div>
            {#if session.secondOpen}
              <button type="button" class="btn" onclick={() => void session.closeSecond()}>{t("Close")}</button>
            {:else}
              <button type="button" class="btn primary" onclick={() => void session.openSecond()}>{t("Open")}</button>
            {/if}
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Name")}</strong><span>{t("What the desk calls this screen.")}</span></div>
            <input class="field" aria-label={t("Second screen name")} maxlength="40" value={second.name} onchange={(event) => session.setSecondOutput({ name: event.currentTarget.value.trim() || t("Lobby") })} />
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Shows")}</strong><span>{second.show === "words" ? t("Scripture and lyrics only. Pictures, videos and cameras show the church name instead.") : t("Everything the audience sees.")}</span></div>
            <select class="field" aria-label={t("What the second screen shows")} value={second.show} onchange={(event) => session.setSecondOutput({ show: event.currentTarget.value === "same" ? "same" : "words" })}>
              <option value="words">{t("Words only")}</option>
              <option value="same">{t("Same as the audience")}</option>
            </select>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Theme")}</strong><span>{t("A plain, readable theme often suits a lobby TV.")}</span></div>
            <select class="field" aria-label={t("Second screen theme")} value={second.themeId ?? ""} onchange={(event) => session.setSecondOutput({ themeId: event.currentTarget.value || null })}>
              <option value="">{t("Same as the audience")}</option>
              {#each session.themes as theme (theme.id)}<option value={theme.id}>{theme.name}</option>{/each}
            </select>
          </div>
          {#if isDesktop() && session.output.displays.length > 1}
            <div class="row">
              <div class="row-copy"><strong>{t("Display")}</strong><span>{t("Where it opens. Close and open it again after changing this.")}</span></div>
              <select class="field" aria-label={t("Second screen display")} value={second.displayKey ?? ""} onchange={(event) => session.setSecondOutput({ displayKey: event.currentTarget.value || null })}>
                <option value="">{t("A free display")}</option>
                {#each session.output.displays as display (display.key)}<option value={display.key}>{display.name}{display.primary ? ` (${t("this screen")})` : display.audience ? ` (${t("audience")})` : ""}</option>{/each}
              </select>
            </div>
          {/if}
          <div class="row">
            <div class="row-copy"><strong>{t("Alerts here too")}</strong><span>{t("Nursery calls and other alerts show on this screen as well.")}</span></div>
            <input type="checkbox" class="switch" role="switch" aria-label={t("Alerts on the second screen")} checked={second.alerts} onchange={(event) => session.setSecondOutput({ alerts: event.currentTarget.checked })} />
          </div>
        </section>
        <p class="section-label">{t("Screen")}</p>
        {#if isDesktop() && session.output.displays.length > 0}
          <div class="monitor-list">
            {#each session.output.displays as display (display.key)}
              <button
                type="button"
                class="monitor"
                class:on={profile.assignments.audience === display.key || (!profile.assignments.audience && display.audience)}
                onclick={() => session.setAssignments(assignments("audience", display.key))}
              >
                <span class="mini" aria-hidden="true"><span>{t("Program")}</span></span>
                <span class="monitor-copy">
                  <strong>{display.name}</strong>
                  <span>{display.width} × {display.height} · {display.primary ? t("Primary") : t("External")}</span>
                </span>
              </button>
            {/each}
          </div>
        {:else}
          <section class="rows">
            <div class="row">
              <div class="row-copy">
                <strong>{isDesktop() ? t("No displays detected") : t("Choose the screen yourself")}</strong>
                <span>{isDesktop() ? t("Connect a monitor, then refresh.") : t("This browser cannot list monitors. Open output, drag the window to the screen, then choose Fill this screen.")}</span>
              </div>
              {#if isDesktop()}<button type="button" class="btn" onclick={() => session.refreshDisplays()}>{t("Refresh")}</button>{/if}
            </div>
          </section>
        {/if}
        <p class="note stand">{t("The audience window shows Program only. Preview, theme edits and Next stay on this desk until LIVE, Clear or Black.")} <button type="button" class="link" onclick={() => (section = "displays")}>{t("Arrange desk and audience")}</button></p>
      {:else if section === "displays"}
        {#if !isDesktop()}
          <section class="rows">
            <div class="row">
              <div class="row-copy"><strong>{t("Browser window")}</strong><span>{t("A browser cannot list monitors or move a window onto one. Open output, drag it to the external display, then choose Fill this screen.")}</span></div>
              <button type="button" class="btn" onclick={() => (section = "audience")}>{t("Audience output")}</button>
            </div>
          </section>
        {:else if session.output.displays.length === 0}
          <section class="rows">
            <div class="row">
              <div class="row-copy"><strong>{t("No displays detected")}</strong><span>{t("Refresh after a monitor is connected. The operator window stays here.")}</span></div>
              <button type="button" class="btn" onclick={() => session.refreshDisplays()}>{t("Refresh")}</button>
            </div>
          </section>
        {:else}
          <div class="monitor-list">
            {#each session.output.displays as display (display.key)}
              <article class="monitor static">
                <span class="mini" aria-hidden="true"><span>{display.primary ? t("Desk") : t("Screen")}</span></span>
                <span class="monitor-copy">
                  <strong>{display.name}</strong>
                  <span>{display.width} × {display.height} · {display.scale}×{display.primary ? ` · ${t("Primary")}` : ""}{display.audience ? ` · ${t("Audience")}` : ""}</span>
                </span>
                <span class="monitor-actions">
                  <button type="button" class:on={profile.assignments.operator === display.key} onclick={() => session.setAssignments(assignments("operator", display.key))}>{t("Desk")}</button>
                  <button type="button" class:on={profile.assignments.audience === display.key} onclick={() => session.setAssignments(assignments("audience", display.key))}>{t("Audience")}</button>
                </span>
              </article>
            {/each}
          </div>
          <button type="button" class="btn" onclick={() => session.refreshDisplays()}>{t("Refresh displays")}</button>
        {/if}
        <p class="section-label">{t("Profile")}</p>
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Display profile")}</strong><span>{t("Save a setup per room or per computer.")}</span></div>
            <select class="field" aria-label={t("Display profile")} value={profile.id} onchange={(event) => session.useDisplayProfile(event.currentTarget.value)}>
              {#each session.workspace.displayProfiles as item (item.id)}
                <option value={item.id}>{item.name}</option>
              {/each}
            </select>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Name")}</strong></div>
            <input class="field" aria-label={t("Profile name")} bind:value={profileName} onchange={() => session.renameDisplayProfile(profileName)} />
          </div>
        </section>
        <p class="section-label">{t("Screens")}</p>
        <section class="rows">
          <div class="row">
            <div class="row-lead"><span class="row-icon"><Icon name="laptop" size={16} /></span><div class="row-copy"><strong>{t("Desk")}</strong><span>{t("Where you operate.")}</span></div></div>
            <select class="field" aria-label={t("Desk display")} value={profile.assignments.operator ?? ""} onchange={(event) => session.setAssignments(assignments("operator", event.currentTarget.value))}>
              <option value="">{t("Automatic · primary display")}</option>
              {#each session.output.displays as display (display.key)}<option value={display.key}>{display.name}</option>{/each}
            </select>
          </div>
          <div class="row">
            <div class="row-lead"><span class="row-icon"><Icon name="cast" size={16} /></span><div class="row-copy"><strong>{t("Audience")}</strong><span>{audience.missing && audience.mode === "assigned" ? t("Disconnected. Program is held until it returns.") : audience.missing ? t("Connect an external display, or assign this screen.") : sameScreen(profile.assignments) ? t("Same display as the desk.") : t("What the congregation sees.")}</span></div></div>
            <select class="field" aria-label={t("Audience display")} value={profile.assignments.audience ?? ""} onchange={(event) => session.setAssignments(assignments("audience", event.currentTarget.value))}>
              <option value="">{t("Automatic · external display")}</option>
              {#each session.output.displays as display (display.key)}<option value={display.key}>{display.name}</option>{/each}
              {#if profile.assignments.audience && audience.missing}<option value={profile.assignments.audience}>{t("Saved display is disconnected")}</option>{/if}
            </select>
          </div>
          <div class="row">
            <div class="row-lead"><span class="row-icon"><Icon name="stage" size={16} /></span><div class="row-copy"><strong>{t("Stage")}</strong><span>{t("The confidence screen for the platform.")}</span></div></div>
            <select class="field" aria-label={t("Stage display")} value={profile.assignments.stage ?? ""} onchange={(event) => session.setAssignments(assignments("stage", event.currentTarget.value))}>
              <option value="">{t("Off")}</option>
              {#each session.output.displays as display (display.key)}<option value={display.key}>{display.name}</option>{/each}
            </select>
          </div>
        </section>
        <p class="section-label">{t("Save")}</p>
        <section class="rows">
          <form
            class="row"
            onsubmit={(event) => {
              event.preventDefault();
              session.saveDisplayProfileAs(newProfile);
              newProfile = "";
            }}
          >
            <div class="row-copy"><strong>{t("Save as a new profile")}</strong></div>
            <div class="row-end">
              <input class="field" placeholder={t("Profile name")} bind:value={newProfile} aria-label={t("New display profile")} />
              <button type="submit" class="btn primary" disabled={!newProfile.trim()}>{t("Save")}</button>
            </div>
          </form>
          <div class="row">
            <div class="row-copy"><strong>{t("Delete this profile")}</strong><span>{profile.builtin ? t("Built-in profiles stay.") : t("Removes the saved screen choices.")}</span></div>
            <button type="button" class="btn danger" onclick={() => session.deleteDisplayProfile(profile.id)} disabled={profile.builtin}>{t("Delete")}</button>
          </div>
        </section>
      {:else if section === "keyboard"}
        {#each shortcutGroups as group (group)}
          <section class="card">
            <h3>{t(group)}</h3>
            <ul class="keys">
              {#each COMMANDS.filter((command) => command.group === group) as command (command.id)}
                <li>
                  <span>{t(command.title)}</span>
                  {#if command.shortcut}
                    {@const action = command.shortcut}
                    <button
                      type="button"
                      class="key-btn"
                      class:listening={capturing === action}
                      aria-label={capturing === action ? t("Press the new key for {title}", { title: t(command.title) }) : t("Change the key for {title}", { title: t(command.title) })}
                      title={t("Click, then press the new key")}
                      onclick={() => { keyNote = ""; capturing = capturing === action ? null : action; }}
                    >{capturing === action ? t("Press a key…") : shortcutLabels(shortcuts, action)}</button>
                  {:else}
                    <kbd class="kbd">{command.id === "open-settings" ? "⌘," : "—"}</kbd>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/each}
        {#if keyNote}<p class="note stand" role="status">{keyNote}</p>{/if}
        <div class="key-foot">
          <p class="note">{t("Click a key, then press the new one. Esc cancels. Tab and Enter stay for typing and moving around.")}</p>
          {#if session.workspace.shortcuts}<button type="button" class="btn" onclick={() => { session.resetShortcuts(); keyNote = ""; }}>{t("Reset to the usual keys")}</button>{/if}
        </div>
      {:else if section === "broadcast"}
        <BroadcastSettings />
      {:else if section === "switcher"}
        <SwitcherSettings />
      {:else if section === "remote"}
        {#if session.entitled("phone-remote")}
          <RemotePanel />
        {:else}
          <section class="rows">
            <div class="row">
              <div class="row-copy"><strong>{t("Phone remote is part of Premium")}</strong><span>{t("Pair a phone to move through the service and go live from anywhere in the room.")}</span></div>
              <button type="button" class="btn primary" onclick={() => session.requireFeature("phone-remote")}>{t("Unlock")}</button>
            </div>
          </section>
        {/if}
      {:else if section === "screens"}
        <ScreensSettings />
      {:else if section === "stage"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Stage display")}</strong><span>{t("What is live now, what is next (Preview), the time and any timer. It never sends anything to the audience.")}</span></div>
            <button type="button" class="btn primary" onclick={() => void session.openStage()}>{t("Open")}</button>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Which screen")}</strong><span>{t("With three screens it opens on the one that is neither the desk nor the audience. Otherwise drag it to the platform screen.")}</span></div>
            <button type="button" class="btn" onclick={() => (section = "displays")}>{t("Displays")}</button>
          </div>
        </section>
        <p class="section-label">{t("Message to the stage")}</p>
        <section class="rows">
          <form class="row" onsubmit={(event) => { event.preventDefault(); session.sendStageMessage(stageText); }}>
            <div class="row-copy"><strong>{session.stageMessage ? t("Showing “{stageMessage}”", { stageMessage: session.stageMessage }) : t("Send a message")}</strong><span>{t("A bright banner on the stage screen until you clear it. The audience never sees it.")}</span></div>
            <div class="row-end">
              <input class="field" aria-label={t("Stage message")} placeholder={t("5 minutes")} maxlength="140" bind:value={stageText} />
              <button type="submit" class="btn primary" disabled={!stageText.trim()}>{t("Send")}</button>
              {#if session.stageMessage}<button type="button" class="btn" onclick={() => session.sendStageMessage("")}>{t("Clear")}</button>{/if}
            </div>
          </form>
          <div class="row">
            <div class="row-copy"><strong>{t("Quick messages")}</strong></div>
            <div class="row-end wrap">
              {#each ["5 minutes", "2 minutes", "Wrap up", "Slow down", "Speak up", "Look at the screen"] as quick (quick)}
                <button type="button" class="btn" onclick={() => session.sendStageMessage(quick)}>{quick}</button>
              {/each}
            </div>
          </div>
        </section>
        <p class="section-label">{t("On phones and tablets")}</p>
        <StageLinks />
        <p class="section-label">{t("What the stage screen shows")}</p>
        <section class="rows">
          {#each [["next", "Next", "What is on Preview, so the speaker knows what comes."], ["clock", "Clock", "The time of day, top right."], ["notes", "Desk notes", "Private sermon notes for the point that is up."], ["chords", "Chords", "Chords above the words for the band, when a song has them (from ChordPro files). Transpose on the song desk."]] as [key, title, detail] (key)}
            <div class="row">
              <div class="row-copy"><strong>{title}</strong><span>{detail}</span></div>
              <input type="checkbox" class="switch" role="switch" aria-label={title} checked={session.workspace.stageLayout[key as "next" | "clock" | "notes" | "chords"]} onchange={(event) => session.setStageLayout({ [key]: event.currentTarget.checked })} />
            </div>
          {/each}
          <div class="row">
            <div class="row-copy"><strong>{t("Text size")}</strong><span>{t("Larger for a stage screen far from the pulpit.")}</span></div>
            <select class="field" aria-label={t("Stage text size")} value={session.workspace.stageLayout.size} onchange={(event) => session.setStageLayout({ size: event.currentTarget.value as "s" | "m" | "l" })}>
              <option value="s">{t("Small")}</option><option value="m">{t("Medium")}</option><option value="l">{t("Large")}</option>
            </select>
          </div>
        </section>
      {:else if section === "captions"}
        <CaptionsSettings onai={() => (section = "ai")} />
      {:else if section === "ai"}
        {@const ai = session.workspace.ai}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Service")}</strong><span>{t("Claude (Anthropic), or anything that speaks the OpenAI API: OpenAI itself, or a model on this computer through Ollama or LM Studio.")}</span></div>
            <select class="field" aria-label={t("AI service")} value={ai.provider} onchange={(event) => { const provider = event.currentTarget.value === "openai" ? "openai" : "anthropic"; session.setAiSettings({ provider, model: AI_DEFAULTS[provider].model, baseUrl: "" }); aiNote = ""; }}>
              <option value="anthropic">{t("Claude (Anthropic)")}</option>
              <option value="openai">{t("OpenAI or compatible")}</option>
            </select>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Your key")}</strong><span>{ai.provider === "anthropic" ? t("Make one at console.anthropic.com › API keys.") : t("From platform.openai.com › API keys. A model on this computer needs no key.")} {t("It stays on this computer and is only used when you ask for a summary.")}</span></div>
            <input class="field" type="password" aria-label={t("AI key")} placeholder={t("Paste your key")} autocomplete="off" value={ai.key} onchange={(event) => { session.setAiSettings({ key: event.currentTarget.value }); aiNote = ""; }} />
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Model")}</strong><span>{ai.provider === "anthropic" ? t("claude-sonnet-5-5 is a good balance; claude-haiku-5-5 is quicker and cheaper.") : t("For example gpt-4o-mini, or llama3.1 on Ollama.")}</span></div>
            <input class="field" aria-label={t("AI model")} value={ai.model} onchange={(event) => session.setAiSettings({ model: event.currentTarget.value })} />
          </div>
          {#if ai.provider === "openai"}
            <div class="row">
              <div class="row-copy"><strong>{t("Address")}</strong><span>{t("Leave empty for OpenAI. Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1")}</span></div>
              <input class="field" aria-label={t("AI address")} placeholder="https://api.openai.com/v1" value={ai.baseUrl} onchange={(event) => session.setAiSettings({ baseUrl: event.currentTarget.value })} />
            </div>
          {/if}
          <div class="row">
            <div class="row-copy"><strong>{t("Check it works")}</strong><span class:form-error={aiNote && !aiOk}>{aiNote || t("Sends a two-line test to the service.")}</span></div>
            <button type="button" class="btn" disabled={!session.aiReady || aiBusy} onclick={async () => {
              aiBusy = true;
              try { aiNote = await session.testAi(); aiOk = true; } catch (error) { aiNote = error instanceof Error ? error.message : String(error); aiOk = false; }
              aiBusy = false;
            }}>{aiBusy ? t("Checking…") : t("Test")}</button>
          </div>
        </section>
        <p class="note stand">{t("Used on the Sermon page: Summarize turns your notes into a short summary and sermon points you can show. Your notes go to the service you chose only when you press it; the service's own terms and charges apply.")}</p>
      {:else if section === "planning"}
        <section class="rows">
          <form class="row" onsubmit={(event) => { event.preventDefault(); void connectPco(); }}>
            <div class="row-copy"><strong>{t("Personal Access Token")}</strong><span class:form-error={!!pcoError}>{pcoError || t("Make one at api.planningcenteronline.com › Personal Access Tokens, then paste the application id and secret. They stay on this computer.")}</span></div>
            <div class="row-end">
              <input class="field" aria-label={t("Planning Center application id")} placeholder={t("Application id")} autocomplete="off" bind:value={pcoApp} />
              <input class="field" type="password" aria-label={t("Planning Center secret")} placeholder={t("Secret")} autocomplete="off" bind:value={pcoSecret} />
              <button type="submit" class="btn primary" disabled={!pcoApp.trim() || !pcoSecret.trim() || pcoBusy || !isDesktop()}>{pcoBusy ? t("Connecting…") : t("Connect")}</button>
            </div>
          </form>
          {#if !isDesktop()}<div class="row"><div class="row-copy"><span>{t("Planning Center import works in the desktop app.")}</span></div></div>{/if}
          {#if pcoTypes.length}
            <div class="row">
              <div class="row-copy"><strong>{t("Service type")}</strong></div>
              <select class="field" aria-label={t("Service type")} bind:value={pcoType} onchange={() => void loadPcoPlans()}>
                {#each pcoTypes as type (type.id)}<option value={type.id}>{type.name}</option>{/each}
              </select>
            </div>
            {#each pcoPlans as plan (plan.id)}
              <div class="row">
                <div class="row-copy"><strong>{plan.title || plan.dates}</strong><span>{plan.dates} · {tn(plan.items, "{n} item", "{n} items")}</span></div>
                <button type="button" class="btn" disabled={pcoBusy} onclick={() => void importPco(plan)}>{t("Import")}</button>
              </div>
            {:else}
              <div class="row"><div class="row-copy"><span>{t("No upcoming plans for this service type.")}</span></div></div>
            {/each}
          {/if}
        </section>
        <p class="note stand">{t("Headers become sections, songs come with their lyrics (new ones go into a \"Planning Center\" folder), and other items become editable slides. Nothing goes live on its own.")}</p>
      {:else if section === "storage"}
        <StorageSpace />
        <p class="section-label">{t("Automatic backup and a second computer")}</p>
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Backup folder")}</strong><span>{session.workspace.backup.folder || t("Pick a folder your cloud drive keeps (Google Drive, OneDrive, Dropbox, iCloud). Church Studio saves there every 30 minutes and keeps the newest 20.")}</span></div>
            <button type="button" class="btn" disabled={!isDesktop()} onclick={() => void chooseBackupFolder()}>{session.workspace.backup.folder ? t("Change") : t("Choose folder")}</button>
          </div>
          {#if session.workspace.backup.folder}
            <div class="row">
              <div class="row-copy"><strong>{session.workspace.backup.lastAt ? t("Last backup {date}", { date: new Date(session.workspace.backup.lastAt).toLocaleString() }) : t("Not backed up yet")}</strong><span>{backupNote || t("On another computer, choose the same folder and restore: songs, services, sermons, slide decks, looks and layouts come across. Display settings stay per computer.")}</span></div>
              <div class="row-end">
                <button type="button" class="btn primary" onclick={async () => (backupNote = (await session.backupNow()) ?? t("Backed up."))}>{t("Back up now")}</button>
                <button type="button" class="btn" onclick={async () => (backupNote = await session.restoreLatestBackup().catch((error) => (error instanceof Error ? error.message : String(error))))}>{t("Restore latest")}</button>
              </div>
            </div>
          {/if}
          {#if !isDesktop()}<div class="row"><div class="row-copy"><span>{t("Folder backups work in the desktop app. Here, use Export below.")}</span></div></div>{/if}
        </section>
        <p class="section-label">{t("Files")}</p>
        <section class="rows">
          <div class="row">
            <div class="row-lead"><span class="row-icon"><Icon name="files" size={16} /></span><div class="row-copy"><strong>{t("Export library")}</strong><span>{t("Songs, services and themes as one file. Program is not included.")}</span></div></div>
            <button type="button" class="btn primary" onclick={() => downloadLibrary()}>{t("Export")}</button>
          </div>
          <div class="row">
            <div class="row-lead"><span class="row-icon"><Icon name="refresh" size={16} /></span><div class="row-copy"><strong>{t("Import")}</strong><span>{t("A Church Studio library, or a text or Markdown file as slides. A record is replaced only when its id matches.")}</span></div></div>
            <button type="button" class="btn" onclick={() => fileInput?.click()}>{t("Choose file…")}</button>
            <input bind:this={fileInput} type="file" accept={IMPORT_ACCEPT} hidden onchange={(event) => void importFile(event)} />
          </div>
        </section>
        {#if fileMessage}<p class="note stand">{fileMessage}</p>{/if}
        <p class="note stand">{t("Pictures and videos import in Media. Songs import and export in the Songs window.")}</p>
      {:else if section === "bible"}
        {@const installedIds = session.translations.map((entry) => entry.id)}
        <p class="section-label">{t("On this computer")}</p>
        <section class="rows">
          {#each BIBLE_CATALOG.filter((entry) => installedIds.includes(entry.id)) as entry (entry.id)}
            <div class="row">
              <div class="row-lead">
                <span class="bible-badge">{entry.abbreviation}</span>
                <div class="row-copy"><strong>{entry.name}</strong><span>{entry.language} · {entry.licenseNote ?? t("Public domain")}{entry.default ? ` · ${t("included")}` : ""}</span></div>
              </div>
              <div class="row-end">
                <span class="pill ok"><Icon name="check" size={11} /> {t("Installed")}</span>
                {#if installedIds.length > 1}
                  <button type="button" class="btn icon-btn" aria-label={t("Remove {name}", { name: entry.name })} title={t("Remove from this computer")} onclick={() => void session.removeBible(entry.id)}><Icon name="trash" size={14} /></button>
                {/if}
              </div>
            </div>
          {/each}
          {#each session.translations.filter((entry) => entry.id.startsWith("user-")) as entry (entry.id)}
            <div class="row">
              <div class="row-lead">
                <span class="bible-badge">{entry.abbreviation}</span>
                <div class="row-copy"><strong>{entry.name}</strong><span>{t("Imported from a Bible file")}</span></div>
              </div>
              <div class="row-end">
                <span class="pill ok"><Icon name="check" size={11} /> {t("Installed")}</span>
                <button type="button" class="btn icon-btn" aria-label={t("Remove {name}", { name: entry.name })} title={t("Remove from this computer")} onclick={() => void session.removeBible(entry.id)}><Icon name="trash" size={14} /></button>
              </div>
            </div>
          {/each}
          {#if isDesktop()}
            <div class="row">
              <div class="row-copy"><strong>{t("Import a Bible file")}</strong><span class:form-error={!!bibleImportNote && !bibleImportOk} role="status">{bibleImportNote || t("A Bible in your church's language, offline: Zefania, OSIS or OpenSong XML files (from OpenLP, FreeShow, SWORD and others).")}</span></div>
              <button type="button" class="btn" disabled={bibleImportBusy} onclick={() => bibleFile?.click()}>{bibleImportBusy ? t("Reading…") : t("Import…")}</button>
              <input bind:this={bibleFile} type="file" accept=".xml,.osis,.zefania,application/xml,text/xml" hidden onchange={(event) => void importBible(event)} />
            </div>
          {/if}
        </section>
        {#if BIBLE_CATALOG.some((entry) => !installedIds.includes(entry.id))}
          <p class="section-label">{t("Available to download")}</p>
          <section class="rows">
            {#each BIBLE_CATALOG.filter((entry) => !installedIds.includes(entry.id)) as entry (entry.id)}
              {@const busy = session.bibleBusy.includes(entry.id)}
              <div class="row">
                <div class="row-lead">
                  <span class="bible-badge muted">{entry.abbreviation}</span>
                  <div class="row-copy"><strong>{entry.name}</strong><span>{entry.language} · {entry.licenseNote ?? t("Public domain")} · {entry.sizeMb} MB</span></div>
                </div>
                <button type="button" class="btn" class:primary={!busy} disabled={busy} onclick={() => void session.installBible(entry.id)}>
                  {#if busy}<span class="spinner" aria-hidden="true"></span> {t("Downloading…")}{:else}<Icon name="download" size={14} /> {t("Download")}{/if}
                </button>
              </div>
            {/each}
          </section>
        {/if}
        <p class="section-label">{t("Licensed translations (online)")}</p>
        <section class="rows">
          <form class="row" onsubmit={(event) => { event.preventDefault(); void connectApiBible(); }}>
            <div class="row-copy"><strong>{t("API.Bible key")}</strong><span class:form-error={!!apiError}>{apiError || t("NIV, NKJV, ESV and others, where the publisher allows it. Get a free key at scripture.api.bible; text is fetched when shown and needs the internet.")}</span></div>
            <div class="row-end">
              <input class="field license-field" type="password" autocomplete="off" spellcheck="false" aria-label={t("API.Bible key")} placeholder={t("Paste your key")} bind:value={apiKey} />
              <button type="submit" class="btn primary" disabled={!apiKey.trim() || apiBusy}>{apiBusy ? t("Checking…") : apiList.length ? t("Refresh") : t("Connect")}</button>
            </div>
          </form>
          {#if apiList.length}
            <div class="row">
              <div class="row-copy"><strong>{t("Find a translation")}</strong><span>{t("{length} available to your key. Tick the ones to show in the translation list.", { length: apiList.length })}</span></div>
              <input class="field" aria-label={t("Filter translations")} placeholder={t("NIV, King James, Twi…")} bind:value={apiFilter} />
            </div>
            {#each apiList.filter((bible) => !apiFilter.trim() || `${bible.abbreviation} ${bible.name} ${bible.language}`.toLowerCase().includes(apiFilter.trim().toLowerCase())).slice(0, 40) as bible (bible.id)}
              {@const on = session.workspace.onlineBibles.bibles.some((entry) => entry.id === bible.id)}
              <label class="row">
                <div class="row-lead">
                  <span class="bible-badge" class:muted={!on}>{bible.abbreviation || "—"}</span>
                  <div class="row-copy"><strong>{bible.name}</strong><span>{bible.language}</span></div>
                </div>
                <input type="checkbox" class="switch" role="switch" aria-label={t("Use {name}", { name: bible.name })} checked={on} onchange={(event) => toggleApiBible(bible, event.currentTarget.checked)} />
              </label>
            {/each}
          {:else if session.workspace.onlineBibles.bibles.length}
            {#each session.workspace.onlineBibles.bibles as bible (bible.id)}
              <div class="row">
                <div class="row-lead"><span class="bible-badge">{bible.abbreviation}</span><div class="row-copy"><strong>{bible.name}</strong><span>{t("{language} · online", { language: bible.language })}</span></div></div>
                <button type="button" class="btn icon-btn" aria-label={t("Remove {name}", { name: bible.name })} onclick={() => toggleApiBible(bible, false)}><Icon name="trash" size={14} /></button>
              </div>
            {/each}
          {/if}
        </section>
        <p class="note stand">{t("King James and the World English Bible come with Church Studio. Download others when you need them; scripture stays on this computer, and Search, Listen and the next verse stay on Preview until LIVE.")}</p>
      {:else if section === "lyrics"}
        {@const report = usageReport(session.workspace.songUses, usageFrom, usageTo)}
        <p class="section-label">{t("CCLI usage report")}</p>
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Songs shown live")}</strong><span>{t("Each song counts once per day it went live. Enter these in your CCLI copy report.")}</span></div>
            <div class="row-end">
              <select class="field" aria-label={t("Report period")} bind:value={usagePeriod}>
                <option value="month">{t("This month")}</option>
                <option value="quarter">{t("Last 3 months")}</option>
                <option value="half">{t("Last 6 months")}</option>
                <option value="year">{t("Last 12 months")}</option>
              </select>
              <button type="button" class="btn" disabled={report.length === 0} onclick={() => exportUsage(report)}><Icon name="download" size={14} /> {t("CSV")}</button>
            </div>
          </div>
          {#each report.slice(0, 12) as row (row.songId)}
            <div class="row">
              <div class="row-copy"><strong>{row.title}</strong><span>{row.ccli ? `CCLI ${row.ccli}` : t("No CCLI number. Add it in the song's details.")} · {t("last {date}", { date: new Date(`${row.last}T12:00`).toLocaleDateString() })}</span></div>
              <span class="pill">{row.times}×</span>
            </div>
          {:else}
            <div class="row"><div class="row-copy"><span>{t("No songs went live in this period.")}</span></div></div>
          {/each}
          {#if report.length > 12}<div class="row"><div class="row-copy"><span>{t("{count} more in the CSV.", { count: report.length - 12 })}</span></div></div>{/if}
        </section>
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Song library")}</strong><span>{tn(session.songs.length, "{n} song", "{n} songs")} · {tn(session.workspace.songFolders.length, "{n} folder", "{n} folders")}. {t("Write, import and organize them in the Songs window.")}</span></div>
            <span class="pill">{session.songs.length}</span>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Imports")}</strong><span>{t("Plain text, ChordPro, SongSelect (.usr / .txt) and OpenLyrics (.xml / .zip).")}</span></div>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("CCLI license #")}</strong><span>{session.workspace.ccliLicense ? t("CCLI License # {ccliLicense} is shown with song copyright.", { ccliLicense: session.workspace.ccliLicense }) : t("Not set. Songs show their © line and CCLI song number only.")}</span></div>
            <button type="button" class="link" onclick={() => (section = "general")}>{session.workspace.ccliLicense ? t("Change") : t("Add")}</button>
          </div>
        </section>
      {:else if section === "media"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Pictures and videos")}</strong><span>{tn(session.media.length, "{n} item on this computer.", "{n} items on this computer.")} {t("Use them as backgrounds, the logo, or sources in a scene.")}</span></div>
            <button type="button" class="btn primary" onclick={() => void importMedia()}>{t("Import…")}</button>
            <input bind:this={mediaInput} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mov,.m4v" hidden onchange={(event) => void importMediaFile(event)} />
          </div>
          {#each [...session.media, ...session.audioTracks] as asset (asset.id)}
            <div class="row">
              <div class="row-lead"><span class="row-icon"><Icon name={asset.kind === "audio" ? "audio" : "media"} size={16} /></span><div class="row-copy"><strong>{asset.name}</strong><span>{asset.kind === "video" ? t("Video") : asset.kind === "audio" ? t("Audio") : t("Picture")}{session.workspace.logoAssetId === asset.id ? ` · ${t("logo")}` : ""}</span></div></div>
              <div class="row-end">
                {#if asset.kind === "image"}
                  <button type="button" class="btn" disabled={session.workspace.logoAssetId === asset.id} onclick={() => session.setLogo(asset.id)}>{session.workspace.logoAssetId === asset.id ? t("Logo") : t("Use as logo")}</button>
                {/if}
                <button
                  type="button"
                  class="btn danger"
                  aria-label={armedMedia === asset.id ? t("Confirm delete {name}", { name: asset.name }) : t("Delete {name}", { name: asset.name })}
                  onclick={() => {
                    if (armedMedia !== asset.id) {
                      armedMedia = asset.id;
                      return;
                    }
                    armedMedia = null;
                    void session.deleteMedia(asset.id);
                  }}
                >{armedMedia === asset.id ? t("Delete? Click again") : t("Delete")}</button>
              </div>
            </div>
          {/each}
        </section>
        <p class="section-label">{t("Cameras")}</p>
        <section class="rows">
          {#each session.cameras as camera (camera.deviceId)}
            <div class="row">
              <div class="row-lead"><span class="row-icon"><Icon name="cast" size={16} /></span><div class="row-copy"><strong>{camera.label}</strong></div></div>
              <button type="button" class="btn" onclick={() => void session.previewCamera(camera.deviceId)}>{t("Preview")}</button>
            </div>
          {:else}
            <div class="row"><div class="row-copy"><strong>{t("No cameras listed")}</strong><span>{session.cameraNote || t("Connect a camera, then refresh.")}</span></div></div>
          {/each}
          <div class="row">
            <div class="row-copy"><span>{t("Preview only. A camera reaches Program and the audience on LIVE.")}</span></div>
            <button type="button" class="btn" onclick={() => void session.loadCameras()}>{t("Refresh")}</button>
          </div>
        </section>
      {:else if section === "audio"}
        <AudioSettings />
        <p class="section-label">{t("Timer sounds")}</p>
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Beep as countdowns run out")}</strong><span>{t("On this computer only, never on the audience screen. If this computer's sound goes to the speakers in the room, keep it low or turn it off.")}</span></div>
            <input type="checkbox" class="switch" role="switch" aria-label={t("Timer sounds")} checked={session.workspace.timerSounds.on} onchange={(event) => session.setTimerSounds({ on: event.currentTarget.checked })} />
          </div>
          {#if session.workspace.timerSounds.on}
            <div class="row">
              <div class="row-copy"><strong>{t("Warn when this much is left")}</strong><span>{t("A double beep at each mark.")}</span></div>
              <div class="row-end">
                {#each WARN_CHOICES as minutes (minutes)}
                  <label class="check"><input type="checkbox" checked={session.workspace.timerSounds.warnAt.includes(minutes)} onchange={(event) => session.setTimerSounds({ warnAt: event.currentTarget.checked ? [...session.workspace.timerSounds.warnAt, minutes] : session.workspace.timerSounds.warnAt.filter((entry) => entry !== minutes) })} /> {t("{n} min", { n: minutes })}</label>
                {/each}
              </div>
            </div>
            <div class="row">
              <div class="row-copy"><strong>{t("Count the last 10 seconds")}</strong><span>{t("A soft tick each second, then a chime at 00:00:00.")}</span></div>
              <input type="checkbox" class="switch" role="switch" aria-label={t("Count the last 10 seconds")} checked={session.workspace.timerSounds.ticks} onchange={(event) => session.setTimerSounds({ ticks: event.currentTarget.checked })} />
            </div>
            <div class="row">
              <div class="row-copy"><strong>{t("Volume")}</strong><span>{t("Try each sound.")}</span></div>
              <div class="row-end">
                <input type="range" min="0.05" max="1" step="0.05" aria-label={t("Timer sound volume")} value={session.workspace.timerSounds.volume} oninput={(event) => session.setTimerSounds({ volume: Number(event.currentTarget.value) })} />
                <button type="button" class="btn" onclick={() => session.testTimerSound("warn")}>{t("Warning")}</button>
                <button type="button" class="btn" onclick={() => session.testTimerSound("tick")}>{t("Tick")}</button>
                <button type="button" class="btn" onclick={() => session.testTimerSound("end")}>{t("End")}</button>
              </div>
            </div>
          {/if}
        </section>
        <p class="section-label">{t("Verse detection")}</p>
        <section class="rows">
          <div class="row">
            <div class="row-copy">
              <strong>{canUse("voice-detect") ? t("Listen for scripture") : t("Not in this release")}</strong>
              <span>{canUse("voice-detect") ? t("Press Listen on the Scriptures desk. A match goes to Preview only; LIVE still sends Program. Recognition stays on this computer.") : t("Audio recognition is not connected. Nothing here starts a microphone.")}</span>
            </div>
            <span class="pill" class:ok={canUse("voice-detect")} class:muted={!canUse("voice-detect")}>{canUse("voice-detect") ? t("On") : t("Off")}</span>
          </div>
          {#if canUse("voice-detect") && isDesktop()}
            <div class="row">
              <div class="row-copy"><strong>{t("Microphone permission")}</strong><span>{audioNote || t("If macOS refused the mic, turn Church Studio on under Microphone and Speech Recognition.")}</span></div>
              <div class="row-end">
                <button type="button" class="btn primary" onclick={() => void allowMicrophone()}>{t("Allow")}</button>
                <button type="button" class="btn" onclick={() => void openPrivacySettings()}>{t("Privacy settings")}</button>
              </div>
            </div>
          {/if}
        </section>
        {#if canUse("voice-detect")}<VoiceWords />{/if}
      {:else if section === "performance"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{t("Desk size")}</strong><span>{t("Spacing and type size for the operator window. The audience window draws Program only.")}</span></div>
            <button type="button" class="link" onclick={() => (section = "appearance")}>{t("Open Appearance")}</button>
          </div>
        </section>
      {:else if section === "updates"}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>Church Studio {APP_VERSION}</strong><span>{t("The copy you launched is the one that is running.")}</span></div>
            <span class="pill">{t("Current")}</span>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Updates")}</strong><span>{updateNote || (isDesktop() ? t("New versions are signed by Church Studio; only those install. Your library stays as it is.") : t("The browser version is always the latest."))}</span></div>
            <div class="row-end">
              {#if updateReady}
                <button type="button" class="btn primary" disabled={updateBusy} onclick={() => void installUpdate()}>{updateBusy ? t("Installing…") : t("Install {updateReady} and restart", { updateReady })}</button>
              {:else}
                <button type="button" class="btn" disabled={!isDesktop() || updateBusy} onclick={() => void checkUpdate()}>{updateBusy ? t("Checking…") : t("Check for updates")}</button>
              {/if}
            </div>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("First-run setup")}</strong><span>{t("Walk through church name, look, scripture and voice again.")}</span></div>
            <button type="button" class="btn" onclick={() => session.restartOnboarding()}>{t("Run setup again")}</button>
          </div>
        </section>
        <p class="section-label">{t("Problem reports")}</p>
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"} noted on this computer` : t("No problems noted")}</strong><span>{t("If something went wrong, save a report and send it to Church Studio support. It holds the errors and a few counts, never your songs, sermons or notes. Nothing is sent by itself.")}</span></div>
            <div class="row-end">
              <button type="button" class="btn" onclick={() => void saveProblemReport()}><Icon name="download" size={14} /> {t("Save report")}</button>
              {#if problems.length}<button type="button" class="btn" onclick={() => { clearProblems(); problems = []; }}>{t("Clear")}</button>{/if}
            </div>
          </div>
        </section>
        <p class="section-label">{t("Legal")}</p>
        <section class="rows">
          {#each [["terms", msg("Terms of Service")], ["privacy", msg("Privacy Policy")], ["refunds", msg("Refunds and cancellation")], ["licenses", msg("Open-source licenses")], ["security", msg("Report a security problem")]] as [page, label] (page)}
            <div class="row">
              <div class="row-copy"><strong>{t(label)}</strong></div>
              <button type="button" class="btn" onclick={() => void openExternal(`${SITE_URL}/${page}`)}>{t("Open")}</button>
            </div>
          {/each}
        </section>
        <p class="note stand">{t("Church Studio can send video over NDI®. NDI® is a registered trademark of Vizrt NDI AB.")} <a href="https://ndi.video" target="_blank" rel="noreferrer">ndi.video</a></p>
      {:else if section === "account"}
        {@const current = planById(session.plan)}
        {@const ent = session.workspace.entitlement}
        {@const profile = session.workspace.profile}
        {@const signin = session.accountSignin}
        <section class="rows">
          {#if signin}
            <div class="row stack signin-wait" role="status" aria-live="polite">
              {#if signin.status === "waiting"}
                <div class="row-copy"><strong>{t("Finish signing in in your browser")}</strong><span>{t("When the page asks, tap this number:")}</span></div>
                <div class="signin-number" aria-label={t("Sign-in number {number}", { number: signin.number })}>{signin.number}</div>
                <div class="sign-in">
                  <button type="button" class="btn" onclick={() => session.reopenAccountSignin()}>{t("Open the page again")}</button>
                  <button type="button" class="btn" onclick={() => session.cancelAccountSignin()}>{t("Cancel")}</button>
                </div>
              {:else}
                <div class="row-copy"><strong>{t("Sign in")}</strong><span>{signin.message}</span></div>
                <div class="sign-in">
                  <button type="button" class="btn primary" onclick={async () => { signInError = (await session.startAccountSignin()) ?? ""; }}>{t("Try again")}</button>
                  <button type="button" class="btn" onclick={() => session.cancelAccountSignin()}>{t("Cancel")}</button>
                </div>
              {/if}
            </div>
          {:else if profile}
            <div class="row">
              <div class="row-lead">
                <span class="avatar" style:background={current.color}>{initials(profile.name)}</span>
                <div class="row-copy"><strong class="one-line" title={profile.name}>{profile.name}</strong><span>{profile.token ? t("{email} · your plan follows this account", { email: profile.email }) : t("{email} · signed in on this computer", { email: profile.email })}</span></div>
              </div>
              <div class="row-end">
                <span class="pill" style:background={`color-mix(in srgb, ${current.color} 20%, transparent)`} style:color={current.color}>{current.name}</span>
                {#if profile.token}
                  <button type="button" class="btn" disabled={accountBusy} onclick={async () => { accountBusy = true; signInError = (await session.syncAccount()) ?? ""; accountBusy = false; }}>{t("Check plan")}</button>
                {:else}
                  <button type="button" class="btn primary" onclick={async () => { signInError = (await session.startAccountSignin()) ?? ""; }}>{t("Sign in to your account")}</button>
                {/if}
                <button type="button" class="btn" onclick={() => session.signOut()}>{t("Sign out")}</button>
              </div>
            </div>
            {#if signInError}<p class="form-error" role="alert">{signInError}</p>{/if}
          {:else}
            <div class="row stack">
              <div class="row-copy"><strong>{t("Sign in")}</strong><span>{t("Optional. Your plan follows your account, so another computer only needs you to sign in. Google, Microsoft, Apple or an email link, in your browser.")}</span></div>
              <div class="sign-in">
                <button type="button" class="btn primary" onclick={async () => { signInError = (await session.startAccountSignin()) ?? ""; }}>{t("Sign in with your browser")}</button>
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
                >{t("Development: sign in as a Premium test user")}</button>
              {/if}
            </div>
          {/if}
        </section>

        <section class="plan-hero" style:--plan={current.color}>
          <span class="plan-badge"><Icon name="key" size={20} /></span>
          <div class="head-copy">
            <p class="eyebrow">{t("Your plan")}</p>
            <h3>
              {current.name}
              {#if session.trialDays > 0 && ent.plan === "free"}<span class="pill">{tn(session.trialDays, "Trial · {n} day left", "Trial · {n} days left")}</span>
              {:else if ent.source === "promo" && session.plan !== "free"}<span class="pill">{t("Test code {code}", { code: ent.code })}</span>
              {:else if ent.source === "license" && session.plan !== "free"}<span class="pill">{ent.expiresAt ? t("Until {date}", { date: new Date(ent.expiresAt).toLocaleDateString() }) : t("No end date")}</span>{/if}
            </h3>
            <p>{ent.source === "license" && ent.holder && session.plan !== "free" ? t("Licensed to {holder}.", { holder: ent.holder }) : current.tagline}</p>
          </div>
          <div class="hero-actions">
            {#if session.plan === "free" && !session.trialUsed}
              <button type="button" class="btn primary" disabled={trialBusy} onclick={async () => { trialBusy = true; trialError = (await session.startTrial()) ?? ""; trialBusy = false; }}>{t("Try Premium free · {TRIAL_DAYS} days", { TRIAL_DAYS })}</button>
            {/if}
            <button type="button" class="btn" class:primary={session.plan === "free" && session.trialUsed} onclick={() => session.openPlans()}>{session.plan === "church" ? t("See plans") : t("Upgrade")}</button>
            {#if (ent.source === "promo" || ent.source === "license") && session.plan !== "free"}
              <button type="button" class="btn" onclick={() => void session.useFreePlan()}>{ent.source === "license" ? t("Remove license") : t("Return to Free")}</button>
            {/if}
          </div>
        </section>
        {#if trialError}<p class="note stand form-error">{trialError}</p>{/if}
        {#if session.ent.reason === "clock"}
          <p class="note stand form-error">{t("This computer's clock is set earlier than it was. Set the date and time correctly; paid features are paused until then.")}</p>
        {:else if session.ent.reason === "renew" && session.workspace.entitlement.source === "license"}
          <p class="note stand form-error">{t("This computer has been offline too long. Connect to the internet once to keep your plan.")}</p>
        {/if}
        {#if session.trialUsed && session.trialDays === 0 && session.plan === "free"}
          <p class="note stand">{t("Your Premium trial on this computer has ended. Everything you made stays; Premium features are paused.")}</p>
        {/if}
        {#if session.plan !== "free"}
          <section class="rows">
            <div class="row">
              <div class="row-copy">
                <strong>{session.entitled("priority-support") ? t("Priority support") : t("Support")}</strong>
                <span>{supportNote || (session.entitled("priority-support") ? t("Your plan is answered first. The email opens with your plan, and the problem report is copied to paste in.") : t("The email opens with your plan, and the problem report is copied to paste in."))}</span>
              </div>
              <button type="button" class="btn" onclick={() => void contactSupport()}>{t("Contact support")}</button>
            </div>
          </section>
        {/if}
        {#if ent.source === "license" && session.activation.status !== "off"}
          {@const act = session.activation}
          <p class="section-label">{t("Computers on this license")}</p>
          <section class="rows">
            {#if act.status === "full"}
              <div class="row"><div class="row-copy"><strong class="form-error">{t("This license is in use on {n} of {n} computers", { n: act.seats })}</strong><span>{act.message || t("Release one below (a computer no longer used, or the old one), then check again. Until then this computer runs on Free.")}</span></div><button type="button" class="btn primary" onclick={() => void session.checkActivation(true)}>{t("Check again")}</button></div>
            {:else if act.status === "offline" || act.status === "error"}
              <div class="row"><div class="row-copy"><strong>{act.status === "offline" ? t("The license server could not be reached") : t("The license server said no")}</strong><span>{act.status === "offline" ? (session.ent.renewBy ? t("No problem for now: this computer keeps its plan offline until {date}.", { date: new Date(session.ent.renewBy).toLocaleDateString() }) : t("Connect to the internet once to start using the key.")) : act.message}</span></div><button type="button" class="btn" onclick={() => void session.checkActivation(true)}>{t("Check again")}</button></div>
            {:else if act.status === "ok"}
              <div class="row"><div class="row-copy"><strong>{t("{used} of {seats} in use", { used: act.devices.length, seats: act.seats })}</strong><span>{t("A computer not used for 60 days frees its place by itself.")}</span></div></div>
            {:else}
              <div class="row"><div class="row-copy"><span>{t("Checking…")}</span></div></div>
            {/if}
            {#each act.devices as device (device.device)}
              <div class="row">
                <div class="row-lead"><span class="row-icon"><Icon name="laptop" size={16} /></span><div class="row-copy"><strong>{device.name}{device.you || device.device === session.deviceId ? ` · ${t("this computer")}` : ""}</strong><span>{t("Last seen {date}", { date: new Date(device.seenAt).toLocaleDateString() })}</span></div></div>
                <button type="button" class="btn" onclick={() => void session.releaseDevice(device.device)}>{t("Release")}</button>
              </div>
            {/each}
          </section>
        {/if}

        <button type="button" class="upsell" onclick={() => session.openPlans()}>
          <span class="upsell-copy">
            <strong>{t("Plans and pricing")}</strong>
            <span>{t("Compare Free, Premium and Church, start a trial, use a promo code or buy.")}</span>
          </span>
          <span class="upsell-plans" aria-hidden="true">{#each PLANS as plan (plan.id)}<i style:background={plan.color}></i>{/each}</span>
          <Icon name="chevron-right" size={16} />
        </button>

        <p class="section-label">{t("License key")}</p>
        <section class="rows">
          <form
            class="row"
            onsubmit={async (event) => {
              event.preventDefault();
              codeBusy = true;
              codeError = (await session.redeemCode(code)) ?? "";
              codeBusy = false;
              if (!codeError) code = "";
            }}
          >
            <div class="row-copy"><strong>{t("Add a license key")}</strong><span class:form-error={!!codeError}>{codeError || t("Paste the key from your purchase email (it starts with CS1). The first time needs the internet; after that it works offline.")}</span></div>
            <div class="row-end">
              <input class="field license-field" aria-label={t("License key")} placeholder={t("CS1-…")} autocapitalize="characters" autocomplete="off" spellcheck="false" bind:value={code} />
              <button type="submit" class="btn primary" disabled={!code.trim() || codeBusy}>{codeBusy ? t("Checking…") : t("Add key")}</button>
            </div>
          </form>
        </section>

        <p class="section-label">{t("Privacy")}</p>
        <section class="rows">
          <label class="row">
            <div class="row-copy"><strong>{t("Share anonymous usage and error reports")}</strong><span>{t("Once a day: the app version, the computer's system and your plan. When something goes wrong: the error and where in the app it happened. No names, songs or sermons. It helps us fix problems quickly.")}</span></div>
            <input type="checkbox" class="switch" role="switch" aria-label={t("Share anonymous usage and error reports")} checked={session.workspace.shareUsage !== false} onchange={(event) => session.setShareUsage(event.currentTarget.checked)} />
          </label>
        </section>
      {:else}
        <section class="rows">
          <div class="row">
            <div class="row-copy"><strong>{planById(session.plan).name}</strong><span>{session.trialDays > 0 ? `Premium trial on this computer · ${session.trialDays} day${session.trialDays === 1 ? "" : "s"} left.` : session.plan === "free" ? t("Free forever. Presentation, the library and audience output run offline.") : t("Licensed on this computer.")}</span></div>
            <span class="pill" class:ok={session.plan !== "free"} class:muted={session.plan === "free"}>{session.plan === "free" ? t("Free") : t("Active")}</span>
          </div>
          <div class="row">
            <div class="row-copy"><strong>{t("Plans and features")}</strong><span>{t("See what each plan includes.")}</span></div>
            <button type="button" class="btn" onclick={() => (section = "account")}>{t("Compare plans")}</button>
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
    width: min(1100px, calc(100% - 32px));
    height: min(780px, calc(100% - 32px));
    display: grid;
    grid-template-columns: 264px minmax(0, 1fr);
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
    padding: 20px 14px 10px;
    border-right: 1px solid var(--line);
    background: color-mix(in srgb, var(--desk) 70%, var(--panel));
  }
  .account-card {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin: 0 0 12px;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    color: var(--ink);
    font: inherit;
    text-align: left;
    flex: none;
  }
  .account-card:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); }
  .account-card.active { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .account-card > :global(svg) { color: var(--muted); flex: none; }
  .set-brand-mark.app-tile { background: #111010; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); }
  .set-brand-mark { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; color: #fff; flex: none; box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.2); }
  .account-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .account-copy strong { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .account-copy span { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    margin: 0 0 8px;
    padding: 0 11px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--panel) 60%, transparent);
    color: var(--muted);
    flex-direction: row;
  }
  .nav-search:focus-within { border-color: var(--accent); color: var(--ink); }
  .nav-search input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; color: var(--ink); font: inherit; font-size: 13px; outline: none; }
  .nav-search input::-webkit-search-cancel-button { display: none; }
  .nav-list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 -6px;
    padding: 6px 6px 18px;
    scrollbar-width: thin;
    /* Fades at both ends say the list goes on. */
    mask-image: linear-gradient(to bottom, transparent 0, #000 10px, #000 calc(100% - 22px), transparent 100%);
  }
  /* The list scrolls; rows keep their height instead of being squeezed. */
  .nav-list > * { flex: none; }
  .nav-group { margin: 18px 10px 6px; font-size: 11px; font-weight: 650; letter-spacing: 0.02em; color: color-mix(in srgb, var(--muted) 85%, transparent); }
  .nav-group:first-child { margin-top: 6px; }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    height: 34px;
    padding: 0 10px 0 7px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: color-mix(in srgb, var(--ink) 88%, var(--muted));
    font: inherit;
    font-size: 13.5px;
    font-weight: 500;
    text-align: left;
    transition: background 120ms;
  }
  .nav-item:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--ink); }
  .nav-item.active { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); }
  .nav-item.active .nav-title { font-weight: 650; }
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
  .tile.big { width: 42px; height: 42px; border-radius: 11px; }
  .nav-empty { margin: 12px 10px; font-size: 12px; color: var(--muted); }

  /* Page */
  .settings-body { min-width: 0; overflow-x: hidden; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 0 36px 44px; }
  /* Pages read best at a steady width on wide windows. */
  .settings-body > :global(*:not(.set-head)) { width: 100%; max-width: 820px; }
  .set-head {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 -36px 6px;
    padding: 22px 36px 18px;
    background: color-mix(in srgb, var(--panel) 92%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .head-copy { flex: 1; min-width: 0; }
  .set-head h2 { margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -0.015em; }
  .set-head p { margin: 3px 0 0; color: var(--muted); font-size: 13px; }
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
  .settings-body :global(.section-label) { margin: 16px 4px -2px; font-size: 12px; font-weight: 650; color: var(--muted); }
  .settings-body :global(.note) { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .settings-body :global(.note.stand) { padding: 0 4px; }
  .settings-body :global(.text), .settings-body :global(.link) { border: 0; background: none; padding: 0; color: var(--accent); font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; width: fit-content; }
  .settings-body :global(.text:hover), .settings-body :global(.link:hover) { text-decoration: underline; }

  /* Rows: label and help on the left, control on the right */
  .settings-body :global(.rows) { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 13px; background: color-mix(in srgb, var(--field) 75%, var(--panel)); overflow: hidden; flex: none; }
  .settings-body :global(.rows.inset) { background: var(--panel); }
  .settings-body :global(.row) { display: flex; flex-direction: row; align-items: center; font-size: inherit; font-weight: inherit; color: inherit; justify-content: space-between; gap: 24px; min-height: 60px; padding: 12px 18px; }
  .settings-body :global(.row + .row) { border-top: 1px solid color-mix(in srgb, var(--line) 75%, transparent); }
  .settings-body :global(.row.stack) { flex-direction: column; align-items: stretch; gap: 10px; }
  .settings-body :global(.row.dim) { opacity: 0.55; }
  .settings-body :global(.row-copy) { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; max-width: 560px; }
  .settings-body :global(.row-copy strong) { font-size: 13.5px; font-weight: 600; color: var(--ink); }
  .settings-body :global(.row-copy span), .settings-body :global(.row-copy small) { font-size: 12.5px; color: var(--muted); line-height: 1.45; overflow-wrap: anywhere; }
  .settings-body :global(.row-icon) { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border-radius: 8px; background: var(--panel); color: var(--muted); }
  .settings-body :global(.row-lead) { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
  .settings-body :global(.row-end) { display: flex; align-items: center; gap: 8px; flex: none; }
  .settings-body :global(.row .row-end .field) { width: 220px; }
  .settings-body :global(.row-end.wrap) { flex-wrap: wrap; justify-content: flex-end; max-width: 60%; }
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
  .settings-body :global(.card) { display: flex; flex-direction: column; gap: 12px; padding: 18px; border: 1px solid var(--line); border-radius: 13px; background: color-mix(in srgb, var(--field) 75%, var(--panel)); flex: none; }
  .settings-body :global(.card h3) { margin: 0; font-size: 13px; font-weight: 650; color: var(--ink); }
  .check { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; }
  .card-note { margin: -4px 0 0; font-size: 12px; color: var(--muted); line-height: 1.45; }
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
  .signin-number { align-self: flex-start; padding: 6px 22px; border: 1px solid var(--line, rgb(255 255 255 / 0.12)); border-radius: 14px; font-size: 40px; font-weight: 800; line-height: 1.2; font-variant-numeric: tabular-nums; letter-spacing: 0.04em; color: var(--accent); }
  .form-error { margin: 0; font-size: 12px; color: var(--live, #e5484d); }
  .contrast-row { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 24px; cursor: pointer; font-size: inherit; font-weight: inherit; color: var(--ink); }
  .contrast-row > span { flex: 1; min-width: 0; }
  .contrast-row h3 { margin: 0 0 4px; }
  .contrast-note { display: block; max-width: 60ch; font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.45; }
  .license-field { width: 280px; letter-spacing: 0.02em; }

  /* Plans */
  .plan-hero { display: flex; align-items: center; gap: 14px; padding: 18px; border: 1px solid color-mix(in srgb, var(--plan) 50%, var(--line)); border-radius: 14px; background: linear-gradient(135deg, color-mix(in srgb, var(--plan) 18%, var(--field)), var(--field) 70%); flex: none; }
  .plan-badge { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border-radius: 12px; background: var(--plan); color: #fff; }
  .plan-hero .eyebrow { margin: 0; font-size: 11px; font-weight: 600; color: var(--muted); }
  .plan-hero h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 20px; font-weight: 700; }
  .plan-hero p { margin: 2px 0 0; font-size: 13px; color: var(--muted); }

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
  /* Segmented choices, for this page and the pages it shows (Production apps, Stream & record…). */
  .settings-body :global(.segment) { display: inline-flex; flex-wrap: wrap; flex: none; gap: 2px; width: fit-content; max-width: 100%; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .settings-body :global(.segment button) { height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .settings-body :global(.segment button:hover:not(.active)) { color: var(--ink); }
  .settings-body :global(.segment button.active) { background: var(--accent); color: var(--on-accent); }
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
  .settings-body :global(.btn.primary), .settings-body :global(.actions button.primary), .settings-body :global(button.primary) { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
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
  .monitor-actions button.on { background: var(--accent); color: var(--on-accent); }

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
    .row { flex-direction: column; align-items: stretch; }
    .row .field { width: 100%; }
  }
  .key-btn { min-width: 64px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .key-btn:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .key-btn.listening { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--field)); }
  .key-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
  .hero-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
  .upsell { display: flex; align-items: center; gap: 14px; width: 100%; margin: 14px 0; padding: 16px 18px; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 14px; background: linear-gradient(120deg, color-mix(in srgb, var(--accent) 12%, var(--panel)), color-mix(in srgb, #7c5cff 10%, var(--panel))); color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: transform 0.15s; }
  .upsell:hover { transform: translateY(-1px); }
  .upsell-copy { flex: 1; display: grid; gap: 2px; }
  .upsell-copy strong { font-size: 14px; }
  .upsell-copy span { font-size: 12px; color: var(--muted); }
  .upsell-plans { display: inline-flex; gap: 4px; }
  .upsell-plans i { width: 10px; height: 10px; border-radius: 50%; }
  .settings-body :global(.one-line) { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
</style>
