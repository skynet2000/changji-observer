// Real production renderer with saved English responses. No model/provider or live website is used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import type { FeedItemSummary, GroupInfo, ReportDetail } from "@aihot/contracts/site";
import { startWebServer, type WebServer } from "./web-server.ts";
const at = new Date().toISOString();
const item: FeedItemSummary = { id: "language-fixture", title: "双十一开局京东与抖音因采销经理朋友圈互诉", summary: "公司与员工沟通组织调整，涉及十个部门。", reason: "关系员工发展。", source: { name: "第一财经 · 科技" },
  publishedAt: at, timelineAt: at, category: "career", tags: [], score: 80, selected: true, channel: "news", x: null };
const report: ReportDetail = { kind: "daily", key: "2026-10-21", issueNumber: 1, title: "互联网日报", generatedAt: at,
  lead: { title: item.title, leadParagraph: "本期关注公司组织调整与岗位变化。" }, leadItemId: null, overview: null, highlights: [],
  sections: [], flashes: [], cover: null, metrics: {}, readingMinutes: 1, prev: "2026-10-20", next: null };
const translated: Record<string, string> = { [item.title]: "JD and Douyin sue each other over a procurement manager’s social post ahead of Singles’ Day", [item.summary!]: "The company communicates organisational changes affecting ten departments to employees.",
  [item.reason!]: "Relevant to employees' careers.", "本期关注公司组织调整与岗位变化。": "This issue focuses on organisational changes and employee roles." };
let dense = false;
let group: GroupInfo | null = null;
const lookupSizes: number[] = [];
const failedTexts: string[] = [];
const longItems = Array.from({ length: 32 }, (_, i) => ({ ...item, id: `long-${i}`, title: `长标题${i}`, summary: `${"长摘要".repeat(1300)}${i}` }));
for (const [i, entry] of longItems.entries()) { translated[entry.title] = `Long story ${i}`; translated[entry.summary!] = `Long summary ${i}`; }
let signedIn = false, sessionFailure = false;
let failing = false, lookups = 0, web: WebServer, browser: Browser;
const api = createServer(async (req, res) => {
  const path = new URL(req.url!, "http://fixture").pathname;
  res.setHeader("content-type", "application/json");
  if (path === "/api/site/meta") return res.end('{"changelogVersion":null}');
  if (path === "/api/site/hot") return res.end(JSON.stringify({ entries: [], windowHours: 48, computedAt: at }));
  if (path === "/api/reader/session") {
    if (sessionFailure) { res.statusCode = 503; return res.end("{}"); }
    return res.end(JSON.stringify({ enabled: true, providers: ["google","github"], user: signedIn ? { id: "language-reader", name: "Fixture Reader", provider: "github" } : null,
      csrf: "fixture", state: { starred: [], read: [] }, version: 1 }));
  }
  if (path === "/api/site/pool") return res.end(JSON.stringify({filters:{channel:"all",category:null,tag:null,q:null,tab:"time"},items:(dense?longItems:[item]).map(item=>({...item,group})),page:1,pageCount:1,total:dense?longItems.length:1,todayCount:1,freshness:at}));
  if (path === "/api/site/timeline") return res.end(JSON.stringify({ filters: { channel: "all", category: null, tag: null }, cards: (dense ? longItems : [item]).map(item => ({ key: item.id, anchorAt: at, item, group })), nextCursor: null, hot: null, dayCounts: { "2026-10-21": dense ? longItems.length : 1 } }));
  if (path === "/api/site/reports/daily/latest-page") return res.end(JSON.stringify({ index: [{ key: report.key, issueNumber: 1, title: report.title }], report }));
  if (path === "/api/language/lookup") {
    lookups++;
    let raw = ""; for await (const chunk of req) raw += chunk;
    lookupSizes.push(Buffer.byteLength(raw));
    if (Buffer.byteLength(raw) > 128 * 1024) { res.statusCode = 413; return res.end("{}"); }
    const texts = JSON.parse(raw).texts as string[];
    if (failing) {
      failedTexts.push(...texts);
      await new Promise(resolve => setTimeout(resolve, 500));
      res.statusCode = 503; return res.end("{}");
    }
    return res.end(JSON.stringify({ translations: Object.fromEntries(texts.filter(text => translated[text]).map(text => [text, translated[text]])) }));
  }
  res.statusCode = 404; res.end("{}");
});
before(async () => { web = await startWebServer(api); browser = await chromium.launch({ channel: "chromium" }); });
after(async () => { await browser?.close(); await web?.stop(); });

