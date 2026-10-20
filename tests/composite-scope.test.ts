// Failure modes: an inner analysis alias captures an outer membership alias; a newer unrelated
// composite changes another fact's size; missing scope or lower input revisions become evidence.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { latestCompositeCondition, compositeCondition, ownFactEvidenceCondition } from "@aihot/backend/publication/scope";
import { candidateViews } from "@aihot/backend/events/recall";
import { overrideFields } from "@aihot/backend/admin/content";
import { moveToFact } from "@aihot/backend/events/corrections";
import { publishArticle } from "@aihot/backend/publication/publish";
import { stopBoss } from "@aihot/backend/jobs/queue";

after(async () => { await stopBoss(); await closeDb(); });

test("latest scope stays correlated to an outer x membership and candidate counts", async () => {
  const source = `scope-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${source}, 'Scope fixture', 'rss', 'T1', 'editorial')`;
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id,title,first_report_at,latest_at)
    VALUES (${randomUUID()}, 'An event', now(), now()) RETURNING id`;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id,story_id,title)
    VALUES (${randomUUID()}, ${story!.id}, 'An occurrence') RETURNING id`;
  const ids = ["single", "composite", "missing", "unknown"].map(s => `${source}-${s}`);
  for (const [index,id] of ids.entries()) {
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at)
      VALUES (${id},${source},${id},${`https://example.org/${id}`},${id},now(),now())`;
    if (index < 2) await sql`INSERT INTO analyses (article_id,input_revision,origin,output)
      VALUES (${id},1,'rule',${sql.json({ scope: 'composite' })})`;
    if (index === 0) await sql`INSERT INTO analyses (article_id,input_revision,origin,output)
      VALUES (${id},2,'rule',${sql.json({ scope: 'single' })})`;
    if (index === 3) await sql`INSERT INTO analyses (article_id,input_revision,origin,output) VALUES (${id},1,'rule','{}')`;
    await sql`INSERT INTO publications (article_id,title,source_id,channel,url,discovered_at,timeline_at,sort_at)
      VALUES (${id},${id},${source},'news',${`https://example.org/${id}`},now(),now(),now())`;
    await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${id},'report')`;
  }
  // An unrelated latest row must not decide scope for every row of x.
  await sql`INSERT INTO analyses (article_id,input_revision,origin,output)
    VALUES (${ids[1]!},1,'rule',${sql.json({ scope: 'composite' })})`;
  const scopes = await sql<{ article_id: string; composite: boolean }[]>`
    SELECT x.article_id, ${latestCompositeCondition(sql`x.article_id`)} AS composite
    FROM fact_articles x WHERE x.fact_id=${fact!.id} ORDER BY x.article_id`;
  assert.deepEqual([...scopes], ids.map((article_id,index) => ({ article_id,composite:index===1 })).sort((a,b) => a.article_id.localeCompare(b.article_id)));
  const [candidate] = await candidateViews([{ factId:fact!.id,storyId:story!.id,factTitle:'An occurrence',score:1 }]);
  assert.equal(candidate!.members,3,"only the composite is excluded; missing and unknown scope remain reports");
  assert.equal(candidate!.storyRoot,true);
});

test("audited scope corrections survive reanalysis and can be cleared without rewriting model history", async () => {
  const id = `scope-edit-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${id},'Scope editor','rss','T1','editorial')`;
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at)
    VALUES (${id},${id},${id},${`https://example.org/${id}`},'融资报道与历史背景',now(),now())`;
  const [story] = await sql`INSERT INTO stories (public_id,title) VALUES (${randomUUID()},'融资事件') RETURNING id`;
  const factPublicId = randomUUID();
  await sql`INSERT INTO facts (public_id,story_id,title) VALUES (${factPublicId},${story!.id},'本轮融资')`;
  const analysis = () => sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,summary_zh,output)
    VALUES (${id},1,'rule','pass','一笔新融资，其他投资为历史背景','{"scope":"composite"}')`;
  await analysis();
  await publishArticle(id);
  const scope = async () => (await sql`SELECT ${compositeCondition()} AS composite, ${ownFactEvidenceCondition()} AS evidence
    FROM publications p WHERE article_id=${id}`)[0]!;
  assert.equal((await scope()).composite,true);
  await overrideFields(id,{ fields:{scope:'single'},version:0,reason:'核对原文，仅有一笔当期融资，其余为背景' },'scope-test');
  await moveToFact(id,factPublicId,'核对融资主体与轮次','scope-test');
  assert.deepEqual(await scope(),{composite:false,evidence:true});
  await analysis();
  await publishArticle(id);
  assert.deepEqual(await scope(),{composite:false,evidence:true},'later model output cannot undo the correction');
  await assert.rejects(overrideFields(id,{fields:{scope:'composite'},version:0,reason:'stale'},'scope-test'),{code:'conflict'});
  await overrideFields(id,{fields:{},clear:['scope'],version:1,reason:'撤销人工范围校正'},'scope-test');
  assert.deepEqual(await scope(),{composite:true,evidence:false});
  const history = await sql`SELECT output->>'scope' AS scope FROM analyses WHERE article_id=${id}`;
  assert.ok(history.every(r=>r.scope==='composite'),'model records are immutable');
  const audit = await sql`SELECT 1 FROM audit_log WHERE subject=${`content:${id}`} AND action='content.override'`;
  assert.equal(audit.length,2);
});
