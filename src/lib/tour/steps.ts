// The screen tour: one short guided walk per desk page. Each step points at a part of the
// screen (the first selector that is on screen wins) and says what it is for in plain words.
// Steps whose target is not showing (a hidden panel, a closed menu) are skipped.

import { msg } from "../i18n/core";

export type TourId = "scriptures" | "songs" | "sermon" | "service" | "production";

export type TourStep = {
  /** CSS selectors, tried in order. None: a centered card with no spotlight. */
  target?: string[];
  title: string;
  body: string;
};

const TOUR_BUTTON: TourStep = {
  target: ['[data-tour="more"]', '[data-tour="tours"]'],
  title: msg("Lost? Come back here"),
  body: msg("The guided tours are here any time, in this menu. Each page has its own."),
};

const LIVE_STEPS: TourStep[] = [
  {
    target: [".pb-actions .live"],
    title: msg("LIVE sends it to the screen"),
    body: msg("Nothing reaches the congregation until you press LIVE (or the Space bar). Then Preview becomes Program."),
  },
  {
    target: [".pb-actions"],
    title: msg("BLACK and CLEAR"),
    body: msg("BLACK turns the screen black at once. CLEAR takes the words off. Neither changes what is on Preview."),
  },
  {
    target: [".output-trigger"],
    title: msg("The audience screen"),
    body: msg("Open the audience window here and put it on the projector or TV. The button turns amber when Program is set but nobody can see it."),
  },
];

export const TOURS: Record<TourId, { name: string; steps: TourStep[] }> = {
  scriptures: {
    name: msg("Scripture"),
    steps: [
      {
        title: msg("A quick look around"),
        body: msg("This takes about a minute. Use the arrow keys or the buttons, and press Esc to stop at any time."),
      },
      {
        target: [".desk-switch"],
        title: msg("Two desks"),
        body: msg("The Presenter Desk is for scripture, songs and sermons. The Production Desk is for cameras, scenes and video."),
      },
      {
        target: [".pb-modes"],
        title: msg("Scripture, Songs and Sermon"),
        body: msg("Switch pages here. Each page keeps its own Preview and panels, and what is live stays live while you move."),
      },
      {
        target: ["label.bible-search"],
        title: msg("Find any verse"),
        body: msg("Type a reference like John 3:16, or a few words you remember. Press / to jump here from anywhere."),
      },
      {
        target: [".verse-list"],
        title: msg("Pick the verses"),
        body: msg("Click a verse to put it on Preview. Shift-click another to show a range."),
      },
      {
        target: [".pb-panel.preview"],
        title: msg("Preview is only for you"),
        body: msg("Get the next thing ready here. The congregation does not see Preview."),
      },
      {
        target: [".pb-panel.output"],
        title: msg("Program is what they see"),
        body: msg("Program shows exactly what is on the audience screen. A red edge means you are on air."),
      },
      ...LIVE_STEPS,
      {
        target: [".pb-foot .go"],
        title: msg("Let it listen"),
        body: msg("Turn on Listen and the desk follows the sermon: it finds the verse being read and puts it on Preview. Say “next verse” to move on."),
      },
      {
        target: ['[data-tour="view"]'],
        title: msg("Make room"),
        body: msg("Show or hide the library, the queue and the monitors. Each page remembers its own choice."),
      },
      TOUR_BUTTON,
    ],
  },
  songs: {
    name: msg("Songs"),
    steps: [
      {
        title: msg("Songs in a minute"),
        body: msg("Find a song, open it, and step through its sections. Press Esc to stop at any time."),
      },
      {
        target: [".song-desk .sidebar", ".song-desk .rail"],
        title: msg("Your song library"),
        body: msg("Search by title, author or a line of the lyrics. Folders keep hymns, worship and seasonal songs apart."),
      },
      {
        target: [".song-desk .imports"],
        title: msg("Bring songs in"),
        body: msg("Import lyric files, a whole folder, SongSelect or OpenLyrics files. Export saves them for other apps."),
      },
      {
        target: [".song-desk .sheet"],
        title: msg("The song"),
        body: msg("Open a song to see its sections. Click a section to put it on Preview; edit the words here too."),
      },
      {
        target: [".song-desk .stage .screen.preview", ".song-desk .stage"],
        title: msg("Preview and Program"),
        body: msg("Preview is yours; Program is what the congregation sees. Use the arrows or Space to move through the song."),
      },
      {
        target: [".song-desk .detect"],
        title: msg("Follow the singing"),
        body: msg("Turn on Listen and Follow singing, and the next section comes up on Preview as the room sings."),
      },
      ...LIVE_STEPS,
      TOUR_BUTTON,
    ],
  },
  sermon: {
    name: msg("Sermon"),
    steps: [
      {
        title: msg("Sermons in a minute"),
        body: msg("Plan the message, keep private notes, and show each point when it comes. Press Esc to stop at any time."),
      },
      {
        target: [".sermon-desk .sidebar", ".sermon-desk .rail"],
        title: msg("Your sermons"),
        body: msg("Every sermon you write is kept here. Search finds a title, a speaker, a note or a verse."),
      },
      {
        target: [".sermon-desk .sheet"],
        title: msg("The outline"),
        body: msg("Write the points and the verses. Click a point to put it on Preview."),
      },
      {
        target: [".sermon-desk .speaker"],
        title: msg("Desk notes stay private"),
        body: msg("Notes for the point on Preview show here. They never reach the screen."),
      },
      ...LIVE_STEPS,
      TOUR_BUTTON,
    ],
  },
  service: {
    name: msg("Service"),
    steps: [
      {
        title: msg("Run the whole service"),
        body: msg("Plan everything in order, then move through it item by item on Sunday. Press Esc to stop at any time."),
      },
      {
        target: [".service-desk .sidebar", ".service-desk .rail"],
        title: msg("Your services"),
        body: msg("Each Sunday or event is its own service. Open last week's to reuse it."),
      },
      {
        target: [".service-desk .order", ".service-desk .blank"],
        title: msg("The running order"),
        body: msg("Sections in order, like Welcome, Worship, Word and Closing. Click an item to put it on Preview; the arrows reorder it."),
      },
      {
        target: [".service-desk .add-bar"],
        title: msg("Add anything"),
        body: msg("Songs, scripture, slide decks (PowerPoint too), pictures and videos, announcements and looks go into the selected section."),
      },
      {
        target: [".service-desk .next"],
        title: msg("Up next"),
        body: msg("Next item moves Preview on through the service. The arrows step inside an item first, like a song's sections."),
      },
      ...LIVE_STEPS,
      TOUR_BUTTON,
    ],
  },
  production: {
    name: msg("Production"),
    steps: [
      {
        title: msg("The Production Desk"),
        body: msg("Scenes, cameras and video, the way a broadcast switcher works. Press Esc to stop at any time."),
      },
      {
        target: [".prod-modes"],
        title: msg("Scenes and Looks"),
        body: msg("Scenes runs the service with scenes. Looks is where you design layouts like scripture over a camera."),
      },
      {
        target: [".pane.preview"],
        title: msg("Preview"),
        body: msg("The next scene waits here. Nobody else sees it."),
      },
      {
        target: [".bridge"],
        title: msg("GO LIVE, CUT and FADE"),
        body: msg("GO LIVE shows Preview with the chosen transition. CUT switches instantly. FADE fades over the set time."),
      },
      {
        target: [".pane.program"],
        title: msg("Program"),
        body: msg("What the audience screen shows right now."),
      },
      {
        target: ['[data-tour="scenes"]'],
        title: msg("Scenes"),
        body: msg("A scene is a saved screen: a camera, a verse, a countdown. Click one to put it on Preview."),
      },
      {
        target: ['[data-tour="sources"]'],
        title: msg("Sources"),
        body: msg("The layers inside the selected scene. Add a camera, text, a timer or a picture."),
      },
      {
        target: ['[data-tour="media"]'],
        title: msg("Media"),
        body: msg("Pictures, videos, cameras and slides ready to drop into a scene."),
      },
      {
        target: [".output-trigger"],
        title: msg("The audience screen"),
        body: msg("Open the audience window here and put it on the projector, TV or stream."),
      },
      TOUR_BUTTON,
    ],
  },
};

