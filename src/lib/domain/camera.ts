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
  return "No camera is available.";
}

export function cameraSourceId(deviceId: string) {
  return `camera:${deviceId}`;
}

export function isCameraSource(sourceId: string | null | undefined) {
  return !!sourceId?.startsWith("camera:");
}

export type CameraSurface = "preview" | "program" | "audience";

/** Operator Preview may show pixels. Program and audience paint the camera card. */
export function previewShowsCamera(model: PresentationModel, sourceId: string | null | undefined): boolean {
  if (isCameraSource(sourceId)) return true;
  return (model.layers ?? []).some((layer) => isCameraSource(layer.sourceId));
}

export function cameraFeedForLayer(
  sourceId: string | undefined,
  feedId: string | null | undefined,
  stream: unknown,
  surface: CameraSurface,
): unknown | null {
  if (surface !== "preview") return null;
  if (!stream || !sourceId || sourceId !== feedId) return null;
  if (!isCameraSource(sourceId)) return null;
  return stream;
}

export function listVideoInputs(devices: MediaDeviceInfoLike[]): CameraDevice[] {
  return devices
    .filter((device) => device.kind === "videoinput" && device.deviceId)
    .map((device) => ({ deviceId: device.deviceId, label: device.label.trim() || "Camera" }));
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
