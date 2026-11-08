import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { env } from "@/lib/env";
import { getDb, schema } from "@/db";

export type ChatMessage = ChatCompletionMessageParam;

const modelLimits = new Map<string, Promise<number | undefined>>();
const learnedBudgets = new Map<string, number>();
const isDeepSeek = (url: string) => { try { return new URL(url).hostname === "api.deepseek.com"; } catch { return false; } };

/** Ask the provider for its real allowance once, avoiding repeated full rewrites. */
function outputLimit(client: OpenAI, base: string, model: string) {
  const key = `${base}:${model}`;
  let pending = modelLimits.get(key);
  if (!pending) {
    pending = client.models.list({ timeout: 5000, maxRetries: 0 }).then((page) => {
      const models = page.data as { id: string; max_output_tokens?: number }[];
      const exact = models.find((m) => m.id === model);
      const legacyFlash = isDeepSeek(base) && ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash"].includes(model)
        ? models.find((m) => m.id === "deepseek-flash" || m.id === "deepseek-v4-flash") : undefined;
      const value = (exact ?? legacyFlash)?.max_output_tokens;
      return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
    }).catch(() => undefined);
    modelLimits.set(key, pending);
  }
  return pending;
}

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
    const budgetKey = `${env.aiBaseUrl}:${env.aiModel}`;
    const providerLimit = await outputLimit(client, env.aiBaseUrl, env.aiModel);
    let outputBudget = providerLimit ?? learnedBudgets.get(budgetKey);
    let previousUsed = 0;
    while (true) {
      const res = await client.chat.completions.create({
        model: env.aiModel,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.7,
        // Use the full advertised provider allowance from the first attempt.
        // Generic providers without metadata retain the growing-budget fallback.
        ...(outputBudget === undefined ? {} : { max_tokens: outputBudget }),
        ...(isDeepSeek(env.aiBaseUrl) ? { thinking: { type: "disabled" } } : {}),
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
        if (providerLimit !== undefined) throw new Error("The AI reached its provider's maximum output/context limit. This draft cannot fit in one response.");
        if (used <= previousUsed) throw new Error("The AI provider cannot return a longer response for this request. Its model/context limit has been reached.");
        previousUsed = used;
        outputBudget = Math.max(used, outputBudget ?? 0) * 2;
        learnedBudgets.set(budgetKey, outputBudget);
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
