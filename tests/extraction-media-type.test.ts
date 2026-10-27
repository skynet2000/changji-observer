import "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb } from "@aihot/backend/db";
import { extractFromUrl } from "@aihot/backend/content/extract";
import { fetchDetail } from "@aihot/backend/sources/web-list";
import type { SourceRow } from "@aihot/backend/sources/types";

const text = "Verified publisher article about internet-company operations and employees. ".repeat(12);
const html = `<!DOCTYPE html><html><head><title>Company news</title><meta name="pubdate" content="2026-10-27 12:30:00"></head><body><article><h1>Company news</h1><p>${text}</p></article></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === "/json") res.setHeader("content-type", "application/json");
  res.end(req.url === "/fragment" ? `<p>${text}</p>` : html);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
config.allowPrivateNetworkFetch = true;
delete process.env.JINA_API_KEY;
after(async () => { server.close(); await closeDb(); });

test("a publisher's HTML document without Content-Type works through extraction and detail enrichment", async () => {
  const extracted = await extractFromUrl(base, "test:missing-content-type", "+08:00");
  assert.ok(extracted);
  assert.ok(extracted.text.includes("Verified publisher article"));
  const detail = await fetchDetail(base, { id: "media-type", config: {} } as SourceRow,
    { date: true, title: false, summary: false, body: true });
  assert.equal(detail.body?.text, extracted.text);
  assert.equal(detail.publishedAt?.toISOString(), "2026-10-27T04:30:00.000Z");
});

for (const path of ["/json", "/fragment"]) test(`a ${path} response is not reinterpreted as an undeclared HTML document`, async () => {
  assert.equal(await extractFromUrl(`${base}${path}`, "test:not-html"), null);
  const detail = await fetchDetail(`${base}${path}`, { id: "media-type", config: {} } as SourceRow,
    { date: false, title: false, summary: true, body: true });
  assert.equal(detail.body, null);
});
