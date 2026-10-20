// Failure modes, fixed before changing public loaders or prefetch:
// - returning to a page that was already open still needs the network;
// - query variants mix content/SEO, or restores lose their anchor;
// - intent no longer loads data, scroll-through touches download it, or a failed prefetch breaks the current page;
// - visits renew deadlines, expired/errors stay cached, or refresh stops working;
// - Agent tabs choose an invalid panel or leave canonical/history behind;
// - search downloads two whole pages, requests before opening, or never retries/updates suggestions.
// Reader work failures fixed before changing enhancement and return-position code:
// - offscreen code downloads/runs immediately, visible code stays plain, or raw copying changes;
// - tiny/linked pictures become zoom buttons, or language changes keep old handlers;
// - a deep return loses its anchor, or folded dates confuse the anchor search.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { before, after, test } from "node:test";
import { chromium, webkit, expect, type Browser } from "@playwright/test";
import type { FeedItemSummary, SiteItemDetail, ReportDetail } from "@aihot/contracts/site";
import { startWebServer, type WebServer } from "./web-server.ts";

const at = '2026-10-04T08:00:00.000Z';
const item: FeedItemSummary = {id:'navigation-fixture',title:'性能检查文章',summary:'固定摘要',reason:'固定推荐理由',source:{name:'Fixture'},publishedAt:at,timelineAt:at,category:'ai-models',tags:[],score:80,selected:true,channel:'news',x:null};
const detail: SiteItemDetail = {...item,x:null,originalTitle:'Fixture article',links:{original:'https://example.org/article'},discoveredAt:at,story:null,readingMode:'full',author:null,body:{zh:'<p>固定正文</p>',original:null,zhKind:'translation',complete:true},outline:[],relatedStories:[],topics:[],indexable:true,markdownAvailable:true,group:null,hasTranslation:true,bodyLanguage:'zh'};
const codeSource='import json\n\nwith open("data.json") as file:\n    data = json.load(file)\n\nfor record in data:\n    print(record["title"])\n';
const readerBody=Array.from({length:30},(_,i)=>`<p>阅读段落 ${i}：先阅读文章，再查看后面的代码和图片。正文保持可读，图片和代码在需要时增强。</p>`).join('')
  +`<pre><code>${codeSource}</code></pre><pre><code>x = 1</code></pre>`
  +Array.from({length:12},(_,i)=>`<img src="/reader-image/${i}.svg" alt="正文配图 ${i}" width="640" height="360" loading="lazy">`).join('')
  +'<img src="/reader-image/tiny.svg" alt="小图标" width="16" height="16" loading="lazy"><a href="https://example.org"><img src="/reader-image/linked.svg" alt="链接图片" width="640" height="360" loading="lazy"></a>';
