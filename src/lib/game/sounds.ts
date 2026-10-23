// The game show's sound, made live with Web Audio on the audience screen: no recordings, so nothing
// to license or download. A gentle loop while people join, a driving one while they answer (faster in
// the last seconds), and short effects: a pop as someone joins, ticks, a gong when time is up, a
// chime for the answer, a drumroll for the leaderboard and a fanfare for the podium.

type Music = "none" | "lobby" | "question";

// Chords as MIDI notes: C, Am, F, G (lobby, warm) and Am, F, C, G (question, a little tense).
const LOBBY = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const QUESTION = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
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
  private tone(frequency: number, at: number, length: number, volume: number, type: OscillatorType = "sine") {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + length + 0.05);
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
    const bpm = lobby ? 104 : this.hurry ? 168 : 132;
    const step = 60 / bpm / 2; // eighth notes
    while (this.nextAt < ctx.currentTime + 0.12) {
      const at = this.nextAt;
      const chords = lobby ? LOBBY : QUESTION;
      const chord = chords[Math.floor(this.beat / 8) % chords.length]!;
      const inBar = this.beat % 8;
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
      this.nextAt += step;
      this.beat += 1;
    }
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
