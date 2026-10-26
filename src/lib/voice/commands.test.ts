import { describe, expect, it } from "vitest";
import { parseVoiceCommand, sanitizeVoiceSettings, type CustomVoiceCommand } from "./commands";

describe("voice commands", () => {
  it("with the wake word required, ignores speech without it", () => {
    expect(parseVoiceCommand("take this to heart", { wake: true })).toBeNull();
    expect(parseVoiceCommand("next we read from john", { wake: true })).toBeNull();
    expect(parseVoiceCommand("clear", { wake: true })).toBeNull();
    expect(parseVoiceCommand("studio next", { wake: true })).toMatchObject({ id: "next" });
  });

  it("maps navigation to Preview-only commands", () => {
    expect(parseVoiceCommand("Studio next")).toMatchObject({ kind: "command", id: "next", live: false });
    expect(parseVoiceCommand("studio, next slide")).toMatchObject({ kind: "command", id: "next", live: false });
    expect(parseVoiceCommand("Church Studio go back")).toMatchObject({ kind: "command", id: "previous", live: false });
    expect(parseVoiceCommand("studio previous verse")).toMatchObject({ kind: "command", id: "previous", live: false });
  });

  it("marks Program-changing commands as live", () => {
    expect(parseVoiceCommand("studio take")).toMatchObject({ kind: "command", id: "take", live: true });
    expect(parseVoiceCommand("studio go live")).toMatchObject({ kind: "command", id: "take", live: true });
    expect(parseVoiceCommand("studio cut")).toMatchObject({ kind: "command", id: "cut", live: true });
    expect(parseVoiceCommand("studio clear the screen")).toMatchObject({ kind: "command", id: "clear", live: true });
    expect(parseVoiceCommand("studio black screen")).toMatchObject({ kind: "command", id: "black", live: true });
    expect(parseVoiceCommand("studio show logo")).toMatchObject({ kind: "command", id: "logo", live: true });
    expect(parseVoiceCommand("studio pause the timer")).toMatchObject({ kind: "command", id: "timer-pause", live: true });
    expect(parseVoiceCommand("studio start timer")).toMatchObject({ kind: "command", id: "timer-resume", live: true });
    expect(parseVoiceCommand("studio reset the countdown")).toMatchObject({ kind: "command", id: "timer-reset", live: true });
  });

  it("opens libraries and searches without touching Program", () => {
    expect(parseVoiceCommand("studio open scripture")).toEqual({ kind: "library", tab: "bible", live: false, phrase: "open scripture" });
    expect(parseVoiceCommand("studio open the bible")).toMatchObject({ kind: "library", tab: "bible" });
    expect(parseVoiceCommand("studio open songs")).toMatchObject({ kind: "library", tab: "songs" });
    expect(parseVoiceCommand("studio search scripture love one another")).toMatchObject({ kind: "search", scope: "scripture", query: "love one another", live: false });
    expect(parseVoiceCommand("studio search song amazing grace")).toMatchObject({ kind: "search", scope: "songs", query: "amazing grace" });
    expect(parseVoiceCommand("studio find song how great")).toMatchObject({ kind: "search", scope: "songs", query: "how great" });
  });

  it("shows a spoken reference on Preview", () => {
    expect(parseVoiceCommand("studio show john 3 verse 16")).toMatchObject({ kind: "reference", query: "john 3:16", live: false });
    expect(parseVoiceCommand("studio show john chapter 3 verse 16")).toMatchObject({ kind: "reference", query: "john 3:16" });
    expect(parseVoiceCommand("studio show romans 8 28")).toMatchObject({ kind: "reference", query: "romans 8 28" });
  });

  it("does not guess at unknown phrases", () => {
    expect(parseVoiceCommand("studio make coffee")).toBeNull();
    expect(parseVoiceCommand("studio")).toBeNull();
    expect(parseVoiceCommand("studio search scripture")).toBeNull();
  });
});

describe("voice settings storage", () => {
  it("keeps valid custom phrases only", () => {
    expect(
      sanitizeVoiceSettings({ wake: false, custom: [{ phrase: " Lights Out ", action: "black" }, { phrase: "lights out", action: "next" }, { phrase: "x", action: "format" }, { phrase: "", action: "next" }] }),
    ).toEqual({ commands: true, wake: false, wakeChosen: false, custom: [{ phrase: "lights out", action: "black" }], noiseFilter: "off", engine: "system", speechKeys: {}, words: [] });
    expect(sanitizeVoiceSettings(undefined)).toEqual({ commands: true, wake: false, wakeChosen: false, custom: [], noiseFilter: "off", engine: "system", speechKeys: {}, words: [] });
    // The church's misheard words: cleaned, one per heard phrase.
    expect(sanitizeVoiceSettings({ words: [{ heard: " Efficient ", means: "Ephesians", source: "learned", uses: 2 }, { heard: "efficient", means: "Esther" }, { heard: "", means: "x" }, "junk"] }).words).toEqual([
      { heard: "efficient", means: "Ephesians", source: "learned", uses: 2 },
    ]);
    expect(sanitizeVoiceSettings({ noiseFilter: "strong" }).noiseFilter).toBe("strong");
    expect(sanitizeVoiceSettings({ noiseFilter: "max" }).noiseFilter).toBe("off");
    // Older saves had the wake word on by default; it stays on only when the operator chose it.
    expect(sanitizeVoiceSettings({ wake: true }).wake).toBe(false);
    expect(sanitizeVoiceSettings({ wake: true, wakeChosen: true }).wake).toBe(true);
  });
});

