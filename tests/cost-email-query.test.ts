import "./setup.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { tag } from "./setup.ts";

after(closeDb);

test("the actual email SQL separates SCNet quota calls from paid estimates in the same Beijing day", async () => {
  const query = execFileSync("python3", ["-c", "import runpy; print(runpy.run_path('deploy/cost-report.py')['QUERY'])"], { encoding: "utf8" });
  const rows = [
    { service: "intern", status: "received", usage: { total_tokens: 20 }, cost: null },
    { service: "scnet", status: "received", usage: { total_tokens: 100 }, cost: null },
    { service: "scnet", status: "received", usage: {}, cost: null },
    { service: "scnet", status: "failed", usage: null, cost: null },
    { service: "scnet", status: "unknown", usage: null, cost: null },
    { service: "deepseek", status: "received", usage: { total_tokens: 50 }, cost: 0.25 },
  ];
  for (const r of rows) {
    const [receipt] = await sql`INSERT INTO receipts(logical_key,service,purpose,status,request)
      VALUES(${tag()},${r.service},'translate_body',${r.status},'{}') RETURNING id`;
    await sql`INSERT INTO receipt_attempts(receipt_id,attempt,service,model,origin,status,usage,cost,currency,started_at)
      VALUES(${receipt!.id},1,${r.service},'test-model','live',${r.status},${r.usage ? sql.json(r.usage) : null},${r.cost},${r.cost === null ? null : "CNY"},
      (date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai')-interval '1 hour') AT TIME ZONE 'Asia/Shanghai')`;
  }
  const [row] = await sql.unsafe(query);
  const report = row!.json_build_object;
  assert.equal(report.paid_calls, 1);
  assert.equal(Number(report.paid_cny), 0.25);
  assert.equal(report.free_success, 1);
  assert.equal(report.scnet_success, 2);
  assert.equal(report.scnet_failed, 1);
  assert.equal(report.scnet_unknown, 1);
  assert.equal(report.scnet_tokens, 100);
  assert.equal(report.scnet_missing_usage, 1);
  assert.equal(report.unknown_outcomes, 0);
  assert.equal(report.unpriced_paid, 0);
  assert.deepEqual(report.purposes.map((p: { calls: number }) => Number(p.calls)), [1]);
});
