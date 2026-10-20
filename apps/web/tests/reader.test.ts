import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { startWebServer, type WebServer } from "./web-server.ts";

let web: WebServer, browser: Browser;
let enabled = true, version = 0;
let state: { starred: Record<string, unknown>[]; read: string[] } = { starred: [], read: [] };
const api = createServer(async (req, res) => {
  const url = new URL(req.url!, "http://fixture"), signedIn = req.headers.cookie?.includes("reader-fixture=yes");
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/api/site/meta") return res.end('{"changelogVersion":"fixture"}');
  if (url.pathname === "/api/site/items/availability") return res.end("{}");
  if (url.pathname === "/api/reader/session") return res.end(JSON.stringify({ enabled, providers: enabled ? ["google", "github"] : [], user: signedIn ? { id: "fixture", name: "测试读者", provider: "github" } : null, csrf: "test-csrf", state, version }));
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
      await expect(page.getByRole("link", { name: "隐私说明", exact: true })).toBeVisible();
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
    await pa.getByRole("link", { name: "返回收藏 →", exact: true }).click();
    await expect(pa.locator('[data-card-key="guest-b"]')).toBeVisible();
    await pa.locator('[data-card-key="guest-a"]').getByRole("button", { name: "取消收藏" }).click();
    await expect.poll(() => state.starred.map(x => x.id)).toEqual(["guest-b"]);
    await pb.getByRole("button", { name: "立即同步", exact: true }).click();
    await pb.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(pb.getByRole("link", { name: "使用 GitHub 登录", exact: true })).toBeVisible();
    await pb.getByRole("link", { name: "返回收藏 →", exact: true }).click();
    await expect(pb.locator('[data-card-key="guest-b"]')).toBeVisible();
    await expect(pb.locator('[data-card-key="guest-a"]')).toHaveCount(0);
    assert.ok(state.read.includes("guest-a") && state.read.includes("guest-b"));
  } finally { await a.close(); await b.close(); }
});
