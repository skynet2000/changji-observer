import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile, unlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { AccessStats } from "../app/lib/access-stats.server.ts";
import { startWebServer } from "./web-server.ts";

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

test("daily estimated UV deduplicates concurrent views and survives restarts without saving raw identifiers", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "traffic-uv-"));
  const visit = { method: "GET", url: "/all?secret=private-search", headers: { "user-agent": "Example browser", cookie: "reader=private-account" }, clientAddress: "203.0.113.7", status: 200, type: "text/html" };
  const read = async () => JSON.parse(await readFile(path.join(dir, "2026-10-25.json"), "utf8"));
  try {
    const now = () => new Date("2026-10-25T10:00:00Z");
    const stats = new AccessStats(dir, now);
    await Promise.all(Array.from({ length: 8 }, () => stats.record(visit)));
    assert.equal((await read()).uniqueVisitors, 1);
    await stats.record({ ...visit, clientAddress: "::ffff:203.0.113.7" });
    await stats.record({ ...visit, clientAddress: "203.0.113.8" });
    await stats.record({ ...visit, headers: { "user-agent": "Different browser" } });
    await stats.record({ ...visit, headers: { "user-agent": "Googlebot" } });
    await stats.record({ ...visit, status: 404 });
    await stats.record({ ...visit, clientAddress: undefined, headers: { "x-forwarded-for": "192.0.2.123", "user-agent": "Forged browser" } });
    const restarted = new AccessStats(dir, now);
    await restarted.record(visit);
    const data = await read();
    assert.equal(data.uniqueVisitors, 3);
    assert.equal(data.views, 13);
    assert.equal(data.uvSince, now().toISOString());
    const state = await readFile(path.join(dir, "uv-current.state"), "utf8");
    assert.ok(!/203\.0\.113|192\.0\.2|Example browser|Different browser|cookie|private-account|private-search/.test(state));
    assert.equal(JSON.parse(state).visitors.length, 3);
    assert.equal((await stat(path.join(dir, "uv-current.state"))).mode & 0o777, 0o600);
    assert.ok(!/visitors|key/.test(await readFile(path.join(dir, "2026-10-25.json"), "utf8")));
    const tomorrow = new AccessStats(dir, () => new Date("2026-10-25T16:00:00Z"));
    await tomorrow.record(visit);
    const next = JSON.parse(await readFile(path.join(dir, "uv-current.state"), "utf8"));
    assert.equal(next.visitors.length, 1);
    assert.notEqual(next.key, JSON.parse(state).key);
    assert.ok(!JSON.parse(state).visitors.includes(next.visitors[0]));
    assert.equal(JSON.parse(await readFile(path.join(dir, "2026-10-26.json"), "utf8")).uniqueVisitors, 1);
    assert.equal((await read()).uniqueVisitors, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("UV upgrades and restores preserve PV totals and label partial UV coverage", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "traffic-uv-upgrade-"));
  const visit = { method: "GET", url: "/all", headers: { "user-agent": "Example browser" }, clientAddress: "203.0.113.7", status: 200, type: "text/html" };
  const dayFile = path.join(dir, "2026-10-25.json");
  try {
    await writeFile(path.join(dir, "started.json"), JSON.stringify({ since: "2026-10-24T00:00:00Z" }));
    await writeFile(dayFile, JSON.stringify({ day: "2026-10-25", views: 40, bots: 2, errors: 0, notFound: 0, pages: { "/all": 40 } }));
    await new AccessStats(dir, () => new Date("2026-10-25T12:00:00Z")).record(visit);
    let data = JSON.parse(await readFile(dayFile, "utf8"));
    assert.equal(data.views, 41); assert.equal(data.uniqueVisitors, 1); assert.equal(data.uvSince, "2026-10-25T12:00:00.000Z");
    await unlink(path.join(dir, "uv-current.state"));
    await new AccessStats(dir, () => new Date("2026-10-25T13:00:00Z")).record(visit);
    data = JSON.parse(await readFile(dayFile, "utf8"));
    assert.equal(data.views, 42); assert.equal(data.uniqueVisitors, 1); assert.equal(data.uvSince, "2026-10-25T13:00:00.000Z");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("web UV uses the existing trusted-address boundary without adding cookies or changing public caches", async () => {
  for (const trusted of [false, true]) {
    const dir = await mkdtemp(path.join(tmpdir(), "traffic-uv-web-"));
    const api = createServer((_req, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ changelogVersion: null })); });
    const web = await startWebServer(api, { ACCESS_STATS_DIR: dir, TRUST_PROXY: String(trusted) });
    try {
      for (const address of ["203.0.113.1", "203.0.113.2", "203.0.113.2"]) {
        const response = await fetch(web.origin + "/terms", { headers: { "user-agent": "Example browser", "x-forwarded-for": "192.0.2.9, " + address, cookie: "reader=never-used-for-uv" } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("set-cookie"), null);
        assert.match(response.headers.get("cache-control") ?? "", /^public,/);
        await response.text();
      }
      await web.stop();
      const state = JSON.parse(await readFile(path.join(dir, "uv-current.state"), "utf8"));
      assert.equal(state.visitors.length, trusted ? 2 : 1);
      const data = JSON.parse(await readFile(path.join(dir, `${state.day}.json`), "utf8"));
      assert.equal(data.views, 3); assert.equal(data.uniqueVisitors, trusted ? 2 : 1);
      assert.equal(web.logs(), "");
    } finally {
      await web.stop();
      await rm(dir, { recursive: true, force: true });
    }
  }
});
