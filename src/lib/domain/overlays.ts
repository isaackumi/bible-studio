import type { PresentationModel, ProgramAlert, Theme } from "./types";

const HEX = /^#[0-9a-fA-F]{6}$/;

export type QrStyle = "square" | "rounded" | "dots";

/** A QR frame. Empty data paints the empty frame rather than a code nobody can use. */
export function presentQr(input: { theme: Theme; data: string; style?: QrStyle; dark?: string; light?: string; caption?: string; code?: { value: string; at: string } }): PresentationModel {
  const code = input.code && /^[A-Z0-9]{4,8}$/.test(input.code.value) ? { value: input.code.value, at: input.code.at.trim().slice(0, 60) } : undefined;
  const data = input.data.trim().slice(0, 1000);
  return {
    layout: data ? "qr" : "empty",
    theme: input.theme,
    reference: null,
    attribution: null,
    lines: [],
    imageUrl: null,
    backgroundImageUrl: null,
    ...(data
      ? {
          qr: {
            data,
            style: input.style === "dots" || input.style === "rounded" ? input.style : "square",
            dark: input.dark && HEX.test(input.dark) ? input.dark : "#000000",
            light: input.light && HEX.test(input.light) ? input.light : "#ffffff",
            caption: (input.caption ?? "").trim().slice(0, 80),
            ...(code ? { code } : {}),
          },
        }
      : {}),
  };
}

/** Clean an alert from the desk; null when there is nothing to show. */
export function sanitizeAlert(value: Partial<ProgramAlert> | null | undefined, now = Date.now()): ProgramAlert | null {
  const text = (value?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (!text) return null;
  const until = typeof value?.until === "number" && Number.isFinite(value.until) ? value.until : null;
  if (until !== null && until <= now) return null;
  return {
    id: value?.id || `alert:${now}`,
    text,
    style: value?.style === "ticker" ? "ticker" : "banner",
    position: value?.position === "top" ? "top" : "bottom",
    until,
  };
}

/** Put the alert on a Program frame (or take it off). Same object back when nothing changes. */
export function withAlert(model: PresentationModel, alert: ProgramAlert | null): PresentationModel {
  if (!alert) {
    if (!model.alert) return model;
    const { alert: _gone, ...rest } = model;
    return rest;
  }
  if (model.alert?.id === alert.id && model.alert.text === alert.text) return model;
  return { ...model, alert };
}
