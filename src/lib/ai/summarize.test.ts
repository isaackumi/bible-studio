import { describe, expect, it } from "vitest";
import { aiReady, parseSummary, replyText, sanitizeAiSettings, summaryRequest } from "./summarize";

describe("sermon summary with the church's own AI key", () => {
  it("builds an Anthropic request with the key and model", () => {
    const request = summaryRequest({ provider: "anthropic", key: "sk-test", model: "claude-sonnet-5-5", baseUrl: "" }, { title: "Grace", notes: "Point one" });
    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["x-api-key"]).toBe("sk-test");
    expect(JSON.parse(request.body).model).toBe("claude-sonnet-5-5");
  });

  it("builds an OpenAI-style request, also for a local server without a key", () => {
    const local = { provider: "openai" as const, key: "", model: "llama3.1", baseUrl: "http://localhost:11434/v1/" };
    const request = summaryRequest(local, { title: "", notes: "x" });
    expect(request.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(request.headers.authorization).toBeUndefined();
    expect(aiReady(local)).toBe(true);
    expect(aiReady({ ...local, baseUrl: "https://api.openai.com/v1" })).toBe(false);
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
    expect(sanitizeAiSettings({ provider: "openai", key: " k " })).toMatchObject({ provider: "openai", key: "k", model: "gpt-4o-mini" });
    expect(sanitizeAiSettings(null).provider).toBe("anthropic");
  });
});
