import { CANON } from "../bible/reference";
import type { NoiseFilter } from "../domain/types";
import type { ListenHandlers } from "./listen";
import { t } from "../i18n/core";

// Listening through a speech service the church has its own key for: ElevenLabs (Scribe v2
// Realtime) or Deepgram (Nova-3). They hear accents and Bible names better than a browser's own
// recognizer, and work in any browser with a microphone, not only Chrome. The microphone's sound
// goes straight from this computer to that service while listening is on; nothing passes through
// Church Studio's servers.

export type CloudSpeech = "elevenlabs" | "deepgram";

export const CLOUD_SPEECH: Record<CloudSpeech, { name: string; keysUrl: string }> = {
  elevenlabs: { name: "ElevenLabs", keysUrl: "https://elevenlabs.io/app/settings/api-keys" },
  deepgram: { name: "Deepgram", keysUrl: "https://console.deepgram.com/" },
};

/** The rate both services are sent: 16 kHz, 16-bit, one channel. */
const RATE = 16_000;
/** About a fifth of a second of sound in each message. */
const CHUNK_SAMPLES = RATE / 5;
/** Words kept for `text` (as the browser recognizer does), so a reference said across two phrases is whole. */
const KEEP_WORDS = 48;
const MOST_RETRIES = 5;

/** How many words each service will take to listen for (ElevenLabs refuses more than 50). */
export const MOST_HINTS: Record<CloudSpeech, number> = { elevenlabs: 50, deepgram: 100 };

/** Books speech recognizers most often get wrong, first; the rest of the Bible follows. */
const HARD_BOOKS = ["Ephesians", "Philippians", "Colossians", "Thessalonians", "Corinthians", "Galatians", "Philemon", "Habakkuk", "Zephaniah", "Zechariah", "Haggai", "Malachi", "Obadiah", "Nahum", "Micah", "Hosea", "Ecclesiastes", "Lamentations", "Deuteronomy", "Leviticus", "Nehemiah", "Ezekiel", "Chronicles", "Hebrews", "Titus", "Timothy"];

/**
 * Words to listen for, within the service's limit: the church's own first (names, places it has
 * taught), then Bible books, hardest first. Numbered books count once ("Corinthians").
 */
export function speechHints(churchWords: readonly string[], most = MOST_HINTS.deepgram): string[] {
  const church = churchWords.map((word) => word.trim()).filter((word) => word && word.length <= 50).slice(0, Math.min(15, most));
  const books = [...new Set([...HARD_BOOKS, ...CANON.map((book) => book.name.replace(/^\d\s+/, ""))])];
  return [...new Set([...church, ...books])].slice(0, most);
}

export function elevenLabsUrl(token: string, hints: readonly string[], language = "en"): string {
  const params = new URLSearchParams({ model_id: "scribe_v2_realtime", token, audio_format: `pcm_${RATE}`, commit_strategy: "vad", language_code: language });
  for (const hint of hints) params.append("keyterms", hint);
  return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`;
}

export function deepgramUrl(hints: readonly string[], language = "en"): string {
  const params = new URLSearchParams({ model: "nova-3", language, encoding: "linear16", sample_rate: String(RATE), channels: "1", interim_results: "true", smart_format: "true", punctuate: "true", endpointing: "300" });
  for (const hint of hints) params.append("keyterm", hint);
  return `wss://api.deepgram.com/v1/listen?${params}`;
}

/** A heard message from either service, as text and whether it is final (null: nothing to show). */
export function readHeard(service: CloudSpeech, raw: string): { text: string; final: boolean } | { error: string; auth: boolean; fatal?: boolean } | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (service === "elevenlabs") {
    const type = String(data.message_type ?? "");
    if (type === "partial_transcript" || type === "committed_transcript") return { text: String(data.text ?? "").trim(), final: type === "committed_transcript" };
    if (type === "auth_error" || type === "unaccepted_terms") return { error: String(data.error ?? type), auth: true };
    if (type === "invalid_request" || type === "quota_exceeded") return { error: String(data.error ?? type), auth: false, fatal: true };
    if (type === "rate_limited" || type === "error" || type === "transcriber_error" || type === "input_error") return { error: String(data.error ?? type), auth: false };
    return null;
  }
  if (data.type === "Results") {
    const channel = data.channel as { alternatives?: Array<{ transcript?: string }> } | undefined;
    return { text: String(channel?.alternatives?.[0]?.transcript ?? "").trim(), final: data.is_final === true };
  }
  if (data.type === "Error") return { error: String(data.description ?? data.message ?? "Deepgram error"), auth: false };
  return null;
}

