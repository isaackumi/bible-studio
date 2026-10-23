import { computerOs, type ComputerOs } from "../platform/os";
import { frame, setPreview } from "./live";
import type { LiveState, PresentationModel, Theme } from "./types";

export type CameraDevice = {
  deviceId: string;
  label: string;
};

export type MediaDeviceInfoLike = {
  deviceId: string;
  kind: string;
  label: string;
};

export type CameraMedia = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<unknown>;
};

export function cameraDeniedMessage() {
  return "Camera permission was denied.";
}

export function cameraUnavailableMessage() {
  return "No camera is available. Phone cameras (Iriun, Camo) must be running on the phone and computer before you press Refresh.";
}

export function cameraSourceId(deviceId: string) {
  return `camera:${deviceId}`;
}

export function isCameraSource(sourceId: string | null | undefined) {
  return !!sourceId?.startsWith("camera:");
}

export function cameraDeviceId(sourceId: string) {
  return sourceId.startsWith("camera:") ? sourceId.slice("camera:".length) : sourceId;
}

/** Open camera feeds keyed by camera source id (`camera:{deviceId}`). */
export type CameraFeeds<T = unknown> = Record<string, T>;

/** Camera source ids a frame paints: its own camera source plus every visible camera layer. */
export function camerasIn(model: PresentationModel, sourceId: string | null | undefined): string[] {
  const ids = new Set<string>();
  if (isCameraSource(sourceId)) ids.add(sourceId!);
  for (const layer of model.layers ?? []) if (isCameraSource(layer.sourceId)) ids.add(layer.sourceId);
  return [...ids];
}

/** Cameras the operator must keep open: whatever Preview or Program paints. */
export function camerasNeeded(live: LiveState): string[] {
  return [...new Set([...camerasIn(live.preview.model, live.preview.sourceId), ...camerasIn(live.program.model, live.program.sourceId)])];
}

export function planFeeds(open: string[], needed: string[]): { open: string[]; close: string[] } {
  return {
    open: needed.filter((id) => !open.includes(id)),
    close: open.filter((id) => !needed.includes(id)),
  };
}

/** Any surface given a feed map may show pixels; a missing feed paints the camera card. */
export function cameraFeedForLayer<T>(sourceId: string | null | undefined, feeds: CameraFeeds<T>): T | null {
  if (!sourceId || !isCameraSource(sourceId)) return null;
  return feeds[sourceId] ?? null;
}

export function listVideoInputs(devices: MediaDeviceInfoLike[]): CameraDevice[] {
  return devices
    .filter((device) => device.kind === "videoinput" && device.deviceId)
    .map((device) => ({ deviceId: device.deviceId, label: device.label.trim() || "Camera" }));
}

export type CameraDiscoveryMedia = CameraMedia & {
  enumerateDevices: () => Promise<MediaDeviceInfoLike[]>;
};

/**
 * List cameras, asking for camera permission first when the browser hides them.
 * Before permission, WebKit and Chromium report cameras with empty ids and labels,
 * so phone and virtual cameras (Iriun, Camo, Continuity) look like nothing is attached.
 */
export async function discoverCameras(media: CameraDiscoveryMedia): Promise<{ cameras: CameraDevice[]; note: string }> {
  const first = await media.enumerateDevices();
  const hidden = first.some((device) => device.kind === "videoinput" && (!device.deviceId || !device.label));
  const found = listVideoInputs(first);
  if (!hidden && found.length) return { cameras: found, note: "" };
  try {
    stopCameraStream((await media.getUserMedia({ audio: false, video: true })) as Parameters<typeof stopCameraStream>[0]);
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String((error as { name: string }).name) : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") return { cameras: found, note: cameraDeniedHelp() };
    if (!found.length) return { cameras: [], note: cameraUnavailableMessage() };
    return { cameras: found, note: "" };
  }
  const cameras = listVideoInputs(await media.enumerateDevices());
  return { cameras, note: cameras.length ? "" : cameraUnavailableMessage() };
}

export function cameraDeniedHelp(os: ComputerOs = computerOs()) {
  if (os === "windows") return "Camera permission was denied. In Windows Settings › Privacy & security › Camera, turn on camera access for desktop apps, then press Refresh.";
  if (os === "mac") return "Camera permission was denied. Allow Church Studio in System Settings › Privacy & Security › Camera, then press Refresh.";
  return "Camera permission was denied. Allow the camera in the browser or the computer's privacy settings, then press Refresh.";
}

export function presentCamera(input: { theme: Theme; label: string }): PresentationModel {
  const label = input.label.trim() || "Camera";
  return {
    layout: "title",
    theme: input.theme,
    reference: null,
    attribution: "Camera",
    lines: [{ text: label }],
    imageUrl: null,
    backgroundImageUrl: null,
  };
}

export function previewCameraLive(live: LiveState, model: PresentationModel, sourceId: string): LiveState {
  return setPreview(live, frame(model, sourceId, "cut"));
}

export async function openCamera(media: CameraMedia, deviceId: string): Promise<unknown> {
  try {
    return await media.getUserMedia({ audio: false, video: { deviceId: { exact: deviceId } } });
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String((error as { name: string }).name) : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") throw new Error(cameraDeniedMessage());
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new Error(cameraUnavailableMessage());
    throw new Error("Church Studio cannot open that camera.");
  }
}

export function stopCameraStream(stream: { getTracks?: () => Array<{ stop: () => void }> } | null | undefined) {
  stream?.getTracks?.().forEach((track) => track.stop());
}
