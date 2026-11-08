import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatJSON } from "./client";

const { create, log } = vi.hoisted(() => ({ create: vi.fn(), log: vi.fn() }));
vi.mock("openai", () => ({ default: class {
  chat = { completions: { create } };
} }));
vi.mock("@/lib/env", () => ({ env: { aiKey: "test-key", aiBaseUrl: "https://example.test", aiModel: "test-model" } }));
vi.mock("@/db", () => ({ schema: { aiLogs: {} }, getDb: async () => ({ insert: () => ({ values: log }) }) }));

const response = (content: string, finish: "length" | "stop", tokens: number) => ({
  choices: [{ message: { content }, finish_reason: finish }],
  usage: { prompt_tokens: 10, completion_tokens: tokens },
});
const messages = [{ role: "user" as const, content: "Write the simulation JSON." }];
beforeEach(() => { vi.resetAllMocks(); log.mockResolvedValue(undefined); });

describe("AI output budgets", () => {
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
