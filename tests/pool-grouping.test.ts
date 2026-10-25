// Confirmed events fold their developments; unrelated, composite and unmatched reports stay separate.
import { tag } from './setup.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { loadTimeline } from '@aihot/backend/publication/timeline';
import { loadPool } from '@aihot/backend/publication/pool';
import { loadGroupReports } from '@aihot/backend/publication/groups';

after(closeDb);
const now = new Date('2026-01-03T12:00:00Z');
async function fixture() {
  const key = `pool-fold-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier) VALUES (${key},${key},'rss','T2'),(${key+'-official'},'Official','rss','T1')`;
  const [story] = await sql`INSERT INTO stories (public_id,title) VALUES (${randomUUID()},'One story') RETURNING id`;
  const fact = async (suffix: string) => (await sql`INSERT INTO facts (public_id,title,story_id) VALUES (${key+suffix},${suffix},${story!.id}) RETURNING id`)[0]!.id as number;
  const add = async (suffix: string, factId: number | null, options: {
    official?: boolean; score?: number; age?: number; publishedAge?: number; category?: string; visibility?: string;
    future?: boolean; eligible?: boolean; role?: string; composite?: boolean; missing?: boolean; title?: string;
  } = {}) => {
    const id = key+suffix, source = key+(options.official ? '-official' : '');
    const at = new Date(+now-(options.age ?? 60_000));
    const title = options.title ?? '千问发布AI眼镜N1';
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,discovered_at,timeline_at)
      VALUES (${id},${source},${id},${'https://example.org/'+id},${title},${at},${at})`;
    const [an] = await sql`INSERT INTO analyses (article_id,input_revision,origin,output)
      VALUES (${id},1,'rule',${sql.json({scope:options.composite ? 'composite' : 'single'})}) RETURNING id`;
    await sql`INSERT INTO publications (article_id,source_id,title,summary,url,channel,category,tags,discovered_at,timeline_at,sort_at,
      selected,eligible,visibility,visible_after,fact_id,story_id,analysis_id,score,search_text)
      VALUES (${id},${source},${title},${title},${'https://example.org/'+id},'news',${options.category ?? 'industry'},${[key]},${at},${at},${at},
        ${options.future ?? false},${options.eligible ?? true},${options.visibility ?? 'public'},${options.future ? new Date(+now+60_000) : at},
        ${factId},${story!.id},${an!.id},${options.score ?? 60},${title.toLowerCase()})`;
    await sql`INSERT INTO pool_search (article_id,direct,body) VALUES (${id},${title.toLowerCase()},${title.toLowerCase()})`;
    if(factId !== null && !options.missing) await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${factId},${id},${options.role ?? 'report'})`;
    if (options.publishedAge !== undefined) await sql`UPDATE publications SET published_at = ${new Date(+now-options.publishedAge)} WHERE article_id = ${id}`;
    return id;
  };
  return {key,fact,add,query:{channel:'all' as const,category:null,tag:key,now}};
}

