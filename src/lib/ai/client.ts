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
    const res = await client.chat.completions.create({
      model: env.aiModel,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 8000,
    });
    const text = res.choices[0]?.message?.content ?? "";
    await db.insert(schema.aiLogs).values({
      kind,
      model: env.aiModel,
      exerciseId,
      ok: true,
      response: text.slice(0, 60_000),
      promptTokens: res.usage?.prompt_tokens,
      completionTokens: res.usage?.completion_tokens,
      ms: Date.now() - started,
    });
    if (res.choices[0]?.finish_reason === "length") throw new Error("The AI's answer was cut off (too long). Ask for fewer transactions or parts.");
    return text;
  } catch (e) {
    await db
      .insert(schema.aiLogs)
      .values({ kind, model: env.aiModel, exerciseId, ok: false, error: String((e as Error).message).slice(0, 4000), ms: Date.now() - started })
      .catch(() => {});
    throw e;
  }
}
