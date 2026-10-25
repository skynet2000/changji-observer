// Anonymous server request totals only: never persist addresses, headers, cookies or query strings.
import { mkdir, readFile, rename, writeFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

interface Visit { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; status: number; type: string }
interface Day { day: string; views: number; bots: number; errors: number; notFound: number; pages: Record<string, number> }
const beijingDay = (at: Date) => new Date(at.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

export class AccessStats {
  private pending: Promise<void> = Promise.resolve();
  private initialized = false;
  private dir: string;
  private now: () => Date;
  constructor(dir: string, now = () => new Date()) { this.dir = dir; this.now = now; }

  record(visit: Visit): Promise<void> {
    if (visit.method !== "GET" || /prefetch/i.test(String(visit.headers["sec-purpose"] ?? visit.headers.purpose ?? ""))) return Promise.resolve();
    let pathname: string;
    try { pathname = new URL(visit.url ?? "/", "http://local").pathname; } catch { return Promise.resolve(); }
    if (/^\/(?:api|admin|assets)(?:\/|$)/i.test(pathname) || /\.(?:js|css|png|svg|ico|jpg|webp|xml|txt|json|woff2)$/i.test(pathname)) return Promise.resolve();
    const navigation = pathname.endsWith(".data");
    if (!navigation && visit.status < 400 && !visit.type.startsWith("text/html")) return Promise.resolve();
    pathname = pathname.replace(/\.data$/, "") || "/";
    if (pathname === "/_root") pathname = "/";
    const at = this.now();
    const bot = /bot\b|crawler|spider|headless|curl|wget|python|playwright|node\b|undici|uptime|monitor/i.test(String(visit.headers["user-agent"] ?? ""));
    const run = this.pending.then(async () => {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      if (!this.initialized) {
        const meta = path.join(this.dir, "started.json");
        try { await writeFile(meta, JSON.stringify({ since: at.toISOString() }), { flag: "wx", mode: 0o600 }); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
        this.initialized = true;
      }
      const day = beijingDay(at), file = path.join(this.dir, `${day}.json`);
      let data: Day;
      try { data = JSON.parse(await readFile(file, "utf8")); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; data = { day, views: 0, bots: 0, errors: 0, notFound: 0, pages: {} }; }
      if (bot) data.bots++;
      else if (visit.status === 200) {
        data.views++;
        const key = pathname.length <= 180 && (Object.keys(data.pages).length < 2000 || pathname in data.pages) ? pathname : "/[other]";
        data.pages[key] = (data.pages[key] ?? 0) + 1;
      } else if (visit.status >= 500) data.errors++;
      else if (visit.status === 404) data.notFound++;
      const temp = `${file}.tmp`;
      await writeFile(temp, JSON.stringify(data), { mode: 0o600 }); await rename(temp, file);
      const oldest = beijingDay(new Date(at.getTime() - 29 * 86400_000));
      for (const old of await readdir(this.dir)) if (/^\d{4}-\d{2}-\d{2}\.json$/.test(old) && old < `${oldest}.json`) await unlink(path.join(this.dir, old));
    });
    this.pending = run.catch(() => {});
    return run;
  }
  flush() { return this.pending; }
}
