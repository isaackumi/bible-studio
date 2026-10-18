import { t } from "../i18n/core";
import type { OutputStatus } from "../domain/types";

export type AudienceStatus = {
  title: string;
  detail: string;
};

/** One status for the audience window. Online output names the screen it is actually on. */
export function audienceStatus(output: OutputStatus, desktop: boolean): AudienceStatus {
  if (!desktop) {
    return output.online
      ? { title: t("Audience window is open"), detail: t("Drag it to the screen you want, then choose Fill this screen on that window.") }
      : { title: t("Audience is closed"), detail: t("Open output to use a separate browser window. A browser cannot move that window onto a monitor.") };
  }
  const live = output.displays.find((display) => display.audience);
  const external = output.displays.find((display) => !display.primary);
  if (!output.desired) {
    if (external) {
      return {
        title: external.name,
        detail: t("External display detected · {width} × {height}. Open output to show Program there.", { width: external.width, height: external.height }),
      };
    }
    if (output.displays.length > 0) {
      return { title: t("Audience is closed"), detail: t("No external display is connected. Connect one, or choose this screen.") };
    }
    return { title: t("Audience is closed"), detail: t("Looking for displays.") };
  }
  if (output.online && live) {
    const place = live.primary ? t("Built-in display") : t("External display");
    const mode = output.mode === "fullscreen" ? t("Fullscreen") : t("Window");
    return { title: live.name, detail: `${place} · ${live.width} × ${live.height} · ${mode}` };
  }
  return { title: t("Audience is not showing"), detail: output.message || t("The assigned display is unavailable.") };
}

/** Short second line for the operator desk. Settings keeps the longer `detail`. */
export function audienceDeskLine(output: OutputStatus, desktop: boolean): { title: string; line: string } {
  const status = audienceStatus(output, desktop);
  const live = output.displays.find((display) => display.audience);
  const external = output.displays.find((display) => !display.primary);
  if (output.online && live) {
    const mode = output.mode === "fullscreen" ? t("Fullscreen") : t("Window");
    return { title: live.name, line: `${live.width}×${live.height} · ${mode}` };
  }
  if (!output.desired && external) {
    return { title: external.name, line: `${external.width}×${external.height} · ${t("Closed")}` };
  }
  if (output.online) return { title: status.title, line: t("Window") };
  if (output.desired) return { title: status.title, line: t("Not showing") };
  return { title: status.title, line: t("Closed") };
}

/** Compact operator chrome: “Audience · Dell U2415”. */
export function audienceChip(output: OutputStatus, desktop: boolean): { on: boolean; label: string } {
  const desk = audienceDeskLine(output, desktop);
  const live = output.displays.find((display) => display.audience);
  const external = output.displays.find((display) => !display.primary);
  if (output.online && live) return { on: true, label: `${t("Audience")} · ${live.name}` };
  if (!output.desired && external) return { on: false, label: `${t("Audience")} · ${external.name}` };
  // Showing, but not on a named display (a browser window): say so plainly.
  if (output.online) return { on: true, label: `${t("Audience")} · ${t("Showing")}` };
  if (desk.title === t("Audience is closed")) return { on: false, label: `${t("Audience")} · ${t("Closed")}` };
  return { on: false, label: `${t("Audience")} · ${desk.title}` };
}