test("Chinese/English changes interface, headlines, summaries and daily body; new visits default to Chinese and links stay unchanged", async () => {
  for (const width of [320, 390, 768, 1024, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "en-US" });
    await context.addInitScript(() => localStorage.setItem("changji.language", "en"));
    const page = await context.newPage();
    try {
      await page.goto(web.origin + "/");
      await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Switch to English", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByRole("heading", { name: translated[item.title], exact: true })).toBeVisible();
      await expect(page.getByText(translated[item.summary!], { exact: true })).toBeVisible();
      await expect(page.getByText("Yicai · Technology", { exact: true })).toBeVisible();
      assert.ok((await page.locator(`a[href="/items/${item.id}"]`).count()) > 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `English feed fits ${width}px`);
      await page.screenshot({ path: `outputs/中英切换-${width}-20261021.png`, fullPage: true });
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
      await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Switch to English", exact: true }).click();
      if (width === 1280) {
        const newVisit = await context.newPage();
        await newVisit.goto(web.origin + "/");
        await expect(newVisit.locator("html")).toHaveAttribute("lang", "zh-CN");
        await expect(newVisit.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
        await newVisit.close();
      }
      await page.locator('a[href="/daily"]').filter({ visible: true }).first().click();
      await expect(page.getByText(translated["本期关注公司组织调整与岗位变化。"], { exact: true })).toBeVisible();
      await expect(page.getByText("Previous day · Oct 20", { exact: true })).toBeVisible();
      await expect(page.getByRole("main").locator("footer")).toContainText("大厂观察 Daily · Compiled from public sources, with links to every original report · Daily archive");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "daily layout fits the same viewport");
      if (width >= 961) {
        await expect(page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Daily", exact: true })).toHaveAttribute("aria-current", "page");
        const note = await page.getByRole("note").boundingBox(), archive = await page.locator('.report-shell > aside').boundingBox();
        assert.ok(note && archive && archive.y >= note.y + note.height, "report archive never covers the language notice");
      }
      await page.screenshot({ path: `outputs/英文日报-${width}-20261021.png`, fullPage: true });
      await page.locator('[data-reader-entry="header"]').click();
      await expect(page.getByRole("link", { name: "Continue with Google", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Continue with GitHub", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Switch to Chinese", exact: true }).click();
      await expect(page.getByRole("link", { name: "使用 GitHub 登录", exact: true })).toBeVisible();
      await page.goto(web.origin + "/");
      await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
    } finally { await context.close(); }
  }
});

test("a new source name uses its saved translation, alongside translated article text", async () => {
  const original = item.source.name;
  item.source.name = "测试媒体 · 职场";
  translated[item.source.name] = "Fixture Media · Careers";
  const context = await browser.newContext(), page = await context.newPage();
  try {
    await page.goto(web.origin + "/");
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await expect(page.getByText("Fixture Media · Careers", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Switch to Chinese", exact: true }).click();
    await expect(page.getByText(item.source.name, { exact: true })).toBeVisible();
  } finally { item.source.name = original; await context.close(); }
});

test("English save actions and essential sign-in copy work without translation lookups", async () => {
  failing = true;
  const context = await browser.newContext(), page = await context.newPage();
  try {
    await page.goto(web.origin + "/");
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    const save = page.getByRole('button',{name:'Save story',exact:true});
    await expect(save).toHaveAttribute('aria-pressed','false');
    await save.click();
    await expect(page.getByRole('button',{name:'Remove saved story',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.locator('[data-reader-entry="header"]').click();
    await expect(page.getByText('Google and GitHub are separate accounts. Use the same provider on each device.',{exact:true})).toBeVisible();
    await expect(page.getByRole('main')).toContainText('By continuing, you agree to');
    await expect(page.getByRole('main')).not.toContainText('继续即表示同意');
  } finally { failing = false; await context.close(); }
});

test("phone and desktop account sync, errors and preferences stay English when translation lookups fail", async () => {
  signedIn = true; failing = true;
  try {
    for (const width of [320, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 960 } }), page = await context.newPage();
      try {
        await page.goto(web.origin + "/account");
        await page.getByRole("button", { name: "Switch to English", exact: true }).click();
        await expect(page.locator('.account-card [role="status"]')).toHaveText("Cloud records loaded. You can choose to import existing local records below.");
        await page.getByRole("button", { name: "Sync now", exact: true }).click();
        await expect(page.locator('.account-card [role="status"]')).toHaveText("Saved and read stories are synced.");
        sessionFailure = true;
        await page.getByRole("button", { name: "Sync now", exact: true }).click();
        await expect(page.locator('.account-card [role="status"]')).toHaveText("Unable to connect to sync. Your local records are kept.");
        sessionFailure = false;
        await page.locator('a[href="/more"]').filter({ visible: true }).first().click();
        await expect(page.getByRole("heading", { name: width < 1024 ? "Tools & access" : "Tools & help", exact: true })).toBeVisible();
        await expect(page.getByRole("combobox", { name: "Font", exact: true })).toBeVisible();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      } finally { sessionFailure = false; await context.close(); }
    }
  } finally { signedIn = false; failing = false; }
});

test("English daily calendar uses weekdays, live date labels and translated original-link text", async () => {
  report.sections = [{ label: "职场与组织", summary: null, items: [{ itemId: item.id, title: item.title, summary: item.summary, sourceName: item.source.name,
    sourceUrl: "https://example.com/language-original", sourceIconUrl: null, firstParty: false, publishedAt: at, available: true }] }];
  report.metrics = { totalEvents: 1, firstPartyEvents: 0 };
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } }), page = await context.newPage();
  try {
    await page.goto(web.origin + "/daily");
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    const masthead = page.locator('[data-report-masthead]');
    await expect(masthead.getByText("Oct", { exact: true })).toBeVisible();
    await expect(masthead.getByText("1 issue this month", { exact: true })).toBeVisible();
    for (const day of ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]) await expect(masthead.getByText(day, { exact: true })).toBeVisible();
    await expect(masthead).toContainText("first-party reports");
    await expect(page.getByRole("link", { name: `Read original from Yicai · Technology: ${translated[item.title]} (opens in a new tab)`, exact: true })).toBeVisible();
    const canvas = masthead.locator('canvas').last(), box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 3.5 / 7, box.y + 10);
    await expect(canvas).toHaveAttribute("title", "Oct 1 · Not published");
    await page.getByRole("button", { name: "Switch to Chinese", exact: true }).click();
    await expect(masthead.getByText("十月", { exact: true })).toBeVisible();
    const chineseBox = (await canvas.boundingBox())!;
    await page.mouse.move(chineseBox.x + chineseBox.width * 3.5 / 7, chineseBox.y + 10);
    await expect(canvas).toHaveAttribute("title", "10月1日 · 未出刊");
  } finally { report.sections = []; report.metrics = {}; await context.close(); }
});

