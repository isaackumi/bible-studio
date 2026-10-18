// Sermon notes → a short summary and screen-ready points, with the church's own AI key.
// Two kinds of service: Anthropic (Claude) and anything that speaks the OpenAI chat API
// (OpenAI itself, or a model on this computer through Ollama or LM Studio). This file only
// builds the request and reads the answer; the app sends it (through Rust on the desktop).

export type AiProvider = "anthropic" | "openai";

export type AiSettings = {
  provider: AiProvider;
  /** The church's own key. Kept on this computer only. Empty for local models that need none. */
  key: string;
  model: string;
  /** OpenAI-style only: another address, e.g. http://localhost:11434/v1 for Ollama. */
  baseUrl: string;
};

export const AI_DEFAULTS: Record<AiProvider, { model: string; baseUrl: string }> = {
  anthropic: { model: "claude-sonnet-5-5", baseUrl: "https://api.anthropic.com" },
  openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
};

export function emptyAiSettings(): AiSettings {
  return { provider: "anthropic", key: "", model: AI_DEFAULTS.anthropic.model, baseUrl: "" };
}

export function sanitizeAiSettings(value: unknown): AiSettings {
  const record = value && typeof value === "object" ? (value as Partial<AiSettings>) : {};
  const provider: AiProvider = record.provider === "openai" ? "openai" : "anthropic";
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    provider,
    key: text(record.key, 400),
    model: text(record.model, 120) || AI_DEFAULTS[provider].model,
    baseUrl: text(record.baseUrl, 300),
  };
}

export function aiReady(settings: AiSettings): boolean {
  if (!settings.model) return false;
  // A local OpenAI-style server (Ollama, LM Studio) needs an address but no key.
  if (settings.provider === "openai" && settings.baseUrl && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(settings.baseUrl)) return true;
  return settings.key.length > 0;
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

/** One instruction and one message to the church's AI service (Claude, or any OpenAI-style API). */
export function chatRequest(settings: AiSettings, system: string, message: string, options: { maxTokens: number; temperature: number }): AiRequest {
  if (settings.provider === "anthropic") {
    const base = (settings.baseUrl || AI_DEFAULTS.anthropic.baseUrl).replace(/\/+$/, "");
    return {
      url: `${base}/v1/messages`,
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.key,
        "anthropic-version": "2023-06-01",
        // Allowed when the call comes straight from the app's window (browser version).
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: options.maxTokens,
        system,
        messages: [{ role: "user", content: message }],
      }),
    };
  }
  const base = (settings.baseUrl || AI_DEFAULTS.openai.baseUrl).replace(/\/+$/, "");
  return {
    url: `${base}/chat/completions`,
    headers: {
      "content-type": "application/json",
      ...(settings.key ? { authorization: `Bearer ${settings.key}` } : {}),
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
      temperature: options.temperature,
    }),
  };
}

/** The model's text from either API's reply, or a readable error. */
export function replyText(provider: AiProvider, reply: unknown): string {
  const record = reply && typeof reply === "object" ? (reply as Record<string, unknown>) : {};
  const error = record.error as { message?: unknown } | string | undefined;
  if (error) {
    const message = typeof error === "string" ? error : typeof error.message === "string" ? error.message : "The AI service returned an error.";
    throw new Error(friendlyError(message));
  }
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
  if (/invalid.*(api[- ]?key|x-api-key)|incorrect api key|authentication/i.test(message)) return "The AI service did not accept the key. Check it in Settings › AI assistant.";
  if (/model/i.test(message) && /not.*found|does not exist|invalid/i.test(message)) return `That model name was not found: ${message}`;
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
