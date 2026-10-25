import "./setup.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";

after(closeDb);

test("source seeds preserve publisher signal groups and never overwrite administrator edits", async () => {
  const seed = () => execFileSync(process.execPath, ["scripts/seed.ts"], { env: process.env, stdio: "pipe" });
  seed();
  const grouped = await sql`SELECT id, signal_group_id FROM sources WHERE id IN ('web-huxiu-business','web-huxiu-tech') ORDER BY id`;
  assert.equal(grouped.length, 2);
  assert.ok(grouped.every(s => s.signal_group_id === "media-huxiu"), "two Huxiu endpoints remain one publisher signal");
  await sql`UPDATE sources SET signal_group_id='admin-custom-group', enabled=false WHERE id='web-huxiu-tech'`;
  seed();
  const [edited] = await sql`SELECT signal_group_id, enabled FROM sources WHERE id='web-huxiu-tech'`;
  assert.equal(edited!.signal_group_id, "admin-custom-group");
  assert.equal(edited!.enabled, false);
});
