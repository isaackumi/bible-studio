/**
 * Runtime probes for operator/output hardware. These report whether an API exists.
 * They do not grant permission, place windows, or open cameras.
 */
export type OutputCapabilities = {
  canOpenAudienceWindow: boolean;
  canRequestFullscreen: boolean;
  canEnumerateScreens: boolean;
  canPlaceWindow: boolean;
  canUseCamera: boolean;
  canUseMicrophone: boolean;
  canUseWebRTC: boolean;
};

export type CapabilityProbe = {
  desktop: boolean;
  open?: unknown;
  getScreenDetails?: unknown;
  fullscreenEnabled?: boolean;
  getUserMedia?: unknown;
  rtcPeerConnection?: unknown;
};

export function probeFromWindow(desktop: boolean, target: Window | undefined): CapabilityProbe {
  const nav = target?.navigator as Navigator & { mediaDevices?: { getUserMedia?: unknown } } | undefined;
  return {
    desktop,
    open: target?.open,
    getScreenDetails: target && "getScreenDetails" in target ? (target as Window & { getScreenDetails?: unknown }).getScreenDetails : undefined,
    fullscreenEnabled: target?.document?.fullscreenEnabled === true,
    getUserMedia: nav?.mediaDevices?.getUserMedia,
    rtcPeerConnection: target && "RTCPeerConnection" in target ? (target as Window & { RTCPeerConnection?: unknown }).RTCPeerConnection : undefined,
  };
}

/**
 * Desktop placement uses the native display layer. Browser `getScreenDetails` is Chromium-only
 * and untested here, so `canPlaceWindow` stays false on the web even when that method exists.
 */
export function detectOutputCapabilities(probe: CapabilityProbe): OutputCapabilities {
  const hasMedia = typeof probe.getUserMedia === "function";
  return {
    canOpenAudienceWindow: probe.desktop || typeof probe.open === "function",
    canRequestFullscreen: probe.desktop || probe.fullscreenEnabled === true,
    canEnumerateScreens: probe.desktop || typeof probe.getScreenDetails === "function",
    canPlaceWindow: probe.desktop,
    canUseCamera: probe.desktop || hasMedia,
    canUseMicrophone: probe.desktop || hasMedia,
    canUseWebRTC: typeof probe.rtcPeerConnection === "function",
  };
}
