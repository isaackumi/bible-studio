// The audio deck: walk-in music, backing tracks and other audio, played on this computer through
// audio elements that live for the whole app, so music keeps playing on every page.
// Sound goes to the computer's sound output (the church's mixer); it never goes through a screen.
//
// Two elements take turns so one track can fade into the next (crossfade). Each track plays at its
// own "even" level (audio/loudness.ts) times the deck volume, and a playlist can play shuffled.

import { mediaUrl } from "../db/api";
import { nextTrackIndex, shuffledOrder } from "../domain/playlists";
import type { MediaAsset } from "../domain/types";

type SinkElement = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

/** This computer's web view can send audio to a chosen output (Chromium can; WebKit may not). */
export function canChooseOutput(): boolean {
  return typeof HTMLMediaElement !== "undefined" && typeof (HTMLMediaElement.prototype as SinkElement).setSinkId === "function";
}

export class AudioDeck {
  /** The tracks being played, in playlist order (a playlist, or one track). */
  queue = $state<MediaAsset[]>([]);
  /** Which playlist the queue came from, if any. */
  playlistId = $state<string | null>(null);
  /** The playing track's place in `queue`. */
  index = $state(0);
  playing = $state(false);
  time = $state(0);
  duration = $state(0);
  volume = $state(0.8);
  loop = $state(false);
  shuffle = $state(false);
  /** Seconds one track fades into the next; 0 plays them back to back. */
  crossfade = $state(3);
  fading = $state(false);
  error = $state("");
  /** The output device id ("" is the computer's default). */
  outputId = $state("");

  /** The volume factor for one track (even volume); 1 when unknown. */
  gainFor: (track: MediaAsset) => number = () => 1;

  /** Play order: positions in `queue` (shuffled, or 0, 1, 2…). */
  #order: number[] = [];
  #position = 0;
  #elements: SinkElement[] = [];
  /** Which of the two elements is the one being heard. */
  #active = 0;
  /** Each element's share of the deck volume (0–1), ramped for fades. */
  #mix = [1, 0];
  #ramp: ReturnType<typeof setInterval> | null = null;
  #crossing = false;

  get current(): MediaAsset | null {
    return this.queue[this.index] ?? null;
  }

