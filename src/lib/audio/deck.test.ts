import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaAsset } from "../domain/types";

vi.mock("../db/api", () => ({ mediaUrl: (asset: MediaAsset | null) => (asset ? `media/${asset.id}` : null) }));

/** A stand-in audio element: time moves with fake timers; events fire like the real one. */
class FakeAudio {
  static all: FakeAudio[] = [];
  src = "";
  volume = 1;
  preload = "";
  currentTime = 0;
  duration = 60;
  paused = true;
  #listeners = new Map<string, Array<() => void>>();
  constructor() {
    FakeAudio.all.push(this);
  }
  addEventListener(name: string, listener: () => void) {
    this.#listeners.set(name, [...(this.#listeners.get(name) ?? []), listener]);
  }
  emit(name: string) {
    for (const listener of this.#listeners.get(name) ?? []) listener();
  }
  async play() {
    this.paused = false;
    this.emit("play");
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.emit("pause");
  }
  /** Move playback on, firing timeupdate (and ended at the end). */
  advance(seconds: number) {
    if (this.paused) return;
    this.currentTime = Math.min(this.duration, this.currentTime + seconds);
    this.emit("timeupdate");
    if (this.currentTime >= this.duration) {
      this.paused = true;
      this.emit("ended");
    }
  }
}

const track = (id: string): MediaAsset => ({ id, kind: "audio", name: `${id}.mp3`, path: `/m/${id}.mp3` }) as MediaAsset;
const tracks = ["a", "b", "c", "d"].map(track);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("audio deck", () => {
  beforeEach(() => {
    FakeAudio.all = [];
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("plays each track at the deck volume times its even level", async () => {
    const { AudioDeck } = await import("./deck.svelte");
    const deck = new AudioDeck();
    deck.gainFor = (asset) => (asset.id === "a" ? 0.5 : 1);
    deck.setVolume(0.8);
    await deck.play(tracks, 0);
    expect(FakeAudio.all[0]!.src).toBe("media/a");
    expect(FakeAudio.all[0]!.volume).toBeCloseTo(0.4);
  });

  it("fades one track into the next near its end, on the second element", async () => {
    vi.useFakeTimers();
    try {
      const { AudioDeck } = await import("./deck.svelte");
      const deck = new AudioDeck();
      deck.setCrossfade(4);
      await deck.play(tracks, 0, { loop: false });
      const first = FakeAudio.all[0]!;
      first.advance(50);
      expect(FakeAudio.all.length).toBe(1);
      first.advance(7); // 3 s left: inside the 4 s crossfade
      await vi.advanceTimersByTimeAsync(0);
      const second = FakeAudio.all[1]!;
      expect(second.src).toBe("media/b");
      expect(second.paused).toBe(false);
      expect(second.volume).toBeLessThan(0.2);
      await vi.advanceTimersByTimeAsync(3200);
      expect(first.paused).toBe(true);
      expect(second.volume).toBeCloseTo(0.8);
      expect(deck.index).toBe(1);
      expect(deck.current?.id).toBe("b");
    } finally {
      vi.useRealTimers();
    }
  });

  it("plays back to back with no crossfade, and stops at the end without loop", async () => {
    const { AudioDeck } = await import("./deck.svelte");
    const deck = new AudioDeck();
    deck.setCrossfade(0);
    await deck.play(tracks.slice(0, 2), 0, { loop: false });
    const element = FakeAudio.all[0]!;
    element.advance(60);
    await flush();
    expect(element.src).toBe("media/b");
    expect(deck.index).toBe(1);
    element.advance(60);
    await flush();
    expect(deck.playing).toBe(false);
    expect(FakeAudio.all.length).toBe(1);
  });

  it("shuffles: every track plays once before any repeats", async () => {
    const { AudioDeck } = await import("./deck.svelte");
    const deck = new AudioDeck();
    deck.setCrossfade(0);
    deck.setShuffle(true);
    await deck.play(tracks, 2, { loop: false });
    const played = [deck.current!.id];
    for (let n = 0; n < 3; n += 1) {
      FakeAudio.all[0]!.advance(60);
      await flush();
      played.push(deck.current!.id);
    }
    expect(played[0]).toBe("c");
    expect([...played].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("fades out to silence, pauses, and is back at full volume for next time", async () => {
    vi.useFakeTimers();
    try {
      const { AudioDeck } = await import("./deck.svelte");
      const deck = new AudioDeck();
      deck.setVolume(1);
      await deck.play(tracks, 0);
      const element = FakeAudio.all[0]!;
      deck.fadeOut(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(element.volume).toBeGreaterThan(0.3);
      expect(element.volume).toBeLessThan(0.7);
      await vi.advanceTimersByTimeAsync(1100);
      expect(element.paused).toBe(true);
      expect(deck.fading).toBe(false);
      expect(element.volume).toBeCloseTo(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
