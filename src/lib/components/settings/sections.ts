// Every Settings page: a coloured icon tile (System Settings style), a one-line description and
// search words. Settings lists them in groups; Go to anything (⌘K) finds them by any of the words.

import { msg } from "../../i18n/core";

export type SettingsSectionId =
  | "ready"
  | "health"
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

export type SettingsEntry = { id: SettingsSectionId; title: string; icon: string; color: string; about: string; keywords: string };
export type SettingsGroup = { label: string; items: SettingsEntry[] };

export const SETTINGS_GROUPS: SettingsGroup[] = [
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
      // One page per question: what the congregation sees, which monitor is which, what the other
      // screens show, and what the people on stage see.
      { id: "audience", title: msg("Main screen"), icon: "cast", color: "#e5484d", about: msg("The congregation's screen: open it, full screen or in a window, its shape, and a test."), keywords: "audience output projector window fullscreen program open test shape aspect 16:9 4:3 16:10 portrait led size resolution" },
      { id: "displays", title: msg("Monitors"), icon: "screens", color: "#0a84ff", about: msg("Which monitor is the desk, and which is the main screen."), keywords: "displays monitor screen profile second assign" },
      { id: "screens", title: msg("More screens"), icon: "screens", color: "#0ea5e9", about: msg("Other monitors and TVs over Wi-Fi, each showing only what you choose: scripture, songs, slides or a timer. And where everything goes."), keywords: "screens monitors multiple outputs timer scripture lyrics songs lock assign wifi wi-fi tv television browser network names" },
      { id: "stage", title: msg("Stage display"), icon: "stage", color: "#ff9f0a", about: msg("A private confidence screen for the people on stage."), keywords: "confidence platform next clock" },
      { id: "themes", title: msg("Themes"), icon: "themes", color: "#c2410c", about: msg("How verses, songs and slides look on the screen."), keywords: "theme background color font animation motion video photo image wash gradient premium library look" },
      { id: "captions", title: msg("Captions"), icon: "captions", color: "#0f9d8a", about: msg("Live captions on the screen and on phones, translated."), keywords: "captions subtitles deaf hard of hearing translate translation language phone qr live words transcript" },
    ],
  },
  {
    label: msg("Going live"),
    items: [
      { id: "ready", title: msg("Readiness check"), icon: "check", color: "#30a46c", about: msg("Check screens, the service, space, backups and more before you start."), keywords: "ready check health sunday before service problems disk space backup screen missing files" },
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
      { id: "storage", title: msg("Storage & backup"), icon: "files", color: "#2f80ed", about: msg("Space on this computer, and export or import the whole library."), keywords: "storage space disk size cache compact unused media export import backup files library" },
    ],
  },
  {
    label: msg("Sound & devices"),
    items: [
      { id: "audio", title: msg("Sound & voice"), icon: "audio", color: "#3e63dd", about: msg("Sound output, microphone, listening and voice commands."), keywords: "sound output speakers usb interface hdmi mixer microphone voice speech listen detection" },
      { id: "remote", title: msg("Phone remote"), icon: "phone", color: "#30a46c", about: msg("Pair a phone as a controller. It is never a display."), keywords: "phone tablet pair qr lan" },
    ],
  },
  {
    label: msg("Connected services"),
    items: [
      { id: "planning", title: msg("Planning Center"), icon: "list", color: "#2266e3", about: msg("Bring upcoming plans in as services."), keywords: "planning center pco services plan import" },
      { id: "ai", title: msg("AI assistant"), icon: "sparkles", color: "#7c3aed", about: msg("Claude, ChatGPT, Gemini or an AI on this computer, for sermons, slides, songs and captions."), keywords: "ai llm claude anthropic openai chatgpt gpt gemini google ollama lm studio local key model summary sermon notes slides captions translate song songs hymn songselect suggest" },
    ],
  },
  {
    label: msg("About"),
    items: [
      { id: "health", title: msg("Performance"), icon: "speed", color: "#30a46c", about: msg("How quickly Church Studio opens and runs here, with tips."), keywords: "performance health speed slow freeze stutter memory startup smooth frames lag hang" },
      { id: "system", title: msg("This computer"), icon: "laptop", color: "#8e8e93", about: msg("What works in this window, and why some things do not."), keywords: "capabilities browser desktop features" },
      { id: "updates", title: msg("Updates"), icon: "refresh", color: "#0a84ff", about: msg("Which version is running."), keywords: "version update release" },
    ],
  },
];
