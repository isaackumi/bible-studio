type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
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

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && engine() !== null;
}

export function startListening(handlers: {
  onHeard: (text: string, final: boolean) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): () => void {
  const Ctor = engine();
  if (!Ctor) {
    handlers.onError("Speech recognition is not available in this window.");
    handlers.onEnd();
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (event) => {
    let text = "";
    let final = false;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      text += result[0].transcript;
      final = result.isFinal;
    }
    handlers.onHeard(text.trim(), final);
  };
  rec.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    handlers.onError(
      event.error === "not-allowed"
        ? "Microphone access was refused. Allow it in System Settings, then listen again."
        : "Listening stopped.",
    );
  };
  rec.onend = () => handlers.onEnd();
  try {
    rec.start();
  } catch (error) {
    handlers.onError(error instanceof Error ? error.message : "Listening could not start.");
    handlers.onEnd();
  }
  return () => {
    rec.onend = null;
    rec.stop();
  };
}
