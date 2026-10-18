import { detectOutputCapabilities, probeFromWindow, type OutputCapabilities } from "./output-capabilities";

export type { OutputCapabilities };

export type PlatformId = "desktop" | "web";

export type AudienceOutputKind = "native-window" | "browser-window";

export type PlatformCapabilities = {
  readonly platform: PlatformId;
  readonly supportsNativeWindows: boolean;
  readonly supportsMultipleDisplays: boolean;
  readonly supportsOfflineStorage: boolean;
  readonly supportsNativeMediaDevices: boolean;
  readonly supportsAudienceWindow: boolean;
  readonly audienceOutput: AudienceOutputKind;
};

/** True only inside the Tauri shell. The web build never has this global. */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function outputCapabilities(desktop = isDesktop()): OutputCapabilities {
  const target = typeof window !== "undefined" ? window : undefined;
  return detectOutputCapabilities(probeFromWindow(desktop, target));
}

export function platformCapabilities(desktop = isDesktop()): PlatformCapabilities {
  return {
    platform: desktop ? "desktop" : "web",
    supportsNativeWindows: desktop,
    supportsMultipleDisplays: desktop,
    supportsOfflineStorage: true,
    supportsNativeMediaDevices: desktop,
    supportsAudienceWindow: true,
    audienceOutput: desktop ? "native-window" : "browser-window",
  };
}

/** Open a web page in the system browser (checkout, help), or a mailto: link in the mail app. */
export async function openExternal(url: string): Promise<void> {
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return;
  if (isDesktop()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}