const report = (kind:'daily'|'weekly'|'monthly'): ReportDetail => ({kind,key:kind==='daily'?'2026-10-04':kind==='weekly'?'2026-W40':'2026-10',issueNumber:1,title:'Fixture '+kind,generatedAt:at,lead:{title:'Fixture '+kind,leadParagraph:'Fixture report'},leadItemId:null,overview:null,highlights:[],sections:[],flashes:[],cover:null,metrics:{},readingMinutes:1,prev:null,next:null});
const hits: string[] = [];
let suggestionsVersion=1;
let failing='';
let ttl=60;
let emptyTimeline=false;
let web:WebServer;
let origin:string;
let chrome:Browser;
let safari:Browser;
const api=createServer((req,res)=>{
  const url=new URL(req.url!,'http://local');
  const p=url.pathname;
  res.setHeader('Content-Type','application/json');
  if(p==='/api/site/meta') return res.end(JSON.stringify({changelogVersion:'fixture'}));
  if(p==='/api/reader/session') return res.end(JSON.stringify({enabled:false,providers:[],user:null}));
  if(p==='/api/site/track'){res.statusCode=204;return res.end();}
  hits.push(req.url!);
  if(p===failing){res.statusCode=503;return res.end(JSON.stringify({code:'unavailable'}));}
  if(p==='/api/health')return res.end('{}');
  if(p==='/api/site/search/suggestions')return res.end(JSON.stringify({topics:[{slug:'openai',name:'OpenAI',group:'company'}],hot:[{rank:1,title:'建议版本 '+suggestionsVersion,to:'/story/fixture'}]}));
  if(p==='/api/site/topics')return res.end(JSON.stringify({groups:[],topics:[{slug:'openai',name:'OpenAI',group:'company',definition:'Fixture',brand:null,total:0,recent:0,indexable:false,latest:null}]}));
  if(p==='/api/site/hot')return res.end(JSON.stringify({computedAt:at,windowHours:48,entries:[{rank:1,story:{publicId:'fixture',title:'建议版本 '+suggestionsVersion},heat:10,trend:'flat',trendPct:0,badges:[],participantCount:0,sourceCount:0,sourceNames:[],participants:[],spark:[],summary:null,latest:null,cover:null}]}));
  if(p==='/api/site/timeline'){
    res.setHeader('X-Accel-Expires','@'+(Math.floor(Date.now()/1000)+ttl));
    const category=url.searchParams.get('category');
    if(emptyTimeline) return res.end(JSON.stringify({filters:{channel:'all',category,tag:null},cards:[],nextCursor:null,hot:null,dayCounts:{}}));
    const shown={...item,title:category?'分类 '+category:'性能检查文章'};
    if(url.searchParams.get('tag')==='long-reading'){
      const cards=Array.from({length:180},(_,i)=>({key:'long-'+i,anchorAt:i<60?at:'2026-10-03T08:00:00.000Z',item:{...item,id:'long-'+i,title:'长列表文章 '+i,summary:'用于核实深处阅读返回的固定摘要。'.repeat(3)},group:null}));
      return res.end(JSON.stringify({filters:{channel:'all',category:null,tag:'long-reading'},cards,nextCursor:null,hot:null,dayCounts:{'2026-10-04':60,'2026-10-03':120}}));
    }
    return res.end(JSON.stringify({filters:{channel:'all',category,tag:null},cards:[{key:shown.id,anchorAt:at,item:shown,group:null}],nextCursor:null,hot:null,dayCounts:{'2026-10-04':1}}));
  }
  if(p==='/api/site/pool'){
    const page=Number(url.searchParams.get('page')||1);
    return res.end(JSON.stringify({filters:{channel:'all',category:null,tag:null,q:null,tab:'time'},items:[{...item,title:'全部第 '+page+' 页',...(url.searchParams.get('tag')==='group-test'?{group:{factId:'group-fixture',scope:'story',developmentCount:3,reportCount:3,additionalSourceCount:0}}:{})}],page,pageCount:3,total:3,todayCount:1,freshness:at}));
  }
  if(p==='/api/site/items/navigation-fixture')return res.end(JSON.stringify(detail));
  if(p==='/api/site/items/navigation-fixture/original')return res.end(JSON.stringify({...detail,body:{zh:null,original:'<p>Original fixture</p>',zhKind:null,complete:true},bodyLanguage:'original'}));
  if(p==='/api/site/items/reader-fixture')return res.end(JSON.stringify({...detail,id:'reader-fixture',title:'阅读增强检查',body:{...detail.body,zh:readerBody}}));
  if(p==='/api/site/items/reader-fixture/original')return res.end(JSON.stringify({...detail,id:'reader-fixture',title:'阅读增强检查',body:{...detail.body,zh:null,original:'<p>Original reader text</p>'},bodyLanguage:'original'}));
  if(p.startsWith('/api/site/items/long-'))return res.end(JSON.stringify({...detail,id:p.split('/').at(-1),title:'长列表详情'}));
  const kind=p.match(/^\/api\/site\/reports\/(daily|weekly|monthly)\/latest-page$/)?.[1] as 'daily'|'weekly'|'monthly'|undefined;
  if(kind){const r=report(kind);return res.end(JSON.stringify({report:r,index:[{key:r.key,issueNumber:1,title:r.title,count:0}]}));}
  res.statusCode=404;res.end(JSON.stringify({code:'not_found'}));
});

