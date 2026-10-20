import assert from "node:assert/strict";
import { test } from "node:test";
import { fromWeiboHtml } from "@aihot/backend/sources/weibo";
import { readable } from "@aihot/backend/content/extract";
import { unsupportedConfig } from "@aihot/backend/sources/config-keys";

const post = (body: string, extra = "", path = "/1560906700/RmVsvfDMZ") => `<div class="WB_feed_type" mid="5354640913727873" ${extra}>
<a node-type="feed_list_item_date" href="${path}?from=profile" title="2026-10-16 13:42">10月16日</a>
<div node-type="feed_list_content" nick-name="作者">${body}</div></div>`;
const url = "https://weibo.com/1560906700/RmVsvfDMZ";

test("public original posts retain exact source dates, paragraphs and canonical URLs", () => {
  const rows = fromWeiboHtml(post('外卖竞争<br>骑手收入<img alt="[思考]" src="/face.png">'), "https://weibo.com/foxshuo");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.url, url);
  assert.equal(rows[0]!.publishedAt?.toISOString(), "2026-10-16T05:42:00.000Z");
  assert.equal(rows[0]!.author, "作者");
  assert.match(rows[0]!.bodyText!, /外卖竞争\s+骑手收入\[思考\]/);
  assert.equal(rows[0]!.bodyStatus, "ok");
  assert.deepEqual(unsupportedConfig("web_list", { adapter: "weibo_profile" }), []);
});

test("collapsed posts await extraction; exact post pages can supply short complete bodies", () => {
  const html = post('外卖竞争...<a action-type="fl_unfold">展开全文</a>');
  const row = fromWeiboHtml(html, url)[0]!;
  assert.equal(row.bodyStatus, "pending");
  assert.equal(row.bodyText, null);
  assert.doesNotMatch(row.excerpt!, /展开全文/);
  assert.equal(readable(html, url), null);
  assert.equal(readable(post("外卖竞争的可核对完整文字"), url)?.text, "外卖竞争的可核对完整文字");
});

test("login walls, unrelated cards, reposts and undated text never become a post body", () => {
  assert.deepEqual(fromWeiboHtml("<main>请登录查看</main>", url), []);
  assert.equal(readable(post("另一个帖子的正文", "", "/1560906700/Another"), url), null);
  assert.equal(readable(post("转发语", 'isforward="1"'), url), null);
  assert.equal(readable(post('评论<div class="WB_expand">别人的正文</div>'), url), null);
  assert.deepEqual(fromWeiboHtml(post("无日期").replace('title="2026-10-16 13:42"', ""), url), []);
  assert.equal(fromWeiboHtml(post("重复") + post("重复"), url).length, 1);
  assert.equal(fromWeiboHtml(post("坏链接", "", "https://[") + post("正常"), url).length, 1);
});