/** Sound at the computer's own rate, as 16 kHz 16-bit samples (averaging, so nothing aliases badly). */
export function toPcm16(input: Float32Array, fromRate: number): Int16Array<ArrayBuffer> {
  const ratio = fromRate / RATE;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end && j < input.length; j++) sum += input[j]!;
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function base64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A short-lived ElevenLabs token for one listening session (the key itself never goes in a URL). */
export async function elevenLabsToken(key: string): Promise<string> {
  const response = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", { method: "POST", headers: { "xi-api-key": key } });
  if (response.status === 401 || response.status === 403) throw new KeyRefused();
  if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}.`);
  const data = (await response.json()) as { token?: string };
  if (!data.token) throw new Error("ElevenLabs sent no token.");
  return data.token;
}

export class KeyRefused extends Error {
  constructor() {
    super("key refused");
  }
}

/**
 * Check a key works: ElevenLabs makes a token; Deepgram opens a connection and closes it. Resolves
 * with nothing when it works; rejects with a reason a church can act on.
 */
export async function testSpeechKey(service: CloudSpeech, key: string): Promise<void> {
  if (!key.trim()) throw new KeyRefused();
  if (service === "elevenlabs") {
    await elevenLabsToken(key.trim());
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(deepgramUrl([]), ["token", key.trim()]);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Deepgram did not answer."));
    }, 8000);
    socket.onopen = () => {
      clearTimeout(timer);
      socket.send(JSON.stringify({ type: "CloseStream" }));
      socket.close();
      resolve();
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new KeyRefused());
    };
  });
}

/**
 * Listen with a speech service: the microphone, cut to 16 kHz, streamed while listening is on.
 * Reconnects by itself when the service ends a session (they cap each one's length). Returns stop.
 */
export function startCloudListening(handlers: ListenHandlers, options: { service: CloudSpeech; key: string; words: readonly string[]; filter: NoiseFilter; language?: string }): () => void {
  const { service, key } = options;
  const name = CLOUD_SPEECH[service].name;
  const hints = speechHints(options.words, MOST_HINTS[service]);
  let stopped = false;
  let socket: WebSocket | null = null;
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retries = 0;
  /** Whether any connection opened: one that never did is most likely a refused key. */
  let everOpened = false;
  let pending: Int16Array[] = [];
  let pendingSamples = 0;
  let committed = "";
  let lastLevelAt = 0;

  const fail = (message: string, kind: Parameters<ListenHandlers["onError"]>[1] = "failed") => {
    if (stopped) return;
    stop();
    handlers.onError(message, kind);
  };

  const send = (samples: Int16Array) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (service === "deepgram") socket.send(samples as Int16Array<ArrayBuffer>);
    else socket.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: base64(samples), commit: false, sample_rate: RATE }));
  };

  const heard = (text: string, final: boolean) => {
    if (!text) return;
    if (final) committed = `${committed} ${text}`.trim().split(/\s+/).slice(-KEEP_WORDS).join(" ");
    handlers.onHeard(final ? committed : `${committed} ${text}`.trim(), final, [], text);
  };

  const connect = async () => {
    if (stopped) return;
    try {
      const url = service === "elevenlabs" ? elevenLabsUrl(await elevenLabsToken(key), hints, options.language) : deepgramUrl(hints, options.language);
      if (stopped) return;
      const next = service === "deepgram" ? new WebSocket(url, ["token", key]) : new WebSocket(url);
      socket = next;
      next.onopen = () => {
        retries = 0;
        everOpened = true;
        handlers.onStatus?.(t("Listening with {service}.", { service: name }));
        clearInterval(keepAlive);
        // Deepgram closes a quiet connection after ten seconds; a keep-alive covers pauses and songs.
        if (service === "deepgram") keepAlive = setInterval(() => next.readyState === WebSocket.OPEN && next.send(JSON.stringify({ type: "KeepAlive" })), 8000);
      };
      next.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        const message = readHeard(service, event.data);
        if (!message) return;
        if ("error" in message) {
          if (message.auth) fail(t("{service} did not accept the key. Check it in Settings › Audio & voice.", { service: name }));
          // The request itself was refused (or the account is out of time): trying again would only repeat it.
          else if (message.fatal) fail(`${name}: ${message.error}`);
          else handlers.onStatus?.(`${name}: ${message.error}`);
          return;
        }
        heard(message.text, message.final);
      };
      next.onclose = (event) => {
        clearInterval(keepAlive);
        if (stopped || socket !== next) return;
        // Deepgram refuses a bad key by closing before it opens (1008, or 1006 with no answer).
        if (service === "deepgram" && event.code === 1008) {
          fail(t("{service} did not accept the key. Check it in Settings › Audio & voice.", { service: name }));
          return;
        }
        retry();
      };
    } catch (error) {
      if (error instanceof KeyRefused) fail(t("{service} did not accept the key. Check it in Settings › Audio & voice.", { service: name }));
      else retry(error instanceof Error ? error.message : String(error));
    }
  };

  const retry = (reason?: string) => {
    if (stopped) return;
    retries += 1;
    // A browser is not told why a connection was refused; twice in a row before any opened, while
    // online, is a key the service will not take (or a network that blocks it). Say so and stop.
    if (!everOpened && retries >= 2 && (typeof navigator === "undefined" || navigator.onLine)) {
      fail(t("{service} refused the connection. Check the key in Settings › Audio & voice, and that this network allows it.", { service: name }));
      return;
    }
    if (retries > MOST_RETRIES) {
      fail(reason ? t("{service} stopped answering: {reason}", { service: name, reason }) : t("{service} stopped answering. Check the internet connection.", { service: name }), "network");
      return;
    }
    handlers.onStatus?.(t("{service} reconnecting…", { service: name }));
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void connect(), Math.min(8000, 500 * 2 ** retries));
  };

  const stop = () => {
    stopped = true;
    clearInterval(keepAlive);
    clearTimeout(retryTimer);
    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN && service === "deepgram") socket.send(JSON.stringify({ type: "CloseStream" }));
        socket.close();
      } catch {
        /* already closed */
      }
      socket = null;
    }
    processor?.disconnect();
    processor = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    void context?.close().catch(() => {});
    context = null;
  };

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: options.filter !== "off", autoGainControl: true } });
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      // Windows hands a microphone to one app at a time when that app asks for it alone.
      const busy = error instanceof DOMException && (error.name === "NotReadableError" || error.name === "AbortError");
      if (busy) return fail(t("The microphone is busy in another app (a call or a recording). Close it there, then listen again."));
      fail(denied ? t("The microphone is blocked. Allow it for this page, then listen again.") : t("No microphone was found."), denied ? "denied" : "no-mic");
      return;
    }
    if (stopped) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    // A script processor works in every browser and the app's window alike; at 4096 samples it
    // runs about twelve times a second, light on the computer.
    processor = context.createScriptProcessor(4096, 1, 1);
    const rate = context.sampleRate;
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const now = performance.now();
      if (handlers.onLevel && now - lastLevelAt > 66) {
        lastLevelAt = now;
        let sum = 0;
        for (let i = 0; i < input.length; i += 4) sum += input[i]! * input[i]!;
        handlers.onLevel(Math.min(1, Math.sqrt(sum / (input.length / 4)) * 4));
      }
      const samples = toPcm16(input, rate);
      pending.push(samples);
      pendingSamples += samples.length;
      if (pendingSamples < CHUNK_SAMPLES) return;
      const chunk = new Int16Array(pendingSamples);
      let at = 0;
      for (const part of pending) {
        chunk.set(part, at);
        at += part.length;
      }
      pending = [];
      pendingSamples = 0;
      send(chunk);
    };
    source.connect(processor);
    // The processor only runs when connected onwards; a silent gain keeps it from reaching the speakers.
    const mute = context.createGain();
    mute.gain.value = 0;
    processor.connect(mute).connect(context.destination);
    await connect();
  })();

  return () => {
    if (stopped) return;
    stop();
    handlers.onEnd();
  };
}
