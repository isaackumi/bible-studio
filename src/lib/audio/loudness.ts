// Even volume: how loud a track sounds on average, so walk-in music from different sources plays
// at a similar level without anyone riding the fader. The measure follows the idea of broadcast
// loudness (EBU R128) without its frequency weighting: the mean energy of 400 ms blocks, leaving
// out silence and passages far quieter than the rest (a soft intro does not make a track "quiet").
//
// The player can only turn a track down (an audio element's volume tops out at full), so loud
// tracks are lowered to the target and quieter ones play as they are.

const BLOCK_SECONDS = 0.4;
const SILENCE_DB = -70;
const RELATIVE_GATE_DB = -10;
/** Tracks louder than this are turned down to it (dB relative to full scale). */
export const EVEN_TARGET_DB = -16;

const toDb = (meanSquare: number) => (meanSquare > 0 ? 10 * Math.log10(meanSquare) : -Infinity);

/** Average loudness of the samples in dB (≤ 0), or null for silence. Channels are averaged. */
export function measureLoudness(channels: Float32Array[], sampleRate: number): number | null {
  const length = channels[0]?.length ?? 0;
  const block = Math.max(1, Math.round(sampleRate * BLOCK_SECONDS));
  if (!channels.length || length === 0) return null;
  const blocks: number[] = [];
  for (let start = 0; start < length; start += block) {
    const end = Math.min(length, start + block);
    let sum = 0;
    for (const channel of channels) for (let n = start; n < end; n += 1) sum += channel[n]! * channel[n]!;
    blocks.push(sum / ((end - start) * channels.length));
  }
  const audible = blocks.filter((energy) => toDb(energy) > SILENCE_DB);
  if (!audible.length) return null;
  const overall = toDb(audible.reduce((a, b) => a + b, 0) / audible.length);
  const loud = audible.filter((energy) => toDb(energy) > overall + RELATIVE_GATE_DB);
  const level = toDb(loud.reduce((a, b) => a + b, 0) / loud.length);
  return Math.round(Math.min(0, level) * 10) / 10;
}

/** The volume factor (0–1) that brings a track measured at `levelDb` down to the target. */
export function evenGain(levelDb: number | undefined, target = EVEN_TARGET_DB): number {
  if (levelDb === undefined || !Number.isFinite(levelDb) || levelDb <= target) return 1;
  return Math.pow(10, (target - levelDb) / 20);
}

/** Measure a track by URL (decoded in the browser). Null when it cannot be read. */
export async function measureUrl(url: string): Promise<number | null> {
  const Context = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const context = new Context();
    try {
      const audio = await context.decodeAudioData(await response.arrayBuffer());
      const channels = Array.from({ length: Math.min(2, audio.numberOfChannels) }, (_, n) => audio.getChannelData(n));
      return measureLoudness(channels, audio.sampleRate);
    } finally {
      void context.close();
    }
  } catch {
    return null;
  }
}
