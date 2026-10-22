import { describe, expect, it } from "vitest";
import { fr } from "../i18n/fr";
import { messageTone } from "./status-line";

describe("desk status line", () => {
  it("leaves out the main buttons' own confirmations", () => {
    expect(messageTone("Live.")).toBeNull();
    expect(messageTone("Program cleared.")).toBeNull();
    expect(messageTone("")).toBeNull();
    expect(messageTone(fr["Program cleared"], "quiet")).toBeNull();
  });

  it("follows the tone the desk gave, in any language", () => {
    expect(messageTone(fr["Displays could not be listed."], "warn")).toBe("warn");
    expect(messageTone(fr["{name} added to favorites."], "info")).toBe("info");
    expect(messageTone("Nothing on Preview yet.", "info")).toBe("info");
    expect(messageTone("", "warn")).toBeNull();
  });

  it("guesses from English wording when no tone was given", () => {
    expect(messageTone("Nothing on Preview yet. Pick a verse, song or slide.")).toBe("warn");
    expect(messageTone("John 99:1 could not be found in this translation.")).toBe("warn");
    expect(messageTone("This window is not sending to the audience.")).toBe("warn");
    expect(messageTone("Add a section first.")).toBe("warn");
    expect(messageTone("That song is no longer available.")).toBe("warn");
  });

  it("shows everything else as information", () => {
    expect(messageTone("Grace saved.")).toBe("info");
    expect(messageTone("John 3:16 is on Preview. LIVE still sends Program.")).toBe("info");
    expect(messageTone("Queue cleared.")).toBe("info");
  });
});
