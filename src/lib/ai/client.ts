import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { env } from "@/lib/env";
import { getDb, schema } from "@/db";

export type ChatMessage = ChatCompletionMessageParam;

export class AiNotConfigured extends Error {
  constructor() {
    super("The AI is not set up yet: DEEPSEEK_API_KEY is missing in the server settings.");
  }
}

/**
 * One provider today (DeepSeek, OpenAI-compatible API). To add OpenAI later, point
 * DEEPSEEK_BASE_URL / DEEPSEEK_MODEL / DEEPSEEK_API_KEY at it, or add a second client here.
 */
export async function chatJSON(messages: ChatMessage[], kind: string, exerciseId?: string): Promise<string> {
  if (!env.aiKey) throw new AiNotConfigured();
  const client = new OpenAI({ apiKey: env.aiKey, baseURL: env.aiBaseUrl, timeout: 240_000, maxRetries: 1 });
  const started = Date.now();
  const db = await getDb();
  try {
    let outputBudget: number | undefined;
    let previousUsed = 0;
    while (true) {
      const res = await client.chat.completions.create({
        model: env.aiModel,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.7,
        // Use the provider default first. If it truncates, grow from the actual
        // usage rather than imposing a fixed application output ceiling.
        ...(outputBudget === undefined ? {} : { max_tokens: outputBudget }),
      });
      const text = res.choices[0]?.message?.content ?? "";
      const truncated = res.choices[0]?.finish_reason === "length";
      await db.insert(schema.aiLogs).values({
        kind,
        model: env.aiModel,
        exerciseId,
        ok: !truncated,
        error: truncated ? "Provider truncated the response; requesting a larger output budget." : null,
        response: text.slice(0, 60_000),
        promptTokens: res.usage?.prompt_tokens,
        completionTokens: res.usage?.completion_tokens,
        ms: Date.now() - started,
      });
      if (truncated) {
        const used = res.usage?.completion_tokens ?? Math.ceil(text.length / 3);
        if (used <= previousUsed) throw new Error("The AI provider cannot return a longer response for this request. Its model/context limit has been reached.");
        previousUsed = used;
        outputBudget = Math.max(used, outputBudget ?? 0) * 2;
        continue;
      }
      return text;
    }
  } catch (e) {
    await db
      .insert(schema.aiLogs)
      .values({ kind, model: env.aiModel, exerciseId, ok: false, error: String((e as Error).message).slice(0, 4000), ms: Date.now() - started })
      .catch(() => {});
    throw e;
  }
}
