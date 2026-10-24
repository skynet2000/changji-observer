import { Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import { after, test } from "node:test";
import { z } from "zod";
import { beijingDate } from "@aihot/contracts/time";
import { closeDb, sql } from "@aihot/backend/db";
import { shutdownSignal } from "@aihot/backend/lib/shutdown";
import { chatJson } from "@aihot/backend/providers/llm";
import { paidRequest } from "@aihot/backend/providers/receipts";

after(closeDb);
const answer = { choices: [{ message: { content: '{"ok":true}' } }] };
const call = (purpose: string, model = "intern-flash") => chatJson({
  model, purpose, subject: tag(), promptVersion: tag(), system: "JSON", user: tag(), schema: z.object({ ok: z.boolean() }),
});
async function withProviders(run: (primary: Awaited<ReturnType<typeof stub>>, fallback: Awaited<ReturnType<typeof stub>>) => Promise<void>, rejectFirst = false) {
  const primary = await stub(hit => rejectFirst && hit === 1 ? new Reply(429, { error: "rate limit" }) : answer);
  const fallback = await stub(() => answer);
  Object.assign(process.env, { INTERN_BASE_URL: primary.url, INTERN_API_KEY: "test", DEEPSEEK_BASE_URL: fallback.url, DEEPSEEK_API_KEY: "test" });
  try { await run(primary, fallback); }
  finally { await primary.close(); await fallback.close(); }
}

test("free variants and maintenance tasks share pacing even with no budget row and an unlimited allowance", async (t) => {
  const previous = process.env.LLM_BUDGET_UNLIMITED_DATE;
  process.env.LLM_BUDGET_UNLIMITED_DATE = beijingDate(new Date());
  t.after(() => {
    if (previous === undefined) delete process.env.LLM_BUDGET_UNLIMITED_DATE;
    else process.env.LLM_BUDGET_UNLIMITED_DATE = previous;
  });
  assert.equal((await sql`SELECT 1 FROM budgets WHERE service='intern'`).length, 0);
  await withProviders(async (primary, fallback) => {
    const results = await Promise.all([call("prefilter"), call("score", "intern-flash-think"), call("prefilter-regression")]);
    const attempts = await sql<{ started_at: Date }[]>`SELECT started_at FROM receipt_attempts WHERE service='intern' ORDER BY started_at`;
    for (let i = 1; i < attempts.length; i++) assert.ok(attempts[i]!.started_at.getTime() - attempts[i - 1]!.started_at.getTime() >= 1300, "requests must be spaced rather than burst");
    assert.equal(primary.hits(), 3);
    assert.equal(fallback.hits(), 0, "local waiting must never turn into a paid fallback");
    assert.ok(results.every(result => result.model.startsWith("intern-")));
  });
});

test("a separate process shares the same provider pace through the database", async () => {
  const local = paidRequest({ service: "intern", purpose: "pacing-process", identity: tag() }, async () => ({ response: {} }));
  const child = promisify(execFile)(process.execPath, ["--input-type=module", "-e", `
    import { paidRequest } from "@aihot/backend/providers/receipts";
    import { closeDb } from "@aihot/backend/db";
    try { await paidRequest({service:"intern",purpose:"pacing-process",identity:crypto.randomUUID()}, async()=>({response:{}})); }
    finally { await closeDb(); }
  `], { env: process.env });
  await Promise.all([local, child]);
  const rows = await sql<{ gap: number }[]>`SELECT extract(epoch FROM started_at - lag(started_at) OVER (ORDER BY started_at)) * 1000 AS gap FROM receipt_attempts WHERE service='intern' ORDER BY started_at`;
  assert.ok(rows.slice(1).every(row => row.gap >= 1333), "process-local limiters must not bypass each other");
});

test("the rolling-minute ceiling counts failed attempts, waits without falling back and ignores imported history", async () => {
  await sql`DELETE FROM receipts WHERE service='intern'`;
  const [receipt] = await sql`INSERT INTO receipts(logical_key,service,purpose,status,request) VALUES(${tag()},'intern','pacing-seed','failed','{}') RETURNING id`;
  await sql`INSERT INTO receipt_attempts(receipt_id,attempt,service,status,started_at)
    SELECT ${receipt!.id}, n, 'intern', 'failed', clock_timestamp() - interval '59.4 seconds' FROM generate_series(1,45) n`;
  await sql`INSERT INTO receipt_attempts(receipt_id,attempt,service,origin,status,started_at)
    VALUES(${receipt!.id},46,'intern','imported','received',clock_timestamp())`;
  await withProviders(async (primary, fallback) => {
    const result = await call("rolling-minute");
    const [elapsed] = await sql`SELECT extract(epoch FROM (
      (SELECT started_at FROM receipt_attempts WHERE receipt_id=${result.receiptId}) -
      (SELECT min(started_at) FROM receipt_attempts WHERE receipt_id=${receipt!.id} AND origin='live')
    )) * 1000 AS ms`;
    assert.ok(elapsed!.ms >= 60_000, "a full rolling window must expire before sending");
    assert.equal(primary.hits(), 1);
    assert.equal(fallback.hits(), 0);
    const [count] = await sql`SELECT count(*) FROM receipt_attempts WHERE service='intern' AND origin='live' AND started_at>clock_timestamp()-interval '1 minute'`;
    assert.equal(count!.count, 1);
  });
});

test("a rejected primary retry gets its own paced attempt, while received answers reuse immediately", async () => {
  await withProviders(async (primary, fallback) => {
    const result = await call("paced-retry");
    const rows = await sql`SELECT status,started_at FROM receipt_attempts WHERE receipt_id=${result.receiptId} ORDER BY attempt`;
    assert.deepEqual(rows.map(row => row.status), ["failed", "received"]);
    assert.ok(rows[1]!.started_at - rows[0]!.started_at >= 1333);
    // Reuse the exact logical request while a new request would still be waiting for its slot.
    const request = { service: "intern", purpose: "reuse", identity: tag() };
    await paidRequest(request, async () => ({ response: {} }));
    const before = Date.now();
    assert.equal((await paidRequest(request, async () => { throw Error("must reuse"); })).reused, true);
    assert.ok(Date.now() - before < 1000);
    assert.equal(primary.hits(), 2);
    assert.equal(fallback.hits(), 0);
  }, true);
});

test("waiting releases database locks and shutdown cancels it without reserving an attempt", async () => {
  await paidRequest({ service: "intern", purpose: "before-shutdown", identity: tag() }, async () => ({ response: {} }));
  const [before] = await sql`SELECT count(*) FROM receipt_attempts WHERE service='intern'`;
  const pending = paidRequest({ service: "intern", purpose: "waiting-shutdown", identity: tag() }, async () => { throw Error("must not send"); });
  const rejection = assert.rejects(pending, { name: "AbortError" });
  await setTimeout(100);
  const [lock] = await sql.begin(tx => tx`SELECT pg_try_advisory_xact_lock(hashtext('budget:intern')) AS acquired`);
  assert.equal(lock!.acquired, true, "waiting must not hold a service lock or a pooled transaction");
  shutdownSignal.abort();
  await rejection;
  const [after] = await sql`SELECT count(*) FROM receipt_attempts WHERE service='intern'`;
  assert.equal(after!.count, before!.count);
  assert.equal((await sql`SELECT 1 FROM receipts WHERE purpose='waiting-shutdown'`).length, 0);
});
