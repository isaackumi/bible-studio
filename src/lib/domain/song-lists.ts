// The ready-made song lists beside the church's folders: favorites, what was sung lately, what
// is sung most, and what is in the service being built. The Songs page and the song search both
// use these, so they always agree.

import { t } from "../i18n/core";
import { daysAgo, mostUsed, recentlyUsedIds, type SongUse } from "./song-usage";
import type { Song } from "./types";

export type SongListId = "all" | "favorites" | "recent" | "most" | "service";

export type SongList = {
  id: SongListId;
  label: string;
  icon: string;
  /** What the list is for, shown when it is empty. */
  empty: string;
  songs: Song[];
};

export type SongListInput = {
  songs: Song[];
  favoriteIds: string[];
  /** Songs put on Preview this session, newest first (before they were ever live). */
  sessionRecentIds: string[];
  uses: SongUse[];
  /** Songs in the open service, in running order. */
  serviceSongIds: string[];
  now?: Date;
};

function pick(songs: Map<string, Song>, ids: string[]): Song[] {
  const seen = new Set<string>();
  const result: Song[] = [];
  for (const id of ids) {
    const song = songs.get(id);
    if (song && !seen.has(id)) {
      seen.add(id);
      result.push(song);
    }
  }
  return result;
}

export function songLists(input: SongListInput): SongList[] {
  const byId = new Map(input.songs.map((song) => [song.id, song]));
  const most = mostUsed(input.uses, daysAgo(90, input.now ?? new Date()));
  return [
    { id: "all", label: t("All songs"), icon: "library", empty: t("No songs yet. Add one with New song or Import."), songs: input.songs },
    {
      id: "favorites",
      label: t("Favorites"),
      icon: "star",
      empty: t("Star the songs you sing most and they wait here."),
      songs: pick(byId, input.favoriteIds),
    },
    {
      id: "recent",
      label: t("Recently used"),
      icon: "reset",
      empty: t("Songs you show appear here, newest first."),
      songs: pick(byId, [...input.sessionRecentIds, ...recentlyUsedIds(input.uses)]),
    },
    {
      id: "most",
      label: t("Most sung"),
      icon: "note",
      empty: t("After a few Sundays, the songs sung most in the last three months appear here."),
      songs: pick(byId, most.map((entry) => entry.songId)),
    },
    {
      id: "service",
      label: t("In this service"),
      icon: "list",
      empty: t("Songs added to the service you are building appear here."),
      songs: pick(byId, input.serviceSongIds),
    },
  ];
}
