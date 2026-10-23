// Sermon notes → a short summary and screen-ready points, with the church's own AI. Four choices:
// Claude, ChatGPT and Gemini, each with a key from the company's website, or an AI running on this
// computer (Ollama, LM Studio) that needs no key and no internet. Claude has its own API; the other
// three speak the OpenAI chat API. This file only builds the request and reads the answer; the app
// sends it (through Rust on the desktop).

export type AiProvider = "anthropic" | "openai" | "gemini" | "local";

export const AI_PROVIDERS: readonly AiProvider[] = ["anthropic", "openai", "gemini", "local"];

export type AiSettings = {
  provider: AiProvider;
  /** The church's own key. Kept on this computer only. Empty for an AI on this computer. */
  key: string;
  model: string;
  /** "local" only: where the AI app listens, e.g. http://localhost:11434/v1 for Ollama. */
  baseUrl: string;
};

/** Each service's address and a good starting model. An AI on this computer has no default model: it is whatever the church downloaded. */
export const AI_DEFAULTS: Record<AiProvider, { model: string; baseUrl: string }> = {
  anthropic: { model: "claude-sonnet-5-5", baseUrl: "https://api.anthropic.com" },
  openai: { model: "gpt-6.1-sol", baseUrl: "https://api.openai.com/v1" },
  gemini: { model: "gemini-3.5-flash-lite", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  local: { model: "", baseUrl: "http://localhost:11434/v1" },
};

/** The apps that run an AI on this computer, and where each listens by default. */
export const LOCAL_AI_APPS = [
  { name: "Ollama", baseUrl: "http://localhost:11434/v1" },
  { name: "LM Studio", baseUrl: "http://localhost:1234/v1" },
] as const;

export function emptyAiSettings(): AiSettings {
  return { provider: "anthropic", key: "", model: AI_DEFAULTS.anthropic.model, baseUrl: "" };
}

/** Settings saved before Gemini and "on this computer" were their own choices said "openai" with another address. */
function providerOf(provider: unknown, baseUrl: string): AiProvider {
  if (provider === "anthropic" || provider === "gemini" || provider === "local") return provider;
  if (provider !== "openai") return "anthropic";
  if (!baseUrl || /^https:\/\/api\.openai\.com/i.test(baseUrl)) return "openai";
  if (/generativelanguage\.googleapis\.com/i.test(baseUrl)) return "gemini";
  return "local";
}

export function sanitizeAiSettings(value: unknown): AiSettings {
  const record = value && typeof value === "object" ? (value as Partial<AiSettings>) : {};
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const baseUrl = text(record.baseUrl, 300);
  const provider = providerOf(record.provider, baseUrl);
  return {
    provider,
    key: text(record.key, 400),
    model: text(record.model, 120) || AI_DEFAULTS[provider].model,
    baseUrl: provider === "local" ? baseUrl : "",
  };
}

/** Where requests go: the company's own address, or the AI app on this computer. */
function baseOf(settings: AiSettings): string {
  const base = settings.provider === "local" ? settings.baseUrl || AI_DEFAULTS.local.baseUrl : AI_DEFAULTS[settings.provider].baseUrl;
  return base.replace(/\/+$/, "");
}

export function aiReady(settings: AiSettings): boolean {
  if (!settings.model) return false;
  // An AI on this computer needs no key.
  return settings.provider === "local" || settings.key.length > 0;
}

export type SermonSummary = {
  summary: string;
  points: Array<{ heading: string; body: string; scripture: string }>;
};

const INSTRUCTIONS = `You help a church projection team. From a preacher's sermon notes, write:
1. "summary": two or three plain sentences a congregation could read.
2. "points": the main points of the message, 3 to 7 of them, in the order preached. Each has
   "heading" (at most 8 words, for the screen), "body" (one short sentence, may be empty) and
   "scripture" (a Bible reference like "John 3:16" if the notes give one for that point, else "").
Keep the preacher's words where you can. Do not invent scripture references.
Answer with JSON only: {"summary": "...", "points": [{"heading": "...", "body": "...", "scripture": "..."}]}`;

export type AiRequest = { url: string; headers: Record<string, string>; body: string };

export function summaryRequest(settings: AiSettings, input: { title: string; notes: string }): AiRequest {
  const message = `Sermon title: ${input.title || "(untitled)"}\n\nNotes:\n${input.notes.slice(0, 40_000)}`;
  return chatRequest(settings, INSTRUCTIONS, message, { maxTokens: 1500, temperature: 0.3 });
}

/** One instruction and one message to the church's AI (Claude, or any OpenAI-style API). */
export function chatRequest(settings: AiSettings, system: string, message: string, options: { maxTokens: number; temperature: number }): AiRequest {
  if (settings.provider === "anthropic") {
    return {
      url: `${baseOf(settings)}/v1/messages`,
      headers: { ...anthropicHeaders(settings.key), "content-type": "application/json" },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: options.maxTokens,
        system,
        messages: [{ role: "user", content: message }],
      }),
    };
  }
  return {
    url: `${baseOf(settings)}/chat/completions`,
    headers: { ...bearer(settings.key), "content-type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
      // OpenAI's newer models refuse any temperature but their own; the others take it.
      ...(settings.provider === "openai" ? {} : { temperature: options.temperature }),
    }),
  };
}

