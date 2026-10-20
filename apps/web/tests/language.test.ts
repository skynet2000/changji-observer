// Real production renderer with saved English responses. No model/provider or live website is used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import type { FeedItemSummary, ReportDetail } from "@aihot/contracts/site";
import { startWebServer, type WebServer } from "./web-server.ts";
const at = "2026-10-21T01:00:00Z";
const item: FeedItemSummary = { id: "language-fixture", title: "公司发布全员公开信", summary: "公司宣布组织调整，涉及员工岗位。", reason: "关系员工发展。", source: { name: "测试媒体" },
  publishedAt: at, timelineAt: at, category: "career", tags: [], score: 80, selected: true, channel: "news", x: null };
const report: ReportDetail = { kind: "daily", key: "2026-10-21", issueNumber: 1, title: "互联网日报", generatedAt: at,
  lead: { title: item.title, leadParagraph: "本期关注公司组织调整与岗位变化。" }, leadItemId: null, overview: null, highlights: [],
  sections: [], flashes: [], cover: null, metrics: {}, readingMinutes: 1, prev: null, next: null };
const translated: Record<string, string> = { [item.title]: "Company issues an all-staff letter", [item.summary!]: "The company announces an organisational change affecting employee roles.",
  [item.reason!]: "Relevant to employees' careers.", "本期关注公司组织调整与岗位变化。": "This issue focuses on organisational changes and employee roles." };
let failing = false, lookups = 0, web: WebServer, browser: Browser;
const api = createServer(async (req, res) => {
  const path = new URL(req.url!, "http://fixture").pathname;
  res.setHeader("content-type", "application/json");
  if (path === "/api/site/meta") return res.end('{"changelogVersion":null}');
  if (path === "/api/reader/session") return res.end('{"enabled":true,"providers":["google","github"],"user":null}');
  if (path === "/api/site/timeline") return res.end(JSON.stringify({ filters: { channel: "all", category: null, tag: null }, cards: [{ key: item.id, anchorAt: at, item, group: null }], nextCursor: null, hot: null, dayCounts: { "2026-10-21": 1 } }));
  if (path === "/api/site/reports/daily/latest-page") return res.end(JSON.stringify({ index: [{ key: report.key, issueNumber: 1, title: report.title }], report }));
  if (path === "/api/language/lookup") {
    lookups++;
    if (failing) { res.statusCode = 503; return res.end("{}"); }
    let raw = ""; for await (const chunk of req) raw += chunk;
    const texts = JSON.parse(raw).texts as string[];
    return res.end(JSON.stringify({ translations: Object.fromEntries(texts.filter(text => translated[text]).map(text => [text, translated[text]])) }));
  }
  res.statusCode = 404; res.end("{}");
});
before(async () => { web = await startWebServer(api); browser = await chromium.launch({ channel: "chromium" }); });
after(async () => { await browser?.close(); await web?.stop(); });

test("Chinese/English changes interface, headlines, summaries and daily body; preference survives reload and links stay unchanged", async () => {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
    try {
      await page.goto(web.origin + "/");
      await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Switch to English", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByRole("heading", { name: translated[item.title], exact: true })).toBeVisible();
      await expect(page.getByText(translated[item.summary!], { exact: true })).toBeVisible();
      assert.ok((await page.locator(`a[href="/items/${item.id}"]`).count()) > 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.screenshot({ path: `outputs/中英切换-${width}-20261021.png`, fullPage: true });
      await page.reload();
      await expect(page.getByRole("heading", { name: translated[item.title], exact: true })).toBeVisible();
      await page.goto(web.origin + "/daily");
      await expect(page.getByText(translated["本期关注公司组织调整与岗位变化。"], { exact: true })).toBeVisible();
      await page.screenshot({ path: `outputs/英文日报-${width}-20261021.png`, fullPage: true });
      await page.goto(web.origin + "/account");
      await expect(page.getByRole("link", { name: "Continue with Google", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Continue with GitHub", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Switch to Chinese", exact: true }).click();
      await expect(page.getByRole("link", { name: "使用 GitHub 登录", exact: true })).toBeVisible();
      await page.goto(web.origin + "/");
      await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
    } finally { await context.close(); }
  }
});

test("unavailable saved translations keep readable Chinese and a pending notice; a failing endpoint cannot cause a request loop", async () => {
  failing = true; lookups = 0;
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage();
  try {
    await page.goto(web.origin + "/");
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
    await expect(page.getByText(/Original text is shown when a translation is pending/)).toBeVisible();
    await expect.poll(() => lookups).toBeGreaterThan(0);
    const settled = lookups;
    await page.waitForTimeout(1000);
    assert.equal(lookups, settled);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally { failing = false; await context.close(); }
});

test("English titles matching JavaScript object property names remain plain readable text", async () => {
  const original = item.title; item.title = "constructor";
  const context = await browser.newContext(), page = await context.newPage();
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(web.origin + "/");
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await expect(page.getByRole("heading", { name: "constructor", exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
  } finally { item.title = original; await context.close(); }
});
