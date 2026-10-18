# Mac testing checklist

Things that can only be checked in the real app on a Mac, with a second screen and a phone on the same Wi-Fi. Run `npm run tauri dev` (or install a build), then work down the list. Tick each box, or note what went wrong beside it.

You need a Mac, a second display or projector (HDMI or AirPlay), a phone on the same network, speakers, and a microphone.

## 1. Saving

- [ ] Add a song, a service with three parts, a theme with a background photo, and a macro. Quit with ⌘Q straight away (within a second). Reopen: all four are there.
- [ ] Change the desk's Bible translation (for example to Twi). Quit and reopen: it is still selected.
- [ ] Start a service part, quit, reopen: the part's start time and the time left are kept.
- [ ] Delete a service and a media file. Reopen: both are gone, and the file is gone from the media folder too.
- [ ] Gone live list: put three verses live, pin one, remove one. Reopen: the order, the pin and the removal are kept.

## 2. Screens

- [ ] Connect the second display. Settings › Screens shows it, and Output goes full screen on it, with nothing at the edges.
- [ ] Try a 4:3 projector or a wide LED wall if you have one: words and backgrounds fit the shape, with nothing cut off or stretched.
- [ ] A second output (stage or lobby) on a third screen shows its own look.
- [ ] Unplug the display while live, then plug it back in: the app doesn't freeze and the output comes back.
- [ ] Black, Logo, Clear and Clear words each do what they say on the real screen.
- [ ] Countdown: on the screen in each corner, full screen, and at a bigger font size.

## 3. Phones (same Wi-Fi)

- [ ] The phone remote QR code opens on the phone, and Next and Previous move the screen.
- [ ] The stage link shows the current and next words, the clock, and the section time left. A message from the desk shows up.
- [ ] The captions link shows live speech, and the translated line if translation is on.
- [ ] Lock and unlock the phone: it reconnects by itself.

## 4. Sound

- [ ] Play a walk-in playlist through the speakers. Fade out takes the set seconds and doesn't click at the end.
- [ ] A video with sound plays through the same speakers, and its volume follows the slider.
- [ ] Live captions: allow the microphone when the Mac asks. Speech shows in the transcript panel, not on the screen, unless captions are turned on for the screen.

## 5. Macros

- [ ] "Start the service" with walk-in music playing: the music fades, the first part starts, and its first item goes live.
- [ ] "Over to the preacher": the next part starts, the countdown shows, and the stage phone shows "Time starts now".
- [ ] A macro with a step that can't run (for example, playing a deleted playlist) stops there and names that step.

## 6. Printing

- [ ] Programme outline › Print or save as PDF: the Mac print window opens. Save as PDF, then open the file. It's one clean page per service with no app controls on it.
- [ ] Copy as text, then paste into Messages: the times and parts line up.

## 7. NDI

- [ ] Turn on the NDI fill and key. In OBS or vMix (NDI source) both appear, and the key cuts the words cleanly over a camera.
- [ ] Leave it running through a full service: no stalls, and the CPU stays reasonable in Activity Monitor.

## 8. Bibles

- [ ] Twi: John 3:16 and Psalm 23 show. The licence credit appears where the other translations show theirs.
- [ ] Find a verse: "jn 3 16", "ps 23", and part of a verse's words each find the right passage fast.

## 9. General

- [ ] Keyboard: change a shortcut in Settings › Keyboard, quit, reopen: the change is kept and the key works.
- [ ] Dark and light Mac appearance both look right.
- [ ] Shrink the window to its smallest: nothing overlaps on the top bar or the Service page.
