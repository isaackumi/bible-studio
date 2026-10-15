import { describe, expect, it } from "vitest";
import { applyProgramAction, createLiveState } from "./live";
import { defaultTheme } from "./theme";
import {
  createTimer,
  formatClock,
  pauseTimer,
  presentTimer,
  resetTimer,
  resumeTimer,
  startTimer,
  timerDisplay,
  timerFromPaint,
} from "./timer";
import { previewComposition, presentComposition, instantiateTemplate, COMPOSITION_TEMPLATES, assignLayerSource, sourceRef } from "./composition";

const theme = defaultTheme();

describe("timer source", () => {
  it("counts down, pauses, resumes, resets, and completes", () => {
    let timer = createTimer({ name: "Service", mode: "countdown", durationMs: 10_000, label: "Service starts in" });
    expect(timerDisplay(timer, 0).text).toBe("00:10");
    expect(timerDisplay(timer, 0).complete).toBe(false);
    timer = startTimer(timer, 1_000);
    expect(timerDisplay(timer, 3_000).text).toBe("00:08");
    timer = pauseTimer(timer, 3_000);
    expect(timerDisplay(timer, 9_000).text).toBe("00:08");
    timer = resumeTimer(timer, 9_000);
    expect(timerDisplay(timer, 11_000).text).toBe("00:06");
    timer = resetTimer(timer);
    expect(timerDisplay(timer, 20_000).text).toBe("00:10");
    timer = startTimer(timer, 0);
    expect(timerDisplay(timer, 10_000).complete).toBe(true);
    expect(timerDisplay(timer, 10_000).text).toBe("00:00");
  });

  it("counts up, shows a clock, and warns before a target time", () => {
    const up = startTimer(createTimer({ name: "Up", mode: "countup", durationMs: 5_000 }), 0);
    expect(timerDisplay(up, 2_500).text).toBe("00:02");
    expect(formatClock(new Date("2026-10-15T10:42:31Z").getTime(), true)).toMatch(/10:42:31/);
    const target = startTimer(
      createTimer({ name: "Go", mode: "target", durationMs: 0, targetAt: 60_000, warningMs: 15_000, label: "Go" }),
      0,
    );
    expect(timerDisplay(target, 50_000).warning).toBe(true);
    expect(timerDisplay(target, 60_000).complete).toBe(true);
  });

  it("paints as a composition layer and reaches Program only through LIVE", () => {
    const painted = presentTimer(
      startTimer(createTimer({ name: "Service", mode: "countdown", durationMs: 8 * 60_000, label: "Service starts in" }), 0),
      theme,
      0,
    );
    expect(painted.layout).toBe("timer");
    expect(painted.reference).toBe("Service starts in");
    expect(painted.timer?.mode).toBe("countdown");

    let composition = instantiateTemplate(COMPOSITION_TEMPLATES.find((entry) => entry.id === "full-frame")!, "Countdown");
    composition = assignLayerSource(
      composition,
      composition.layers[0]!.id,
      sourceRef("timer", "service", "Service", { timerId: "service", mode: "countdown", durationMs: "480000", label: "Service starts in" }),
    );
    let live = createLiveState(theme);
    const program = live.program;
    live = previewComposition(live, presentComposition(composition, { theme, now: 0 }), composition.id);
    expect(live.preview.model.layers?.[0]?.model.layout).toBe("timer");
    expect(live.program).toEqual(program);
    const taken = applyProgramAction(live, "take", theme, { title: "Logo", imageUrl: null });
    expect(taken.program.model.layout).toBe("composition");
    expect(taken.program.model.layers?.[0]?.model.layout).toBe("timer");
    const snapshot = taken.program.model.layers?.[0]?.model.timer;
    expect(timerDisplay(timerFromPaint(snapshot!), 60_000).text).toBe("07:00");
    expect(taken.program.model.layers?.[0]?.model.timer?.elapsedMs).toBe(0);
  });
});