before(async()=>{
  // Started together; whatever started is stopped in after() even when another one failed.
  const started=await Promise.allSettled([
    startWebServer(api).then(w=>{web=w;origin=w.origin;}),
    chromium.launch({channel:'chromium'}).then(b=>{chrome=b;}),
    webkit.launch().then(b=>{safari=b;}),
  ]);
  for(const result of started)if(result.status==='rejected')throw result.reason;
});
after(async()=>{
  await chrome?.close();await safari?.close();
  await web?.stop();
});

// One engine per behaviour: WebKit for what phone readers do (iPhone Safari), Chromium for desktop-only
// intent such as hover. The router and caches are the same code in both.
test('empty home explains its purpose; category navigation preserves the filtered empty state',async()=>{
  emptyTimeline=true;
  try{
    for(const width of [390,1280]){
      const context=await chrome.newContext({viewport:{width,height:900}});
      const page=await context.newPage();
      try{
        await page.goto(origin+'/');
        await expect(page.getByRole('status')).toContainText('精选内容尚未发布');
        await expect(page.getByRole('heading',{name:'职场与组织',exact:true})).toBeVisible();
        await page.getByRole('link',{name:/职场与组织.*组织调整/}).click();
        await expect(page).toHaveURL(/category=career/);
        await expect(page.getByText('这个筛选下还没有精选内容')).toBeVisible();
        await expect(page.getByRole('heading',{name:'看懂业务变化，找到成长方向。'})).toHaveCount(0);
        await page.goBack();
        await expect(page.getByRole('status')).toContainText('精选内容尚未发布');
      }finally{await context.close();}
    }
  }finally{emptyTimeline=false;}
});

test('SSR list and visited query variants return offline without another read',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  try{
    await page.goto(origin+'/');
    await expect(page.getByRole('link',{name:'性能检查文章',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'性能检查文章',exact:true}).click();
    await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    await context.setOffline(true);
    await page.goBack();
    await expect(page.getByRole('link',{name:'性能检查文章',exact:true})).toBeVisible({timeout:1500});
    await context.setOffline(false);
    await page.getByRole('button',{name:/^筛选/}).click();
    await page.getByRole('link',{name:'大厂动态',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 industry',exact:true})).toBeVisible();
    await page.getByRole('button',{name:/^筛选/}).click();
    await page.getByRole('link',{name:'业务与产品',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 ai-products',exact:true})).toBeVisible();
    await context.setOffline(true);
    await page.goBack();
    await expect(page.getByRole('link',{name:'分类 industry',exact:true})).toBeVisible({timeout:1500});
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',origin+'/?category=industry');
  }finally{await context.close();}
});

test('hover still fetches article data, touches that move do not, and failed prefetch does not replace the current page',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.goto(origin+'/');
    const link=page.getByRole('link',{name:'性能检查文章',exact:true});
    const start=hits.length;
    await link.dispatchEvent('touchstart');await link.dispatchEvent('touchmove');
    await page.getByRole('heading',{name:'精选',exact:true}).click();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,0);
    const response=page.waitForResponse(r=>r.url().includes('/items/navigation-fixture.data'));
    await link.hover();await response;
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,1);
    await link.click();await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,1,'navigation reuses its intent-prefetched response');
    const fresh=await chrome.newContext();const freshPage=await fresh.newPage();
    try{
      await freshPage.goto(origin+'/');failing='/api/site/items/navigation-fixture';
      const failed=freshPage.waitForResponse(r=>r.url().includes('/items/navigation-fixture.data')&&r.status()===503);
      await freshPage.getByRole('link',{name:'性能检查文章',exact:true}).hover();await failed;
      await expect(freshPage.getByRole('heading',{name:'精选',exact:true})).toBeVisible();
    }finally{await fresh.close();}
  }finally{failing='';await context.close();}
});

