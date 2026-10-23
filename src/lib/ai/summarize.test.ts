import { describe, expect, it } from "vitest";
import { aiReady, modelsRequest, parseModels, parseSummary, replyText, sanitizeAiSettings, summaryRequest } from "./summarize";

describe("sermon summary with the church's own AI key", () => {
  it("builds an Anthropic request with the key and model", () => {
    const request = summaryRequest({ provider: "anthropic", key: "sk-test", model: "claude-sonnet-5-5", baseUrl: "" }, { title: "Grace", notes: "Point one" });
    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["x-api-key"]).toBe("sk-test");
    expect(JSON.parse(request.body).model).toBe("claude-sonnet-5-5");
  });

  it("builds an AI-on-this-computer request without a key", () => {
    const local = { provider: "local" as const, key: "", model: "llama3.1", baseUrl: "http://localhost:11434/v1/" };
    const request = summaryRequest(local, { title: "", notes: "x" });
    expect(request.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(request.headers.authorization).toBeUndefined();
    expect(JSON.parse(request.body).temperature).toBe(0.3);
    expect(aiReady(local)).toBe(true);
    expect(aiReady({ ...local, model: "" })).toBe(false);
  });

  it("sends ChatGPT and Gemini to their own addresses with the key", () => {
    const openai = summaryRequest({ provider: "openai", key: "sk", model: "gpt-6.1-sol", baseUrl: "" }, { title: "", notes: "x" });
    expect(openai.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(openai.headers.authorization).toBe("Bearer sk");
    expect(JSON.parse(openai.body).temperature).toBeUndefined();
    const gemini = summaryRequest({ provider: "gemini", key: "g", model: "gemini-3.8-flash", baseUrl: "" }, { title: "", notes: "x" });
    expect(gemini.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(gemini.headers.authorization).toBe("Bearer g");
    expect(aiReady({ provider: "gemini", key: "", model: "gemini-3.8-flash", baseUrl: "" })).toBe(false);
  });

  it("lists the models a key can use, writers only", () => {
    expect(modelsRequest({ provider: "anthropic", key: "k", model: "", baseUrl: "" }).url).toBe("https://api.anthropic.com/v1/models?limit=100");
    expect(modelsRequest({ provider: "local", key: "", model: "", baseUrl: "http://localhost:1234/v1" }).url).toBe("http://localhost:1234/v1/models");
    const reply = { data: [{ id: "models/gemini-3.8-flash" }, { id: "models/text-embedding-004" }, { id: "gpt-6-luna" }, { id: "tts-1" }, { id: "gpt-6-luna" }] };
    expect(parseModels(reply)).toEqual(["gemini-3.8-flash", "gpt-6-luna"]);
    expect(() => parseModels([{ error: { message: "API key not valid. Please pass a valid API key." } }])).toThrow(/did not accept the key/);
    expect(() => replyText("gemini", [{ error: { code: 503, message: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.", status: "UNAVAILABLE" } }])).toThrow(/busy right now/);
    expect(() => replyText("gemini", [{ error: { code: 400, message: "Please pass a valid API key", status: "INVALID_ARGUMENT" } }])).toThrow(/did not accept the key/);
  });

  it("reads both kinds of reply and explains errors", () => {
    expect(replyText("anthropic", { content: [{ type: "text", text: "hi" }] })).toBe("hi");
    expect(replyText("openai", { choices: [{ message: { content: "hey" } }] })).toBe("hey");
    expect(() => replyText("anthropic", { error: { message: "invalid x-api-key" } })).toThrow(/did not accept the key/);
  });

  it("parses the summary even inside a code fence, keeping only usable points", () => {
    const parsed = parseSummary('```json\n{"summary":"God is near.","points":[{"heading":"He sees you","body":"","scripture":"Psalm 139:1"},{"heading":""}]}\n```');
    expect(parsed.summary).toBe("God is near.");
    expect(parsed.points).toEqual([{ heading: "He sees you", body: "", scripture: "Psalm 139:1" }]);
    expect(() => parseSummary("sorry")).toThrow();
  });

  it("cleans saved settings", () => {
    expect(sanitizeAiSettings({ provider: "openai", key: " k " })).toMatchObject({ provider: "openai", key: "k", model: "gpt-6.1-sol" });
    expect(sanitizeAiSettings(null).provider).toBe("anthropic");
    expect(sanitizeAiSettings({ provider: "local" })).toMatchObject({ provider: "local", model: "" });
  });

  it("moves settings saved before Gemini and local AI had their own choice", () => {
    expect(sanitizeAiSettings({ provider: "openai", model: "llama3.1", baseUrl: "http://localhost:11434/v1" })).toMatchObject({ provider: "local", model: "llama3.1", baseUrl: "http://localhost:11434/v1" });
    expect(sanitizeAiSettings({ provider: "openai", key: "g", model: "gemini-3.8-flash", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/" })).toMatchObject({ provider: "gemini", key: "g", baseUrl: "" });
    expect(sanitizeAiSettings({ provider: "openai", key: "k", baseUrl: "https://api.openai.com/v1" })).toMatchObject({ provider: "openai", baseUrl: "" });
  });
});
