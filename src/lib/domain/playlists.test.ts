import { describe, expect, it } from "vitest";
import { addTracks, formatDuration, moveTrack, nextTrackIndex, removeTrackAt, sanitizeAudioSettings, sanitizePlaylists, shuffledOrder } from "./playlists";

describe("playlists", () => {
  it("starts with walk-in music and reads back only valid lists", () => {
    expect(sanitizePlaylists(undefined)).toEqual([{ id: "walk-in", name: "Walk-in music", trackIds: [], loop: true }]);
    expect(sanitizePlaylists([{ id: "a", name: " Offering ", trackIds: ["t1", 3, ""], loop: true }, { id: "a" }, null])).toEqual([
      { id: "a", name: "Offering", trackIds: ["t1"], loop: true },
    ]);
  });

  it("adds, removes and moves tracks", () => {
    let list = addTracks({ id: "p", name: "P", trackIds: ["a"], loop: false }, ["b", "a", "c"]);
    expect(list.trackIds).toEqual(["a", "b", "c"]);
    list = moveTrack(list, 2, 0);
    expect(list.trackIds).toEqual(["c", "a", "b"]);
    expect(removeTrackAt(list, 1).trackIds).toEqual(["c", "b"]);
  });

  it("goes on to the next track, looping when asked", () => {
    expect(nextTrackIndex(3, 1, 1, false)).toBe(2);
    expect(nextTrackIndex(3, 2, 1, false)).toBeNull();
    expect(nextTrackIndex(3, 2, 1, true)).toBe(0);
    expect(nextTrackIndex(3, 0, -1, true)).toBe(2);
    expect(nextTrackIndex(0, 0, 1, true)).toBeNull();
  });

  it("keeps volume in range and times readable", () => {
    expect(sanitizeAudioSettings({ volume: 3, fadeOnLive: false })).toMatchObject({ volume: 1, fadeOnLive: false });
    expect(sanitizeAudioSettings(null)).toMatchObject({ volume: 0.8, fadeOnLive: true });
    expect(formatDuration(187)).toBe("3:07");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});

describe("music settings", () => {
  it("reads back only sensible values, with good defaults", () => {
    const clean = sanitizeAudioSettings({ crossfade: 99, shuffle: true, outputId: "usb-1", levels: { a: -12.34, b: 5, c: "x" }, pad: [{ id: "p1", assetId: "bell", label: "  Offering bell  " }, { id: "p1", assetId: "x" }, { id: "p2" }] });
    expect(clean).toMatchObject({ crossfade: 12, shuffle: true, outputId: "usb-1", even: true, stopTrackWithSong: true, levels: { a: -12.3 } });
    expect(clean.pad).toEqual([{ id: "p1", assetId: "bell", label: "Offering bell" }]);
    expect(sanitizeAudioSettings(undefined)).toMatchObject({ volume: 0.8, crossfade: 3, shuffle: false, even: true, pad: [] });
  });

  it("shuffles every track once, starting with the chosen one", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const order = shuffledOrder(6, 2, random);
    expect(order[0]).toBe(2);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(shuffledOrder(0)).toEqual([]);
  });
});
