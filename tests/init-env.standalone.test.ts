import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/init-env.ts", import.meta.url));

for (const [base, copied] of [["https://api.deepseek.com/v1", true], ["https://other.example/v1", false]] as const) {
  test(`init-env keeps scoring credentials ${copied ? "shared for official DeepSeek" : "separate from another provider"}`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), "changji-init-env-"));
    try {
      writeFileSync(path.join(dir, ".env.example"), `ADMIN_PASSWORD=\nSESSION_SECRET=\nIMG_PROXY_SIGN_SECRET=\nPOSTGRES_PASSWORD=\nLLM_BASE_URL=${base}\nLLM_API_KEY=\nDEEPSEEK_BASE_URL=https://api.deepseek.com/v1\nDEEPSEEK_API_KEY=\n`);
      execFileSync(process.execPath, [script, "--llm-key", "fixture-provider-key"], { cwd: dir, stdio: "pipe" });
      const env = parseEnv(readFileSync(path.join(dir, ".env"), "utf8"));
      assert.equal(env.LLM_API_KEY, "fixture-provider-key");
      assert.equal(env.DEEPSEEK_API_KEY, copied ? "fixture-provider-key" : "");
      assert.ok(env.ADMIN_PASSWORD!.length >= 12);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
