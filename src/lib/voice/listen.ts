type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function engine(): (new () => SpeechRec) | null {
  const speech = window as Window & { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null;
}

export function micAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && (engine() !== null || micAvailable());
}

/** Keep listening through silence. Stop only when the operator stops or the OS refuses the mic. */
export function shouldRestartListening(reason: "end" | "error", error?: string): boolean {
  if (reason === "error" && (error === "not-allowed" || error === "service-not-allowed" || error === "audio-capture")) {
    return false;
  }
  return true;
}

function rms(samples: Uint8Array): number {
  let total = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    total += centered * centered;
  }
  return Math.min(1, Math.sqrt(total / samples.length) * 4);
}

export function startListening(handlers: {
  onHeard: (text: string, final: boolean) => void;
  onError: (message: string) => void;
  onEnd: () => void;
  onLevel?: (level: number) => void;
}): () => void {
  let stopped = false;
  let rec: SpeechRec | null = null;
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let frame = 0;
  let restartTimer = 0;

  const stopTracks = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (restartTimer) window.clearTimeout(restartTimer);
    restartTimer = 0;
    void context?.close();
    context = null;
  };

  const stopRec = () => {
    if (!rec) return;
    rec.onend = null;
    rec.onerror = null;
    rec.onresult = null;
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
    rec = null;
  };

  const startRec = () => {
    if (stopped) return;
    const Ctor = engine();
    if (!Ctor) return;
    stopRec();
    const next = new Ctor();
    next.lang = "en-US";
    next.continuous = true;
    next.interimResults = true;
    next.maxAlternatives = 1;
    next.onresult = (event) => {
      let text = "";
      let final = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        text += result[0].transcript;
        final = result.isFinal;
      }
      handlers.onHeard(text.trim(), final);
    };
    next.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (!shouldRestartListening("error", event.error)) {
        stopped = true;
        handlers.onError(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "Microphone or speech access was refused. Allow Church Studio in System Settings → Privacy & Security, then listen again."
            : "Listening stopped.",
        );
        stopRec();
        stopTracks();
        handlers.onEnd();
      }
    };
    next.onend = () => {
      rec = null;
      if (stopped) {
        handlers.onEnd();
        return;
      }
      if (!shouldRestartListening("end")) return;
      restartTimer = window.setTimeout(startRec, 160);
    };
    rec = next;
    try {
      next.start();
    } catch (error) {
      handlers.onError(error instanceof Error ? error.message : "Listening could not start.");
      stopped = true;
      stopTracks();
      handlers.onEnd();
    }
  };

  const watchLevel = () => {
    if (!stream || stopped) return;
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    context = new AudioCtx();
    void context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (stopped) return;
      analyser.getByteTimeDomainData(samples);
      handlers.onLevel?.(rms(samples));
      frame = requestAnimationFrame(tick);
    };
    tick();
  };

  if (!micAvailable() && !engine()) {
    handlers.onError("This window cannot open a microphone.");
    handlers.onEnd();
    return () => {};
  }

  const begin = (next: MediaStream | null) => {
    if (stopped) {
      next?.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = next;
    if (stream) watchLevel();
    if (!engine()) {
      handlers.onError("The mic is open. This window cannot turn speech into words. Type a reference if no text appears.");
    }
    startRec();
  };

  if (micAvailable()) {
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } })
      .then((next) => begin(next))
      .catch(() => {
        if (stopped) return;
        handlers.onError("Microphone access was refused. Allow it in System Settings → Privacy & Security, then listen again.");
        if (engine()) begin(null);
        else {
          stopped = true;
          handlers.onEnd();
        }
      });
  } else {
    begin(null);
  }

  return () => {
    stopped = true;
    stopRec();
    stopTracks();
  };
}