test('SSR all-pages and report kinds return offline with their own content',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.goto(origin+'/all');
    await page.locator('a[href="/all?page=2"]').first().click();
    await expect(page.getByRole('link',{name:'全部第 2 页',exact:true})).toBeVisible();
    await context.setOffline(true);await page.goBack();
    await expect(page.getByRole('link',{name:'全部第 1 页',exact:true})).toBeVisible({timeout:1500});
    await context.setOffline(false);await page.goto(origin+'/daily');
    await page.getByRole('link',{name:'周报',exact:true}).click();
    await expect(page.locator('#report-start')).toContainText('周报');
    await context.setOffline(true);await page.getByRole('link',{name:'日报',exact:true}).click();
    await expect(page.locator('#report-start')).toContainText('日报',{timeout:1500});
  }finally{await context.close();}
});

// A prefetch of the newly selected link must not be mistaken for an explicit refresh of that page.
// Disable HTTP reuse here: otherwise the browser cache can hide a lost document-level result.
test('intent on a selected link preserves visited data and the next revisit starts no data request',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  const requests:string[]=[];
  await context.route('**/*.data*',route=>route.continue());
  page.on('request',request=>{if(request.url().includes('.data'))requests.push(request.url());});
  try{
    await page.goto(origin+'/');
    await page.getByRole('link',{name:'大厂动态',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 industry',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'大厂动态',exact:true}).focus();
    await page.waitForTimeout(150);
    await page.getByRole('link',{name:'业务与产品',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 ai-products',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'业务与产品',exact:true}).focus();
    await page.waitForTimeout(150);
    const before=requests.length;
    await page.getByRole('link',{name:'大厂动态',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 industry',exact:true})).toBeVisible();
    assert.deepEqual(requests.slice(before),[],'neither prefetch nor navigation may evict and reload a still-valid visited page');
  }finally{await context.close();}
});

test('a revisit never renews the original deadline; an expired read shows an error and a reload asks again',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.clock.install();ttl=1;
    await page.goto(origin+'/');
    await page.getByRole('link',{name:'性能检查文章',exact:true}).click();await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    failing='/api/site/timeline';
    await page.clock.runFor(1500);
    await page.goBack();await expect(page.getByRole('heading',{name:'暂时无法加载',exact:true})).toBeVisible();
    failing='';ttl=60;
    await page.reload();await expect(page.getByRole('link',{name:'性能检查文章',exact:true})).toBeVisible();
  }finally{ttl=60;failing='';await context.close();}
});

test('SSR freshness spent in an upstream cache is not renewed by HTML hydration',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    ttl=0;await page.goto(origin+'/');
    await page.getByRole('link',{name:'性能检查文章',exact:true}).click();await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    const start=hits.length;ttl=60;
    await page.goBack();await expect(page.getByRole('link',{name:'性能检查文章',exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/timeline')).length,1);
  }finally{ttl=60;await context.close();}
});

test('Agent tabs finish offline with matching canonical; invalid direct tabs and anchored links keep a panel',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.goto(origin+'/agent');
    await context.setOffline(true);
    await page.getByRole('tablist',{name:'接入方式'}).getByRole('tab',{selected:true}).click();
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    for(const [tab,name] of [['mcp',/^MCP/],['rss',/^RSS/],['api',/^REST API/]] as const){
      const choice=page.getByRole('tab',{name});
      // The active track was exercised above; compare navigation through every remaining track.
      if(await choice.getAttribute('aria-selected')==='true')continue;
      const target=await choice.getAttribute('href');
      await choice.click();
      await expect(page).toHaveURL(origin+target,{timeout:1500});
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',origin+target);
      await expect(page.locator('#agent-panel')).toHaveAttribute('aria-labelledby','agent-tab-'+tab);
      await expect(page.locator('#agent-panel')).not.toBeEmpty();
    }
    await context.setOffline(false);
    await page.goto(origin+'/agent?tab=unknown');
    await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    await page.goto(origin+'/agent#agent-api-recovery');
    await expect(page.locator('#agent-api-recovery')).toBeVisible();
  }finally{await context.close();}
});

test('phone suggestions load only on opening, use one small read, retry failures and update on reopening',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  try{
    suggestionsVersion=1;await page.goto(origin+'/');
    assert.equal(hits.filter(x=>x==='/api/site/search/suggestions').length,0);
    let start=hits.length;
    await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.getByRole('link',{name:'1 建议版本 1',exact:true})).toBeVisible();
    assert.deepEqual(hits.slice(start),['/api/site/search/suggestions']);
    await page.getByRole('button',{name:'取消',exact:true}).click();
    suggestionsVersion=2;start=hits.length;
    await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.getByRole('link',{name:'1 建议版本 2',exact:true})).toBeVisible();
    assert.deepEqual(hits.slice(start),['/api/site/search/suggestions']);
    await page.getByRole('button',{name:'取消',exact:true}).click();
    failing='/api/site/search/suggestions';await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.getByRole('link',{name:'1 建议版本 2',exact:true})).not.toBeVisible();
    await page.getByRole('button',{name:'取消',exact:true}).click();failing='';suggestionsVersion=3;
    await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.getByRole('link',{name:'1 建议版本 3',exact:true})).toBeVisible();
  }finally{failing='';await context.close();}
});

