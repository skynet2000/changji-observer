// Reduced titles from the public hotlist reviewed on 2026-10-26; no external requests.
import "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchRss } from "@aihot/backend/sources/rss";
import { admitListing } from "@aihot/backend/sources/filters";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";
import type { SourceRow } from "@aihot/backend/sources/types";

const pack = JSON.parse(readFileSync(new URL("../industry/sources.json", import.meta.url), "utf8"));
const source: SourceRow & { site_fulltext: boolean; syndicate_fulltext: boolean; signal_group_id: string } = {
  cursor: null, fail_count: 0, first_party: false, ...pack.sources.find((s: SourceRow) => s.id === "rss-maimai-hot"),
};
const titles = [
  "字节商业化GenAI负责人文石磊离职",
  "小米员工住宅开盘，共建4栋楼297套住房",
  "TikTok电商负责人陈熙离职",
  "曝米哈游、拳头、猩球游戏疯狂在广州抢人",
  "大众拟2030年前再裁1.2万人",
  "老干妈引入AI后裁员500余人引争议",
  "知名具身智能公司被曝欠薪停工，老板失联",
  "Kimi就K3.1 Pro限流致歉并补偿",
];
const server = http.createServer((_req, res) => {
  res.setHeader("content-type", "application/rss+xml; charset=utf-8");
  res.end(`<rss version="2.0"><channel><title>脉脉热榜</title><lastBuildDate>Mon, 26 Oct 2026 16:00:18 GMT</lastBuildDate>${titles.map((title, i) => `<item><title>${title}</title><description>${title}</description><link>https://maimai.cn/n/content/global-topic?topic_id=sample${i}</link></item>`).join("")}</channel></rss>`);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
config.allowPrivateNetworkFetch = true;
after(() => new Promise<void>(resolve => server.close(() => resolve())));

test("Maimai leads require an internet employer and a workplace topic; service refunds are excluded", async () => {
  assertSupportedConfig(source.kind, source.config);
  const { candidates } = await fetchRss({ ...source, config: { ...source.config, feedUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}` } });
  assert.deepEqual(admitListing(candidates, source).map(c => c.title), titles.slice(0, 4));
  assert(candidates.every(c => c.publishedAt == null), "feed refresh time is not a topic publication date");
  assert.deepEqual(admitListing([{ title: "普通企业薪酬传闻", excerpt: "字节员工讨论", url: "https://maimai.cn/n/content/global-topic?topic_id=other" }], source), [], "a company in the excerpt cannot admit an unnamed headline");
  assert.deepEqual(admitListing([{ title: titles[0]!, url: "https://example.com/unrelated" }], source), [], "topic links stay on the reviewed public route");
});

test("Maimai remains an isolated two-hour lead source without full-text redistribution", () => {
  assert.equal(source.participation_mode, "isolated");
  assert.equal(source.interval_minutes, 120);
  assert.equal(source.site_fulltext, false);
  assert.equal(source.syndicate_fulltext, false);
  assert.equal(source.signal_group_id, "community-maimai");
});
