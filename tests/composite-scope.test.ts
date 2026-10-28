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
import { moveFactToStory, moveToFact } from "@aihot/backend/events/corrections";
import { mergeStoryInto } from "@aihot/backend/events/merge";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadPool } from "@aihot/backend/publication/pool";
import { loadGroupReports } from "@aihot/backend/publication/groups";
import { stopBoss } from "@aihot/backend/jobs/queue";

after(async () => { await stopBoss(); await closeDb(); });

test("unfocused roundups stay out of the pool; an audited focus and human selection remain publishable", async () => {
  const id = `roundup-pool-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${id},'Roundup editor','rss','T1','editorial')`;
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at,grouping_status)
    VALUES (${id},${id},${id},${`https://example.org/${id}`},'Kimi发布、家电优惠与汽车安全早报',now(),now(),'complete')`;
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,title_zh,summary_zh,selected,output)
    VALUES (${id},1,'rule','pass','Kimi发布、家电优惠与汽车安全早报','多个互不相关的新闻，含互联网与消费硬件。',false,'{"scope":"composite"}')`;
  await publishArticle(id);
  const state = async () => (await sql`SELECT eligible,selected FROM publications WHERE article_id=${id}`)[0]!;
  assert.equal((await state()).eligible,false,'one relevant mention cannot admit an entire unfocused roundup');
  await overrideFields(id,{fields:{category:'ecommerce'},version:0,reason:'人工复核为同一电商竞争主线'},'roundup-test');
  assert.equal((await state()).eligible,true,'a focused multi-report analysis is allowed');
  await overrideFields(id,{fields:{selected:true},clear:['category'],version:1,reason:'保留人工明确入选决定'},'roundup-test');
  assert.equal((await state()).selected,true,'the admission repair preserves explicit human selection');
});

test("material with unknown scope and no category waits for review instead of entering the pool", async () => {
  const id = `unknown-pool-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${id},'Insufficient material','rss','T1','editorial')`;
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at)
    VALUES (${id},${id},${id},${`https://example.org/${id}`},'片段提到公司，但无法判断主线',now(),now())`;
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,summary_zh,output)
    VALUES (${id},1,'rule','pass','只有简短片段，正文未能确认。','{"scope":"unknown"}')`;
  await publishArticle(id);
  const [p] = await sql`SELECT eligible FROM publications WHERE article_id=${id}`;
  assert.equal(p!.eligible,false);
});

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

test("an audited reprint of one dispute joins its original without folding an unrelated roundup", async () => {
  const key = `scope-dispute-${tag()}`;
  const at = new Date("2026-10-28T03:20:00Z");
  const now = new Date("2026-10-28T05:00:00Z");
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES
    (${key},'First publisher','rss','T2','editorial'),(${key+'-reprint'},'Reprint','rss','T2','editorial')`;
  const ids = [key+'-original',key+'-reprint',key+'-roundup'];
  for (const [i,id] of ids.entries()) {
    const source = i===1 ? key+'-reprint' : key;
    const title = i===2 ? '字节时间争议、另一公司融资及独立政策的早报' : '中国互联网是否存在字节时间？抖音高管反驳，秦朔再回应';
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at,grouping_status)
      VALUES (${id},${source},${id},${'https://example.org/'+id},${title},${at},${at},'complete')`;
    await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,tags,title_zh,summary_zh,selected,output)
      VALUES (${id},1,'rule','pass','industry',${[key]},${title},'秦朔回应李亮对同一争议的反驳。',false,${sql.json({scope:i===0?'single':'composite'})})`;
    await publishArticle(id, {releasedAt: at});
  }
  const [story] = await sql`INSERT INTO stories(public_id,title) VALUES (${randomUUID()},'字节时间之争') RETURNING id`;
  const factId=randomUUID();
  const [fact] = await sql`INSERT INTO facts(public_id,story_id,title) VALUES (${factId},${story!.id},'秦朔再回应') RETURNING id`;
  await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES (${fact!.id},${ids[0]!},'primary')`;
  await publishArticle(ids[0]!);
  const q={channel:'all' as const,category:null,tag:key,now};
  assert.equal((await loadPool(q)).total,3,'the mistaken composite initially produces a duplicate card');
  await overrideFields(ids[1]!,{fields:{scope:'single'},version:0,reason:'原文核对为同一篇争议报道的转载'},'scope-test');
  await moveToFact(ids[1]!,factId,'核对原稿与转载正文一致','scope-test');
  const result=await loadPool(q);
  assert.equal(result.total,2,'the unrelated multi-topic roundup remains separate');
  const group=result.items.find((item)=>item.group)?.group;
  assert.equal(group?.reportCount,2);
  const reports=await loadGroupReports({factPublicId:factId,scope:'story',channel:'all',category:null,tag:key},now);
  assert.deepEqual(new Set(reports!.reports.map((item)=>item.id)),new Set(ids.slice(0,2)));
});

