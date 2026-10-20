// Recall must keep the same evidence through a query-plan change: discovery defines the window,
// live stories and membership roles define eligibility, and the latest analysis (revision, then id)
// excludes composites even before publication catches up. Shared reports retain every fact.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { recallFacts } from "@aihot/backend/events/recall";

const T = `recall-${tag()}`;
const title = `${T}模型发布全新版本详细说明`;
after(closeDb);

test("recall preserves window, live-story, membership and latest-analysis evidence", async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode)
    VALUES (${T}, 'Recall fixture', 'rss', 'T1', 'editorial')`;
  const [live] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, first_report_at, latest_at)
    VALUES (${randomUUID()}, ${title}, now(), now()) RETURNING id`;
  const [merged] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, first_report_at, latest_at, merged_into)
    VALUES (${randomUUID()}, ${title}, now(), now(), ${live!.id}) RETURNING id`;
  const expected: number[] = [];
  for (const [index, scenario] of ["single", "missing-analysis", "unknown-scope", "composite", "latest-single", "latest-composite", "higher-revision", "old-discovery", "boundary", "recent-discovery", "mention", "merged", "shared"].entries()) {
    const id = `${T}-${scenario}`;
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at, published_at)
      VALUES (${id}, ${T}, ${id}, ${`https://example.org/${id}`}, ${title},
        now() - CASE WHEN ${scenario} = 'old-discovery' THEN interval '15 days'
          WHEN ${scenario} = 'boundary' THEN interval '14 days'
          WHEN ${scenario} = 'recent-discovery' THEN interval '14 days' - interval '1 minute' ELSE interval '1 day' END,
        now(), now() - interval '1 year')`;
    const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title)
      VALUES (${`${T}-fact-${index}`}, ${scenario === "merged" ? merged!.id : live!.id}, ${title}) RETURNING id`;
    await sql`INSERT INTO fact_articles (fact_id, article_id, role)
      VALUES (${fact!.id}, ${id}, ${scenario === "mention" ? "mention" : index % 2 ? "primary" : "report"})`;
    if (scenario !== "missing-analysis") {
      await sql`INSERT INTO analyses (article_id, input_revision, origin, title_zh, output)
        VALUES (${id}, ${scenario === "higher-revision" ? 2 : 1}, 'rule', ${title},
          ${sql.json(scenario === "unknown-scope" ? {} : { scope: ["composite", "latest-single"].includes(scenario) ? "composite" : "single" })})`;
      if (["latest-single", "latest-composite", "higher-revision"].includes(scenario)) {
        await sql`INSERT INTO analyses (article_id, input_revision, origin, title_zh, output)
          VALUES (${id}, 1, 'rule', ${title}, ${sql.json({ scope: scenario === "latest-single" ? "single" : "composite" })})`;
        await sql`INSERT INTO publications (article_id, analysis_id, title, source_id, channel, url, discovered_at, timeline_at, sort_at)
          SELECT a.id, (SELECT min(id) FROM analyses WHERE article_id = a.id), a.title, a.source_id, 'news', a.url,
            a.discovered_at, a.timeline_at, a.timeline_at FROM articles a WHERE a.id = ${id}`;
      }
    }
    if (!["composite", "latest-composite", "old-discovery", "boundary", "mention", "merged"].includes(scenario)) expected.push(fact!.id);
    if (scenario === "shared") {
      const [second] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title)
        VALUES (${`${T}-shared-fact`}, ${live!.id}, ${title}) RETURNING id`;
      await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${second!.id}, ${id}, 'primary')`;
      expected.push(second!.id);
    }
  }
  const recalled = await recallFacts(`${T}-query`, title, 0, 1000);
  assert.deepEqual(recalled.map(r => r.factId).sort((a, b) => a - b), expected.sort((a, b) => a - b));
  assert.ok(recalled.every(r => r.score === 1 && r.storyId === live!.id && r.factTitle === title));
});

test('same-subject same-day facts reach the judge even when incident and compensation wording differ', async () => {
  const key=`frame-${tag()}`;
  await sql`INSERT INTO sources(id,name,kind,tier) VALUES (${key},${key},'rss','T2')`;
  const [story]=await sql`INSERT INTO stories(public_id,title) VALUES (${randomUUID()},'Incident') RETURNING id`;
  const ids:number[]=[];
  for(const [index,subject,day,scope] of [[0,key,'2026-10-15','single'],[1,key,'2026-10-14','single'],[2,key+' other','2026-10-15','single'],[3,key,'2026-10-15','composite']] as const){
    const id=key+index;
    await sql`INSERT INTO articles(id,source_id,identity_key,url,title,discovered_at,timeline_at) VALUES (${id},${key},${id},${'https://example.org/'+id},'网络连接中断',now(),now())`;
    await sql`INSERT INTO analyses(article_id,input_revision,origin,output) VALUES (${id},1,'rule',${sql.json({scope})})`;
    const [fact]=await sql`INSERT INTO facts(public_id,story_id,title,subject,occurred_at) VALUES (${id},${story!.id},'网络连接中断',${subject},${day+'T00:00:00+08:00'}) RETURNING id`;
    await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES (${fact!.id},${id},'report')`;
    ids.push(Number(fact!.id));
  }
  const query='用户获赠代金券，企业致歉承诺整改';
  const before=await recallFacts(key+'-query',query,0.6,10);
  assert.ok(!before.some(r=>ids.includes(r.factId)));
  const after=await recallFacts(key+'-query',query,0.6,10,[],{subject:key,occurredAt:'2026-10-15'});
  assert.deepEqual(after.filter(r=>ids.includes(r.factId)).map(r=>[r.factId,r.score]),[[ids[0],0]]);
});

test("archive recall finds old peers by publication date, without recalling another year's identical headline", async () => {
  const key = `archive-${tag()}`;
  await sql`INSERT INTO sources(id,name,kind,tier) VALUES (${key},${key},'rss','T2')`;
  const [story] = await sql`INSERT INTO stories(public_id,title) VALUES (${randomUUID()},${key}) RETURNING id`;
  const ids: number[] = [];
  for (const [name, at] of [['peer','2024-04-01'],['other-year','2023-04-01']] as const) {
    const id = `${key}-${name}`;
    await sql`INSERT INTO articles(id,source_id,identity_key,url,title,discovered_at,timeline_at,published_at)
      VALUES (${id},${key},${id},${'https://example.org/'+id},${key},'2024-04-02','2024-04-02',${at})`;
    await sql`INSERT INTO analyses(article_id,input_revision,origin,output) VALUES (${id},1,'rule',${sql.json({scope:'single'})})`;
    const [fact] = await sql`INSERT INTO facts(public_id,story_id,title) VALUES (${id},${story!.id},${key}) RETURNING id`;
    await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES (${fact!.id},${id},'report')`;
    ids.push(Number(fact!.id));
  }
  const query = `${key}-query`;
  await sql`INSERT INTO articles(id,source_id,identity_key,url,title,discovered_at,timeline_at,published_at,backfill)
    VALUES (${query},${key},${query},${'https://example.org/'+query},${key},now(),now(),'2024-04-02',true)`;
  const result = await recallFacts(query,key,0,1000);
  assert.deepEqual(result.filter(r=>ids.includes(r.factId)).map(r=>r.factId), [ids[0]]);
});