test('reader enhancements wait for visible code and update only the picture that loaded',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const scripts:string[]=[];page.on('request',r=>{if(r.url().includes('/assets/')&&r.url().includes('highlight-'))scripts.push(r.url());});
  await page.route('**/reader-image/*.svg',route=>route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${route.request().url().endsWith('/tiny.svg')?16:640}" height="360"><rect width="640" height="360" fill="red"/></svg>`}));
  try{
    await page.goto(origin+'/items/reader-fixture');
    await expect(page.getByRole('heading',{name:'阅读增强检查',exact:true})).toBeVisible();
    await expect(page.locator('.code-block-copy')).toHaveCount(2);
    assert.deepEqual(scripts,[],'reading the introduction must not download the offscreen highlighter');
    const source=page.locator('.prose pre code').first();
    assert.equal(await source.textContent(),codeSource);
    await source.scrollIntoViewIfNeeded();
    await expect(source).toHaveClass(/hljs/);
    assert.equal(await source.textContent(),codeSource,'colouring preserves the copyable text');
    assert.equal(scripts.length,1);
    await page.locator('.code-block-copy').first().click();
    await expect(page.locator('.code-block-copy').first()).toHaveText('已复制');
    assert.equal(await page.locator('.prose pre code').nth(1).textContent(),'x = 1');
    for(let i=0;i<12;i++){
      const picture=page.locator(`.prose img[alt="正文配图 ${i}"]`);
      await picture.scrollIntoViewIfNeeded();
      await expect(picture).toHaveAttribute('role','button');
    }
    const tiny=page.locator('.prose img[alt="小图标"]');await tiny.scrollIntoViewIfNeeded();
    await expect(tiny).not.toHaveAttribute('role','button');
    await expect(page.locator('.prose a img')).not.toHaveAttribute('role','button');
    await page.getByRole('navigation',{name:'正文语言'}).getByRole('link',{name:'原文',exact:true}).click();
    await expect(page.getByText('Original reader text',{exact:true})).toBeVisible();
    assert.equal(await page.locator('.code-block-copy').count(),0);
  }finally{await context.close();}
});

test('deep reading returns to its anchor, including folded dates',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  try{
    await page.goto(origin+'/?tag=long-reading');
    await expect(page.locator('[data-card-key]')).toHaveCount(180);
    await page.getByRole('button',{name:'收起10月4日',exact:true}).click();
    await expect(page.locator('[data-card-key]')).toHaveCount(120);
    await page.getByRole('link',{name:'长列表文章 160',exact:true}).scrollIntoViewIfNeeded();
    const before=await page.evaluate(()=>{
      const first=[...document.querySelectorAll<HTMLElement>('[data-card-key]')].find(e=>e.getBoundingClientRect().bottom>72)!;
      return {key:first.dataset.cardKey!,top:first.getBoundingClientRect().top};
    });
    await page.getByRole('link',{name:'长列表文章 160',exact:true}).click();
    await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-card-key]')).toHaveCount(120);
    await expect.poll(()=>page.locator(`[data-card-key="${before.key}"]`).evaluate((e,top)=>Math.abs(e.getBoundingClientRect().top-top),before.top)).toBeLessThan(2);
    await expect(page.getByRole('button',{name:'展开10月4日',exact:true})).toBeVisible();
  }finally{await context.close();}
});


