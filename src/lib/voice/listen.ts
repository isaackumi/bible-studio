import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isDesktop } from "../platform/runtime";

export type ListenAccess = { microphone: string; speech: string };

/** Why listening could not run. The desk shows a different state for each. */
export type ListenErrorKind = "denied" | "no-mic" | "unsupported" | "network" | "failed";

export type ListenHandlers = {
  /** `latest` is the newest phrase on its own (commands are parsed from it); `text` may carry earlier words. */
  onHeard: (text: string, final: boolean, alternatives: string[], latest: string) => void;
  onError: (message: string, kind: ListenErrorKind) => void;
  onEnd: () => void;
  onLevel?: (level: number) => void;
  onStatus?: (message: string) => void;
};

/** Consecutive Web Speech "network" errors before listening gives up instead of looping silently. */
export const NETWORK_RETRIES = 3;

export function accessMessage(access: ListenAccess): string | null {
  if (access.microphone === "denied") {
    return "macOS blocked the microphone. In System Settings → Privacy & Security → Microphone, turn on Church Studio.";
  }
  if (access.speech === "denied") {
    return "macOS blocked Speech Recognition. In System Settings → Privacy & Security → Speech Recognition, turn on Church Studio.";
  }
  return null;
}

export async function prepareListening(): Promise<string | null> {
  if (!isDesktop()) return null;
  try {
    const access = await invoke<ListenAccess>("request_listen_access");
    return accessMessage(access);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function openPrivacySettings(): Promise<void> {
  if (!isDesktop()) return;
  await invoke("open_privacy_settings");
}

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean; length: number }> }) => void) | null;
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

type NativePhrase = { kind: string; text?: string; final?: boolean; alternatives?: string[]; value?: number; message?: string };

const TRANSCRIPT_WORDS = 48;

function recentWords(text: string): string {
  return text.split(/\s+/).filter(Boolean).slice(-TRANSCRIPT_WORDS).join(" ");
}

/**
 * SpeechTranscriber grows a volatile guess, then commits it as short final pieces.
 * Keep the pieces and show the latest guess after them, so a fragment is never the whole phrase.
 */
export function stitchTranscript(
  committed: string,
  update: { text: string; final: boolean; alternatives: string[] },
): { committed: string; text: string; alternatives: string[] } {
  const piece = update.text.trim();
  const options = [...new Set(update.alternatives.map((item) => item.trim()).filter(Boolean))];
  if (update.final) {
    const next = recentWords(`${committed} ${piece}`);
    const alternatives = (options.length ? options : [piece]).map((option) => recentWords(`${committed} ${option}`));
    return { committed: next, text: next, alternatives: [...new Set(alternatives)] };
  }
  const spoken = recentWords(`${committed} ${piece}`);
  const alternatives = [...new Set([spoken, ...options.map((option) => recentWords(`${committed} ${option}`))])];
  return { committed, text: spoken, alternatives };
}

/** macOS Listen uses the system lecture model. The browser keeps Web Speech. */
export function startNativeListening(handlers: ListenHandlers): () => void {
  let detach = () => {};
  let stopped = false;
  let ended = false;
  let committed = "";
  // Lines from an earlier run (its helper still sends a final "end") are ignored.
  const run = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const end = () => {
    if (ended) return;
    ended = true;
    handlers.onEnd();
  };
  const subscribed = listen<{ run: number; line: string }>("listen-phrase", (event) => {
    if (event.payload?.run !== run) return;
    let message: NativePhrase;
    try {
      message = JSON.parse(event.payload.line) as NativePhrase;
    } catch {
      return;
    }
    if (message.kind === "phrase" && message.text) {
      const stitched = stitchTranscript(committed, {
        text: message.text,
        final: Boolean(message.final),
        alternatives: message.alternatives?.filter(Boolean) ?? [],
      });
      committed = stitched.committed;
      handlers.onHeard(stitched.text, Boolean(message.final), stitched.alternatives, message.text.trim());
    } else if (message.kind === "level" && typeof message.value === "number") {
      handlers.onLevel?.(message.value);
    } else if (message.kind === "status" && message.message) {
      handlers.onStatus?.(message.message);
    } else if (message.kind === "error") {
      const text = message.message || "Listening stopped.";
      handlers.onError(text, /denied|not authori[sz]ed|privacy/i.test(text) ? "denied" : "failed");
      end();
    } else if (message.kind === "end") {
      end();
    }
  });
  // Subscribe before starting, so the first phrases are not lost.
  void subscribed
    .then((unlisten) => {
      if (stopped) unlisten();
      else detach = unlisten;
      if (stopped) return;
      return invoke("start_sermon_listen", { run });
    })
    .catch((error: unknown) => {
      handlers.onError(error instanceof Error ? error.message : String(error), "unsupported");
      end();
    });
  return () => {
    stopped = true;
    detach();
    void invoke("stop_sermon_listen");
  };
}

export function startListening(handlers: ListenHandlers): () => void {
  let stopped = false;
  let networkErrors = 0;
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
    next.maxAlternatives = 5;
    next.onresult = (event) => {
      const latest = event.results[event.results.length - 1];
      if (!latest) return;
      const alternatives: string[] = [];
      for (let index = 0; index < latest.length; index += 1) {
        const phrase = latest[index]?.transcript?.trim();
        if (phrase) alternatives.push(phrase);
      }
      if (alternatives.length === 0) return;
      networkErrors = 0;
      handlers.onHeard(alternatives[0], latest.isFinal, alternatives, alternatives[0]);
    };
    next.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      const fail = (message: string, kind: ListenErrorKind) => {
        stopped = true;
        handlers.onError(message, kind);
        stopRec();
        stopTracks();
        handlers.onEnd();
      };
      if (event.error === "network") {
        networkErrors += 1;
        if (networkErrors >= NETWORK_RETRIES) {
          fail("Speech recognition lost its connection. This browser sends audio to an online service; check the network, then listen again.", "network");
        }
        return;
      }
      if (!shouldRestartListening("error", event.error)) {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          fail("The microphone or speech recognition is blocked for this site. Allow it in the browser's site settings (or System Settings → Privacy & Security), then listen again.", "denied");
        } else if (event.error === "audio-capture") {
          fail("No microphone is available. Connect one, then listen again.", "no-mic");
        } else {
          fail("Listening stopped.", "failed");
        }
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
      handlers.onError(error instanceof Error ? error.message : "Listening could not start.", "failed");
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

  // Without a recognizer, a level meter alone would look like listening. Say so and stop.
  if (!engine()) {
    handlers.onError(
      "This browser cannot turn speech into words. Use Chrome or Edge, or the Church Studio desktop app.",
      "unsupported",
    );
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
    startRec();
  };

  if (micAvailable()) {
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } })
      .then((next) => begin(next))
      .catch((error: unknown) => {
        if (stopped) return;
        const name = error && typeof error === "object" && "name" in error ? String((error as { name: string }).name) : "";
        stopped = true;
        stopTracks();
        if (name === "NotFoundError" || name === "OverconstrainedError") {
          handlers.onError("No microphone is available. Connect one, then listen again.", "no-mic");
        } else {
          handlers.onError("The microphone is blocked for this window. Allow it in the browser's site settings (or System Settings → Privacy & Security → Microphone), then listen again.", "denied");
        }
        handlers.onEnd();
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
