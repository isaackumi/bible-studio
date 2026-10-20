import { describe, expect, it } from "vitest";
import { messageTone } from "./status-line";

describe("desk status line", () => {
  it("leaves out the main buttons' own confirmations", () => {
    expect(messageTone("Live.")).toBeNull();
    expect(messageTone("Program cleared.")).toBeNull();
    expect(messageTone("")).toBeNull();
  });

  it("shows problems as warnings", () => {
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
