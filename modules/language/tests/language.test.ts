import { pointModels, stub } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import Fastify from "fastify";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { publicTextValues, collectPublicText } from "@aihot/backend/publication/texts";
import language, { hashText, translateNextBatch, validTranslations } from "../server.ts";

const app = Fastify(); language.http!(app);
after(async () => { await app.close(); await closeDb(); });

test("English uses current public text only, leaves Chinese untouched, and lookup cannot invoke or enqueue models", async () => {
  const source = "language-fixture";
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode) VALUES(${source},'媒体','rss','T1','editorial')`;
  const { articleId } = await upsertMaterial({ sourceId: source, url: "https://example.com/language", title: "公司公开信", bodyText: "公司公开信正文", via: "fetch", publishedAt: new Date() });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,reason_zh,score,selected)
    VALUES(${articleId},1,'rule','pass','industry','公司公开信','公司宣布组织调整。','影响员工岗位。',80,true)`;
  await publishArticle(articleId);
  assert.ok((await publicTextValues()).includes("公司公开信"));
  for (const [source, english] of [["公司公开信", "A company-wide letter"], ["机密未公开", "Private"], ["不存在的旧标题", "Old title"]]) {
    await sql`INSERT INTO language_texts(source_hash,source,english,receipt_id) VALUES(${hashText(source)},${source},${english},0)`;
  }
  const before = await sql`SELECT count(*)::int AS n FROM receipts`;
  const result = await app.inject({ method: "POST", url: "/api/language/lookup", payload: { texts: ["公司公开信", "机密未公开", "不存在的旧标题"] } });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json().translations, { "公司公开信": "A company-wide letter" });
  assert.equal(result.headers["cache-control"], "no-store");
  assert.deepEqual(await sql`SELECT count(*)::int AS n FROM receipts`, before);
  assert.equal((await sql`SELECT title FROM publications WHERE article_id=${articleId}`)[0]!.title, "公司公开信");
  await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${articleId}`;
  assert.ok(!(await publicTextValues()).includes("公司公开信"));
  assert.equal((await app.inject({ method: "POST", url: "/api/language/lookup", payload: { texts: Array(65).fill("中文") } })).statusCode, 400);
});

test("report extraction skips withdrawn citations, IDs and URLs; translation checks protect numbers/placeholders", () => {
  assert.deepEqual([...collectPublicText({ title: "本期导读", sections: [{ label: "职场与组织", items: [
    { available: false, title: "撤下的稿件", summary: "不再展示" }, { available: true, title: "组织调整", itemId: "秘密ID", sourceUrl: "https://example.com/中文" },
  ] }] })], ["本期导读", "职场与组织", "组织调整"]);
  assert.ok(validTranslations(["{{0}} 条，V4.1，10:15，500元"], ["{{0}} items, V4.1, 10:15, 500 CNY"]));
  assert.equal(validTranslations(["500元"], ["50 CNY"]), false);
  assert.equal(validTranslations(["500元"], ["1500 CNY"]), false);
  assert.equal(validTranslations(["一", "二"], ["one"]), false);
  assert.equal(validTranslations(["中文"], ["<script>alert(1)</script>"]), false);
});

test("worker persists translations and completes real receipts; repeating a completed batch cannot pay for it again", async () => {
  const api = await stub((_hit, req) => {
    const input = JSON.parse(req.body);
    const texts = JSON.parse(input.messages.at(-1).content) as Array<{ id: number; text: string }>;
    return { choices: [{ message: { content: JSON.stringify({ translations: texts.map(item => ({ id: item.id, text: `English ${item.text}` })).reverse() }) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20 } };
  });
  pointModels(api.url, ["deepseek-flash"]);
  try {
    const first = await translateNextBatch();
    assert.ok(first.translated > 0);
    assert.equal(api.hits(), 1);
    const [receipt] = await sql`SELECT status FROM receipts WHERE purpose='language.english' ORDER BY id DESC LIMIT 1`;
    assert.equal(receipt!.status, "completed");
    const saved = await sql`SELECT source_hash, source, english FROM language_texts WHERE receipt_id>0`;
    assert.ok(saved.every(row => row.english === `English ${row.source}`), "reordered response ids cannot attach a translation to the wrong source");
    assert.equal(saved.length, first.translated);
    await translateNextBatch();
    assert.equal(api.hits(), 2, "the second run advances to different source texts");
    const savedAgain = new Set((await sql`SELECT source_hash FROM language_texts WHERE receipt_id>0`).map(r => r.source_hash));
    assert.ok(saved.every(r => savedAgain.has(r.source_hash)));
  } finally { await api.close(); }
});

test("a bad segment remains private and waits before retrying while other segments are saved", async () => {
  const api = await stub((_hit, req) => {
    const texts = JSON.parse(JSON.parse(req.body).messages.at(-1).content) as Array<{ id: number; text: string }>;
    return { choices: [{ message: { content: JSON.stringify({ translations: texts.map((item, i) => ({ id: item.id, text: i === 0 ? "" : `English ${item.text}` })) }) }, finish_reason: "stop" }] };
  });
  pointModels(api.url, ["deepseek-flash"]);
  try {
    const result = await translateNextBatch();
    assert.ok(result.translated > 0); assert.equal(result.failed, 1);
    const [bad] = await sql`SELECT source, english, attempts, retry_after FROM language_texts WHERE english IS NULL`;
    assert.equal(bad!.english, null); assert.equal(bad!.attempts, 1); assert.ok(bad!.retry_after.getTime() > Date.now());
    const lookup = await app.inject({ method: "POST", url: "/api/language/lookup", payload: { texts: [bad!.source] } });
    assert.deepEqual(lookup.json().translations, {});
  } finally { await api.close(); }
});

test("real translations preserve values across Chinese magnitudes, grouping commas and English date/number words", () => {
  const cases = [
    ["收藏最多500条，已读5000条。", "Up to 500 saved and 5,000 read items."],
    ["年包最高500万元", "Annual package up to 5 million yuan"],
    ["从200万元到400万至500万元，去年200万至300万元", "From 2 million yuan to 4 million to 5 million yuan, versus 2 million to 3 million yuan last year"],
    ["10月18日08:00至10月19日08:00", "08:00 on October 18 to 08:00 on October 19"],
    ["上线7个月，日活2200万", "Seven months since launch, 22 million daily active users"],
    ["季度营收168亿美元，环比45%", "Quarterly revenue of $16.8 billion, up 45%"],
    ["最快1分钟一次", "At most once per minute"],
  ];
  for (const [source, english] of cases) assert.ok(validTranslations([source!], [english!]), `${source} -> ${english}`);
  assert.equal(validTranslations(["500万元"], ["50 million yuan"]), false);
  assert.equal(validTranslations(["500万元"], ["5 billion yuan"]), false);
  assert.equal(validTranslations(["V4.1"], ["V4.2"]), false);
  assert.equal(validTranslations(["V4.1"], ["V4.10"]), false);
  assert.equal(validTranslations(["10月18日"], ["October 19"]), false);
});
