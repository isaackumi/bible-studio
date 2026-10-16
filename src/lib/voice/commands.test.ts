import { describe, expect, it } from "vitest";
import { parseVoiceCommand } from "./commands";

describe("voice commands", () => {
  it("ignores speech without the wake word, so sermon words never act", () => {
    expect(parseVoiceCommand("take this to heart")).toBeNull();
    expect(parseVoiceCommand("next we read from john")).toBeNull();
    expect(parseVoiceCommand("clear")).toBeNull();
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