  #element(slot: number): SinkElement | null {
    if (typeof Audio === "undefined") return null;
    if (this.#elements[slot]) return this.#elements[slot]!;
    const element = new Audio() as SinkElement;
    element.preload = "auto";
    element.addEventListener("timeupdate", () => {
      if (slot !== this.#active) return;
      this.time = element.currentTime;
      this.#maybeCrossfade(element);
    });
    element.addEventListener("durationchange", () => {
      if (slot === this.#active) this.duration = Number.isFinite(element.duration) ? element.duration : 0;
    });
    element.addEventListener("play", () => slot === this.#active && (this.playing = true));
    element.addEventListener("pause", () => slot === this.#active && !this.#crossing && (this.playing = false));
    element.addEventListener("ended", () => slot === this.#active && !this.#crossing && void this.#advance());
    element.addEventListener("error", () => {
      if (slot !== this.#active) return;
      this.error = `${this.current?.name ?? "That track"} could not be played.`;
      this.playing = false;
    });
    if (this.outputId && element.setSinkId) void element.setSinkId(this.outputId).catch(() => {});
    this.#elements[slot] = element;
    return element;
  }

  /** The element's volume: deck volume × the track's even level × its share in a fade. */
  #apply(slot: number) {
    const element = this.#elements[slot];
    if (!element) return;
    const track = slot === this.#active ? this.current : this.#incoming;
    const gain = track ? this.gainFor(track) : 1;
    element.volume = Math.min(1, Math.max(0, this.volume * gain * this.#mix[slot]!));
  }

  /** The track fading in during a crossfade. */
  #incoming: MediaAsset | null = null;

  /** Play a list of tracks from one of them. */
  play = async (tracks: MediaAsset[], index = 0, options: { playlistId?: string | null; loop?: boolean } = {}) => {
    const playable = tracks.filter((track) => track.kind === "audio");
    if (!playable.length) return;
    this.#stopRamp();
    this.#silenceOther();
    this.queue = playable;
    this.playlistId = options.playlistId ?? null;
    this.loop = options.loop ?? false;
    const start = Math.min(Math.max(0, index), playable.length - 1);
    this.#order = this.shuffle ? shuffledOrder(playable.length, start) : playable.map((_, n) => n);
    this.#position = this.#order.indexOf(start);
    this.#mix[this.#active] = 1;
    await this.#load(this.#active, start);
  };

  async #load(slot: number, index: number): Promise<boolean> {
    const audio = this.#element(slot);
    const track = this.queue[index];
    if (!audio || !track) return false;
    const url = mediaUrl(track);
    if (!url) {
      this.error = `${track.name} is missing from the media library.`;
      return false;
    }
    if (slot === this.#active) {
      this.index = index;
      this.error = "";
      this.time = 0;
    } else this.#incoming = track;
    audio.src = url;
    this.#apply(slot);
    try {
      await audio.play();
      return true;
    } catch (error) {
      if (slot === this.#active) {
        this.error = error instanceof Error && error.name === "NotAllowedError" ? "Press play to start the music." : `${track.name} could not be played.`;
      }
      return false;
    }
  }

  /** The next track's place in the queue, following the play order; null at the end. */
  #nextIndex(direction: 1 | -1, wrap: boolean): number | null {
    const position = nextTrackIndex(this.#order.length, this.#position, direction, wrap);
    if (position === null) return null;
    // A shuffled playlist starting over gets a new order.
    if (this.shuffle && wrap && direction > 0 && position === 0 && this.#order.length > 2) {
      this.#order = shuffledOrder(this.queue.length, this.#order[Math.floor(Math.random() * this.#order.length)]!);
    }
    this.#position = position;
    return this.#order[position] ?? null;
  }

  /** Near the end of a track, start the next one on the other element and fade across. */
  #maybeCrossfade(element: SinkElement) {
    if (this.#crossing || this.crossfade <= 0 || this.fading || element.paused) return;
    const left = element.duration - element.currentTime;
    if (!Number.isFinite(left) || left > this.crossfade || element.duration < this.crossfade * 3) return;
    const position = this.#position;
    const next = this.#nextIndex(1, this.loop);
    if (next === null || (this.queue.length === 1 && !this.loop)) {
      this.#position = position;
      return;
    }
    this.#crossing = true;
    const from = this.#active;
    const to = 1 - from;
    this.#mix[to] = 0;
    void this.#load(to, next).then((started) => {
      if (!started) {
        this.#crossing = false;
        return;
      }
      this.#rampTo(Math.max(0.5, left), (share) => {
        this.#mix[from] = 1 - share;
        this.#mix[to] = share;
        this.#apply(from);
        this.#apply(to);
      }, () => {
        this.#elements[from]?.pause();
        this.#active = to;
        this.#incoming = null;
        this.index = next;
        this.time = this.#elements[to]?.currentTime ?? 0;
        this.duration = this.#elements[to]?.duration || 0;
        this.playing = true;
        this.#crossing = false;
      });
    });
  }

  async #advance() {
    const next = this.#nextIndex(1, this.loop);
    if (next === null) {
      this.playing = false;
      this.time = 0;
      return;
    }
    await this.#load(this.#active, next);
  }

  toggle = async () => {
    const audio = this.#element(this.#active);
    if (!audio || !this.current) return;
    if (!audio.src) {
      await this.#load(this.#active, this.index);
      return;
    }
    this.#stopRamp();
    this.#mix[this.#active] = 1;
    this.#apply(this.#active);
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        this.error = "The music could not start.";
      }
    } else audio.pause();
  };

  step = async (direction: 1 | -1) => {
    const audio = this.#elements[this.#active];
    // Previous restarts the track when it is a few seconds in, like any music player.
    if (direction < 0 && this.time > 3 && audio) {
      audio.currentTime = 0;
      return;
    }
    this.#stopRamp();
    this.#silenceOther();
    this.#mix[this.#active] = 1;
    const next = this.#nextIndex(direction, true);
    if (next !== null) await this.#load(this.#active, next);
  };

  seek = (seconds: number) => {
    const audio = this.#elements[this.#active];
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, Math.min(seconds, this.duration || seconds));
  };

  setVolume = (volume: number) => {
    this.volume = Math.min(1, Math.max(0, volume));
    if (!this.fading) {
      this.#apply(0);
      this.#apply(1);
    }
  };

  setLoop = (loop: boolean) => {
    this.loop = loop;
  };

  setShuffle = (shuffle: boolean) => {
    this.shuffle = shuffle;
    if (!this.queue.length) return;
    this.#order = shuffle ? shuffledOrder(this.queue.length, this.index) : this.queue.map((_, n) => n);
    this.#position = this.#order.indexOf(this.index);
  };

  setCrossfade = (seconds: number) => {
    this.crossfade = Math.max(0, seconds);
  };

  /** Even volume changed (a track was measured, or the setting turned): apply it now. */
  refreshLevels = () => {
    this.#apply(0);
    this.#apply(1);
  };

  /** Send the music to this output device ("" = default). False when this web view cannot. */
  setOutput = async (deviceId: string): Promise<boolean> => {
    this.outputId = deviceId;
    if (!canChooseOutput()) return false;
    try {
      await Promise.all(this.#elements.filter(Boolean).map((element) => element.setSinkId!(deviceId)));
      return true;
    } catch {
      return false;
    }
  };

  /** Lower the music to silence over `seconds`, then pause; the volume is back for next time. */
  fadeOut = (seconds = 4) => {
    const audio = this.#elements[this.#active];
    if (!audio || audio.paused || this.fading) return;
    this.#crossing = false;
    this.#silenceOther();
    this.fading = true;
    const slot = this.#active;
    const start = this.#mix[slot]!;
    this.#rampTo(seconds, (share) => {
      this.#mix[slot] = start * (1 - share);
      this.#apply(slot);
    }, () => {
      audio.pause();
      this.fading = false;
      this.#mix[slot] = 1;
      this.#apply(slot);
    });
  };

  /** Run `step(share)` with share going 0 → 1 over `seconds`, then `done`. One ramp at a time. */
  #rampTo(seconds: number, step: (share: number) => void, done: () => void) {
    this.#stopRamp();
    const started = Date.now();
    const total = Math.max(50, seconds * 1000);
    this.#ramp = setInterval(() => {
      const share = Math.min(1, (Date.now() - started) / total);
      step(share);
      if (share >= 1) {
        this.#stopRamp();
        done();
      }
    }, 50);
  }

  #stopRamp() {
    if (this.#ramp) clearInterval(this.#ramp);
    this.#ramp = null;
    this.fading = false;
  }

  /** Stop a track that was fading in or out on the other element. */
  #silenceOther() {
    const other = this.#elements[1 - this.#active];
    if (other && !other.paused) other.pause();
    this.#mix[1 - this.#active] = 0;
    this.#incoming = null;
    this.#crossing = false;
  }

  stop = () => {
    this.#stopRamp();
    this.#silenceOther();
    const audio = this.#elements[this.#active];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.#mix[this.#active] = 1;
    this.#apply(this.#active);
    this.time = 0;
  };
}

