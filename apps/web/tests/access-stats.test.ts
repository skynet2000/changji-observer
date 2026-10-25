import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AccessStats } from "../app/lib/access-stats.server.ts";

test("anonymous traffic counts Shanghai days, navigation and errors without storing identity or query strings", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "traffic-test-"));
  try {
    const stats = new AccessStats(dir, () => new Date("2026-10-25T15:59:00Z"));
    const page = { method: "GET", url: "/all?token=secret&q=private", headers: { "user-agent": "Mozilla/5.0" }, status: 200, type: "text/html" };
    await stats.record(page);
    await stats.record({ ...page, url: "/daily/2026-10-25.data", type: "text/plain" });
    await stats.record({ ...page, headers: { "user-agent": "Googlebot" } });
    await stats.record({ ...page, headers: { "user-agent": "node" } });
    await stats.record({ ...page, headers: { purpose: "prefetch" } });
    await stats.record({ ...page, url: "/api/reader/session" });
    await stats.record({ ...page, url: "/admin/login" });
    await stats.record({ ...page, url: "/assets/app.js", type: "text/javascript" });
    await stats.record({ ...page, status: 503, type: "text/plain" });
    await stats.record({ ...page, status: 404, type: "", url: "/unknown-private-path" });
    const raw = await readFile(path.join(dir, "2026-10-25.json"), "utf8");
    const day = JSON.parse(raw);
    assert.equal(day.views, 2); assert.equal(day.bots, 2); assert.equal(day.errors, 1); assert.equal(day.notFound, 1);
    assert.deepEqual(day.pages, { "/all": 1, "/daily/2026-10-25": 1 });
    assert.ok(!/secret|private|Mozilla|Googlebot|token|user-agent/i.test(raw));
    const restarted = new AccessStats(dir, () => new Date("2026-10-25T16:01:00Z"));
    await restarted.record(page);
    assert.equal(JSON.parse(await readFile(path.join(dir, "2026-10-26.json"), "utf8")).views, 1);
    assert.equal(JSON.parse(await readFile(path.join(dir, "2026-10-25.json"), "utf8")).views, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
