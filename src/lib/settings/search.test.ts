import { describe, expect, it } from "vitest";
import { fr } from "../i18n/fr";
import { settingsIndex } from "./index";
import { extractSettings, highlight, normalize, readRecent, rememberRecent, searchSettings, type SettingsPage } from "./search";

const pages: SettingsPage[] = [
  { id: "general", title: "Church", about: "Your church's name, logo text and CCLI license.", keywords: "name logo ccli license copyright", group: "General" },
  { id: "audio", title: "Sound & voice", about: "Microphone, listening and voice commands.", keywords: "microphone voice speech listen detection", group: "Sound" },
  { id: "storage", title: "Storage & backup", about: "Space on this computer.", keywords: "storage space disk size cache", group: "Library" },
  { id: "keyboard", title: "Keyboard", about: "Keys that drive the desk.", keywords: "shortcuts keys hotkeys", group: "General" },
  { id: "appearance", title: "Appearance", about: "Desk, theme, accent color.", keywords: "theme dark light", group: "General" },
];

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};

describe("settings search", () => {
  it("reads rows, cards and section labels from the markup, nested components included", () => {
    const dialog = `
      {#if section === "general"}
        <div class="row-copy"><strong>{t("Church name")}</strong><span>{t("Shown in Settings.")}</span></div>
        <p class="section-label">{t("Copyright")}</p>
        <div class="row-copy"><strong>{t("CCLI license #")}</strong></div>
        <strong>{t("Last backup {date}", { date })}</strong>
      {:else if section === "audio"}
        <AudioSettings />
      {/if}`;
    const audio = `<script>let x = 1;</script><section class="card"><h3>{t("Noise filter")}</h3><p class="card-note">{t("Quiets the fan.")}</p><strong>{t("Strong")}</strong></section>`;
    const entries = extractSettings(dialog, { AudioSettings: audio });
    expect(entries.map((entry) => entry.id)).toEqual(["general:Church name", "general:Copyright", "general:CCLI license #", "audio:Noise filter", "audio:Strong"]);
    expect(entries[0]!.about).toBe("Shown in Settings.");
    expect(entries[2]!.context).toBe("Copyright");
    expect(entries[4]!.context).toBe("Noise filter");
  });

  it("indexes the real Settings, every page and the keyboard commands", () => {
    const ids = new Set(settingsIndex().map((entry) => entry.id));
    for (const id of ["general:Church name", "audio:Clean the microphone before listening", "audio:Which recognizer listens", "storage:Cache", "broadcast:Stream key", "keyboard:Go live"]) expect(ids).toContain(id);
    expect(ids.size).toBeGreaterThan(150);
  });

  it("puts the title match first and finds words in descriptions and synonyms", () => {
    const entries = settingsIndex();
    expect(searchSettings(entries, pages, "church name")[0]!.id).toBe("general:Church name");
    expect(searchSettings(entries, pages, "noise").slice(0, 3).map((hit) => hit.id)).toContain("audio:Clean the microphone before listening");
    expect(searchSettings(entries, pages, "whisper").map((hit) => hit.id)).toContain("audio:Which recognizer listens");
    expect(searchSettings(entries, pages, "keyboard")[0]!.id).toBe("keyboard:");
    // Every word must be found.
    expect(searchSettings(entries, pages, "church zebra")).toEqual([]);
  });

  it("forgives one wrong letter and accents, and searches the desk's language", () => {
    const entries = settingsIndex();
    expect(searchSettings(entries, pages, "microphne").length).toBeGreaterThan(0);
    expect(normalize("Réglages › Écran")).toBe("reglages ecran");
    const french = (text: string) => fr[text] ?? text;
    const name = normalize(french("Church name")).split(" ")[0]!;
    expect(searchSettings(entries, pages, name, french).some((hit) => hit.id === "general:Church name")).toBe(true);
  });

  it("remembers picks and searches, newest first, without repeats", () => {
    const store = memory();
    rememberRecent("general:Church name", "church", store);
    rememberRecent("storage:Cache", "cache", store);
    const recent = rememberRecent("general:Church name", "Church", store);
    expect(recent.picks).toEqual(["general:Church name", "storage:Cache"]);
    expect(recent.queries).toEqual(["Church", "cache"]);
    expect(readRecent(store)).toEqual(recent);
    expect(readRecent({ getItem: () => "{broken", setItem: () => {} })).toEqual({ queries: [], picks: [] });
    expect(readRecent(null)).toEqual({ queries: [], picks: [] });
  });
});

describe("highlight", () => {
  it("marks each word typed, in any case", () => {
    expect(highlight("Church name", "NAME ch")).toEqual([{ text: "Ch", match: true }, { text: "urch ", match: false }, { text: "name", match: true }]);
    expect(highlight("Cache", "")).toEqual([{ text: "Cache", match: false }]);
  });
});
