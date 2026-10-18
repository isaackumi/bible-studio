// How each kind of source looks in the Production Desk: icon, color and a plain description.

export type SourceMeta = { icon: string; color: string; blurb: string; group: "Live" | "Words" | "Time" | "Graphics" };

export const SOURCE_META: Record<string, SourceMeta> = {
  camera: { icon: "camera", color: "#30a46c", blurb: "A camera or capture card, live", group: "Live" },
  video: { icon: "video", color: "#e5484d", blurb: "A video file: walk-in loops, clips", group: "Live" },
  ndi: { icon: "cast", color: "#30a46c", blurb: "A network video feed", group: "Live" },
  scripture: { icon: "bible", color: "#c18a3d", blurb: "A verse or passage, any translation", group: "Words" },
  song: { icon: "note", color: "#e93d82", blurb: "A section of a song from the library", group: "Words" },
  text: { icon: "type", color: "#8e4ec6", blurb: "A heading and words you type", group: "Words" },
  "lower-third": { icon: "captions", color: "#3e63dd", blurb: "A name bar: speaker, title, notice", group: "Words" },
  timer: { icon: "timer", color: "#f76b15", blurb: "Countdown or count-up", group: "Time" },
  countdown: { icon: "timer", color: "#f76b15", blurb: "Countdown", group: "Time" },
  clock: { icon: "clock", color: "#0d9488", blurb: "The time of day", group: "Time" },
  image: { icon: "media", color: "#12a5b8", blurb: "A picture or logo", group: "Graphics" },
  qr: { icon: "qr", color: "#525252", blurb: "A code to scan: giving, sign-up, Wi-Fi", group: "Graphics" },
  web: { icon: "globe", color: "#0a84ff", blurb: "A web page, YouTube or Vimeo video, Google Slides", group: "Live" },
  shape: { icon: "square", color: "#525252", blurb: "A colored shape", group: "Graphics" },
  empty: { icon: "layers", color: "#6b7280", blurb: "Empty: double-click to choose what it shows", group: "Graphics" },
};

export function sourceMeta(type: string): SourceMeta {
  return SOURCE_META[type] ?? { icon: "layers", color: "#6b7280", blurb: "", group: "Graphics" };
}