test('all folds confirmed developments and leads with the latest fact, preserving every report', async()=>{
  const f=await fixture(), launch=await f.fact('-launch'), followup=await f.fact('-followup');
  const first=await f.add('-first',launch,{age:2*86400000});
  await f.add('-duplicate',launch,{score:90});
  const official=await f.add('-official-report',launch,{official:true});
  const development=await f.add('-development',followup,{title:'千问眼镜上市后新增退款政策'});
  const result=await loadPool(f.query);
  assert.equal(result.total,1); assert.equal(result.todayCount,1);
  assert.equal(result.items[0]!.id,development,'latest development beats a higher-scored old fact');
  assert.equal(result.items[0]!.anchorAt,new Date(+now-60_000).toISOString());
  assert.deepEqual(result.items[0]!.group,{factId:f.key+'-followup',reportCount:4,additionalSourceCount:1,scope:'story',developmentCount:2});
  const expanded=await loadGroupReports({factPublicId:f.key+'-followup',scope:'story',...f.query},now);
  assert.deepEqual(new Set(expanded!.reports.map(r=>r.id)),new Set([first,f.key+'-duplicate',official,development]));
  const factOnly=await loadGroupReports({factPublicId:f.key+'-launch',...f.query},now);
  assert.equal(factOnly!.reports.length,3,'home fact groups keep their existing scope');
  await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${official}`;
  const after=await loadPool(f.query);
  assert.equal(after.items[0]!.id,development);
  assert.deepEqual(after.items[0]!.group,{factId:f.key+'-followup',reportCount:3,additionalSourceCount:0,scope:'story',developmentCount:2});
});

test('filters and both search orderings choose a matching report before folding',async()=>{
  const f=await fixture(), fact=await f.fact('-fact');
  await f.add('-official',fact,{official:true,title:'千问推出新品',category:'industry'});
  const match=await f.add('-match',fact,{title:'千问眼镜新增验收说明',category:'ai-products'});
  await f.add('-second-match',fact,{title:'千问眼镜新增验收说明',category:'ai-products',score:50});
  for(const tab of ['time','relevance'] as const){
    const result=await loadPool({...f.query,q:'验收',tab});
    assert.equal(result.total,1);assert.equal(result.items[0]!.id,match);
    assert.equal(result.items[0]!.group!.reportCount,3,'expansion lists all reports under the category/channel/tag filters');
    assert.equal((await loadPool({...f.query,q:'不存在',tab})).total,0);
  }
  const filtered=await loadPool({...f.query,category:'ai-products'});
  assert.equal(filtered.items[0]!.id,match);assert.equal(filtered.items[0]!.group!.reportCount,2);
});

test('composites, mentions, removed memberships and ungrouped articles do not fold; unreleased rows do not count',async()=>{
  const f=await fixture(), fact=await f.fact('-fact');
  await f.add('-report',fact);await f.add('-copy',fact);
  await f.add('-composite',fact,{composite:true});await f.add('-mention',fact,{role:'mention'});
  await f.add('-removed',fact,{missing:true});await f.add('-unmatched',null);
  await f.add('-future',fact,{future:true});await f.add('-withdrawn',fact,{visibility:'withdrawn'});await f.add('-ineligible',fact,{eligible:false});
  const result=await loadPool(f.query);
  assert.equal(result.total,5);assert.equal(result.todayCount,5);
  assert.equal(result.items.filter(i=>i.group).length,1);assert.equal(result.items.find(i=>i.group)!.group!.reportCount,2);
});

test('deduplication precedes pagination and totals, including an empty page',async()=>{
  const f=await fixture(), fact=await f.fact('-many');
  for(let i=0;i<42;i++)await f.add('-copy'+i,fact);
  for(let i=0;i<40;i++)await f.add('-independent'+i,null);
  for(const tab of ['time','relevance'] as const){
    const query={...f.query,q:tab==='relevance'?'千问':null,tab};
    const a=await loadPool(query),b=await loadPool({...query,page:2}),c=await loadPool({...query,page:3});
    assert.deepEqual([a.total,a.pageCount,a.items.length,b.items.length,c.total,c.items.length],[41,2,40,1,41,0]);
    const items=[...a.items,...b.items];assert.equal(new Set(items.map(i=>i.id)).size,41);
    assert.equal(items.filter(i=>i.group).length,1);
  }
});


test('batch ingestion uses original publication dates; old copies do not bump events or merge another incident', async()=>{
  const f=await fixture(), incident=await f.fact('-incident'), recovery=await f.fact('-recovery');
  await f.add('-incident-report',incident,{age:0,publishedAge:3*86400000});
  const latest=await f.add('-recovery-report',recovery,{age:0,publishedAge:2*86400000});
  await f.add('-late-copy',incident,{age:0,publishedAge:1000,score:99});
  const [separate]=await sql`INSERT INTO stories(public_id,title) VALUES (${randomUUID()},'A different outage') RETURNING id`;
  const another=await f.fact('-another-incident');
  await sql`UPDATE facts SET story_id=${separate!.id} WHERE id=${another}`;
  const independent=await f.add('-another-report',another,{age:0,publishedAge:3600000});
  const result=await loadPool(f.query);
  assert.equal(result.total,2);assert.equal(result.todayCount,1);
  assert.deepEqual(result.items.map(i=>i.id),[independent,latest]);
  assert.equal(result.items[1]!.anchorAt,new Date(+now-2*86400000).toISOString());
  const reports=await loadGroupReports({factPublicId:f.key+'-recovery',scope:'story',...f.query},now);
  assert.equal(reports!.reports.length,3);
  assert.equal(reports!.reports.find(r=>r.id===latest)!.timelineAt,new Date(+now-2*86400000).toISOString());
});


test('reader groups include their detailed categories without mixing workplace and business',async()=>{
  const f=await fixture();
  for(const category of ['jobs','workplace','industry','career','tip','ai-products','ecommerce','local-life','ai-models','opinion','policy','paper'])
    await f.add('-category-'+category,null,{category});
  for(const [category,members] of [
    ['industry',['industry','opinion','paper','ai-products','ecommerce','local-life','ai-models','tip']], ['career',['career']],
    ['workplace',['career','workplace']], ['jobs',['jobs']], ['policy',['policy']]
  ] as const){
    const result=await loadPool({...f.query,category});
    assert.deepEqual(new Set(result.items.map(i=>i.category)),new Set(members));
  }
});


test('late selection uses the same publication clock as all; older public copies do not bump a fact',async()=>{
  const f=await fixture(), fact=await f.fact('-publication-clock');
  const chosen=await f.add('-chosen',fact,{age:1000,publishedAge:86400000});
  await sql`UPDATE publications SET selected=true WHERE article_id=${chosen}`;
  await f.add('-earlier-public',fact,{age:1000,publishedAge:2*86400000});
  const newer=await f.add('-newer',null,{age:30000,publishedAge:3600000});
  await sql`UPDATE publications SET selected=true WHERE article_id=${newer}`;
  const selected=await loadTimeline(f.query), all=await loadPool(f.query);
  assert.deepEqual(selected.cards.map(c=>c.item.id),[newer,chosen]);
  for(const card of selected.cards)assert.equal(card.anchorAt,all.items.find(i=>i.id===card.item.id)!.anchorAt);
  assert.equal(selected.cards[1]!.anchorAt,new Date(+now-2*86400000).toISOString());
  const page=await loadTimeline({...f.query,limit:1});
  assert.deepEqual((await loadTimeline({...f.query,limit:1,cursor:page.nextCursor})).cards.map(c=>c.item.id),[chosen]);
});


test('selected and all share one event card, leader, date and expanded developments',async()=>{
  const f=await fixture(), launch=await f.fact('-launch'), response=await f.fact('-response');
  const chosen=await f.add('-selected',launch,{publishedAge:86400000});
  await sql`UPDATE publications SET selected=true WHERE article_id=${chosen}`;
  const followup=await f.add('-followup',response,{publishedAge:3600000});
  const selected=await loadTimeline(f.query), all=await loadPool(f.query);
  assert.equal(selected.cards.length,1);assert.equal(all.total,1);
  assert.equal(selected.cards[0]!.item.id,chosen);assert.equal(all.items[0]!.id,chosen);
  assert.equal(selected.cards[0]!.anchorAt,all.items[0]!.anchorAt);
  assert.deepEqual(selected.cards[0]!.group,all.items[0]!.group);
  const group=selected.cards[0]!.group!;
  assert.equal(group.scope,'story');assert.equal(group.developmentCount,2);
  const reports=await loadGroupReports({factPublicId:group.factId,scope:group.scope,...f.query},now);
  assert.deepEqual(new Set(reports!.reports.map(r=>r.id)),new Set([chosen,followup]));
  await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${chosen}`;
  assert.equal((await loadTimeline(f.query)).cards.length,0);
  assert.equal((await loadPool(f.query)).items[0]!.id,followup);
});