test('event reports recover from invalid responses, timeouts and stale refreshes on phone and desktop',async()=>{
  for(const width of [390,1280]){
    const context=await chrome.newContext({viewport:{width,height:900}});
    const page=await context.newPage();
    let response:'invalid'|'ok'|'error'|'empty'|'timeout'='invalid';
    let requests=0;
    try{
      await page.route('**/api/site/groups/**/reports*',async route=>{
        requests++;
        if(response==='timeout'){await route.abort('timedout');return;}
        await route.fulfill({status:response==='error'?503:200,contentType:'application/json',body:JSON.stringify(
          response==='invalid'?{reports:[null]}: {factId:'group-fixture',reports:response==='empty'?[]:[
            {id:'other-report',title:'服务恢复进展',source:{name:'测试媒体'},timelineAt:at,originalUrl:'https://example.org/report'}
          ]})});
      });
      await page.goto(origin+'/all?tag=group-test');
      const toggle=page.getByRole('button',{name:'3 条进展 · 3 篇报道',exact:true}).filter({visible:true});
      await toggle.click();
      const retry=page.getByRole('button',{name:'暂时无法加载，点此重试',exact:true});
      await expect(retry).toBeVisible();
      response='timeout';await retry.click();await expect(retry).toBeVisible();
      response='ok';await retry.click();
      await expect(page.getByText('服务恢复进展',{exact:true})).toBeVisible();
      await expect(page.getByText('10月4日 16:00',{exact:true})).toBeVisible();
      if(width===390){
        await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
        response='error';await toggle.click();
        const staleRetry=page.getByRole('button',{name:'更新失败，当前为上次内容，点此重试',exact:true});
        await expect(staleRetry).toBeVisible();
        await expect(page.getByText('服务恢复进展',{exact:true})).toBeVisible();
        response='empty';await staleRetry.click();
        await expect(page.getByText('暂无其他可显示的报道',{exact:true})).toBeVisible();
        await expect(page.getByText('服务恢复进展',{exact:true})).toHaveCount(0);
      }
      assert.ok(requests>=3);
    }finally{await context.close();}
  }
});


test('reader navigation has four categories on desktop and phone; old model links select business',async()=>{
  const labels=['全部','大厂动态','职场与组织','业务与产品','行业观察'];
  for(const width of [390,1280]){
    const context=await chrome.newContext({viewport:{width,height:900}});
    const page=await context.newPage();
    try{
      await page.goto(origin+'/');
      if(width===390){
        await page.getByRole('button',{name:'筛选',exact:true}).click();
        const dialog=page.getByRole('dialog');
        for(const label of ['不限',...labels.slice(1)])await expect(dialog.getByRole('link',{name:label,exact:true})).toBeVisible();
        await expect(dialog.getByRole('link')).toHaveCount(5);
      }else{
        const nav=page.getByRole('navigation',{name:'筛选',exact:true});
        assert.deepEqual(await nav.getByRole('link').allTextContents(),labels);
      }
      await page.goto(origin+'/?category=ai-models');
      await expect(page.getByRole('link',{name:'分类 ai-products',exact:true})).toBeVisible();
      if(width===390)await expect(page.getByRole('link',{name:'取消筛选：业务与产品',exact:true})).toBeVisible();
      else await expect(page.getByRole('navigation',{name:'筛选',exact:true}).getByRole('link',{name:'业务与产品',exact:true})).toHaveAttribute('aria-current','page');
    }finally{await context.close();}
  }
});
