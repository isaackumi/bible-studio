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
  const external = output.displays.find((display) => !display.primary);
  if (!output.desired) {
    if (external) {
      return {
        title: external.name,
        detail: `External display detected · ${external.width} × ${external.height}. Open output to show Program there.`,
      };
    }
    if (output.displays.length > 0) {
      return { title: "Audience is closed", detail: "No external display is connected. Connect one, or choose this screen." };
    }
    return { title: "Audience is closed", detail: "Looking for displays." };
  }
  if (output.online && live) {
    const place = live.primary ? "Built-in display" : "External display";
    const mode = output.mode === "fullscreen" ? "Fullscreen" : "Window";
    return { title: live.name, detail: `${place} · ${live.width} × ${live.height} · ${mode}` };
  }
  return { title: "Audience is not showing", detail: output.message || "The assigned display is unavailable." };
}

/** Short second line for the operator desk. Settings keeps the longer `detail`. */
export function audienceDeskLine(output: OutputStatus, desktop: boolean): { title: string; line: string } {
  const status = audienceStatus(output, desktop);
  const live = output.displays.find((display) => display.audience);
  const external = output.displays.find((display) => !display.primary);
  if (output.online && live) {
    const mode = output.mode === "fullscreen" ? "Fullscreen" : "Window";
    return { title: live.name, line: `${live.width}×${live.height} · ${mode}` };
  }
  if (!output.desired && external) {
    return { title: external.name, line: `${external.width}×${external.height} · Closed` };
  }
  if (output.online) return { title: status.title, line: "Window" };
  if (output.desired) return { title: status.title, line: "Not showing" };
  return { title: status.title, line: "Closed" };
}

/** Compact operator chrome: “Audience · Dell U2415”. */
export function audienceChip(output: OutputStatus, desktop: boolean): { on: boolean; label: string } {
  const desk = audienceDeskLine(output, desktop);
  const live = output.displays.find((display) => display.audience);
  const external = output.displays.find((display) => !display.primary);
  if (output.online && live) return { on: true, label: `Audience · ${live.name}` };
  if (!output.desired && external) return { on: false, label: `Audience · ${external.name}` };
  // Showing, but not on a named display (a browser window): say so plainly.
  if (output.online) return { on: true, label: "Audience · Showing" };
  if (desk.title === "Audience is closed") return { on: false, label: "Audience · Closed" };
  return { on: false, label: `Audience · ${desk.title}` };
}
