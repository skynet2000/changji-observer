import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config, credential } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import type { ServerModule } from "@aihot/backend/modules";

type Provider = "google" | "github";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const enabled = () => process.env.READER_LOGIN_ENABLED === "true";
const cookieName = () => config.siteUrl.startsWith("https:") ? "__Host-changji_reader" : "changji_reader";
const stateCookie = () => `${cookieName()}_oauth`;
const cookies = (req: FastifyRequest) => Object.fromEntries((req.headers.cookie ?? "").split(";").map(s => s.trim().split("=")));
const cookie = (name: string, value: string, age: number) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${config.siteUrl.startsWith("https:") ? "; Secure" : ""}`;
const credentials = (provider: Provider) => provider === "google"
  ? { id: credential("auth", "READER_GOOGLE_CLIENT_ID"), secret: credential("auth", "READER_GOOGLE_CLIENT_SECRET") }
  : { id: credential("auth", "READER_GITHUB_CLIENT_ID"), secret: credential("auth", "READER_GITHUB_CLIENT_SECRET") };
const configured = (p: Provider) => { const c = credentials(p); return !!c.id && !!c.secret; };
const callback = (p: Provider) => `${config.siteUrl}/api/reader/callback/${p}`;
const provider = (s: unknown): Provider | null => s === "google" || s === "github" ? s : null;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const date = z.string().max(64).refine(s => Number.isFinite(Date.parse(s)));
const stateSchema = z.object({
  starred: z.array(z.object({ id, title: z.string().max(500), summary: z.string().max(4000).nullable(), sourceName: z.string().max(200), savedAt: date,
    publishedAt: date.nullable(), score: z.number().finite().nullable(), aiSelected: z.boolean() }).strict()).max(500),
  read: z.array(id).max(5000),
}).strict().refine(s => new Set(s.starred.map(x => x.id)).size === s.starred.length && new Set(s.read).size === s.read.length);

async function session(req: FastifyRequest) {
  const raw = cookies(req)[cookieName()] ?? "";
  if (!/^[\w-]{43}$/.test(raw)) return null;
  const [row] = await sql`SELECT a.id, a.name, a.provider, a.state, a.version::int, s.csrf
    FROM reader_sessions s JOIN reader_accounts a ON a.id=s.account_id
    WHERE s.token_hash=${hash(raw)} AND s.expires_at>now()`;
  return row ?? null;
}
const view = (s: NonNullable<Awaited<ReturnType<typeof session>>>) => ({ user: { id: s.id, name: s.name, provider: s.provider }, csrf: s.csrf, state: s.state, version: s.version });

async function json(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("identity provider request failed");
  return await response.json() as Record<string, unknown>;
}

export function registerReader(app: FastifyInstance) {
  app.register(async routes => {
    const attempts = new Map<string, { until: number; count: number }>();
    routes.addHook("onRequest", async (req, reply) => {
      reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer");
      const now = Date.now();
      for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
      const key = hash(req.ip), item = attempts.get(key) ?? { until: now + 60_000, count: 0 };
      if (item.count >= 60 || (!attempts.has(key) && attempts.size >= 10_000)) return reply.code(429).header("Retry-After", "60").send({ error: "try_later" });
      item.count++; attempts.set(key, item);
    });
    routes.get("/api/reader/session", async req => {
      if (!enabled()) return { enabled: false, providers: [], user: null };
      const s = await session(req);
      return { enabled: true, providers: (["google", "github"] as Provider[]).filter(configured), ...(s ? view(s) : { user: null }) };
    });
    routes.get("/api/reader/login/:provider", async (req, reply) => {
      const p = provider((req.params as Record<string, string>).provider);
      if (!enabled() || !p || !configured(p)) return reply.code(404).send({ error: "login_unavailable" });
      // Keep pending OAuth handshakes bounded and one-use; never log the code, verifier or tokens.
      await sql`DELETE FROM reader_oauth_states WHERE expires_at<=now()`;
      const browser = token(), state = token(), verifier = token();
      const [count] = await sql`SELECT count(*)::int AS n FROM reader_oauth_states`;
      if (count!.n >= 1000) return reply.code(429).header("Retry-After", "600").send({ error: "try_later" });
      await sql`INSERT INTO reader_oauth_states (state_hash,browser_hash,provider,verifier,expires_at)
        VALUES (${hash(state)},${hash(browser)},${p},${verifier},now()+interval '10 minutes')`;
      const url = new URL(p === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://github.com/login/oauth/authorize");
      url.search = new URLSearchParams({ client_id: credentials(p).id!, redirect_uri: callback(p), response_type: "code", state,
        scope: p === "google" ? "openid profile" : "", code_challenge: hashChallenge(verifier), code_challenge_method: "S256" }).toString();
      reply.header("Set-Cookie", cookie(stateCookie(), browser, 600));
      return reply.redirect(url.href, 302);
    });
    routes.get("/api/reader/callback/:provider", async (req, reply) => {
      const p = provider((req.params as Record<string, string>).provider);
      const q = req.query as Record<string, string>;
      const browser = cookies(req)[stateCookie()] ?? "";
      reply.header("Set-Cookie", cookie(stateCookie(), "", 0));
      if (!enabled() || !p || !configured(p) || !q.code || !/^[\w-]{43}$/.test(q.state ?? "") || !/^[\w-]{43}$/.test(browser)) return reply.redirect("/account?error=login", 303);
      const [handshake] = await sql`DELETE FROM reader_oauth_states WHERE state_hash=${hash(q.state)} AND browser_hash=${hash(browser)}
        AND provider=${p} AND expires_at>now() RETURNING verifier`;
      if (!handshake) return reply.redirect("/account?error=login", 303);
      try {
        const c = credentials(p);
        const result = await json(p === "google" ? "https://oauth2.googleapis.com/token" : "https://github.com/login/oauth/access_token", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body: new URLSearchParams({ client_id: c.id!, client_secret: c.secret!, code: q.code, grant_type: "authorization_code", redirect_uri: callback(p), code_verifier: handshake.verifier }),
        });
        if (typeof result.access_token !== "string" || (result.token_type && String(result.token_type).toLowerCase() !== "bearer")) throw new Error("invalid identity token");
        const profile = await json(p === "google" ? "https://openidconnect.googleapis.com/v1/userinfo" : "https://api.github.com/user", {
          headers: { authorization: `Bearer ${result.access_token}`, accept: "application/json", "user-agent": "ChangjiObserver" },
        });
        const subject = p === "google" ? profile.sub : profile.id;
        if (!(typeof subject === "string" && subject.length > 0 && subject.length <= 200) && !(p === "github" && Number.isSafeInteger(subject) && Number(subject) > 0)) throw new Error("missing identity subject");
        const name = String(profile.name ?? profile.login ?? (p === "google" ? "Google 读者" : "GitHub 读者")).slice(0, 100);
        const raw = token(), csrf = token();
        await sql.begin(async tx => {
          const [account] = await tx`INSERT INTO reader_accounts (provider,subject,name) VALUES (${p},${String(subject)},${name})
            ON CONFLICT (provider,subject) DO UPDATE SET name=excluded.name RETURNING id`;
          await tx`DELETE FROM reader_sessions WHERE expires_at<=now()`;
          await tx`INSERT INTO reader_sessions (token_hash,account_id,csrf,expires_at) VALUES (${hash(raw)},${account!.id},${csrf},now()+interval '30 days')`;
        });
        reply.header("Set-Cookie", [cookie(stateCookie(), "", 0), cookie(cookieName(), raw, 30 * 86400)]);
        return reply.redirect("/account", 303);
      } catch {
        // Provider responses can contain credentials: only a fixed failure code reaches the browser/log.
        return reply.redirect("/account?error=login", 303);
      }
    });

    const guard = async (req: FastifyRequest, reply: FastifyReply) => {
      const s = enabled() ? await session(req) : null;
      if (!s) { reply.code(401).send({ error: "sign_in_required" }); return null; }
      if (req.headers.origin !== new URL(config.siteUrl).origin || req.headers["x-csrf-token"] !== s.csrf) {
        reply.code(403).send({ error: "csrf" }); return null;
      }
      return s;
    };
    routes.put("/api/reader/state", { bodyLimit: 3 * 1024 * 1024 }, async (req, reply) => {
      const s = await guard(req, reply); if (!s) return;
      const parsed = z.object({ userId: z.string().uuid(), version: z.number().int().nonnegative(), state: stateSchema }).strict().safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_state" });
      const b = parsed.data;
      if (b.userId !== s.id) return reply.code(409).send({ error: "account_changed" });
      const [updated] = await sql`UPDATE reader_accounts SET state=${sql.json(b.state)},version=version+1,updated_at=now()
        WHERE id=${s.id} AND version=${b.version} RETURNING version::int`;
      if (!updated) return reply.code(409).send({ error: "version_changed" });
      return { ...view(s), state: b.state, version: updated.version };
    });
    routes.post("/api/reader/logout", async (req, reply) => {
      const s = await guard(req, reply); if (!s) return;
      await sql`DELETE FROM reader_sessions WHERE token_hash=${hash(cookies(req)[cookieName()])}`;
      reply.header("Set-Cookie", cookie(cookieName(), "", 0));
      return { ok: true };
    });
    routes.delete("/api/reader/account", async (req, reply) => {
      const s = await guard(req, reply); if (!s) return;
      await sql`DELETE FROM reader_accounts WHERE id=${s.id}`;
      reply.header("Set-Cookie", cookie(cookieName(), "", 0));
      return { ok: true };
    });
  });
}
function hashChallenge(verifier: string) { return createHash("sha256").update(verifier).digest("base64url"); }

const reader: ServerModule = { name: "reader", http: registerReader, schedules: [{ name: "reader.retention", cron: "15 3 * * *", run: async () => {
  await sql`DELETE FROM reader_oauth_states WHERE expires_at<=now()`;
  const result = await sql`DELETE FROM reader_sessions WHERE expires_at<=now()`;
  return { sessionsRemoved: result.count };
}, when: enabled }] };
export default reader;
