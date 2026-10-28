import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { unsupportedConfig } from "@aihot/backend/sources/config-keys";
import { fetchRss } from "@aihot/backend/sources/rss";

const items = [
  ["local", "2026-10-28 16:04:23"],
  ["fraction", "2026-10-28T16:04:23.125"],
  ["utc", "2026-10-28T16:04:23Z"],
  ["offset", "2026-10-28T16:04:23+02:00"],
  ["rfc", "Wed, 28 Oct 2026 16:04:23 GMT"],
  ["invalid", "2026-02-30 16:04:23"],
];
const feed = `<rss><channel>${items.map(([name, date]) => `<item><title>${name}</title><link>https://example.org/${name}</link><pubDate>${date}</pubDate></item>`).join("")}</channel></rss>`;
const server = http.createServer((_, res) => { res.setHeader("content-type", "application/rss+xml"); res.end(feed); });
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const previousPrivate = config.allowPrivateNetworkFetch;
const previousTZ = process.env.TZ;
config.allowPrivateNetworkFetch = true;
process.env.TZ = "America/New_York";
after(async () => { config.allowPrivateNetworkFetch = previousPrivate; if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; await new Promise<void>(resolve => server.close(() => resolve())); });

const read = async (offset?: string) => (await fetchRss({ config: { feedUrl: `http://127.0.0.1:${(server.address() as {port:number}).port}/rss`, ...(offset ? { publishedAtUtcOffset: offset } : {}) }, participation_mode: "editorial" } as never, { force: true })).candidates.map(c => c.publishedAt?.toISOString() ?? null);

test("zoneless RSS times use the configured offset; explicit zones remain authoritative", async () => {
  assert.deepEqual(await read("+08:00"), ["2026-10-28T08:04:23.000Z", "2026-10-28T08:04:23.125Z", "2026-10-28T16:04:23.000Z", "2026-10-28T14:04:23.000Z", "2026-10-28T16:04:23.000Z", null]);
  assert.deepEqual((await read())[0], "2026-10-28T16:04:23.000Z", "unconfigured feeds keep UTC behavior regardless of host timezone");
});

test("RSS accepts only valid explicit UTC offsets", () => {
  assert.deepEqual(unsupportedConfig("rss", {publishedAtUtcOffset: "+08:00"}), []);
  for (const value of ["CST", "+25:00", "+14:30", "+08", null]) assert.deepEqual(unsupportedConfig("rss", {publishedAtUtcOffset:value}), ["publishedAtUtcOffset"]);
});
