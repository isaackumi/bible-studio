import { describe, expect, it } from "vitest";
import { createLiveState, frame, programPacket, setPreview } from "../domain/live";
import { defaultTheme, emptyModel } from "../domain/theme";
import { presentScripture } from "../domain/present";
import { acceptAudienceFrame, browserAudienceState, openBrowserAudience, type BrowserOutputWindow } from "./output";
import { factoryProfiles, normalizeProfile } from "./profiles";

const theme = defaultTheme();

function packet(revision: number) {
  const state = createLiveState(theme);
  return { ...programPacket({ ...state, revision }, 450), revision };
}

describe("audience frames", () => {
  it("shows Program and ignores a preview that was never published", () => {
    const live = setPreview(
      createLiveState(theme),
      frame(
        presentScripture({ theme, reference: "John 3:16", attribution: "King James Version", verses: [{ verse: 16, text: "For God so loved." }] }),
        "scripture",
        "cut",
      ),
    );
    const published = programPacket(live, 450);
    expect(published.frame.model.layout).toBe("empty");
    expect(published.frame.model.lines).toEqual([]);
    expect(live.preview.model.reference).toBe("John 3:16");
  });

  it("accepts a newer Program frame and ignores a stale one", () => {
    const current = packet(3);
    expect(acceptAudienceFrame(null, current)).toBe(true);
    expect(acceptAudienceFrame(current, packet(2))).toBe(false);
    expect(acceptAudienceFrame(current, packet(4))).toBe(true);
    expect(acceptAudienceFrame(current, packet(0))).toBe(true);
    expect(acceptAudienceFrame(current, null)).toBe(false);
  });

  it("keeps an empty Program empty instead of inventing a slide", () => {
    const empty = programPacket(createLiveState(theme), 0);
    expect(empty.frame.model).toEqual(emptyModel(theme));
    expect(acceptAudienceFrame(null, empty)).toBe(true);
  });
});

describe("browser audience window", () => {
  it("reports a blocked pop-up without a window", () => {
    const result = openBrowserAudience(() => null);
    expect(result.window).toBeNull();
    expect(result.state.online).toBe(false);
    expect(result.state.message).toMatch(/blocked/i);
  });

  it("asks the operator to move an opened window", () => {
    const opened: BrowserOutputWindow = { closed: false, close: () => {}, focus: () => {}, postMessage: () => {} };
    const result = openBrowserAudience(() => opened);
    expect(result.state.online).toBe(true);
    expect(result.state.message).toMatch(/cannot move/i);
  });

  it("notices when the audience window has been closed", () => {
    const closed: BrowserOutputWindow = { closed: true, close: () => {}, focus: () => {}, postMessage: () => {} };
    expect(browserAudienceState(true, closed).message).toMatch(/closed/i);
    expect(browserAudienceState(false, closed).online).toBe(false);
  });
});

describe("saved display configuration", () => {
  it("keeps an older profile closed until the operator opens output", () => {
    const saved = normalizeProfile({
      id: "profile-this-computer",
      name: "This computer",
      builtin: true,
      assignments: { operator: null, audience: "gone|1x1|1.00", stage: null },
    });
    expect(saved?.outputEnabled).toBe(false);
    expect(saved?.outputMode).toBe("window");
    expect(saved?.assignments.audience).toBe("gone|1x1|1.00");
    expect(factoryProfiles()[0].outputEnabled).toBe(false);
  });
});