export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Where the tour card goes: below the spotlight if it fits, else above, else beside it,
 * always inside the window with a margin.
 */
export function placeCard(target: Rect | null, card: { width: number; height: number }, view: { width: number; height: number }, gap = 14, margin = 12): { left: number; top: number } {
  const clampLeft = (left: number) => Math.min(Math.max(margin, left), view.width - card.width - margin);
  const clampTop = (top: number) => Math.min(Math.max(margin, top), view.height - card.height - margin);
  if (!target) return { left: clampLeft((view.width - card.width) / 2), top: clampTop((view.height - card.height) / 2) };
  const centerX = target.left + target.width / 2 - card.width / 2;
  const below = target.top + target.height + gap;
  if (below + card.height + margin <= view.height) return { left: clampLeft(centerX), top: below };
  const above = target.top - gap - card.height;
  if (above >= margin) return { left: clampLeft(centerX), top: above };
  const right = target.left + target.width + gap;
  const middleY = clampTop(target.top + target.height / 2 - card.height / 2);
  if (right + card.width + margin <= view.width) return { left: right, top: middleY };
  const left = target.left - gap - card.width;
  if (left >= margin) return { left, top: middleY };
  // Huge target: sit inside it, near the bottom.
  return { left: clampLeft(centerX), top: clampTop(target.top + target.height - card.height - margin * 2) };
}

/** Tours grouped by desk, in the order the hub lists them. */
export const TOUR_GROUPS: { name: string; tours: TourId[] }[] = [
  { name: msg("Presenter Desk"), tours: ["scriptures", "songs", "sermon", "service"] },
  { name: msg("Production Desk"), tours: ["production"] },
];

/** How far someone got in each tour: the furthest step seen (index into the full list), and done. */
export type TourProgress = Record<TourId, { seen: number; done: boolean }>;

const TOUR_IDS = Object.keys(TOURS) as TourId[];

export function emptyTourProgress(): TourProgress {
  return Object.fromEntries(TOUR_IDS.map((id) => [id, { seen: -1, done: false }])) as TourProgress;
}

export function sanitizeTourProgress(value: unknown): TourProgress {
  const record = value && typeof value === "object" ? (value as Record<string, { seen?: unknown; done?: unknown }>) : {};
  return Object.fromEntries(
    TOUR_IDS.map((id) => {
      const seen = Number(record[id]?.seen);
      const last = TOURS[id].steps.length - 1;
      return [id, { seen: Number.isInteger(seen) ? Math.min(last, Math.max(-1, seen)) : -1, done: record[id]?.done === true }];
    }),
  ) as TourProgress;
}

export type TourStatus = { label: string; state: "done" | "partial" | "new"; seen: number; total: number };

export function tourStatus(progress: TourProgress, id: TourId): TourStatus {
  const total = TOURS[id].steps.length;
  const { seen, done } = progress[id];
  if (done) return { label: msg("Done"), state: "done", seen: total, total };
  if (seen < 0) return { label: msg("Not started"), state: "new", seen: 0, total };
  return { label: `${seen + 1} of ${total}`, state: "partial", seen: seen + 1, total };
}
