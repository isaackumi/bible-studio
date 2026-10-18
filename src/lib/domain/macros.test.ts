import { describe, expect, it } from "vitest";
import { defaultMacros, describeStep, sanitizeMacros } from "./macros";

describe("macros", () => {
  it("starts with samples a church can edit", () => {
    const [start] = defaultMacros();
    expect(start?.name).toBe("Start the service");
    expect(start?.steps.map((step) => describeStep(step, { playlist: () => "Walk-in music" }))).toEqual([
      "Fade the music out (4 s)",
      "Begin the first part",
      "First item of the part, on the screen",
    ]);
  });

  it("reads back only steps it knows, within limits", () => {
    const [macro] = sanitizeMacros([
      {
        id: "m",
        name: "  Welcome  ",
        steps: [{ kind: "wait", seconds: 300 }, { kind: "launch-rocket" }, { kind: "program", action: "black" }, { kind: "play-playlist" }, { kind: "stage-message", text: "x".repeat(200) }],
      },
    ]);
    expect(macro?.name).toBe("Welcome");
    expect(macro?.steps).toEqual([{ kind: "wait", seconds: 60 }, { kind: "program", action: "black" }, { kind: "stage-message", text: "x".repeat(140) }]);
    expect(sanitizeMacros(null)[0]?.id).toBe("start-service");
  });
});