test("phone and desktop trend headings, timestamps and empty states need no model translation", async () => {
  failing = true;
  try {
    for (const width of [320,1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
      try {
        await page.goto(web.origin + "/hot");
        await page.getByRole("button", { name: "Switch to English", exact: true }).click();
        await expect(page.getByRole("heading", { name: width < 1024 ? "Trending" : "Internet trends", exact: true })).toBeVisible();
        await expect(page.getByText(/^Past 48 hours · 0 trends across our sources/).filter({ visible: true })).toHaveCount(1);
        await expect(page.getByText("No trends yet", { exact: true })).toBeVisible();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      } finally { await context.close(); }
    }
  } finally { failing = false; }
});

test("English count labels work without saved translations and long source names fit phone cards", async () => {
  const original = item.source.name;
  item.source.name = "21世纪经济报道 · 公司";
  group = { factId: "language-group", additionalSourceCount: 1, reportCount: 2 };
  try {
    for (const width of [320, 390, 768]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
      try {
        await page.goto(web.origin + "/");
        await page.getByRole("button", { name: "Switch to English", exact: true }).click();
        await expect(page.getByRole("heading", { name: translated[item.title], exact: true })).toBeVisible();
        await expect(page.getByText("1 item", { exact: true }).filter({ visible: true })).toHaveCount(1);
        await expect(page.getByRole("button", { name: "1 other source", exact: true })).toBeVisible();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `English source labels fit ${width}px`);
      } finally { await context.close(); }
    }
  } finally { group = null; item.source.name = original; }
});

test("unavailable saved translations keep readable Chinese and a pending notice; a failing endpoint cannot cause a request loop", async () => {
  failing = true; lookups = 0; failedTexts.length = 0;
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage();
  try {
    await page.goto(web.origin + "/");
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
    await expect(page.getByText(/Original text is shown when a translation is pending/)).toBeVisible();
    await expect.poll(() => lookups).toBeGreaterThan(0);
    // Rerender while the failed read is still in flight: those texts must remain deduplicated.
    await page.getByRole("button", { name: "Switch to Chinese", exact: true }).click();
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await page.waitForTimeout(1000);
    assert.equal(new Set(failedTexts).size, failedTexts.length, "a failed or in-flight text is not queued twice; new late UI labels may use another batch");
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

test("long summaries are split into lookup requests below the public API body limit", async () => {
  dense = true; lookupSizes.length = 0;
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } }), page = await context.newPage();
  try {
    await page.goto(web.origin + "/");
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await expect(page.locator('[data-item-id="long-31"]').getByText("Long summary 31", { exact: true })).toHaveCount(1);
    assert.ok(lookupSizes.length > 1);
    assert.ok(lookupSizes.every(size => size <= 128 * 1024));
  } finally { dense = false; await context.close(); }
});
