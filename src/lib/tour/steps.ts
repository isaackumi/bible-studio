// The screen tour: one short guided walk per desk page. Each step points at a part of the
// screen (the first selector that is on screen wins) and says what it is for in plain words.
// Steps whose target is not showing (a hidden panel, a closed menu) are skipped.

export type TourId = "scriptures" | "songs" | "sermon" | "service" | "production";

export type TourStep = {
  /** CSS selectors, tried in order. None: a centered card with no spotlight. */
  target?: string[];
  title: string;
  body: string;
};

const TOUR_BUTTON: TourStep = {
  target: ['[aria-label="Show me around"]'],
  title: "Lost? Come back here",
  body: "Press this button any time to take this tour again. Each page has its own.",
};

const LIVE_STEPS: TourStep[] = [
  {
    target: [".pb-actions .live"],
    title: "LIVE sends it to the screen",
    body: "Nothing reaches the congregation until you press LIVE (or the Space bar). Then Preview becomes Program.",
  },
  {
    target: [".pb-actions"],
    title: "BLACK and CLEAR",
    body: "BLACK turns the screen black at once. CLEAR takes the words off. Neither changes what is on Preview.",
  },
  {
    target: [".output-trigger"],
    title: "The audience screen",
    body: "Open the audience window here and put it on the projector or TV. The button turns amber when Program is set but nobody can see it.",
  },
];

