import "./model-chain-fixture.ts";
import { stub, Reply, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { z } from "zod";
import { chatJson, MODELS } from "@aihot/backend/providers/llm";
import { closeDb, sql } from "@aihot/backend/db";
import { BudgetExceededError, ProviderRejectedError } from "@aihot/backend/providers/receipts";

after(closeDb);
const answer = { choices: [{ message: { content: '{"ok":true}' } }] };
const call = (model = "intern-flash", timeoutMs?: number) => chatJson({ model, purpose: "chain-test", subject: tag(), promptVersion: tag(), system: "JSON", user: tag(), schema: z.object({ ok: z.boolean() }), timeoutMs });

async function withChain(pReply: Parameters<typeof stub>[0], mReply: Parameters<typeof stub>[0], run: (p: Awaited<ReturnType<typeof stub>>, m: Awaited<ReturnType<typeof stub>>, f: Awaited<ReturnType<typeof stub>>) => Promise<void>, fReply: Parameters<typeof stub>[0] = () => answer) {
  const p = await stub(pReply), m = await stub(mReply), f = await stub(fReply);
  const names = ["INTERN_BASE_URL", "INTERN_API_KEY", "TEST_MIDDLE_URL", "TEST_MIDDLE_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_API_KEY"];
  const before = names.map(name => process.env[name]);
  const normal = MODELS["intern-flash"]!.fallback, think = MODELS["intern-flash-think"]!.fallback;
  Object.assign(process.env, { INTERN_BASE_URL: p.url, INTERN_API_KEY: "test", TEST_MIDDLE_URL: m.url, TEST_MIDDLE_KEY: "test", DEEPSEEK_BASE_URL: f.url, DEEPSEEK_API_KEY: "test" });
  MODELS["intern-flash"]!.fallback = "test-middle";
  MODELS["intern-flash-think"]!.fallback = "test-middle-think";
  try { await run(p, m, f); }
  finally {
    MODELS["intern-flash"]!.fallback = normal; MODELS["intern-flash-think"]!.fallback = think;
    names.forEach((name, i) => { if (before[i] === undefined) delete process.env[name]; else process.env[name] = before[i]; });
    await Promise.all([p.close(), m.close(), f.close()]);
  }
}

test("a three-provider route stops on primary success without sending to either fallback", async () => {
  await withChain(() => answer, () => answer, async (p, m, f) => {
    assert.equal((await call()).model, "intern-flash");
    assert.deepEqual([p.hits(), m.hits(), f.hits()], [1, 0, 0]);
  });
});

test("primary 429 recovery is exhausted before the exact-version middle provider; paid stays unused", async () => {
  await withChain(() => new Reply(429, { error: "rate limit" }), (_hit, req) => {
    const body = JSON.parse(req.body);
    assert.equal(body.model, "test-model");
    assert.equal(body.thinking.type, "enabled");
    return answer;
  }, async (p, m, f) => {
    const result = await call();
    assert.equal(result.model, "test-middle");
    assert.deepEqual([p.hits(), m.hits(), f.hits()], [2, 1, 0]);
    const [receipt] = await sql`SELECT service,model,cost,currency FROM receipts WHERE id=${result.receiptId}`;
    assert.equal(receipt!.service, "test-middle");
    assert.equal(receipt!.model, "test-model");
    assert.equal(receipt!.cost, null, "unknown quota cost must not be fabricated as zero");
  });
});

test("both failed quota layers reach paid once and preserve the thinking variant and separate attempts", async () => {
  await withChain(() => new Reply(429, { error: "rate limit" }), (_hit, req) => {
    assert.equal(JSON.parse(req.body).thinking.type, "enabled");
    return new Reply(429, { error: "quota limit" });
  }, async (p, m, f) => {
    const result = await call("intern-flash-think");
    assert.equal(result.model, "deepseek-flash-think");
    assert.deepEqual([p.hits(), m.hits(), f.hits()], [2, 1, 1]);
    const rows = await sql`SELECT a.service,a.status FROM receipt_attempts a JOIN receipts r ON r.id=a.receipt_id
      WHERE r.subject=(SELECT subject FROM receipts WHERE id=${result.receiptId}) ORDER BY a.started_at`;
    assert.deepEqual(rows.map(r => [r.service, r.status]), [["intern", "failed"], ["intern", "failed"], ["test-middle", "failed"], ["deepseek", "received"]]);
  });
});

test("unusable middle output falls through while a local middle budget stop never buys paid fallback", async () => {
  await withChain(() => new Reply(503, {}), () => ({ choices: [{ message: { content: "not JSON" } }] }), async (p, m, f) => {
    assert.equal((await call()).model, "deepseek-flash");
    assert.deepEqual([p.hits(), m.hits(), f.hits()], [2, 2, 1]);
  });
  await withChain(() => new Reply(503, {}), () => answer, async (p, m, f) => {
    await sql`INSERT INTO budgets(service,per_minute,per_hour,per_day) VALUES('test-middle',0,0,0)`;
    try { await assert.rejects(call(), BudgetExceededError); }
    finally { await sql`DELETE FROM budgets WHERE service='test-middle'`; }
    assert.deepEqual([p.hits(), m.hits(), f.hits()], [2, 0, 0]);
  });
});

test("a timed-out middle provider is not resent; its receipt stays unknown when paid succeeds", async () => {
  await withChain(() => new Reply(503, {}), async () => { await new Promise(resolve => setTimeout(resolve, 800)); return answer; }, async (p, m, f) => {
    const result = await call("intern-flash", 500);
    assert.equal(result.model, "deepseek-flash");
    assert.deepEqual([p.hits(), m.hits(), f.hits()], [2, 1, 1]);
    const [row] = await sql`SELECT status FROM receipts WHERE service='test-middle'
      AND subject=(SELECT subject FROM receipts WHERE id=${result.receiptId})`;
    assert.equal(row!.status, "unknown");
  });
});

test("cycles and missing links are rejected before any request; final provider failure propagates", async () => {
  await withChain(() => answer, () => answer, async (p, m, f) => {
    const end = MODELS["test-middle"]!.fallback;
    try {
      MODELS["test-middle"]!.fallback = "intern-flash";
      await assert.rejects(call(), /Invalid model fallback/);
      MODELS["test-middle"]!.fallback = "missing-provider";
      await assert.rejects(call(), /Invalid model fallback/);
      assert.deepEqual([p.hits(), m.hits(), f.hits()], [0, 0, 0]);
    } finally { MODELS["test-middle"]!.fallback = end; }
  });
  await withChain(() => new Reply(503, {}), () => new Reply(503, {}), async (p, m, f) => {
    await assert.rejects(call(), ProviderRejectedError);
    assert.deepEqual([p.hits(), m.hits(), f.hits()], [2, 2, 1]);
  }, () => new Reply(503, {}));
});

test("an exhausted middle provider free allowance falls to paid without retrying the empty allowance", async () => {
  await withChain(() => new Reply(503, {}), () => new Reply(434, { error: "free allowance exhausted" }), async (p, m, f) => {
    assert.equal((await call()).model, "deepseek-flash");
    assert.deepEqual([p.hits(), m.hits(), f.hits()], [2, 1, 1]);
  });
});

test("middle provider normal and thinking variants share the provider pace without paying for local waiting", async () => {
  await withChain(() => answer, () => answer, async (p, m, f) => {
    const results = await Promise.all([call("test-middle"), call("test-middle-think")]);
    const rows = await sql`SELECT a.started_at FROM receipt_attempts a WHERE a.receipt_id IN ${sql(results.map(r => r.receiptId))} ORDER BY a.started_at`;
    assert.ok(rows[1]!.started_at.getTime() - rows[0]!.started_at.getTime() >= 2000);
    assert.deepEqual([p.hits(), m.hits(), f.hits()], [0, 2, 0]);
  });
});
