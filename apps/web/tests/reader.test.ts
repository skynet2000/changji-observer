import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { startWebServer, type WebServer } from "./web-server.ts";

let web: WebServer, browser: Browser;
let enabled = true, version = 0, displayName = "测试读者";
let state: { starred: Record<string, unknown>[]; read: string[] } = { starred: [], read: [] };
const api = createServer(async (req, res) => {
  const url = new URL(req.url!, "http://fixture"), signedIn = req.headers.cookie?.includes("reader-fixture=yes");
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/api/site/meta") return res.end('{"changelogVersion":"fixture"}');
  if (url.pathname === "/api/site/items/availability") return res.end("{}");
  if (url.pathname === "/api/reader/session") return res.end(JSON.stringify({ enabled, providers: enabled ? ["google", "github"] : [], user: signedIn ? { id: "fixture", name: displayName, provider: "github" } : null, csrf: "test-csrf", state, version }));
  if (url.pathname === "/api/reader/login/github") {
    res.writeHead(303, { "set-cookie": "reader-fixture=yes; Path=/; HttpOnly; SameSite=Lax", location: "/account" }); return res.end();
  }
  if (url.pathname === "/api/reader/logout") {
    res.setHeader("set-cookie", "reader-fixture=; Path=/; Max-Age=0"); return res.end('{"ok":true}');
  }
  if (url.pathname === "/api/reader/state" && req.method === "PUT") {
    let text = ""; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    if (body.version !== version) { res.statusCode = 409; return res.end('{"error":"version_changed"}'); }
    state = body.state; version++;
    return res.end(JSON.stringify({ state, version }));
  }
  res.statusCode = 404; res.end("{}");
});
before(async () => { web = await startWebServer(api); browser = await chromium.launch({ channel: "chromium" }); });
after(async () => { await browser?.close(); await web?.stop(); });
const seed = async (context: Awaited<ReturnType<Browser["newContext"]>>, id: string) => {
  await context.addInitScript((key: string) => {
    if (localStorage.getItem("reader-test-seeded")) return;
    localStorage.setItem("reader-test-seeded", "yes");
    localStorage.setItem("aihot-starred-items", JSON.stringify([{ id: key, title: key, summary: null, sourceName: "Fixture", savedAt: "2026-10-21T00:00:00Z", publishedAt: null, score: null, aiSelected: false }]));
    localStorage.setItem("aihot-read-items", JSON.stringify([key]));
  }, id);
};
test("login is optional; desktop and phone hide maintenance entries while retaining feedback and policy links", async () => {
  enabled = false;
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } }); const page = await context.newPage();
    try {
      await page.goto(web.origin + "/more");
      await expect(page.getByRole("link", { name: "更新日志", exact: true })).toHaveCount(0);
      await expect(page.locator('a[href="/about"]')).toHaveCount(0);
      await expect(page.getByRole("link", { name: "意见反馈", exact: true })).toBeVisible();
      await expect(page.locator('#main').getByRole("link", { name: "隐私说明", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "登录并同步", exact: true })).toHaveCount(0);
      await page.screenshot({ path: fileURLToPath(new URL(`../../../outputs/维护导航-${width}-20261021.png`, import.meta.url)), fullPage: true });
    } finally { await context.close(); }
  }
  enabled = true;
});
test("two devices import deliberately, merge concurrent stars, synchronize removal and restore guest data on logout", async () => {
  state = { starred: [], read: [] }; version = 0;
  const a = await browser.newContext(), b = await browser.newContext();
  await seed(a, "guest-a"); await seed(b, "guest-b");
  const pa = await a.newPage(), pb = await b.newPage();
  try {
    for (const page of [pa, pb]) {
      await page.goto(web.origin + "/account");
      await page.getByRole("link", { name: "使用 GitHub 登录", exact: true }).click();
      await expect(page.getByText("测试读者", { exact: false }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "立即同步", exact: true })).toBeEnabled();
    }
    assert.equal(state.starred.length, 0, "guest history is not uploaded merely by logging in");
    await pa.getByRole("button", { name: "导入本机原有收藏与已读", exact: true }).click();
    await expect.poll(() => state.starred.length).toBe(1);
    await pb.getByRole("button", { name: "导入本机原有收藏与已读", exact: true }).click();
    await expect.poll(() => state.starred.length).toBe(2);
    await pa.getByRole("button", { name: "立即同步", exact: true }).click();
    await pa.getByRole("link", { name: "查看我的收藏", exact: true }).click();
    await expect(pa.locator('[data-card-key="guest-b"]')).toBeVisible();
    await pa.locator('[data-card-key="guest-a"]').getByRole("button", { name: "取消收藏" }).click();
    await expect.poll(() => state.starred.map(x => x.id)).toEqual(["guest-b"]);
    await pb.getByRole("button", { name: "立即同步", exact: true }).click();
    await pb.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(pb.getByRole("link", { name: "使用 GitHub 登录", exact: true })).toBeVisible();
    await pb.getByRole("link", { name: "查看我的收藏", exact: true }).click();
    await expect(pb.locator('[data-card-key="guest-b"]')).toBeVisible();
    await expect(pb.locator('[data-card-key="guest-a"]')).toHaveCount(0);
    assert.ok(state.read.includes("guest-a") && state.read.includes("guest-b"));
  } finally { await a.close(); await b.close(); }
});

