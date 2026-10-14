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
