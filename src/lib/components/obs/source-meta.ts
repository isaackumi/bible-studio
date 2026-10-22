// How each kind of source looks in the Production Desk: icon, color and a plain description.

import { msg } from "../../i18n/core";

export type SourceMeta = { icon: string; color: string; blurb: string; group: "Live" | "Words" | "Time" | "Graphics" };

export const SOURCE_META: Record<string, SourceMeta> = {
  camera: { icon: "camera", color: "#30a46c", blurb: msg("A camera or capture card, live"), group: "Live" },
  video: { icon: "video", color: "#e5484d", blurb: msg("A video file: walk-in loops, clips"), group: "Live" },
  ndi: { icon: "cast", color: "#30a46c", blurb: msg("A network video feed"), group: "Live" },
  scripture: { icon: "bible", color: "#c18a3d", blurb: msg("A verse or passage, any translation"), group: "Words" },
  song: { icon: "note", color: "#e93d82", blurb: msg("A section of a song from the library"), group: "Words" },
  text: { icon: "type", color: "#8e4ec6", blurb: msg("A heading and words you type"), group: "Words" },
  "lower-third": { icon: "captions", color: "#3e63dd", blurb: msg("A name bar: speaker, title, notice"), group: "Words" },
  slide: { icon: "stage", color: "#d4a017", blurb: msg("A page you designed: a lower third, a logo, a bar"), group: "Graphics" },
  timer: { icon: "timer", color: "#f76b15", blurb: msg("Countdown or count-up"), group: "Time" },
  countdown: { icon: "timer", color: "#f76b15", blurb: msg("Countdown"), group: "Time" },
  clock: { icon: "clock", color: "#0d9488", blurb: msg("The time of day"), group: "Time" },
  image: { icon: "media", color: "#12a5b8", blurb: msg("A picture or logo"), group: "Graphics" },
  qr: { icon: "qr", color: "#525252", blurb: msg("A code to scan: giving, sign-up, Wi-Fi"), group: "Graphics" },
  web: { icon: "globe", color: "#0a84ff", blurb: msg("A web page, YouTube or Vimeo video, Google Slides"), group: "Live" },
  shape: { icon: "square", color: "#525252", blurb: msg("A colored shape"), group: "Graphics" },
  empty: { icon: "layers", color: "#6b7280", blurb: msg("Empty: double-click to choose what it shows"), group: "Graphics" },
};

export function sourceMeta(type: string): SourceMeta {
  return SOURCE_META[type] ?? { icon: "layers", color: "#6b7280", blurb: "", group: "Graphics" };
}