test("account entries stay in navigation and login choices fit phone, desktop and dark mode", async () => {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(web.origin + "/more");
      const entry = page.locator('[data-reader-entry="header"]');
      await expect(entry).toBeVisible();
      assert.notEqual(await entry.evaluate(el => getComputedStyle(el).position), "fixed");
      const entryBox = await entry.boundingBox();
      assert.ok(entryBox && entryBox.y < 80 && entryBox.x > width / 2, "account is at the top right on phone and desktop");
      await page.screenshot({ path: fileURLToPath(new URL(`../../../outputs/账号入口-${width}-20261021.png`, import.meta.url)), fullPage: true });
      await entry.click();
      await expect(page.getByRole("heading", { name: "登录大厂观察", exact: true })).toBeVisible();
      for (const name of ["Google", "GitHub"]) {
        const choice = page.getByRole("link", { name: `使用 ${name} 登录`, exact: true });
        await expect(choice).toBeVisible();
        const box = await choice.boundingBox();
        assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: fileURLToPath(new URL(`../../../outputs/登录改版-${width}-20261021.png`, import.meta.url)), fullPage: true });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.getByRole("link", { name: "使用 Google 登录", exact: true })).toBeVisible();
      await page.screenshot({ path: fileURLToPath(new URL(`../../../outputs/登录改版-深色-${width}-20261021.png`, import.meta.url)), fullPage: true });
    } finally { await context.close(); }
  }
});

test("language switching preserves a reader's display name even when it matches an interface label", async () => {
  enabled = true; displayName = "精选";
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: "reader-fixture", value: "yes", url: web.origin }]);
  const page = await context.newPage();
  try {
    await page.goto(web.origin + "/account");
    await expect(page.locator('[data-reader-entry="header"]')).toContainText("精选");
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await expect(page.locator('[data-reader-entry="header"]')).toContainText("精选");
    await expect(page.getByText("精选 · GitHub", { exact: true })).toBeVisible();
  } finally { displayName = "测试读者"; await context.close(); }
});

test("desktop sidebar exposes content and tools without a hidden More menu; links support keyboard navigation", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(web.origin + "/more");
    const nav = page.getByRole("navigation", { name: "主导航", exact: true });
    await expect(nav).toBeVisible();
    for (const label of ["精选", "全部互联网动态", "热点榜", "互联网日报", "主题", "收藏", "Agent 接入", "反馈"])
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: /关于|更新日志/ })).toHaveCount(0);
    await expect(page.locator('[data-site-header]').getByRole("navigation")).toHaveCount(0);
    const saved = nav.getByRole("link", { name: "收藏", exact: true });
    await saved.focus();
    await saved.press("Enter");
    await expect(page).toHaveURL(/\/starred$/);
    await expect(saved).toHaveAttribute("aria-current", "page");
  } finally { await context.close(); }
});
