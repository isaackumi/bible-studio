import { describe, expect, it } from "vitest";
import { findSongRequest, hymnRequest, parseHymn, parseSongMatches, parseSongSuggestions, songSelectUrl, suggestSongsRequest, wordsAreFree } from "./songs";
import { emptyAiSettings } from "./summarize";

const settings = { ...emptyAiSettings(), key: "k" };

describe("songs with the church's own AI", () => {
  it("asks for matches and reads them, never more than five", () => {
    expect(JSON.parse(findSongRequest(settings, "the one about the cornerstone").body).messages[0].content).toContain("cornerstone");
    const answer = '```json\n{"songs":[{"title":"Amazing Grace","authors":"John Newton","year":1779,"ccli":"22025","copyright":"","publicDomain":true,"firstLine":"Amazing grace, how sweet the sound"},{"title":""},{"title":"Cornerstone","authors":"Edward Mote, Reuben Morgan","year":2011,"ccli":6158927,"copyright":"2011 Hillsong","publicDomain":false}]}\n```';
    const songs = parseSongMatches(answer);
    expect(songs.map((song) => song.title)).toEqual(["Amazing Grace", "Cornerstone"]);
    expect(songs[1]).toMatchObject({ ccli: "6158927", publicDomain: false, year: 2011 });
    expect(() => parseSongMatches("no idea")).toThrow();
  });

  it("writes words out only for songs old enough and called public domain", () => {
    const now = new Date("2026-10-23");
    expect(wordsAreFree({ publicDomain: true, year: 1779, copyright: "" }, now)).toBe(true);
    expect(wordsAreFree({ publicDomain: true, year: 1930, copyright: "" }, now)).toBe(true);
    expect(wordsAreFree({ publicDomain: true, year: 1931, copyright: "" }, now)).toBe(false);
    expect(wordsAreFree({ publicDomain: true, year: 0, copyright: "" }, now)).toBe(false);
    expect(wordsAreFree({ publicDomain: false, year: 1779, copyright: "" }, now)).toBe(false);
    expect(wordsAreFree({ publicDomain: true, year: 1779, copyright: "2006 worshiptogether.com songs" }, now)).toBe(false);
  });

  it("reads a hymn's words and respects a refusal", () => {
    expect(JSON.parse(hymnRequest(settings, { title: "Amazing Grace", authors: "John Newton", year: 1779 }).body).messages[0].content).toContain("Published: 1779");
    expect(parseHymn("```\nVerse 1\nAmazing grace\n```")).toBe("Verse 1\nAmazing grace");
    expect(() => parseHymn("NOT AVAILABLE")).toThrow(/SongSelect/);
  });

  it("numbers the library for suggestions and keeps only real picks", () => {
    const request = suggestSongsRequest(settings, { title: "Grace", notes: "Ephesians 2:8", songs: [{ title: "Amazing Grace", author: "John Newton" }, { title: "Way Maker", author: "" }] });
    expect(JSON.parse(request.body).messages[0].content).toContain("1. Amazing Grace (John Newton)\n2. Way Maker");
    const picks = parseSongSuggestions('{"library":[{"n":2,"why":"God at work"},{"n":2},{"n":9},{"n":"1","why":"grace"}],"others":[{"title":"Grace Alone","authors":"Dustin Kensrue","why":"Ephesians 2"},{"title":""}]}', 2);
    expect(picks.library).toEqual([{ index: 1, why: "God at work" }, { index: 0, why: "grace" }]);
    expect(picks.others).toEqual([{ title: "Grace Alone", authors: "Dustin Kensrue", why: "Ephesians 2" }]);
  });

  it("links to SongSelect by number, else by title", () => {
    expect(songSelectUrl({ title: "Cornerstone", ccli: "6158927" })).toBe("https://songselect.ccli.com/search/results?search=6158927");
    expect(songSelectUrl({ title: "It Is Well", ccli: "" })).toBe("https://songselect.ccli.com/search/results?search=It%20Is%20Well");
  });
});

describe("songs sent for suggestions", () => {
  it("sends the whole library when it fits, and else the songs closest to the sermon, not the first by title", async () => {
    const { songsToSuggestFrom } = await import("./songs");
    const songs = Array.from({ length: 10 }, (_, i) => ({ title: `Song ${String.fromCharCode(65 + i)}`, author: "", sections: [{ lines: [i === 9 ? "grace abounding mercy forgiveness" : "light"] }] }));
    expect(songsToSuggestFrom(songs, { title: "", notes: "" }, 20)).toHaveLength(10);
    const picked = songsToSuggestFrom(songs, { title: "Grace", notes: "mercy and forgiveness" }, 3);
    expect(picked).toHaveLength(3);
    expect(picked.map((song) => song.title)).toContain("Song J");
  });
});