function anthropicHeaders(key: string): Record<string, string> {
  return {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    // Allowed when the call comes straight from the app's window (browser version).
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

function bearer(key: string): Record<string, string> {
  return key ? { authorization: `Bearer ${key}` } : {};
}

/** Ask the service which models this key can use. */
export function modelsRequest(settings: AiSettings): { url: string; headers: Record<string, string> } {
  return settings.provider === "anthropic"
    ? { url: `${baseOf(settings)}/v1/models?limit=100`, headers: anthropicHeaders(settings.key) }
    : { url: `${baseOf(settings)}/models`, headers: bearer(settings.key) };
}

// Models that do something else (speech, pictures, search), left out of the list of writers.
const NOT_FOR_WRITING = /embed|tts|whisper|transcri|dall-e|image|imagen|veo|sora|banana|audio|realtime|live|moderation|search|aqa|lyria|robotics|research|antigravity|computer-use/i;

/** The model names from a models list (every service answers {data: [{id}]}), writers only. */
export function parseModels(reply: unknown): string[] {
  const record = recordOf(reply);
  throwIfError(record);
  const data = Array.isArray(record.data) ? record.data : [];
  const ids = data
    .map((model) => (model && typeof model === "object" ? (model as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map((id) => id.replace(/^models\//, ""))
    .filter((id) => !NOT_FOR_WRITING.test(id));
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

/** An answer as an object; Gemini sometimes wraps its error in a one-item list. */
function recordOf(reply: unknown): Record<string, unknown> {
  const value = Array.isArray(reply) && reply.length === 1 ? reply[0] : reply;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function throwIfError(record: Record<string, unknown>) {
  const error = record.error as { message?: unknown } | string | undefined;
  if (!error) return;
  const message = typeof error === "string" ? error : typeof error.message === "string" ? error.message : "The AI service returned an error.";
  throw new Error(friendlyError(message));
}

/** The model's text from either API's reply, or a readable error. */
export function replyText(provider: AiProvider, reply: unknown): string {
  const record = recordOf(reply);
  throwIfError(record);
  if (provider === "anthropic") {
    const content = Array.isArray(record.content) ? record.content : [];
    const text = content.map((part) => (part && typeof part === "object" && (part as { type?: unknown }).type === "text" ? String((part as { text?: unknown }).text ?? "") : "")).join("");
    if (text.trim()) return text;
  } else {
    const choices = Array.isArray(record.choices) ? record.choices : [];
    const first = choices[0] as { message?: { content?: unknown } } | undefined;
    if (typeof first?.message?.content === "string" && first.message.content.trim()) return first.message.content;
  }
  throw new Error("The AI service answered with nothing to show. Try again.");
}

function friendlyError(message: string): string {
  if (/invalid.*(api[- ]?key|x-api-key)|incorrect api key|api key not valid|valid api key|authentication/i.test(message)) return "The AI service did not accept the key. Check it in Settings › AI assistant.";
  if (/model/i.test(message) && /not.*found|does not exist|invalid/i.test(message)) return `That model name was not found: ${message}`;
  if (/high demand|overloaded|try again later|temporarily unavailable|rate limit|too many requests/i.test(message)) return "The AI service is busy right now. Try again in a minute, or choose another model.";
  if (/credit|quota|billing|insufficient/i.test(message)) return "The AI account has no credit left. Top it up with the provider.";
  return message;
}

/** Read the summary JSON (allowing a ```json fence or stray words around it). */
export function parseSummary(text: string): SermonSummary {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI answer was not in the expected shape. Try again.");
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The AI answer was not in the expected shape. Try again.");
  }
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const points = (Array.isArray(record.points) ? record.points : [])
    .map((point) => {
      const p = point && typeof point === "object" ? (point as Record<string, unknown>) : {};
      return { heading: clean(p.heading, 120), body: clean(p.body, 400), scripture: clean(p.scripture, 60) };
    })
    .filter((point) => point.heading)
    .slice(0, 12);
  return { summary: clean(record.summary, 1200), points };
}
