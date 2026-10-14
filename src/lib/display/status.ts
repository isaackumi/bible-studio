import type { OutputStatus } from "../domain/types";

export type AudienceStatus = {
  title: string;
  detail: string;
};

/** One status for the audience window. Online output names the screen it is actually on. */
export function audienceStatus(output: OutputStatus, desktop: boolean): AudienceStatus {
  if (!desktop) {
    return output.online
      ? { title: "Audience window is open", detail: "Drag it to the screen you want, then choose Fill this screen on that window." }
      : { title: "Audience is closed", detail: "Open output to use a separate browser window. A browser cannot move that window onto a monitor." };
  }
  const live = output.displays.find((display) => display.audience);
  if (!output.desired) {
    return { title: "Audience is closed", detail: "Open output when you are ready to show Program." };
  }
  if (output.online && live) {
    const place = live.primary ? "Built-in display" : "External display";
    const mode = output.mode === "fullscreen" ? "Fullscreen" : "Window";
    return { title: live.name, detail: `${place} · ${live.width} × ${live.height} · ${mode}` };
  }
  return { title: "Audience is not showing", detail: output.message || "The assigned display is unavailable." };
}
