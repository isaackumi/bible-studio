// The audio deck: walk-in music, backing tracks and other audio, played on this computer through
// one audio element that lives for the whole app, so music keeps playing on every page.
// Sound goes to the computer's sound output (the church's mixer); it never goes through a screen.

import { mediaUrl } from "../db/api";
import { nextTrackIndex } from "../domain/playlists";
import type { MediaAsset } from "../domain/types";

export class AudioDeck {
  /** The tracks being played, in order (a playlist, or one track). */
  queue = $state<MediaAsset[]>([]);
  /** Which playlist the queue came from, if any. */
  playlistId = $state<string | null>(null);
  index = $state(0);
  playing = $state(false);
  time = $state(0);
  duration = $state(0);
  volume = $state(0.8);
  loop = $state(false);
  fading = $state(false);
  error = $state("");

  #element: HTMLAudioElement | null = null;
  #fadeTimer: ReturnType<typeof setInterval> | null = null;

  get current(): MediaAsset | null {
    return this.queue[this.index] ?? null;
  }

  #audio(): HTMLAudioElement | null {
    if (typeof Audio === "undefined") return null;
    if (this.#element) return this.#element;
    const element = new Audio();
    element.preload = "auto";
    element.volume = this.volume;
    element.addEventListener("timeupdate", () => (this.time = element.currentTime));
    element.addEventListener("durationchange", () => (this.duration = Number.isFinite(element.duration) ? element.duration : 0));
    element.addEventListener("play", () => (this.playing = true));
    element.addEventListener("pause", () => (this.playing = false));
    element.addEventListener("ended", () => void this.#advance());
    element.addEventListener("error", () => {
      this.error = `${this.current?.name ?? "That track"} could not be played.`;
      this.playing = false;
    });
    this.#element = element;
    return element;
  }

  /** Play a list of tracks from one of them. */
  play = async (tracks: MediaAsset[], index = 0, options: { playlistId?: string | null; loop?: boolean } = {}) => {
    const playable = tracks.filter((track) => track.kind === "audio");
    if (!playable.length) return;
    this.#stopFade(true);
    this.queue = playable;
    this.playlistId = options.playlistId ?? null;
    this.loop = options.loop ?? false;
    await this.#load(Math.min(Math.max(0, index), playable.length - 1));
  };

  async #load(index: number) {
    const audio = this.#audio();
    const track = this.queue[index];
    if (!audio || !track) return;
    const url = mediaUrl(track);
    if (!url) {
      this.error = `${track.name} is missing from the media library.`;
      return;
    }
    this.index = index;
    this.error = "";
    this.time = 0;
    audio.src = url;
    audio.volume = this.volume;
    try {
      await audio.play();
    } catch (error) {
      this.error = error instanceof Error && error.name === "NotAllowedError" ? "Press play to start the music." : `${track.name} could not be played.`;
    }
  }

  async #advance() {
    const next = nextTrackIndex(this.queue.length, this.index, 1, this.loop);
    if (next === null) {
      this.playing = false;
      this.time = 0;
      return;
    }
    await this.#load(next);
  }

  toggle = async () => {
    const audio = this.#audio();
    if (!audio || !this.current) return;
    if (!audio.src) return this.#load(this.index);
    this.#stopFade(true);
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        this.error = "The music could not start.";
      }
    } else audio.pause();
  };

  step = async (direction: 1 | -1) => {
    // Previous restarts the track when it is a few seconds in, like any music player.
    if (direction < 0 && this.time > 3 && this.#element) {
      this.#element.currentTime = 0;
      return;
    }
    const next = nextTrackIndex(this.queue.length, this.index, direction, true);
    if (next !== null) await this.#load(next);
  };

  seek = (seconds: number) => {
    if (!this.#element || !Number.isFinite(seconds)) return;
    this.#element.currentTime = Math.max(0, Math.min(seconds, this.duration || seconds));
  };

  setVolume = (volume: number) => {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.#element && !this.fading) this.#element.volume = this.volume;
  };

  setLoop = (loop: boolean) => {
    this.loop = loop;
  };

  /** Lower the music to silence over `seconds`, then pause; the volume is back for next time. */
  fadeOut = (seconds = 4) => {
    const audio = this.#element;
    if (!audio || audio.paused || this.fading) return;
    this.fading = true;
    const start = audio.volume;
    const steps = Math.max(1, Math.round(seconds * 20));
    let step = 0;
    this.#fadeTimer = setInterval(() => {
      step += 1;
      audio.volume = Math.max(0, start * (1 - step / steps));
      if (step >= steps) {
        audio.pause();
        this.#stopFade(true);
      }
    }, (seconds * 1000) / steps);
  };

  #stopFade(restore: boolean) {
    if (this.#fadeTimer) clearInterval(this.#fadeTimer);
    this.#fadeTimer = null;
    this.fading = false;
    if (restore && this.#element) this.#element.volume = this.volume;
  }

  stop = () => {
    this.#stopFade(true);
    if (this.#element) {
      this.#element.pause();
      this.#element.currentTime = 0;
    }
    this.time = 0;
  };
}
