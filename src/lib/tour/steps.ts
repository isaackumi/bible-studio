// The screen tour: one short guided walk per desk page. Each step points at a part of the
// screen (the first selector that is on screen wins) and says what it is for in plain words.
// Steps whose target is not showing (a hidden panel, a closed menu) are skipped.

import { msg } from "../i18n/core";

export type TourId = "scriptures" | "songs" | "sermon" | "service" | "production" | "audience" | "design" | "pictures" | "sound";

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
  audience: {
    name: msg("Audience & phones"),
    steps: [
      {
        title: msg("Phones in the room"),
        body: msg("Open Audience and a room starts: people scan a code to ask questions, play quizzes, answer polls or be picked. Nothing reaches the screen until you put it there."),
      },
      {
        target: ['[data-tour="aud-join"]'],
        title: msg("Scan to join"),
        body: msg("The QR code and the six-letter code go on the screen with Show join. Anyone with a phone is in: no app, no sign-in."),
      },
      {
        target: ['[data-tour="aud-tabs"]'],
        title: msg("Three things to do"),
        body: msg("Questions from the room, quizzes and polls, and picking someone at random. Each tab is its own panel."),
      },
      {
        target: ['[data-tour="aud-questions"]'],
        title: msg("Questions, on your terms"),
        body: msg("Taking questions is off until you turn it on. Hold for approval keeps each one here until you put it through to the screen."),
      },
      {
        target: ['[data-tour="aud-tab-games"]'],
        title: msg("Quizzes and polls"),
        body: msg("Ready-made quizzes and polls to try, or your own. Questions come in a new order each time; a poll can be anonymous, a word cloud or a rating."),
      },
      {
        target: ['[data-tour="game-step"]'],
        title: msg("One button runs the game"),
        body: msg("It always says what happens next: start the question, stop answers, show the answer, the leaderboard, the next question. By default it moves on by itself."),
      },
      {
        target: ['[data-tour="game-switches"]'],
        title: msg("How the game runs"),
        body: msg("Sounds and music styles, a countdown to read each question, and whether the game moves on by itself or waits for you to press Next."),
      },
      {
        target: ['[data-tour="aud-tab-pick"]'],
        title: msg("Pick someone"),
        body: msg("Spin through the names of everyone here and land on one, or split the room into random groups."),
      },
      {
        target: ['[data-tour="now-running"]'],
        title: msg("Now running"),
        body: msg("Leave this panel and a small bar under the top keeps the game's next step within reach, with a way back to it."),
      },
      TOUR_BUTTON,
    ],
  },
  design: {
    name: msg("Design studio"),
    steps: [
      {
        title: msg("The design studio"),
        body: msg("Slides, lower thirds, announcements and logos, designed here and used anywhere: on Preview, on the screen, or in the service."),
      },
      {
        target: ['.deck-editor .rail'],
        title: msg("Tools down the side"),
        body: msg("Templates, text, pictures, shapes, icons, gradients and your media, each a panel."),
      },
      {
        target: ['.deck-editor .side'],
        title: msg("Start from a template"),
        body: msg("Welcome, event, verse, sermon and giving pages in many styles. Add one as a new page or replace this one, then change anything."),
      },
      {
        target: ['.deck-editor .toolbar'],
        title: msg("Add to the page"),
        body: msg("Text, a picture, a shape, an icon or a QR code. Drag to place it, resize from the corners."),
      },
      {
        target: ['.deck-editor .canvas-area'],
        title: msg("The page"),
        body: msg("Click an element to edit it; double-click text to type. The inspector on the right changes fonts, colours, fit and animation."),
      },
      {
        target: ['.deck-editor .pages'],
        title: msg("Pages"),
        body: msg("A deck can hold many pages. Drag to reorder; each page can go on the screen on its own."),
      },
      {
        target: ['.deck-editor .save'],
        title: msg("Save, then use it"),
        body: msg("A saved deck shows up in Slides on the desk, in Add to service, and as a source in the Production Desk."),
      },
      TOUR_BUTTON,
    ],
  },
  pictures: {
    name: msg("Pictures & slideshows"),
    steps: [
      {
        title: msg("Pictures from any folder"),
        body: msg("Show photos straight from a folder on this computer or a USB stick: no importing, no library."),
      },
      {
        target: ['[data-tour="pic-folder"]'],
        title: msg("Choose a folder"),
        body: msg("Pick a folder once; its pictures appear here, and the folders inside it too."),
      },
      {
        target: ['.folders'],
        title: msg("Folders inside"),
        body: msg("Open any folder inside with a click. Back takes you up a level."),
      },
      {
        target: ['.grid[role="listbox"]'],
        title: msg("Pictures"),
        body: msg("Click one to put it on Preview; LIVE sends it to the screen. The arrow keys move through them."),
      },
      {
        target: ['.start-btn'],
        title: msg("Slideshow"),
        body: msg("Start from the first picture or the one you chose. It changes by itself at the pace you set, and loops."),
      },
      {
        target: ['.slideshow'],
        title: msg("Slideshow settings"),
        body: msg("Seconds per picture, how one changes to the next, and whether to shuffle."),
      },
      TOUR_BUTTON,
    ],
  },
  sound: {
    name: msg("Sound & voice"),
    steps: [
      {
        title: msg("Sound and voice"),
        body: msg("Where the room hears Church Studio, and how Church Studio listens to you."),
      },
      {
        target: ['.settings-body .picker'],
        title: msg("Where sound goes"),
        body: msg("Music, the sound pad and videos on the audience screen play through the output chosen here. Automatic follows the church's sound system when it is plugged in."),
      },
      {
        target: ['[data-tour="audio-mic"]'],
        title: msg("The microphone"),
        body: msg("Listening needs the microphone. If the computer refused it, this row says where to allow it."),
      },
      {
        target: ['.settings-body .choices'],
        title: msg("Which recognizer listens"),
        body: msg("System is built in and light. Accurate runs Whisper on this computer. ElevenLabs and Deepgram use your own key and hear accents best."),
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

/** The plan feature a tour walks through: locked in the hub, and the upgrade prompt opens instead, without it. */
export const TOUR_FEATURES: Partial<Record<TourId, import("../domain/plans").PlanFeature>> = { songs: "songs", sermon: "sermon", service: "service", production: "production", audience: "audience", design: "slides", pictures: "media" };

/** Tours grouped by desk, in the order the hub lists them. */
export const TOUR_GROUPS: { name: string; tours: TourId[] }[] = [
  { name: msg("Presenter Desk"), tours: ["scriptures", "songs", "sermon", "service"] },
  { name: msg("Production Desk"), tours: ["production"] },
  { name: msg("Audience & phones"), tours: ["audience"] },
  { name: msg("Design & pictures"), tours: ["design", "pictures"] },
  { name: msg("Sound & voice"), tours: ["sound"] },
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