/**
 * The sound pad: short clips (an offering bell, an intro sting) played over everything with one
 * click. Each press starts its own element, so clips can overlap; pressing a playing clip stops it.
 */
export class SoundPad {
  playing = $state<Record<string, boolean>>({});
  #elements = new Map<string, SinkElement>();
  outputId = "";

  press = async (id: string, url: string, volume: number) => {
    const current = this.#elements.get(id);
    if (current && !current.paused) {
      current.pause();
      current.currentTime = 0;
      return;
    }
    const element = current ?? (new Audio() as SinkElement);
    if (!current) {
      element.addEventListener("play", () => (this.playing = { ...this.playing, [id]: true }));
      const off = () => (this.playing = { ...this.playing, [id]: false });
      element.addEventListener("pause", off);
      element.addEventListener("ended", off);
      this.#elements.set(id, element);
    }
    if (this.outputId && element.setSinkId) await element.setSinkId(this.outputId).catch(() => {});
    element.src = url;
    element.volume = Math.min(1, Math.max(0, volume));
    element.currentTime = 0;
    await element.play().catch(() => {});
  };

  stopAll = () => {
    for (const element of this.#elements.values()) {
      element.pause();
      element.currentTime = 0;
    }
  };

  setOutput = (deviceId: string) => {
    this.outputId = deviceId;
    if (!canChooseOutput()) return;
    for (const element of this.#elements.values()) void element.setSinkId?.(deviceId).catch(() => {});
  };
}
