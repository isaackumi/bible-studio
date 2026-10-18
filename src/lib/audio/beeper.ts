// The timer sounds, made on the spot with Web Audio (nothing to download): a double beep for a
// warning, a short tick for the last seconds, and a rising three-note chime at zero.

import type { TimerCue } from "../domain/timer-cues";

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume().catch(() => {});
  return context;
}

function tone(ctx: AudioContext, frequency: number, at: number, length: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  // A quick rise and a soft fall, so it never clicks.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

export function playCue(cue: TimerCue, volume: number): void {
  const ctx = audio();
  if (!ctx || volume <= 0) return;
  const now = ctx.currentTime + 0.01;
  const level = 0.35 * volume;
  if (cue === "warn") {
    tone(ctx, 880, now, 0.14, level);
    tone(ctx, 880, now + 0.22, 0.14, level);
  } else if (cue === "tick") {
    tone(ctx, 1320, now, 0.06, level * 0.6);
  } else {
    tone(ctx, 660, now, 0.3, level);
    tone(ctx, 880, now + 0.18, 0.3, level);
    tone(ctx, 1175, now + 0.36, 0.7, level);
  }
}
