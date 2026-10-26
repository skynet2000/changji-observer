import { MODEL_COST_POLICY } from "@aihot/site/models";
import { beijingDate } from "@aihot/contracts/time";
import type { ReceiptRequest } from "./receipts.ts";

const roundUp = (amount: number) => Math.ceil(amount * 1e6) / 1e6;
const tokens = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** The economy output cap applies only while an amount limit is active. */
export function budgetedOutputTokens(requested: number): number {
  const setting = process.env.LLM_DAILY_BUDGET_CNY;
  const unlimited = setting === "unlimited" || process.env.LLM_BUDGET_UNLIMITED_DATE === beijingDate(new Date());
  return setting && !unlimited ? Math.min(requested, MODEL_COST_POLICY.maxOutputTokens) : requested;
}

/** A conservative CNY estimate at the site's verified peak prices; unknown usage keeps the reservation. */
export function modelCost(usage: Record<string, unknown> | null): number | null {
  if (!usage || !tokens(usage.prompt_tokens) || !tokens(usage.completion_tokens)) return null;
  const cached = tokens(usage.prompt_cache_hit_tokens) ? usage.prompt_cache_hit_tokens : 0;
  if (cached > usage.prompt_tokens) return null;
  return roundUp(((usage.prompt_tokens - cached) * MODEL_COST_POLICY.inputPerMillion
    + cached * MODEL_COST_POLICY.cachedInputPerMillion + usage.completion_tokens * MODEL_COST_POLICY.outputPerMillion) / 1e6);
}

/** Byte-based input upper bound plus per-message framing; unsupported models or image inputs stop before sending. */
export function reserveModelCost(baseUrl: string, body: Record<string, unknown>): ReceiptRequest["costBudget"] {
  const setting = process.env.LLM_DAILY_BUDGET_CNY;
  if (!setting) return undefined;
  const dailyLimit = setting === "unlimited" ? null : Number(setting);
  if (dailyLimit !== null && (!Number.isFinite(dailyLimit) || dailyLimit <= 0)) throw new Error("LLM_DAILY_BUDGET_CNY must be positive or unlimited");
  if (new URL(baseUrl).origin !== MODEL_COST_POLICY.origin || body.model !== MODEL_COST_POLICY.model) {
    // The quota provider reports tokens but no CNY bill. Keep its monetary cost unknown, not a
    // fabricated zero or DeepSeek's retail price. A future finite cap must fail closed.
    const quotaModel = (new URL(baseUrl).origin === "https://discovery-api.intern-ai.org.cn" && body.model === "deepseek-v4.1-flash-1017")
      || (baseUrl.replace(/\/$/, "") === "https://api.scnet.cn/api/llm/v1" && body.model === "GLM-5.3-Flash");
    if (dailyLimit === null && quotaModel) return undefined;
    throw new Error("Cost budget requires the verified DeepSeek Flash endpoint and model");
  }
  const fields = ["model", "messages", "temperature", "max_tokens", "response_format", "thinking", "reasoning_effort"];
  if (Object.keys(body).some(key => !fields.includes(key))) throw new Error("Cannot bound extra model request fields");
  if (body.reasoning_effort !== undefined && !["low", "high", "max"].includes(String(body.reasoning_effort))) throw new Error("Unsupported reasoning effort");
  if (!tokens(body.max_tokens) || body.max_tokens === 0 || !Array.isArray(body.messages)) throw new Error("Cannot bound model request cost");
  let inputBytes = 0;
  for (const message of body.messages as Array<{ content: unknown }>) {
    if (typeof message.content === "string") inputBytes += Buffer.byteLength(message.content);
    else if (Array.isArray(message.content) && message.content.every(p => p.type === "text" && typeof p.text === "string")) {
      inputBytes += message.content.reduce((sum, p) => sum + Buffer.byteLength(p.text), 0);
    } else throw new Error("Cost budget supports text-only model requests");
  }
  const maxAmount = roundUp(((inputBytes + body.messages.length * 1024) * MODEL_COST_POLICY.inputPerMillion
    + body.max_tokens * MODEL_COST_POLICY.outputPerMillion) / 1e6);
  const unlimitedToday = process.env.LLM_BUDGET_UNLIMITED_DATE === beijingDate(new Date());
  return { maxAmount, dailyLimit: unlimitedToday ? null : dailyLimit, currency: "CNY" };
}
