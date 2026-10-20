import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchWebList, fetchDetail, fromHtml } from "@aihot/backend/sources/web-list";
import { unsupportedConfig } from "@aihot/backend/sources/config-keys";

const requests: { method: string; body: string; type: string | undefined }[] = [];
const html = '<li class="js_news_item" id="123"><a class="title">公司全员信公布组织调整</a></li><li class="js_news_item"><a class="title">没有文章标识</a></li>';
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  requests.push({ method: req.method!, body, type: req.headers["content-type"] });
  res.setHeader("content-type", "text/html");
  res.end(req.url?.startsWith("/news/") ? '<span class="pub_time">2026-10-16 09:44</span><div class="article_wrap"><div class="body">公司发布全员信，宣布整合产品与研发团队，明确新的汇报线。</div></div><footer>下载应用</footer>' : html);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const previous = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => { config.allowPrivateNetworkFetch = previous; await new Promise<void>(resolve => server.close(() => resolve())); });
const settings = { url: base, method: "POST", bodyForm: { page_no: "1", page_size: "100" }, itemSelector: "li", titleSelector: "a.title", urlTemplate: `${base}/news/details?id={id}`, detail: { publishedAtSelector: ".pub_time", publishedAtUtcOffset: "+08:00", publishedAtAuthoritative: true, summarySelector: ".article_wrap > .body" } };

test("public HTML form query resolves row ids and uses the original detail date", async () => {
  const source = { id: "form-test", config: settings } as never;
  const items = await fetchWebList(source);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.url, `${base}/news/details?id=123`);
  assert.equal(items[0]!.title, "公司全员信公布组织调整");
  assert.deepEqual(requests[0], { method: "POST", body: "page_no=1&page_size=100", type: "application/x-www-form-urlencoded" });
  const detail = await fetchDetail(items[0]!.url, source, { date: true, title: false, summary: true, body: true });
  assert.equal(detail.publishedAt?.toISOString(), "2026-10-16T01:44:00.000Z");
  assert.equal(detail.summary, "公司发布全员信，宣布整合产品与研发团队，明确新的汇报线。");
  assert.equal(detail.body, null); // A short bulletin still supplies evidence through its explicit excerpt.
  assert.deepEqual(unsupportedConfig("web_list", settings), []);
});

test("ordinary href parsing stays unchanged and a template encodes untrusted row attributes", () => {
  const ordinary = fromHtml('<a href="/article/2">公司任命新负责人</a>', base, { config: {} } as never);
  assert.equal(ordinary[0]!.url, `${base}/article/2`);
  const templated = fromHtml('<li id="1&amp;admin=true"><a class="title">公司组织调整</a></li>', base, { config: settings } as never);
  assert.equal(templated[0]!.url, `${base}/news/details?id=1%26admin%3Dtrue`);
});

test("form configuration refuses GET bodies and unsupported methods or non-string form values", () => {
  assert.deepEqual(unsupportedConfig("web_list", { method: "DELETE" }), ["method"]);
  assert.deepEqual(unsupportedConfig("web_list", { bodyForm: { page_no: "1" } }), ["bodyForm"]);
  assert.deepEqual(unsupportedConfig("web_list", { method: "POST", bodyForm: { page_no: 1 } }), ["bodyForm"]);
});

test("detail reads retry a transient 502 once, but do not retry a missing article", async () => {
  const hits = new Map<string,number>();
  const origin = http.createServer((req,res)=>{
    const key = req.url!;
    hits.set(key,(hits.get(key)??0)+1);
    if (key==='/missing') {res.writeHead(404);res.end();return;}
    if (hits.get(key)===1) {res.writeHead(502);res.end();return;}
    res.writeHead(200,{'content-type':'text/html'});
    res.end('<span class="pub_time">2026-10-16 09:44</span>');
  });
  await new Promise<void>(resolve=>origin.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(origin.address() as {port:number}).port}`;
  try {
    const source={id:'detail-retry',config:settings} as never;
    const need={date:true,title:false,summary:false,body:false};
    const detail=await fetchDetail(url+'/transient',source,need);
    assert.equal(detail.publishedAt?.toISOString(),'2026-10-16T01:44:00.000Z');
    assert.equal(hits.get('/transient'),2);
    await assert.rejects(fetchDetail(url+'/missing',source,need),/HTTP 404/);
    assert.equal(hits.get('/missing'),1);
  } finally {await new Promise<void>(resolve=>origin.close(()=>resolve()));}
});
