import { describe, expect, it } from "vitest";
import { secondOutputModel, sanitizeSecondOutput } from "./second-output";
import { defaultTheme } from "./theme";
import type { PresentationModel } from "./types";

const theme = defaultTheme();
const lobby = { ...defaultTheme(), id: "lobby", name: "Lobby" };
const base = { theme, reference: null, attribution: null, imageUrl: null, backgroundImageUrl: null } as const;
const lyrics: PresentationModel = { ...base, layout: "lyrics", lines: [{ text: "Amazing grace" }], backgroundImageUrl: "sanctuary.jpg" };
const picture: PresentationModel = { ...base, layout: "image", lines: [], imageUrl: "flyer.png" };
const logo = { theme, title: "Grace Chapel", imageUrl: null };

describe("second screen", () => {
  it("mirrors Program, in its own theme when it has one", () => {
    expect(secondOutputModel(lyrics, { show: "same", alerts: true }, null, logo)).toBe(lyrics);
    const own = secondOutputModel(lyrics, { show: "same", alerts: true }, { theme: lobby, photo: null, video: null }, logo);
    expect(own.theme.id).toBe("lobby");
    expect(own.backgroundImageUrl).toBeNull();
    expect(secondOutputModel(picture, { show: "same", alerts: true }, { theme: lobby, photo: null, video: null }, logo)).toBe(picture);
  });

  it("shows only the words, with the church name otherwise", () => {
    expect(secondOutputModel(lyrics, { show: "words", alerts: true }, null, logo).lines[0]?.text).toBe("Amazing grace");
    const instead = secondOutputModel(picture, { show: "words", alerts: true }, null, logo);
    expect(instead.layout).toBe("logo");
    expect(instead.lines[0]?.text).toBe("Grace Chapel");
    const look: PresentationModel = {
      ...base,
      layout: "composition",
      lines: [],
      layers: [
        { id: "cam", zIndex: 0, opacity: 1, bounds: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover", sourceId: "c", model: picture },
        { id: "w", zIndex: 1, opacity: 1, bounds: { x: 0, y: 70, w: 100, h: 30 }, fit: "contain", sourceId: "s", model: { ...lyrics, layout: "scripture", reference: "John 3:16" } },
      ],
    };
    expect(secondOutputModel(look, { show: "words", alerts: true }, null, logo)).toMatchObject({ layout: "scripture", reference: "John 3:16" });
  });

  it("can leave alerts off this screen", () => {
    const alerted = { ...lyrics, alert: { text: "Parent of Sam to the nursery", style: "banner", position: "bottom" } } as PresentationModel;
    expect(secondOutputModel(alerted, { show: "same", alerts: false }, null, logo).alert).toBeUndefined();
    expect(secondOutputModel(alerted, { show: "same", alerts: true }, null, logo).alert).toBeDefined();
  });

  it("reads back settings safely", () => {
    expect(sanitizeSecondOutput({ name: "  Overflow ", show: "same", themeId: "", alerts: false })).toEqual({ name: "Overflow", show: "same", themeId: null, alerts: false, displayKey: null });
    expect(sanitizeSecondOutput(null).show).toBe("words");
  });
});
