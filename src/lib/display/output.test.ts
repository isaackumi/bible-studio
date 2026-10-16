import { describe, expect, it } from "vitest";
import { createLiveState, frame, programPacket, setPreview } from "../domain/live";
import { defaultTheme, emptyModel } from "../domain/theme";
import { presentScripture } from "../domain/present";
import { acceptAudienceFrame, browserAudienceState, openBrowserAudience, pickAudienceScreen, pickStageDisplay, pickStageScreen, placementFeatures, type BrowserOutputWindow, type ScreenLike } from "./output";
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

describe("browser audience placement", () => {
  const laptop: ScreenLike = { label: "Built-in Retina Display", left: 0, top: 0, width: 1512, height: 982, availLeft: 0, availTop: 25, availWidth: 1512, availHeight: 957, isPrimary: true, isInternal: true };
  const projector: ScreenLike = { label: "EPSON PJ", left: 1512, top: 0, width: 1920, height: 1080, availLeft: 1512, availTop: 0, availWidth: 1920, availHeight: 1080, isPrimary: false, isInternal: false };
  const tv: ScreenLike = { label: "Lobby TV", left: -1280, top: 0, width: 1280, height: 720, availLeft: -1280, availTop: 0, availWidth: 1280, availHeight: 720, isPrimary: false, isInternal: false };

  it("picks a screen other than the operator's, preferring the largest external one", () => {
    expect(pickAudienceScreen([laptop, projector], laptop)).toBe(projector);
    expect(pickAudienceScreen([laptop, tv, projector], laptop)).toBe(projector);
    expect(pickAudienceScreen([laptop, projector], projector)).toBe(laptop);
  });

  it("returns null with a single screen, so the operator drags the window as before", () => {
    expect(pickAudienceScreen([laptop], laptop)).toBeNull();
    expect(pickAudienceScreen([], null)).toBeNull();
  });

  it("opens the popup over the chosen screen's usable area", () => {
    expect(placementFeatures(projector)).toBe("popup=yes,left=1512,top=0,width=1920,height=1080");
    expect(placementFeatures(tv)).toBe("popup=yes,left=-1280,top=0,width=1280,height=720");
  });

  it("names the screen in the open message when placed", () => {
    const opened = openBrowserAudience(() => ({ closed: false, close() {}, focus() {}, postMessage() {} }), { features: placementFeatures(projector), label: "EPSON PJ" });
    expect(opened.state.message).toContain("EPSON PJ");
    expect(opened.state.online).toBe(true);
  });

  it("puts the stage on a third screen, never over the audience or the desk", () => {
    expect(pickStageScreen([laptop, projector, tv], laptop, projector)).toBe(tv);
    expect(pickStageScreen([laptop, projector], laptop, projector)).toBeNull();
    expect(pickStageScreen([laptop, projector], laptop, null)).toBe(projector);
  });

  it("picks a desktop stage display that is neither primary nor audience", () => {
    const d = (key: string, primary: boolean, audience: boolean) => ({ key, name: key, x: 0, y: 0, width: 1920, height: 1080, primary, audience });
    expect(pickStageDisplay([d("mac", true, false), d("dell", false, true), d("tv", false, false)])?.key).toBe("tv");
    expect(pickStageDisplay([d("mac", true, false), d("dell", false, true)])).toBeNull();
  });
});
