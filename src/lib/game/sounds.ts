// The game show's sound, made live with Web Audio on the audience screen: no recordings, so nothing
// to license or download. A loop while people join, a driving one while they answer (faster in the
// last seconds), and short effects: a pop as someone joins, ticks, a gong when time is up, a chime
// for the answer, a drumroll for the leaderboard and a fanfare for the podium. The loops come in
// several styles, from a gentle lo-fi groove to an 8-bit arcade and a gospel shuffle.

type Music = "none" | "lobby" | "question";

export const MUSIC_STYLES = ["classic", "upbeat", "arcade", "gospel", "epic", "chill"] as const;
export type MusicStyle = (typeof MUSIC_STYLES)[number] | "surprise";

/** Each style's name and what it sounds like, for the desk. */
export const MUSIC_STYLE_INFO: Record<MusicStyle, { name: string; hint: string }> = {
  classic: { name: "Game show", hint: "Bright and friendly, the original" },
  upbeat: { name: "Upbeat pop", hint: "Claps and a bouncing bass" },
  arcade: { name: "Arcade", hint: "8-bit, like an old video game" },
  gospel: { name: "Gospel shuffle", hint: "Organ, swing and handclaps" },
  epic: { name: "Epic", hint: "Big drums and strings, for a final" },
  chill: { name: "Lo-fi", hint: "Calm and gentle, for little ones or a quiet room" },
  surprise: { name: "Surprise me", hint: "A different style each game" },
};

export const sanitizeMusicStyle = (value: unknown): MusicStyle => (typeof value === "string" && Object.hasOwn(MUSIC_STYLE_INFO, value) ? (value as MusicStyle) : "classic");

