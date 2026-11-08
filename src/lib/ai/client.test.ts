import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatJSON } from "./client";

const { create, log, list, settings } = vi.hoisted(() => ({ create: vi.fn(), log: vi.fn(), list: vi.fn(), settings: { aiKey: "test-key", aiBaseUrl: "https://example.test", aiModel: "test-model" } }));
vi.mock("openai", () => ({ default: class {
  chat = { completions: { create } };
  models = { list };
} }));
vi.mock("@/lib/env", () => ({ env: settings }));
vi.mock("@/db", () => ({ schema: { aiLogs: {} }, getDb: async () => ({ insert: () => ({ values: log }) }) }));

const response = (content: string, finish: "length" | "stop", tokens: number) => ({
  choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: 10, completion_tokens: tokens },
});
const messages = [{ role: "user" as const, content: "Write the simulation JSON." }];
let testNumber = 0;
beforeEach(() => {
  vi.resetAllMocks(); log.mockResolvedValue(undefined); list.mockResolvedValue({ data: [] });
  settings.aiBaseUrl = `https://example.test/${++testNumber}`; settings.aiModel = "test-model";
});

describe("AI output budgets", () => {
  it("uses the provider's advertised allowance on the first request and caches metadata", async () => {
    list.mockResolvedValue({ data: [{ id: "test-model", max_output_tokens: 393216 }] });
    create.mockResolvedValue(response('{"complete":true}', "stop", 20000));
    await chatJSON(messages, "sim-generate");
    await chatJSON(messages, "sim-generate-repair");
    expect(create.mock.calls.map(([req]) => req.max_tokens)).toEqual([393216, 393216]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("uses current Flash metadata for DeepSeek's legacy alias and disables thinking", async () => {
    settings.aiBaseUrl = "https://api.deepseek.com"; settings.aiModel = "deepseek-chat";
    list.mockResolvedValue({ data: [{ id: "deepseek-flash", max_output_tokens: 393216 }] });
    create.mockResolvedValue(response('{"complete":true}', "stop", 20000));
    await chatJSON(messages, "sim-generate");
    expect(create.mock.calls[0][0]).toMatchObject({ model: "deepseek-chat", max_tokens: 393216, thinking: { type: "disabled" } });
  });

  it("does not regenerate a response already using the advertised provider maximum", async () => {
    list.mockResolvedValue({ data: [{ id: "test-model", max_output_tokens: 393216 }] });
    create.mockResolvedValue(response('{"partial":', "length", 393216));
    await expect(chatJSON(messages, "sim-generate")).rejects.toThrow("maximum output/context limit");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("reuses a learned budget during repairs when provider metadata is unavailable", async () => {
    create.mockResolvedValueOnce(response('{"partial":', "length", 8000))
      .mockResolvedValue(response('{"complete":true}', "stop", 10000));
    await chatJSON(messages, "sim-generate");
    await chatJSON(messages, "sim-generate-repair");
    expect(create.mock.calls.map(([req]) => req.max_tokens)).toEqual([undefined, 16000, 16000]);
  });

  it("returns a complete large response without a fixed initial token cap or log truncation affecting the result", async () => {
    const text = JSON.stringify({ story: "a".repeat(70000) });
    create.mockResolvedValueOnce(response(text, "stop", 20000));
    expect(await chatJSON(messages, "sim-generate")).toBe(text);
    expect(create.mock.calls[0][0]).not.toHaveProperty("max_tokens");
    expect(log.mock.calls[0][0]).toMatchObject({ ok: true });
  });

  it("retries truncated responses with growing budgets and returns only the complete result", async () => {
    create.mockResolvedValueOnce(response('{"partial":', "length", 8000))
      .mockResolvedValueOnce(response('{"partial":', "length", 16000))
      .mockResolvedValueOnce(response('{"complete":true}', "stop", 24000));
    expect(await chatJSON(messages, "sim-generate")).toBe('{"complete":true}');
    expect(create.mock.calls.map(([req]) => req.max_tokens)).toEqual([undefined, 16000, 32000]);
    expect(log.mock.calls.map(([row]) => row.ok)).toEqual([false, false, true]);
  });

  it("stops if the provider cannot increase output rather than looping or accepting truncated JSON", async () => {
    create.mockResolvedValue(response('{"partial":', "length", 8000));
    await expect(chatJSON(messages, "sim-generate")).rejects.toThrow("model/context limit");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("preserves a provider rejection of a larger budget without returning partial content", async () => {
    create.mockResolvedValueOnce(response('{"partial":', "length", 8000))
      .mockRejectedValueOnce(new Error("Provider maximum context reached"));
    await expect(chatJSON(messages, "sim-generate")).rejects.toThrow("Provider maximum context reached");
    expect(log.mock.calls.at(-1)![0].ok).toBe(false);
  });
});