describe("voice settings: translations, custom phrases, wake word", () => {
  const translations = [
    { id: "kjv", abbreviation: "KJV", name: "King James Version" },
    { id: "web", abbreviation: "WEB", name: "World English Bible" },
    { id: "bbe", abbreviation: "BBE", name: "Bible in Basic English" },
  ];

  it("switches translation by abbreviation or name", () => {
    expect(parseVoiceCommand("studio use King James", { translations })).toMatchObject({ kind: "translation", id: "kjv", live: false });
    expect(parseVoiceCommand("studio give me WEB", { translations })).toMatchObject({ kind: "translation", id: "web" });
    expect(parseVoiceCommand("studio switch to the basic english bible", { translations })).toMatchObject({ kind: "translation", id: "bbe" });
    expect(parseVoiceCommand("studio switch to NIV", { translations })).toBeNull();
  });

  it("runs custom phrases, keeping live actions marked live", () => {
    const custom: CustomVoiceCommand[] = [
      { phrase: "next slide please", action: "next" },
      { phrase: "lights out", action: "black" },
      { phrase: "show the songs", action: "open-songs" },
    ];
    expect(parseVoiceCommand("Studio, next slide please", { custom })).toMatchObject({ kind: "command", id: "next", live: false });
    expect(parseVoiceCommand("studio lights out", { custom })).toMatchObject({ kind: "command", id: "black", live: true });
    expect(parseVoiceCommand("studio show the songs", { custom })).toMatchObject({ kind: "library", tab: "songs" });
  });

  it("can work without the wake word, but only for a whole command", () => {
    expect(parseVoiceCommand("next", { wake: false })).toMatchObject({ kind: "command", id: "next" });
    expect(parseVoiceCommand("next we read from john", { wake: false })).toBeNull();
    expect(parseVoiceCommand("take this to heart", { wake: false })).toBeNull();
    expect(parseVoiceCommand("studio next", { wake: false })).toMatchObject({ id: "next" });
    expect(parseVoiceCommand("show me 3 things", { wake: false })).toBeNull();
    // Song search names what it wants, so it works without the wake word.
    expect(parseVoiceCommand("search song amazing grace", { wake: false })).toMatchObject({ kind: "search", scope: "songs" });
  });
});

describe("plain-language commands (no wake word)", () => {
  const translations = [
    { id: "kjv", abbreviation: "KJV", name: "King James Version" },
    { id: "asv", abbreviation: "ASV", name: "American Standard Version" },
    { id: "web", abbreviation: "WEB", name: "World English Bible" },
    { id: "bbe", abbreviation: "BBE", name: "Bible in Basic English" },
  ];
  const say = (text: string) => parseVoiceCommand(text, { translations });

  it("moves through verses the way people say it", () => {
    for (const text of ["next", "Next verse.", "go to the next verse", "go to next verse", "okay, next verse please", "move on", "the next one", "can you go to the next slide", "let's go to the next verse"]) {
      expect(say(text), text).toMatchObject({ kind: "command", id: "next", live: false });
    }
    for (const text of ["previous", "go back", "Go back please", "previous verse", "the verse before", "back one", "go back to the previous verse", "last verse"]) {
      expect(say(text), text).toMatchObject({ kind: "command", id: "previous", live: false });
    }
  });

  it("switches translation by nickname, abbreviation or name", () => {
    expect(say("give me king james")).toMatchObject({ kind: "translation", id: "kjv" });
    expect(say("give me KJV")).toMatchObject({ kind: "translation", id: "kjv" });
    expect(say("give me the king james version please")).toMatchObject({ kind: "translation", id: "kjv" });
    expect(say("King James")).toMatchObject({ kind: "translation", id: "kjv" });
    expect(say("read it in the American Standard")).toMatchObject({ kind: "translation", id: "asv" });
    expect(say("switch to WEB")).toMatchObject({ kind: "translation", id: "web" });
    expect(say("basic english")).toMatchObject({ kind: "translation", id: "bbe" });
  });

  it("finds a passage or a song when asked plainly", () => {
    expect(say("turn to John 3 verse 16")).toMatchObject({ kind: "reference", query: "john 3:16" });
    expect(say("let's turn to Romans chapter 8")).toMatchObject({ kind: "reference", query: "romans 8" });
    expect(say("find the song amazing grace")).toMatchObject({ kind: "search", scope: "songs", query: "amazing grace" });
    expect(say("open songs")).toMatchObject({ kind: "library", tab: "songs" });
  });

  it("keeps Program changes marked live", () => {
    expect(say("go live")).toMatchObject({ id: "take", live: true });
    expect(say("take it down")).toMatchObject({ id: "clear", live: true });
    expect(say("black screen")).toMatchObject({ id: "black", live: true });
  });

  it("never acts on sermon sentences", () => {
    for (const text of [
      "take this to heart",
      "next we read from john",
      "and the next verse says this",
      "let us go back to the beginning of creation",
      "show me 3 things",
      "the king james translators were careful",
      "songs of praise fill this house",
      "we will clear the air today",
    ]) {
      expect(say(text), text).toBeNull();
    }
  });

  it("points at a part of the screen only after the wake word", () => {
    expect(parseVoiceCommand("Studio, where is the projector?")).toMatchObject({ kind: "where", query: "the projector" });
    expect(parseVoiceCommand("studio where do I find the songs")).toMatchObject({ kind: "where", query: "the songs" });
    expect(parseVoiceCommand("where is God when we suffer")).toBeNull();
  });
});
