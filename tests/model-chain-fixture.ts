import { MODELS } from "@aihot/backend/providers/llm";
import { MODEL_MAX_CONCURRENT, MODEL_REQUESTS_PER_MINUTE } from "@aihot/site/models";

for (const suffix of ["", "-think"]) {
  const key = `test-middle${suffix}`;
  MODELS[key] = { key, service: "test-middle", model: "test-model", baseUrlEnv: "TEST_MIDDLE_URL", apiKeyEnv: "TEST_MIDDLE_KEY", reasoningTokens: 12000,
    extra: { thinking: { type: "enabled" } }, jsonMode: true, fallback: `deepseek-flash${suffix}` };
  MODELS[`intern-flash${suffix}`]!.fallback = key;
}
Object.assign(MODEL_REQUESTS_PER_MINUTE, { "test-middle": 30 });
Object.assign(MODEL_MAX_CONCURRENT, { "test-middle": 3 });
