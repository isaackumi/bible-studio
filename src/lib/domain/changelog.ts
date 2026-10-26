// What changed in each version, written once for people, not developers. It feeds the What's new
// card (shown once after an update), the update note on the desk, and the GitHub release notes
// (scripts/release-notes.ts). Add the new version at the top before tagging a release: three to five
// highlights, each one line a volunteer would understand.

import { msg } from "../i18n/core";

export type Highlight = { icon: string; title: string; text: string };
export type Release = { version: string; date: string; highlights: Highlight[] };

export const CHANGELOG: Release[] = [
  {
    version: "0.6.4",
    date: "2026-10-26",
    highlights: [
      { icon: "transition", title: msg("A third desk: the Conductor Desk"), text: msg("Next and Live side by side with a lever between them: push it up and Next goes live. The service runs along the top, one box finds verses, songs and service items, and listening drops the verses it hears onto Next. Choose it in the desk switcher.") },
      { icon: "type", title: msg("The screen's look, changed while it shows"), text: msg("On the Conductor Desk, text size, font, lining up, where the words sit, the theme and the Bible version are on one line under the screens. Changes show on the screen at once, or wait on Next for the lever.") },
      { icon: "eye", title: msg("Easier to read and use"), text: msg("Clearer colours on the Day desk, a visible outline on every search box, larger small text, and the computer's Increase contrast and Reduce motion settings followed.") },
    ],
  },
  {
    version: "0.6.3",
    date: "2026-10-25",
    highlights: [
      { icon: "bible", title: msg("The Berean Standard Bible, built in"), text: msg("A modern English Bible, free for every church, installed with the King James and the World English Bible. Choose it like any other version.") },
      { icon: "mic", title: msg("Listening knows old and modern wording"), text: msg("A verse quoted in modern words (\u201cFor I know the plans I have for you\u201d, \u201cLove is patient\u201d) or in the King James is found either way, and shown in the version your desk uses.") },
    ],
  },
  {
    version: "0.6.2",
    date: "2026-10-25",
    highlights: [
      { icon: "mic", title: msg("Listening hears more of what preachers say"), text: msg("References said the way preachers say them (\u201cPhilippians 4 and verse 13\u201d, \u201cLuke 15\u2026 verse 11\u201d, \u201cGo with me to Psalm 23\u201d), and verses from a short phrase of them (\u201cin him is life\u201d, \u201cthe Lord is my shepherd\u201d). The noise filter no longer muffles the voice listening hears, and everyday words are no longer learned as books.") },
      { icon: "download", title: msg("Keep a recording of listening"), text: msg("Settings \u203a Sound & voice \u203a Listening recording keeps the sound listening heard and a timed list of what it understood, in Documents \u203a Church Studio Listening. Send it to us to make listening better for your church.") },
    ],
  },
  {
    version: "0.6.1",
    date: "2026-10-25",
    highlights: [
      { icon: "screens", title: msg("Every screen shows what you choose"), text: msg("Name your monitors (\u201cMain auditorium (HISENSE)\u201d). Give a screen one job and let it take others between: a scripture screen can show songs, and a verse takes over the moment it goes live. Preview says which screens LIVE will reach, and Settings \u203a More screens shows where everything goes.") },
      { icon: "cast", title: msg("TVs over Wi-Fi, set up once"), text: msg("A TV over Wi-Fi can be one of your screens, with its own job. Bookmark its link on the TV once: it keeps working when the computer's address changes, and Settings shows which Wi-Fi network the TV must join.") },
    ],
  },
  {
    version: "0.6.0",
    date: "2026-10-25",
    highlights: [
      { icon: "screens", title: msg("A TV over Wi-Fi, no cable needed"), text: msg("Audience output \u203a Show on a TV over Wi-Fi: open the address it shows on the TV's own browser, and the screen appears there over the church Wi-Fi, without an HDMI cable or the internet. Words and pictures show; videos stay on this computer for now.") },
    ],
  },
  {
    version: "0.5.9",
    date: "2026-10-25",
    highlights: [
      { icon: "screens", title: msg("Safer when you are live"), text: msg("BLACK is always in sight, and Undo sits beside CLEAR after any change on the screen. When Auto LIVE is on it says so beside LIVE, with one click back to Preview first. Backspace just after typing no longer clears the screen.") },
      { icon: "alerts", title: msg("Notes you can read"), text: msg("The desk's notes stack instead of covering each other, and problems show in amber. Phones say when they are reconnecting.") },
    ],
  },
  {
    version: "0.5.8",
    date: "2026-10-25",
    highlights: [
      { icon: "alerts", title: msg("Sunday morning, looked after"), text: msg("When the TV drops out, a banner says so and Program waits for it. On a service day the desk checks the screens, the service and the backup by itself and says what needs a look. Backups now happen on their own, to Documents \u203a Church Studio Backups.") },
      { icon: "cloud", title: msg("Sync at a glance"), text: msg("A cloud in the top bar shows whether your library is synced, syncing or offline. Cloud space explains why another computer may not be found on the network.") },
      { icon: "users", title: msg("Names in games"), text: msg("Players keep one name each, and their phone remembers it for next time. The desk can rename or remove a player whose name is not for the screen (Audience \u203a Pick someone \u203a Names).") },
    ],
  },
  {
    version: "0.5.7",
    date: "2026-10-25",
    highlights: [
      { icon: "screens", title: msg("Mac: a TV that blinks stays off your desk"), text: msg("When the TV or projector drops out for a moment, the audience window waits for it to come back instead of covering the laptop's own screen.") },
    ],
  },
  {
    version: "0.5.6",
    date: "2026-10-25",
    highlights: [
      { icon: "laptop", title: msg("Pictures and videos from the computer next door"), text: msg("On Premium and Church, your computers on the same network find each other and hand over the pictures, videos and audio a service needs: in seconds, without the cloud space, and even with the internet out. Works over Wi-Fi, Ethernet, or a cable straight between two computers. Settings › Cloud space shows which computers are on this network.") },
    ],
  },
  {
    version: "0.5.5",
    date: "2026-10-25",
    highlights: [
      { icon: "users", title: msg("Invite your team by email"), text: msg("On a Church plan, add someone in Settings › Plan & account and they get an email from you naming the church. They download Church Studio, sign in with that address, and the church's library comes to their computer. No license key to pass around. You see who has joined, and can send the invitation again.") },
      { icon: "screens", title: msg("Mac: the audience screen's status tells the truth"), text: msg("A Mac no longer warns that the audience window misses the screen when it covers it, and a rare crash on start is gone.") },
    ],
  },
  {
    version: "0.5.4",
    date: "2026-10-24",
    highlights: [
      { icon: "cloud", title: msg("Your library in the cloud"), text: msg("Premium and Church keep songs, services, slides and media in the cloud: every computer on the licence sees the same library, and a new computer gets it all back when it signs in. Settings › Account shows the space used and lets you free some.") },
      { icon: "laptop", title: msg("Moving to a new computer"), text: msg("Move Premium to this computer in one step; the one it left drops to Free. Or carry the whole library in a .churchstudio file from Settings › Storage, media included.") },
      { icon: "layout", title: msg("Design studio: show without leaving"), text: msg("Going live keeps the studio open. A glass bar over the canvas says which page is live, steps pages, previews, runs a slideshow at the pace you choose, and can be dragged anywhere or folded to a dot.") },
      { icon: "sparkles", title: msg("Tours, search, and games"), text: msg("Guided tours for the audience, the design studio, pictures and sound. Go to anything (⌘K / Ctrl+K) finds settings, actions and help. The quiz leaderboard climbs between answers again, and questions move on by themselves.") },
      { icon: "bible", title: msg("What Free includes"), text: msg("Free is the Bible on the wall: the Scriptures page and the audience screen. Songs, services, slides, media and the rest come with Premium.") },
    ],
  },
  {
    version: "0.5.3",
    date: "2026-10-24",
    highlights: [
      { icon: "screens", title: msg("Choosing the audience screen on Windows"), text: msg("The audience window now opens on its own thread, so the desk keeps responding while it appears.") },
    ],
  },
  {
    version: "0.5.2",
    date: "2026-10-24",
    highlights: [
      { icon: "screens", title: msg("Presenting on Windows, without freezing"), text: msg("Choosing the screen for the audience no longer makes the app stop responding.") },
      { icon: "pencil", title: msg("Design studio edits are kept"), text: msg("A change typed just before clicking elsewhere, like a QR code's text, is saved instead of lost.") },
    ],
  },
  {
    version: "0.5.1",
    date: "2026-10-24",
    highlights: [
      { icon: "sparkles", title: msg("Word clouds and ratings"), text: msg("A poll can ask for a few words and grow a word cloud on the screen, or a rating from 1 to 5 or 10, shown as bars and an average. You can hide any word.") },
      { icon: "stage", title: msg("Now running"), text: msg("A small bar under the top shows what keeps going while you work elsewhere (a quiz, a slideshow, music, captions) with its next step and a way back to it.") },
      { icon: "audio", title: msg("Sound on Windows goes where you choose"), text: msg("The speaker you pick becomes the computer's sound, so music, videos and YouTube all play there, and the computer's own choice comes back when you quit.") },
      { icon: "mic", title: msg("Listening that tells you what's wrong"), text: msg("An unplugged microphone, or one held by a call in another app, is named instead of going quiet. Accurate listening checks the computer can run it before you download it.") },
      { icon: "laptop", title: msg("Steadier on Windows"), text: msg("The audience screen lands in the right place on scaled screens and never takes the keyboard, the desk no longer freezes on slow disks, and updates no longer fail with 404.") },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-10-24",
    highlights: [
      { icon: "users", title: msg("Pick someone at random"), text: msg("Audience › Pick someone spins through the names of everyone here and lands on a winner, a volunteer or who reads next. Or split the room into random groups.") },
      { icon: "list", title: msg("Ready-made polls, and anonymous ones"), text: msg("Six sample polls to try, from service feedback to planning a picnic. A poll can be anonymous: no names on the screen. Remove any sample you don't need.") },
      { icon: "check", title: msg("Games, smoother"), text: msg("Question 1 waits until someone has joined, a quiz opens with a Back bar (Esc works too), and games you've played say when, with Play again.") },
      { icon: "pencil", title: msg("A tidier quiz editor"), text: msg("Labelled fields, answers that line up, and Save at the foot.") },
    ],
  },
  {
    version: "0.4.9",
    date: "2026-10-24",
    highlights: [
      { icon: "refresh", title: msg("Quizzes that feel new on a replay"), text: msg("Questions come in a new order every time, and a quiz can ask a set number drawn from its pool, the ones the room has not had lately first.") },
      { icon: "music", title: msg("More game music"), text: msg("Six styles, from Upbeat pop and Arcade to a Gospel shuffle, an Epic final and calm Lo-fi, or Surprise me. Listen before you choose.") },
      { icon: "check", title: msg("Running a game, clearer"), text: msg("One big button says what happens next: Start question 1, Show the answer, Next. End game stops it and takes it off the screen.") },
      { icon: "users", title: msg("Who is here now"), text: msg("The room counts the phones that are with you, not everyone who ever joined, and a new game leaves out people who have gone.") },
      { icon: "phone", title: msg("A join screen that reads well"), text: msg("A bigger QR code that scans easily, and the address on one line, on wide, 4:3 and portrait screens alike.") },
    ],
  },
  {
    version: "0.4.8",
    date: "2026-10-24",
    highlights: [
      { icon: "audio", title: msg("Sound stays where you put it"), text: msg("A soundbar or speaker the computer already plays through is kept, and a change made in the computer's own sound settings is kept too. An output you move away from, like a screen with no speakers, is not picked again.") },
    ],
  },
  {
    version: "0.4.7",
    date: "2026-10-24",
    highlights: [
      { icon: "audio", title: msg("Sound for the room, not the laptop"), text: msg("Church Studio finds the church's sound system (a USB audio interface, or the audience screen's own speakers) and plays music, videos and YouTube there, with this computer's speakers as the fallback. Choose another output in Settings › Sound & voice.") },
      { icon: "refresh", title: msg("Plug in, pull out"), text: msg("An interface plugged in during the service takes over; if the one in use is unplugged, the sound moves and the desk says where. On a Mac the old sound output comes back when Church Studio quits.") },
    ],
  },
  {
    version: "0.4.6",
    date: "2026-10-24",
    highlights: [
      { icon: "layout", title: msg("A proper design studio"), text: msg("Templates, Text, Elements, Pictures and Background sit beside the canvas, with your pages along the bottom. About 400 templates in 16 kinds of page, each laid out for your screen, in any of 20 colour palettes and 6 font pairs.") },
      { icon: "download", title: msg("More templates to download"), text: msg("Add packs for Advent and Christmas, Easter, youth and kids, outreach, weddings and funerals, and sermon series when you want them.") },
      { icon: "screens", title: msg("From the studio to the screen"), text: msg("Show puts the page on Preview, shows it now, adds the deck to the service, or plays every page as a slideshow. My designs opens any deck, the newest first.") },
    ],
  },
  {
    version: "0.4.5",
    date: "2026-10-24",
    highlights: [
      { icon: "users", title: msg("Quizzes and polls, clearer"), text: msg("Quizzes and polls show as cards you can open, play as everyone or in teams, edit, duplicate or copy. Paste typed questions to make a quiz: a * marks the right answer.") },
      { icon: "music", title: msg("Samples to start with"), text: msg("18 public-domain hymns on any plan, four quiz packs, and a sample Sunday service with readings, sermon notes and announcements, offered at the end of setup and in Templates.") },
      { icon: "check", title: msg("Questions from the room read larger"), text: msg("Show the top question on screen in one press.") },
    ],
  },
  {
    version: "0.4.4",
    date: "2026-10-23",
    highlights: [
      { icon: "mic", title: msg("Listening with ElevenLabs or Deepgram"), text: msg("Bring your own key in Settings › Audio & voice for sharper listening that knows your church's words and the Bible's book names, in the app and in a web browser alike.") },
      { icon: "pdf", title: msg("PDFs that scroll like a web page"), text: msg("Choose Scroll as one long page on a PDF: every screen glides to where you are, and Next moves a little over half a screen. Scroll with the mouse over Program, or jump to a page.") },
      { icon: "video", title: msg("YouTube and Vimeo from a link"), text: msg("Add to service › YouTube takes a pasted link and can play it again in a loop, with or without sound.") },
      { icon: "laptop", title: msg("Better on Windows"), text: msg("If Windows keeps the microphone from Church Studio, listening now says which switch to turn on and opens that page of Settings. Shortcuts and help read Ctrl and Windows Settings.") },
      { icon: "check", title: msg("Fixes"), text: msg("Bible quizzes use the Bible the desk reads from. Music from a slideshow's Test, or from a game, stops when you move on.") },
    ],
  },
  {
    version: "0.4.3",
    date: "2026-10-23",
    highlights: [
      { icon: "mic", title: msg("Live sermon notes"), text: msg("On the Sermon page or in Preach mode, Take live notes keeps everything heard, and every few minutes your AI turns it into clean notes and puts misheard words right. You accept each version.") },
      { icon: "users", title: msg("Teams, and who was listening"), text: msg("Play quizzes in two to four teams. When a quiz ends, a report shows how many got each question right, the hardest one and the top players. Quizzes group by sermon series, with a series final.") },
      { icon: "media", title: msg("Picture slideshows, full window"), text: msg("Open Pictures to the whole window: a big grid, the picture large, and every setting in view. Add a title across the top, the clock, music from your library, a black background or pictures that fill the screen.") },
      { icon: "folder", title: msg("See what takes the space"), text: msg("Settings › Storage › Review files lists every picture and video with where it is used. Only the unused ones can be removed.") },
    ],
  },
  {
    version: "0.4.2",
    date: "2026-10-24",
    highlights: [
      { icon: "users", title: msg("Quizzes like a game show"), text: msg("Each player gets a colour. The screen shows a lobby, a Get ready countdown, the clock, how the room answered and who was fastest, a leaderboard where people climb as their points count up, and a podium with confetti. Music and sounds, and it can run by itself.") },
      { icon: "sparkles", title: msg("Quizzes written by your AI"), text: msg("From today's sermon, a book you are reading together, a Bible passage, a topic, or anything you paste: a summary, an article, notes or questions. You check every question before anyone plays.") },
      { icon: "phone", title: msg("Phones in the game"), text: msg("Each phone shows its player's colour, the answer shapes and the clock, then their points, their streak and their place: 2nd of 23.") },
      { icon: "speed", title: msg("Steady for a whole service"), text: msg("The audience screen stays awake, videos free their memory when they leave the screen, moving backgrounds take far less of the computer, and the Audience drawer opens to the full window.") },
    ],
  },
  {
    version: "0.4.1",
    date: "2026-10-23",
    highlights: [
      { icon: "layout", title: msg("Settings always in reach"), text: msg("The top bar fits any screen and text size: the desks are two small groups, and the tools on the right, with Settings, never leave the screen.") },
      { icon: "phone", title: msg("The phone remote over the internet"), text: msg("In Settings \u203a Phone remote, choose Internet: a phone on mobile data or another Wi-Fi controls the desk, after you approve it here. Wi-Fi stays the default.") },
      { icon: "folder", title: msg("Pictures: folders, Google Drive and videos"), text: msg("Folders show as coloured tiles with a path to click back through. Google Drive, iCloud, Dropbox and OneDrive appear when synced to this computer, and videos play in a slideshow to the end.") },
      { icon: "media", title: msg("Slideshow options"), text: msg("Switch on what you want: shuffle or newest first, a slow zoom, file names as captions, a countdown over the pictures, music that fades when it ends, and new pictures joining as they arrive.") },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-10-23",
    highlights: [
      { icon: "stage", title: msg("Design your own slides"), text: msg("A design studio with templates for any screen shape, gradients, shapes, icons, pictures and lower thirds. Find it with the Studio button at the top.") },
      { icon: "users", title: msg("Questions, quizzes and polls from phones"), text: msg("Open a room in Audience: people scan the QR code, or type the code on the screen, then ask, vote and play Bible games. Nothing reaches the screen until you put it there.") },
      { icon: "media", title: msg("Pictures from a folder, as a slideshow"), text: msg("Show pictures straight from any folder, without importing, or run them as a slideshow that fades on its own. Find it with the Pictures button at the top.") },
      { icon: "screens", title: msg("Phones and TVs as screens, and videos from a link"), text: msg("Any browser can show what your screen shows, over the internet. Play a video file or a live HLS stream from a web address.") },
      { icon: "speed", title: msg("Lighter, tidier and easier to fix"), text: msg("The app is 20 MB smaller, the desk keeps Program and Go LIVE in sight on laptops, and if Church Studio ever stops responding it tells us where, so we can fix it.") },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-10-22",
    highlights: [
      { icon: "user", title: msg("Sign in once, in your browser"), text: msg("Sign in comes back to Church Studio by itself, with no number to tap. From a phone or another computer, type the short code instead.") },
      { icon: "key", title: msg("Your plan goes with you"), text: msg("The free trial and license keys now belong to your account. Add your team by email in Settings › Account, and see every computer you are signed in on.") },
      { icon: "screens", title: msg("Steadier on Sunday"), text: msg("Installing a Bible, importing a video or starting to listen no longer freezes the desk or the projector, and quick clicks through verses always land on the right one.") },
      { icon: "layout", title: msg("Every screen shape"), text: msg("Looks with gaps or frames, theme previews and slide pages follow your screen's real shape, 4:3 and portrait included.") },
      { icon: "globe", title: msg("Clearer in French and Spanish"), text: msg("Desk messages are translated, and problems stand out as warnings in every language.") },
    ],
  },
  {
    version: "0.2.9",
    date: "2026-10-21",
    highlights: [
      { icon: "screens", title: msg("Two identical projectors work together"), text: msg("Two monitors of the same model are kept apart in Settings, the audience choice and Screens.") },
      { icon: "audio", title: msg("A steady Accurate listening download"), text: msg("Settings no longer flickers while the speech model downloads, and Cancel stops it at once.") },
      { icon: "folder", title: msg("Storage is easier to find"), text: msg("Space on this computer is now in Settings › Storage & backup.") },
    ],
  },
  {
    version: "0.2.8",
    date: "2026-10-21",
    highlights: [
      { icon: "bible", title: msg("Bibles in Ewe, Yorùbá, Igbo, Hausa and Asante Twi"), text: msg("Five more openly licensed Bibles in Settings › Bible, downloaded only when you choose one, then offline.") },
      { icon: "folder", title: msg("Space on this computer"), text: msg("Settings › Storage shows what Church Studio uses, finds pictures and videos nothing uses, and clears the cache or compacts the library.") },
      { icon: "audio", title: msg("Lighter Accurate listening"), text: msg("The speech model leaves memory a few minutes after you stop listening.") },
    ],
  },
  {
    version: "0.2.7",
    date: "2026-10-21",
    highlights: [
      { icon: "screens", title: msg("Screens with their own job"), text: msg("Give each extra monitor a job in Settings › Screens: a timer for the preacher, only scripture, only lyrics, or the stage view. Lock a screen so nothing changes it, or let each part of the service switch it.") },
      { icon: "check", title: msg("A start that never hangs"), text: msg("If Church Studio takes too long to start, it says why and lets you send the details to support.") },
    ],
  },
  {
    version: "0.2.6",
    date: "2026-10-21",
    highlights: [
      { icon: "mic", title: msg("Accurate listening"), text: msg("Choose Accurate in Settings › Sound & voice to listen on this computer. It hears accents and Bible names better, and audio never leaves the computer. A one-time 60 MB download.") },
      { icon: "audio", title: msg("More accents understood"), text: msg("Nearly 250 common mishearings of book names are put right, including “fast Corinthians”, “Tessalonians” and “chapta”.") },
    ],
  },
  {
    version: "0.2.5",
    date: "2026-10-21",
    highlights: [
      { icon: "audio", title: msg("Verses heard right, in your accent"), text: msg("Words the recognizer mishears, like “efficient 4” for Ephesians 4, are put right before verses are found. It learns from what you put up, and Settings › Sound & voice › Words has a Practice to teach it.") },
      { icon: "list", title: msg("Each part runs where you choose"), text: msg("On the Service page, a part can use the running order, the Presenter desk, the Production desk or any mix, skip this week, and show a countdown or the leader’s name your way.") },
      { icon: "search", title: msg("Go to anything"), text: msg("Press Command-K (Ctrl+K on Windows) on any page to jump to a part, a song, a verse or a setting.") },
      { icon: "globe", title: msg("Church Studio in Spanish"), text: msg("The whole desk in Spanish, chosen in Settings or from the computer’s language.") },
      { icon: "layout", title: msg("Cleaner looks on Production"), text: msg("Choose how regions meet (none, line, gap or framed panels) and the line’s colour, with more room for the picture.") },
      { icon: "check", title: msg("Fixes"), text: msg("Stronger borders and other settings are kept, the Privacy switch sits beside its text, long names fit, and Settings › Updates links the terms and privacy policy.") },
    ],
  },
  {
    version: "0.2.4",
    date: "2026-10-20",
    highlights: [
      { icon: "download", title: msg("Bring your songs from ProPresenter and EasyWorship"), text: msg("Import ProPresenter files or a whole EasyWorship library from Songs › Import, with parts, order and CCLI details.") },
      { icon: "bible", title: msg("Your own Bible, offline"), text: msg("Import a Bible file in your church's language (Zefania, OSIS or OpenSong) in Settings › Bible.") },
      { icon: "lyrics", title: msg("Chords for the band"), text: msg("Songs from ChordPro files show chords on the stage screen, and the song desk can change their key.") },
      { icon: "check", title: msg("Smoother setup"), text: msg("Setup ends with a verse ready to show, and the desk says when a trial ends or the plan needs to check in.") },
    ],
  },
  {
    version: "0.2.3",
    date: "2026-10-20",
    highlights: [
      { icon: "reset", title: msg("Undo on Program"), text: msg("Cleared or blacked the screen by mistake? Press Undo, or Command-Z (Ctrl+Z on Windows), and it comes back.") },
      { icon: "lyrics", title: msg("Keys for song parts"), text: msg("Press 1 to 9 for a part, or Shift with V, C or B for the next verse, chorus or bridge.") },
      { icon: "alerts", title: msg("The desk tells you what happened"), text: msg("A short line at the bottom explains when something could not be done, in amber when it matters.") },
      { icon: "check", title: msg("Safer by default"), text: msg("Clearing the queue takes two clicks and can be undone, unsaved song edits ask first, and Preview buttons stay on Preview.") },
    ],
  },
  {
    version: "0.2.2",
    date: "2026-10-20",
    highlights: [
      { icon: "timer", title: msg("Walk-in with a countdown"), text: msg("Start walk-in from Audio: the countdown goes on the screen, the music plays, and it fades by itself when the service starts.") },
      { icon: "audio", title: msg("Music that sounds right"), text: msg("Tracks play at an even volume and fade into each other, and playlists can shuffle.") },
      { icon: "keys", title: msg("A sound pad"), text: msg("Play an offering bell or an intro sting with one click, over everything else.") },
      { icon: "lyrics", title: msg("Backing tracks for songs"), text: msg("Give a song a backing track in the song editor, and it plays when the song goes live.") },
      { icon: "phone", title: msg("Music from your phone"), text: msg("The phone remote can play, skip and fade the music.") },
    ],
  },
  {
    version: "0.2.1",
    date: "2026-10-20",
    highlights: [
      { icon: "lyrics", title: msg("Songs line by line"), text: msg("Choose how many lines show at once with Lines on the song desk. The arrows step through them, and listening follows the line being sung.") },
      { icon: "speed", title: msg("Faster verse and song detection"), text: msg("What is read or sung reaches Preview much sooner, even with a large song library.") },
      { icon: "audio", title: msg("Your playlists stay as you left them"), text: msg("Church Studio now opens only once, so a second copy can no longer save over your music.") },
      { icon: "refresh", title: msg("Updates come to you"), text: msg("When a new version is ready, a note on the desk offers it, to install after the service.") },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-10-20",
    highlights: [
      { icon: "user", title: msg("Sign in, and your plan follows you"), text: msg("Optional. Sign in with an email link in your browser, and another computer only needs you to sign in. No key to copy.") },
      { icon: "key", title: msg("Plans and a free trial"), text: msg("Try Premium free for 14 days, then choose monthly or yearly from Settings › Account.") },
      { icon: "screens", title: msg("The audience screen waits for you"), text: msg("It opens when you first put something on Program, not as soon as Church Studio starts.") },
      { icon: "mic", title: msg("The microphone is asked for once"), text: msg("On a Mac, Church Studio now remembers your answer instead of asking again each time you listen.") },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-10-19",
    highlights: [{ icon: "sparkles", title: msg("Church Studio is here"), text: msg("Scripture, songs and sermons on screen, from one desk.") }],
  },
];

const parts = (version: string) => version.split(".").map((part) => Number.parseInt(part, 10) || 0);
/** -1, 0 or 1, comparing "0.10.0" after "0.9.0". */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

/**
 * The releases the public can have: up to the newest one on GitHub when that is known, else the
 * ones dated today or earlier. The next version is written here before it is tagged, and the
 * website must not announce it until the release is out.
 */
export function published(released: string | null, today: string, changelog = CHANGELOG): Release[] {
  return changelog.filter((release) => (released ? compareVersions(release.version, released) <= 0 : release.date <= today));
}

export function releaseFor(version: string, changelog = CHANGELOG): Release | null {
  return changelog.find((release) => compareVersions(release.version, version) === 0) ?? null;
}

/**
 * The card to show after an update: this version's highlights, once. A first install shows none
 * (setup already introduces the app), and neither does a version with nothing written for it.
 */
export function whatsNewFor(current: string, lastSeen: string | null, changelog = CHANGELOG): Release | null {
  if (!lastSeen || compareVersions(current, lastSeen) <= 0) return null;
  return releaseFor(current, changelog);
}

/** Markdown for a GitHub release. */
export function releaseNotes(version: string, changelog = CHANGELOG): string {
  const release = releaseFor(version, changelog);
  if (!release) return "Installed copies update from Settings › Updates.";
  return [
    "## What's new",
    "",
    ...release.highlights.map((highlight) => `- **${highlight.title}.** ${highlight.text}`),
    "",
    "Installed copies offer this update on the desk, or from Settings › Updates.",
  ].join("\n");
}
