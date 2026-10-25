// Reduced public page samples from the 2026-10-26 source review. No external requests in tests.
import "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fromHtml, fetchDetail } from "@aihot/backend/sources/web-list";
import { fetchJsonList } from "@aihot/backend/sources/json-list";
import { admitListing } from "@aihot/backend/sources/filters";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";
import type { SourceRow } from "@aihot/backend/sources/types";

const pack = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8"));
const source = (id: string): SourceRow => ({ cursor: null, fail_count: 0, first_party: false, ...pack.sources.find((s: SourceRow) => s.id === id) });
const lanjing = { tid: "1792588239727276081", title: "红果把观众的时间标好了价：每千次曝光25元", r_time: 1792588570 };
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (req.url === "/lanjing") res.end(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { data: { Article: [lanjing] } } } })}</script>`);
  else if (req.url === "/news/78-20261023-393741.html") res.end('<div class="releaseTime"><span>2026-10-25 15:14:23</span></div>');
  else { res.statusCode = 404; res.end(); }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
config.allowPrivateNetworkFetch = true;
after(() => new Promise<void>(resolve => server.close(() => resolve())));

test("ChinaVenture cards exclude navigation and use the detail date, not the older date in the URL", async () => {
  const s = source("web-chinaventure");
  assertSupportedConfig(s.kind, s.config);
  const items = fromHtml('<a href="/meeting/live/27.html"><h1>大会</h1></a><a href="/news/78-20261023-393741.html"><h1>实习生也能月薪10万了</h1><h2>抢人之势愈发激烈。</h2></a>', s.config.url, s);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.title, "实习生也能月薪10万了");
  const detail = await fetchDetail(`${base}/news/78-20261023-393741.html`, s, { date: true, title: false, summary: false });
  assert.equal(detail.publishedAt?.toISOString(), "2026-10-25T07:14:23.000Z");
});

test("Time Weekly ignores old hero cards and reads each dated technology listing in Beijing time", () => {
  const s = source("web-time-weekly-tech");
  assertSupportedConfig(s.kind, s.config);
  const html = '<a href="http://www.time-weekly.com/post/322371"><h2>旧推荐</h2></a>' +
    '<a class="pindao_block" href="http://www.time-weekly.com/post/333772"><div class="pindao_block_title">DeepSeek 服务恢复</div><div class="pindao_block_tips">2026-10-24 17:56:32</div></a>';
  const items = fromHtml(html, s.config.url, s);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.url, "https://www.time-weekly.com/post/333772");
  assert.equal(items[0]!.publishedAt?.toISOString(), "2026-10-24T09:56:32.000Z");
});

test("Lanjing embedded JSON preserves long string IDs and the original publication instant", async () => {
  const s = source("json-lanjing-business");
  assertSupportedConfig(s.kind, s.config);
  const items = await fetchJsonList({ ...s, config: { ...s.config, url: `${base}/lanjing` } });
  assert.equal(items.length, 1);
  assert.equal(items[0]!.url, "https://www.lanjinger.com/d/1792588239727276081");
  assert.equal(items[0]!.publishedAt?.toISOString(), "2026-10-21T13:16:10.000Z");
  const admitted = admitListing([...items, { title: "MiuMiu饰品销售", url: "https://www.lanjinger.com/d/other" }], s);
  assert.deepEqual(admitted.map(c => c.title), [lanjing.title]);
});