test("move one response into the dispute without merging the revenue denial", async () => {
  const key = `split-dispute-${tag()}`;
  const at = new Date("2026-10-28T04:00:00Z");
  const now = new Date("2026-10-28T05:00:00Z");
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode) VALUES (${key},'Dispute source','rss','T2','editorial')`;
  const ids = [key+'-qin', key+'-li', key+'-denial'];
  const titles = ['秦朔再回应字节时间争议','李亮再次回应秦朔','红果否认年收入400亿元'];
  const [debate] = await sql`INSERT INTO stories(public_id,title) VALUES (${randomUUID()},'字节时间争议') RETURNING id`;
  const [mixed] = await sql`INSERT INTO stories(public_id,title) VALUES (${randomUUID()},'红果收入辟谣') RETURNING id`;
  const factIds = [randomUUID(),randomUUID(),randomUUID()];
  for (let i=0;i<ids.length;i++) {
    const id=ids[i]!;
    const storyId=i===0?debate!.id:mixed!.id;
    await sql`INSERT INTO articles(id,source_id,identity_key,url,title,discovered_at,timeline_at,grouping_status)
      VALUES (${id},${key},${id},${'https://example.org/'+id},${titles[i]!},${at},${at},'complete')`;
    await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,tags,title_zh,summary_zh,selected,output)
      VALUES (${id},1,'rule','pass','industry',${[key]},${titles[i]!},'原文报道的独立进展。',false,'{"scope":"single"}')`;
    const [fact]=await sql`INSERT INTO facts(public_id,story_id,title) VALUES (${factIds[i]!},${storyId},${titles[i]!}) RETURNING id`;
    await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES (${fact!.id},${id},'report')`;
    await sql`INSERT INTO story_signals(story_id,article_id,participant_key,source_id,kind,observed_at)
      VALUES (${storyId},${id},${key},${key},'editorial',${at})`;
    await publishArticle(id,{releasedAt:at});
  }
  const from=Number(mixed!.id), into=Number(debate!.id);
  const query={channel:'all' as const,category:null,tag:key,now};
  assert.equal((await loadPool(query)).total,2);
  await assert.rejects(moveFactToStory(factIds[1]!,into,from,'旧状态','scope-test'),{code:'conflict'});
  const moved=await moveFactToStory(factIds[1]!,from,into,'同一争议的后续回应','scope-test');
  assert.equal(moved.reports,1);
  const state=await sql`SELECT p.article_id,p.story_id,f.public_id,fa.manual FROM publications p
    JOIN fact_articles fa ON fa.article_id=p.article_id AND fa.role='report'
    JOIN facts f ON f.id=fa.fact_id WHERE p.article_id=ANY(${ids}) ORDER BY p.article_id`;
  assert.equal(Number(state.find(r=>r.article_id===ids[1])!.story_id),into);
  assert.equal(state.find(r=>r.article_id===ids[1])!.public_id,factIds[1]);
  assert.equal(state.find(r=>r.article_id===ids[1])!.manual,true);
  assert.equal(Number(state.find(r=>r.article_id===ids[2])!.story_id),from);
  const reports=await loadGroupReports({factPublicId:factIds[0]!,scope:'story',channel:'all',category:null,tag:key},now);
  assert.deepEqual(new Set(reports!.reports.map(r=>r.id)),new Set(ids.slice(0,2)));
  assert.equal((await loadPool(query)).total,2,'separate revenue denial stays visible');
  const signals=await sql`SELECT story_id,article_id FROM story_signals WHERE article_id=ANY(${ids})`;
  assert.equal(Number(signals.find(s=>s.article_id===ids[1])!.story_id),into);
  assert.equal(Number(signals.find(s=>s.article_id===ids[2])!.story_id),from);
  assert.equal(await mergeStoryInto(from,into,'不能自动重新合并已人工拆分的事件','grouping'),null);
  assert.equal(Number((await sql`SELECT story_id FROM facts WHERE public_id=${factIds[2]!}`)[0]!.story_id),from);
  const audit=await sql`SELECT 1 FROM audit_log WHERE subject=${'fact:'+factIds[1]} AND action='story.move-fact'`;
  assert.equal(audit.length,1);
});
