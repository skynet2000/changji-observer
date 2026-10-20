import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import Fastify from "fastify";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { registerAdminAuth } from "../../../apps/api/src/routes/admin-auth.ts";
import { registerReader } from "../server.ts";
import { emptyState, mergeReading, type Star } from "../state.ts";

const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const apps: ReturnType<typeof Fastify>[] = [];
const app = async () => { const a = Fastify(); apps.push(a); registerReader(a); registerAdminAuth(a); await a.ready(); return a; };
const cookieName = config.siteUrl.startsWith("https:") ? "__Host-changji_reader" : "changji_reader";
const originalFetch = globalThis.fetch;
beforeEach(async () => {
  globalThis.fetch = async () => { throw Error("unexpected external fetch in a test"); };
  process.env.READER_LOGIN_ENABLED = "true";
  process.env.READER_GOOGLE_CLIENT_ID = "google-test-client"; process.env.READER_GOOGLE_CLIENT_SECRET = "google-test-secret";
  process.env.READER_GITHUB_CLIENT_ID = "github-test-client"; process.env.READER_GITHUB_CLIENT_SECRET = "github-test-secret";
  await sql`TRUNCATE reader_accounts, reader_oauth_states CASCADE`;
});
after(async () => { globalThis.fetch = originalFetch; await Promise.all(apps.map(a => a.close())); await closeDb(); });
async function identity(subject: string) {
  const [user] = await sql`INSERT INTO reader_accounts(provider,subject,name) VALUES ('github',${subject},'读者') RETURNING id`;
  const raw = randomBytes(32).toString("base64url"), csrf = randomBytes(32).toString("base64url");
  await sql`INSERT INTO reader_sessions(token_hash,account_id,csrf,expires_at) VALUES(${digest(raw)},${user!.id},${csrf},now()+interval '1 day')`;
  return { id: user!.id, raw, headers: { cookie: `${cookieName}=${raw}`, origin: new URL(config.siteUrl).origin, "x-csrf-token": csrf } };
}

test("disabled or unconfigured providers cannot start login; private status is never shared-cacheable", async () => {
  const a = await app(); process.env.READER_LOGIN_ENABLED = "false";
  const response = await a.inject("/api/reader/session");
  assert.equal(response.json().enabled, false); assert.match(String(response.headers["cache-control"]), /no-store/);
  assert.equal((await a.inject("/api/reader/login/github")).statusCode, 404);
  process.env.READER_LOGIN_ENABLED = "true"; delete process.env.READER_GITHUB_CLIENT_SECRET;
  assert.equal((await a.inject("/api/reader/login/github")).statusCode, 404);
});

test("reader cookies grant no administrator access; missing, expired and forged sessions cannot read cloud state", async () => {
  const a = await app(), user = await identity("one");
  assert.equal((await a.inject({ url: "/api/admin/me", headers: user.headers })).statusCode, 401);
  const me = await a.inject({ url: "/api/reader/session", headers: user.headers }); assert.equal(me.json().user.id, user.id);
  const expired = await identity("expired");
  await sql`UPDATE reader_sessions SET expires_at=now()-interval '1 second' WHERE account_id=${expired.id}`;
  assert.equal((await a.inject({ url: "/api/reader/session", headers: expired.headers })).json().user, null);
  assert.equal((await a.inject({ url: "/api/reader/session", headers: { cookie: `${cookieName}=forged` } })).json().user, null);
});

test("cloud writes require both same-origin CSRF and the correct account/version; concurrent updates cannot overwrite silently", async () => {
  const a = await app(), u = await identity("one"), other = await identity("two");
  const payload = { userId: u.id, version: 0, state: { starred: [], read: ["article-a"] } };
  const put = (headers = u.headers, body = payload) => a.inject({ method: "PUT", url: "/api/reader/state", headers, payload: body });
  assert.equal((await put({ ...u.headers, origin: "https://evil.example" })).statusCode, 403);
  assert.equal((await put({ ...u.headers, "x-csrf-token": "wrong" })).statusCode, 403);
  assert.equal((await put(other.headers)).statusCode, 409);
  assert.equal((await put()).statusCode, 200);
  assert.equal((await put()).statusCode, 409);
  assert.equal((await a.inject({ url: "/api/reader/session", headers: other.headers })).json().state.read.length, 0);
  assert.equal((await put(u.headers, { ...payload, version: 1, state: { starred: [], read: Array(5001).fill("a") } })).statusCode, 400);
});

