import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { tag } from "./setup.ts";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { correctVerifiedRssTime } from "@aihot/backend/admin/rss-time-correction";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";

const source = `rss-time-${tag()}`;
const oldTime = "2026-10-28T16:04:23.000Z";
const correctedTime = "2026-10-28T08:04:23.000Z";
const discovery = new Date("2026-10-28T15:23:33.000Z");
before(async () => { await getBoss(); await sql`INSERT INTO sources(id,name,kind,config,tier,participation_mode)
  VALUES (${source},'RSS timezone','rss','{"publishedAtUtcOffset":"+08:00"}','T2','editorial')`; });
after(async () => { await stopBoss(); await closeDb(); });

async function fixture() {
  const url = `https://example.org/${tag()}`;
  const {articleId:id} = await upsertMaterial({sourceId:source,url,title:'真实原始新闻',bodyText:'报道',bodyStatus:'ok',
    via:'fetch',publishedAt:new Date(oldTime),discoveredAt:discovery});
  await sql`UPDATE articles SET processing_state='analyzed',grouping_status='complete',grouped_at=now() WHERE id=${id}`;
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,output)
    VALUES (${id},1,'rule','pass','保留标题','保留摘要',false,'{"scope":"single"}')`;
  const [story] = await sql`INSERT INTO stories(public_id,title,first_report_at,latest_at) VALUES (${randomUUID()},'原事件',${new Date(oldTime)},${new Date(oldTime)}) RETURNING id`;
  const [fact] = await sql`INSERT INTO facts(public_id,story_id,title) VALUES (${randomUUID()},${story!.id},'原事实') RETURNING id`;
  await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES (${fact!.id},${id},'report')`;
  await sql`INSERT INTO story_signals(story_id,article_id,participant_key,source_id,kind,observed_at)
    VALUES (${story!.id},${id},${source},${source},'editorial',${new Date(oldTime)})`;
  await publishArticle(id,{releasedAt:discovery});
  return {id,url,story:Number(story!.id),input:{sourceId:source,url,revision:1,oldTime,correctedTime,requestId:`rss-${id}`}};
}

test("verified RSS time correction preserves editorial decisions and corrects event evidence", async () => {
  const f = await fixture();
  const [before] = await sql`SELECT to_jsonb(p)-ARRAY['published_at','timeline_at','sort_at','revision','updated_at'] AS decision FROM publications p WHERE article_id=${f.id}`;
  const reports = await sql`SELECT id,content FROM reports ORDER BY id`;
  const result = await correctVerifiedRssTime(f.id,f.input,'rss-time-test');
  assert.equal(result.status,'corrected');
  const [article] = await sql`SELECT published_at,published_at_claim,discovered_at,timeline_at FROM articles WHERE id=${f.id}`;
  assert.equal(article!.published_at.toISOString(),correctedTime);
  assert.equal(article!.published_at_claim.toISOString(),correctedTime);
  assert.equal(article!.discovered_at.toISOString(),discovery.toISOString());
  assert.equal(article!.timeline_at.toISOString(),discovery.toISOString());
  const [published] = await sql`SELECT published_at,to_jsonb(p)-ARRAY['published_at','timeline_at','sort_at','revision','updated_at'] AS decision FROM publications p WHERE article_id=${f.id}`;
  assert.equal(published!.published_at.toISOString(),correctedTime);
  assert.deepEqual(published!.decision,before!.decision);
  const [signal] = await sql`SELECT observed_at FROM story_signals WHERE article_id=${f.id}`;
  const [story] = await sql`SELECT first_report_at,latest_at FROM stories WHERE id=${f.story}`;
  assert.equal(signal!.observed_at.toISOString(),correctedTime);
  assert.equal(story!.first_report_at.toISOString(),correctedTime);
  assert.equal(story!.latest_at.toISOString(),correctedTime);
  assert.deepEqual(await sql`SELECT id,content FROM reports ORDER BY id`,reports,'published report snapshots remain unchanged');
  assert.equal((await correctVerifiedRssTime(f.id,f.input,'rss-time-test')).status,'unchanged');
  assert.equal((await sql`SELECT 1 FROM audit_log WHERE subject=${`content:${f.id}`} AND action='content.correct-rss-timezone'`).length,1);
});

test("rejects wrong evidence or changed source without touching the article", async () => {
  const f = await fixture();
  for(const input of [{...f.input,url:f.url+'-different'}, {...f.input,revision:2}, {...f.input,correctedTime:'2026-10-28T08:05:23.000Z'}])
    await assert.rejects(correctVerifiedRssTime(f.id,input,'rss-time-test'),{code:'conflict'});
  const [a] = await sql`SELECT published_at FROM articles WHERE id=${f.id}`;
  assert.equal(a!.published_at.toISOString(),oldTime);
  assert.equal((await sql`SELECT 1 FROM audit_log WHERE subject=${`content:${f.id}`} AND action='content.correct-rss-timezone'`).length,0);
});

test("does not silently change a report across the historical backfill boundary", async () => {
  const f = await fixture();
  await sql`UPDATE articles SET discovered_at=${new Date(+new Date(oldTime) + 45 * 3600_000)} WHERE id=${f.id}`;
  await assert.rejects(correctVerifiedRssTime(f.id,f.input,'rss-time-test'),/回填边界/);
  const [a] = await sql`SELECT published_at FROM articles WHERE id=${f.id}`;
  assert.equal(a!.published_at.toISOString(),oldTime);
});

test("a failed audit rolls back article, publication and story time together", async () => {
  const f = await fixture();
  await sql.unsafe(`CREATE FUNCTION reject_rss_time_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor='reject-rss-time' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$`);
  await sql.unsafe('CREATE TRIGGER reject_rss_time_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_rss_time_audit()');
  try {
    await assert.rejects(correctVerifiedRssTime(f.id,f.input,'reject-rss-time'),/audit unavailable/);
    const [row] = await sql`SELECT a.published_at,p.published_at AS public_at,ss.observed_at,st.latest_at
      FROM articles a JOIN publications p ON p.article_id=a.id JOIN story_signals ss ON ss.article_id=a.id
      JOIN stories st ON st.id=ss.story_id WHERE a.id=${f.id}`;
    for (const value of Object.values(row!)) assert.equal(value.toISOString(),oldTime);
    assert.equal((await sql`SELECT 1 FROM audit_log WHERE subject=${`content:${f.id}`} AND action='content.correct-rss-timezone'`).length,0);
  } finally {
    await sql.unsafe('DROP TRIGGER reject_rss_time_audit ON audit_log');
    await sql.unsafe('DROP FUNCTION reject_rss_time_audit()');
  }
});