// Chords as MIDI notes. Lobby is warm, question a little tense.
const PROGRESSIONS: Record<(typeof MUSIC_STYLES)[number], { lobby: number[][]; question: number[][]; bpm: [lobby: number, question: number, hurry: number] }> = {
  classic: { lobby: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], question: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bpm: [104, 132, 168] },
  upbeat: { lobby: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], question: [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]], bpm: [116, 138, 172] },
  arcade: { lobby: [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]], question: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]], bpm: [128, 150, 184] },
  gospel: { lobby: [[60, 64, 67, 70], [65, 69, 72, 75], [60, 64, 67, 70], [67, 71, 74, 77]], question: [[60, 64, 67, 70], [65, 69, 72], [67, 71, 74, 77], [65, 69, 72]], bpm: [96, 120, 150] },
  epic: { lobby: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], question: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], bpm: [84, 112, 140] },
  chill: { lobby: [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 60, 64, 67]], question: [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 60, 64, 67]], bpm: [78, 92, 116] },
};
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class GameSound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: Music = "none";
  private beat = 0;
  private nextAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private hurry = false;
  private noise: AudioBuffer | null = null;
  private chosen: MusicStyle = "classic";
  /** The style playing now (Surprise picks one each game). */
  private style: (typeof MUSIC_STYLES)[number] = "classic";

  /** Choose the music's style; a loop that is playing changes at once. */
  setStyle(style: MusicStyle) {
    if (style === this.chosen) return;
    this.chosen = style;
    this.pickStyle();
    const playing = this.music;
    if (playing !== "none") {
      this.music = "none";
      this.play(playing);
    }
  }

  private pickStyle() {
    this.style = this.chosen === "surprise" ? MUSIC_STYLES[Math.floor(Math.random() * MUSIC_STYLES.length)]! : this.chosen;
  }

  private get ctx(): AudioContext | null {
    if (this.context) return this.context;
    try {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return null;
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.context.destination);
      const length = this.context.sampleRate * 0.4;
      this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.context = null;
    }
    return this.context;
  }

  /** One note: a quick rise, then it fades. */
  private tone(frequency: number, at: number, length: number, volume: number, type: OscillatorType = "sine", options: { attack?: number; lowpass?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + (options.attack ?? 0.012));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    if (options.lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = options.lowpass;
      osc.connect(filter).connect(gain).connect(this.master);
    } else {
      osc.connect(gain).connect(this.master);
    }
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  /** A handclap or snare: a burst of noise around one pitch. */
  private clap(at: number, volume = 0.18, centre = 1500) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    for (const offset of [0, 0.012, 0.024]) {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = centre;
      filter.Q.value = 0.9;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, at + offset);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.11);
      source.connect(filter).connect(gain).connect(this.master);
      source.start(at + offset);
      source.stop(at + offset + 0.14);
    }
  }

  /** A low drum for the epic loop. */
  private tom(at: number, volume = 0.45, from = 110) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(from * 0.5, at + 0.35);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + 0.55);
  }

  /** An organ note: a few sine partials together (drawbars). */
  private organ(midi: number, at: number, length: number, volume: number) {
    [1, 2, 3, 4].forEach((partial, index) => this.tone(hz(midi) * partial, at, length, volume / (index + 1.5), "sine", { attack: 0.02 }));
  }

  private hiss(at: number, length: number, volume: number, high = 6000) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = high;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(at);
    source.stop(at + length + 0.02);
  }

  private kick(at: number, volume = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + 0.25);
  }

  /** Start or change the background loop. */
  play(music: Music) {
    if (music === this.music) return;
    this.music = music;
    this.hurry = false;
    clearInterval(this.timer);
    if (music === "none") return;
    // Surprise: a new style for each game (it starts in the lobby).
    if (music === "lobby" && this.chosen === "surprise") this.pickStyle();
    const ctx = this.ctx;
    if (!ctx) return;
    void ctx.resume().catch(() => {});
    this.beat = 0;
    this.nextAt = ctx.currentTime + 0.08;
    // Schedule a little ahead, every 25 ms, so the beat stays steady whatever else the page does.
    this.timer = setInterval(() => this.schedule(), 25);
  }

  /** The last seconds of a question: the loop speeds up. */
  urgent(on: boolean) {
    this.hurry = on;
  }

  private schedule() {
    const ctx = this.context;
    if (!ctx || this.music === "none") return;
    const lobby = this.music === "lobby";
    const style = PROGRESSIONS[this.style];
    const bpm = lobby ? style.bpm[0] : this.hurry ? style.bpm[2] : style.bpm[1];
    const step = 60 / bpm / 2; // eighth notes
    while (this.nextAt < ctx.currentTime + 0.12) {
      const chords = lobby ? style.lobby : style.question;
      const chord = chords[Math.floor(this.beat / 8) % chords.length]!;
      const inBar = this.beat % 8;
      // Gospel swings: every off-beat eighth comes a little late.
      const at = this.style === "gospel" || this.style === "chill" ? this.nextAt + (inBar % 2 === 1 ? step * 0.28 : 0) : this.nextAt;
      this[this.style](at, chord, inBar, step, lobby);
      this.nextAt += step;
      this.beat += 1;
    }
  }

  // One eighth note of each style. `chord` is this bar's, `inBar` 0–7, `step` an eighth in seconds.

  private classic(at: number, chord: number[], inBar: number, step: number, lobby: boolean) {
    if (lobby) {
      // A soft pad on each bar, a rippling arpeggio, a gentle kick on the beat.
      if (inBar === 0) chord.forEach((note) => this.tone(hz(note - 12), at, step * 7.5, 0.035, "triangle"));
      this.tone(hz(chord[inBar % 3]! + 12), at, step * 1.6, 0.05, "sine");
      if (inBar % 4 === 0) this.kick(at, 0.28);
    } else {
      // Driving bass eighths, an off-beat stab, a ticking hat: the clock is running.
      this.tone(hz(chord[0]! - 24), at, step * 0.8, 0.09, "square");
      if (inBar % 2 === 1) this.tone(hz(chord[(inBar >> 1) % 3]! + 12), at, step * 0.5, 0.04, "triangle");
      if (inBar % 2 === 0) this.kick(at, 0.35);
      this.hiss(at, 0.03, this.hurry ? 0.06 : 0.035);
    }
  }

  private upbeat(at: number, chord: number[], inBar: number, step: number, lobby: boolean) {
    // Four on the floor, claps on two and four, an octave-bouncing bass and bright plucks.
    if (inBar % 2 === 0) this.kick(at, lobby ? 0.3 : 0.38);
    if (inBar === 2 || inBar === 6) this.clap(at, lobby ? 0.12 : 0.17);
    const root = chord[0]! - 24;
    this.tone(hz(inBar % 2 ? root + 12 : root), at, step * 0.7, 0.08, "sawtooth", { lowpass: 900 });
    if ([0, 3, 6].includes(inBar)) chord.forEach((note) => this.tone(hz(note + 12), at, step * 0.9, 0.025, "sawtooth", { lowpass: 3200 }));
    if (!lobby) this.hiss(at, 0.025, this.hurry ? 0.055 : 0.03);
  }

  private arcade(at: number, chord: number[], inBar: number, step: number, lobby: boolean) {
    // Chiptune: a fast square arpeggio, a triangle bass, a noise snare.
    const arpeggio = [0, 1, 2, 1];
    this.tone(hz(chord[arpeggio[inBar % 4]!]! + 12), at, step * 0.45, 0.045, "square");
    if (!lobby) this.tone(hz(chord[arpeggio[(inBar + 2) % 4]!]! + 24), at + step / 2, step * 0.35, 0.025, "square");
    if (inBar % 2 === 0) this.tone(hz(chord[0]! - 12), at, step * 0.9, 0.12, "triangle");
    if (inBar === 4) this.hiss(at, 0.09, 0.09, 2500);
    if (!lobby && inBar % 4 === 0) this.kick(at, 0.3);
  }

  private gospel(at: number, chord: number[], inBar: number, step: number, lobby: boolean) {
    // Organ chords on the beat, a walking bass, handclaps on two and four.
    if (inBar % 2 === 0) chord.forEach((note) => this.organ(note, at, step * (lobby ? 1.8 : 1.2), 0.02));
    const walk = [0, 4, 7, 9];
    if (inBar % 2 === 0) this.tone(hz(chord[0]! - 24 + walk[(inBar >> 1) % 4]!), at, step * 1.6, 0.11, "triangle");
    if (inBar === 2 || inBar === 6) this.clap(at, lobby ? 0.13 : 0.18, 1300);
    if (inBar === 0 || (!lobby && inBar === 4)) this.kick(at, 0.32);
    if (!lobby) this.hiss(at, 0.03, this.hurry ? 0.05 : 0.025);
  }

  private epic(at: number, chord: number[], inBar: number, step: number, lobby: boolean) {
    // Low strings swell over each bar, an ostinato, and big drums that build while people answer.
    if (inBar === 0) chord.forEach((note) => this.tone(hz(note - 12), at, step * 8, 0.035, "sawtooth", { attack: step * 2, lowpass: 1100 }));
    this.tone(hz(chord[inBar % 2 ? 2 : 0]! - (inBar % 4 === 3 ? 0 : 12)), at, step * 0.7, 0.05, "sawtooth", { lowpass: 1600 });
    if (inBar === 0 || inBar === 3 || (!lobby && inBar === 6)) this.tom(at, lobby ? 0.35 : 0.5);
    if (!lobby && inBar % 2 === 1) this.tom(at, 0.2, 180);
    if (!lobby && this.hurry) this.hiss(at, 0.04, 0.05, 3000);
  }

  private chill(at: number, chord: number[], inBar: number, step: number, lobby: boolean) {
    // Soft electric-piano chords, a round bass, a lazy kick and a quiet brush.
    if (inBar === 0 || inBar === 5) chord.forEach((note, index) => this.tone(hz(note), at + index * 0.012, step * 3.5, 0.03, "sine", { attack: 0.03 }));
    if (inBar === 0 || inBar === 3) this.tone(hz(chord[0]! - 24), at, step * 2.5, 0.12, "sine");
    if (inBar === 0 || inBar === 5) this.kick(at, 0.22);
    if (inBar === 4) this.clap(at, 0.06, 2200);
    if (!lobby || inBar % 2 === 0) this.hiss(at, 0.02, 0.015, 7000);
  }

  private now(): number | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    void ctx.resume().catch(() => {});
    return ctx.currentTime + 0.02;
  }

  /** Someone joined. */
  pop() {
    const at = this.now();
    if (at === null) return;
    this.tone(880, at, 0.12, 0.12);
    this.tone(1320, at + 0.05, 0.14, 0.09);
  }

  /** A second ticking away (the last five). */
  tick() {
    const at = this.now();
    if (at === null) return;
    this.tone(1500, at, 0.05, 0.12, "square");
  }

  /** Time is up. */
  gong() {
    const at = this.now();
    if (at === null) return;
    [110, 165, 220, 277].forEach((f, i) => this.tone(f, at, 2.2 - i * 0.3, 0.12 - i * 0.02, "sine"));
  }

  /** The answer is shown. */
  chime() {
    const at = this.now();
    if (at === null) return;
    [72, 76, 79, 84].forEach((note, i) => this.tone(hz(note), at + i * 0.09, 0.7, 0.12, "triangle"));
  }

  /** The leaderboard rolls in. */
  drumroll(seconds = 1.4) {
    const at = this.now();
    if (at === null) return;
    for (let t = 0; t < seconds; t += 0.045) this.hiss(at + t, 0.06, 0.04 + (t / seconds) * 0.08, 1800);
    this.kick(at + seconds, 0.5);
    this.tone(hz(84), at + seconds, 0.5, 0.1, "triangle");
  }

  /** The winner. */
  fanfare() {
    const at = this.now();
    if (at === null) return;
    const notes = [67, 72, 76, 79, 76, 79, 84];
    const lengths = [0.15, 0.15, 0.15, 0.3, 0.15, 0.3, 1.2];
    let t = at;
    notes.forEach((note, i) => {
      this.tone(hz(note), t, lengths[i]! + 0.1, 0.13, "triangle");
      this.tone(hz(note - 12), t, lengths[i]! + 0.1, 0.06, "square");
      t += lengths[i]!;
    });
    this.kick(at, 0.5);
    this.kick(t - 1.2, 0.6);
  }

  stop() {
    this.play("none");
  }

  close() {
    clearInterval(this.timer);
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