test("OAuth handshakes bind the browser and provider, use PKCE and cannot be replayed", async () => {
  const a = await app();
  for (const p of ["google", "github"]) {
    const start = await a.inject(`/api/reader/login/${p}`), url = new URL(String(start.headers.location));
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("redirect_uri"), `${config.siteUrl}/api/reader/callback/${p}`);
    assert.ok(!url.searchParams.get("scope")?.includes("email"));
    assert.ok(!url.searchParams.get("scope")?.includes("repo"));
    const state = url.searchParams.get("state")!, cookies = String(start.headers["set-cookie"]).split(";")[0];
    let hits = 0;
    globalThis.fetch = async (address, init) => {
      hits++; const endpoint = String(address);
      if (endpoint.endsWith("/token") || endpoint.endsWith("/access_token")) {
        const body = new URLSearchParams(String(init?.body));
        assert.equal(createHash("sha256").update(body.get("code_verifier")!).digest("base64url"), url.searchParams.get("code_challenge"));
        return Response.json({ access_token: "ephemeral-provider-token", token_type: "Bearer" });
      }
      assert.ok(endpoint === "https://openidconnect.googleapis.com/v1/userinfo" || endpoint === "https://api.github.com/user");
      return Response.json(p === "google" ? { sub: "google-sub", name: "Google读者" } : { id: 123, login: "GitHub读者" });
    };
    const callback = `/api/reader/callback/${p}?code=fixture-code&state=${state}`;
    await a.inject({ url: callback, headers: { cookie: `${cookieName}_oauth=wrong` } }); assert.equal(hits, 0);
    await a.inject({ url: callback.replace(p, p === "google" ? "github" : "google"), headers: { cookie: cookies } }); assert.equal(hits, 0);
    const completed = await a.inject({ url: callback, headers: { cookie: cookies } });
    assert.equal(completed.headers.location, "/account"); assert.equal(hits, 2);
    const returned = String(completed.headers["set-cookie"]); assert.match(returned, /HttpOnly/); assert.match(returned, /SameSite=Lax/);
    assert.ok(!returned.includes("ephemeral-provider-token"));
    const replay = await a.inject({ url: callback, headers: { cookie: cookies } });
    assert.equal(replay.headers.location, "/account?error=login"); assert.equal(hits, 2);
  }
});

test("logout and account deletion revoke sessions and erase only that reader's cloud records", async () => {
  const a = await app(), u = await identity("delete"), other = await identity("keep");
  assert.equal((await a.inject({ method: "DELETE", url: "/api/reader/account", headers: { ...u.headers, "x-csrf-token": "wrong" } })).statusCode, 403);
  assert.equal((await a.inject({ method: "DELETE", url: "/api/reader/account", headers: u.headers })).statusCode, 200);
  assert.equal((await a.inject({ url: "/api/reader/session", headers: u.headers })).json().user, null);
  assert.equal((await sql`SELECT id FROM reader_accounts WHERE id=${other.id}`).length, 1);
  assert.equal((await a.inject({ method: "POST", url: "/api/reader/logout", headers: other.headers })).statusCode, 200);
  assert.equal((await a.inject({ url: "/api/reader/session", headers: other.headers })).json().user, null);
});

test("login endpoints have bounded per-address request protection", async () => {
  const a = await app(); for (let n = 0; n < 60; n++) assert.equal((await a.inject("/api/reader/session")).statusCode, 200);
  const limited = await a.inject("/api/reader/session"); assert.equal(limited.statusCode, 429); assert.equal(limited.headers["retry-after"], "60");
});

const star = (id: string): Star => ({ id, title: id, summary: null, sourceName: "test", savedAt: "2026-10-21T00:00:00Z", publishedAt: null, score: null, aiSelected: false });
test("three-way merge preserves additions from both devices, propagates removals, and keeps edits made while syncing", () => {
  const base = { starred: [star("old"), star("keep")], read: ["old"] };
  const local = { starred: [star("keep"), star("new-local")], read: ["local-read"] };
  const remote = { starred: [star("old"), star("new-remote")], read: ["remote-read"] };
  const merged = mergeReading(base, local, remote);
  assert.deepEqual(new Set(merged.starred.map(s => s.id)), new Set(["new-local", "new-remote"]));
  assert.deepEqual(merged.read, ["local-read", "remote-read"]);
  const duringRequest = { ...local, starred: [...local.starred, star("while-saving")] };
  const after = mergeReading(local, duringRequest, merged);
  assert.deepEqual(new Set(after.starred.map(s => s.id)), new Set(["new-local", "new-remote", "while-saving"]));
  assert.deepEqual(mergeReading(emptyState(), emptyState(), { starred: [star("cloud")], read: [] }).starred.map(s => s.id), ["cloud"]);
  const full = { starred: [], read: Array.from({ length: 5000 }, (_, i) => `old-${i}`) };
  const capped = mergeReading(full, { starred: [], read: ["local-new", ...full.read].slice(0, 5000) }, { starred: [], read: ["remote-new", ...full.read].slice(0, 5000) });
  assert.equal(capped.read.length, 5000); assert.ok(capped.read.includes("local-new") && capped.read.includes("remote-new"));
});