export const TOURS: Record<TourId, { name: string; steps: TourStep[] }> = {
  scriptures: {
    name: "Scripture",
    steps: [
      {
        title: "A quick look around",
        body: "This takes about a minute. Use the arrow keys or the buttons, and press Esc to stop at any time.",
      },
      {
        target: [".desk-switch"],
        title: "Two desks",
        body: "The Presenter Desk is for scripture, songs and sermons. The Production Desk is for cameras, scenes and video.",
      },
      {
        target: [".pb-modes"],
        title: "Scripture, Songs and Sermon",
        body: "Switch pages here. Each page keeps its own Preview and panels, and what is live stays live while you move.",
      },
      {
        target: ["label.bible-search"],
        title: "Find any verse",
        body: "Type a reference like John 3:16, or a few words you remember. Press / to jump here from anywhere.",
      },
      {
        target: [".verse-list"],
        title: "Pick the verses",
        body: "Click a verse to put it on Preview. Shift-click another to show a range.",
      },
      {
        target: [".pb-panel.preview"],
        title: "Preview is only for you",
        body: "Get the next thing ready here. The congregation does not see Preview.",
      },
      {
        target: [".pb-panel.output"],
        title: "Program is what they see",
        body: "Program shows exactly what is on the audience screen. A red edge means you are on air.",
      },
      ...LIVE_STEPS,
      {
        target: [".pb-foot .go"],
        title: "Let it listen",
        body: "Turn on Listen and the desk follows the sermon: it finds the verse being read and puts it on Preview. Say “next verse” to move on.",
      },
      {
        target: ['[aria-label="View"]'],
        title: "Make room",
        body: "Show or hide the library, the queue and the monitors. Each page remembers its own choice.",
      },
      TOUR_BUTTON,
    ],
  },
  songs: {
    name: "Songs",
    steps: [
      {
        title: "Songs in a minute",
        body: "Find a song, open it, and step through its sections. Press Esc to stop at any time.",
      },
      {
        target: [".song-desk .sidebar", ".song-desk .rail"],
        title: "Your song library",
        body: "Search by title, author or a line of the lyrics. Folders keep hymns, worship and seasonal songs apart.",
      },
      {
        target: [".song-desk .imports"],
        title: "Bring songs in",
        body: "Import lyric files, a whole folder, SongSelect or OpenLyrics files. Export saves them for other apps.",
      },
      {
        target: [".song-desk .sheet"],
        title: "The song",
        body: "Open a song to see its sections. Click a section to put it on Preview; edit the words here too.",
      },
      {
        target: [".song-desk .stage .screen.preview", ".song-desk .stage"],
        title: "Preview and Program",
        body: "Preview is yours; Program is what the congregation sees. Use the arrows or Space to move through the song.",
      },
      {
        target: [".song-desk .detect"],
        title: "Follow the singing",
        body: "Turn on Listen and Follow singing, and the next section comes up on Preview as the room sings.",
      },
      ...LIVE_STEPS,
      TOUR_BUTTON,
    ],
  },
  sermon: {
    name: "Sermon",
    steps: [
      {
        title: "Sermons in a minute",
        body: "Plan the message, keep private notes, and show each point when it comes. Press Esc to stop at any time.",
      },
      {
        target: [".sermon-desk .sidebar", ".sermon-desk .rail"],
        title: "Your sermons",
        body: "Every sermon you write is kept here. Search finds a title, a speaker, a note or a verse.",
      },
      {
        target: [".sermon-desk .sheet"],
        title: "The outline",
        body: "Write the points and the verses. Click a point to put it on Preview.",
      },
      {
        target: [".sermon-desk .speaker"],
        title: "Desk notes stay private",
        body: "Notes for the point on Preview show here. They never reach the screen.",
      },
      ...LIVE_STEPS,
      TOUR_BUTTON,
    ],
  },
  service: {
    name: "Service",
    steps: [
      {
        title: "Run the whole service",
        body: "Plan everything in order, then move through it item by item on Sunday. Press Esc to stop at any time.",
      },
      {
        target: [".service-desk .sidebar", ".service-desk .rail"],
        title: "Your services",
        body: "Each Sunday or event is its own service. Open last week's to reuse it.",
      },
      {
        target: [".service-desk .order", ".service-desk .blank"],
        title: "The running order",
        body: "Sections in order, like Welcome, Worship, Word and Closing. Click an item to put it on Preview; the arrows reorder it.",
      },
      {
        target: [".service-desk .add-bar"],
        title: "Add anything",
        body: "Songs, scripture, slide decks (PowerPoint too), pictures and videos, announcements and looks go into the selected section.",
      },
      {
        target: [".service-desk .next"],
        title: "Up next",
        body: "Next item moves Preview on through the service. The arrows step inside an item first, like a song's sections.",
      },
      ...LIVE_STEPS,
      TOUR_BUTTON,
    ],
  },
  production: {
    name: "Production",
    steps: [
      {
        title: "The Production Desk",
        body: "Scenes, cameras and video, the way a broadcast switcher works. Press Esc to stop at any time.",
      },
      {
        target: [".prod-modes"],
        title: "Studio and Looks",
        body: "Studio runs the service with scenes. Looks is where you design layouts like scripture over a camera.",
      },
      {
        target: [".pane.preview"],
        title: "Preview",
        body: "The next scene waits here. Nobody else sees it.",
      },
      {
        target: [".bridge"],
        title: "GO LIVE, CUT and FADE",
        body: "GO LIVE shows Preview with the chosen transition. CUT switches instantly. FADE fades over the set time.",
      },
      {
        target: [".pane.program"],
        title: "Program",
        body: "What the audience screen shows right now.",
      },
      {
        target: ['[data-tour="scenes"]'],
        title: "Scenes",
        body: "A scene is a saved screen: a camera, a verse, a countdown. Click one to put it on Preview.",
      },
      {
        target: ['[data-tour="sources"]'],
        title: "Sources",
        body: "The layers inside the selected scene. Add a camera, text, a timer or a picture.",
      },
      {
        target: ['[data-tour="media"]'],
        title: "Media",
        body: "Pictures, videos, cameras and slides ready to drop into a scene.",
      },
      {
        target: [".output-trigger"],
        title: "The audience screen",
        body: "Open the audience window here and put it on the projector, TV or stream.",
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
  { name: "Presenter Desk", tours: ["scriptures", "songs", "sermon", "service"] },
  { name: "Production Desk", tours: ["production"] },
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
  if (done) return { label: "Done", state: "done", seen: total, total };
  if (seen < 0) return { label: "Not started", state: "new", seen: 0, total };
  return { label: `${seen + 1} of ${total}`, state: "partial", seen: seen + 1, total };
}
