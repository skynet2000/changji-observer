import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { startWebServer, type WebServer } from "./web-server.ts";

const at = "2026-10-26T08:00:00Z";
const item: SiteItemDetail = {id:"unverified-fixture",title:"用户转述某互联网公司招聘情况",summary:"【未经独立核实】用户转述招聘情况，不代表企业确认。",reason:null,source:{name:"脉脉 · 公开原帖"},publishedAt:at,timelineAt:at,discoveredAt:at,category:"jobs",tags:["未经独立核实"],score:null,selected:false,channel:"news",x:null,originalTitle:null,links:{original:"https://example.org/original-post"},story:null,readingMode:"summary-only",author:"测试用户",body:{zh:null,original:null,zhKind:null,complete:false},outline:[],relatedStories:[],topics:[],indexable:true,markdownAvailable:true,group:null,hasTranslation:false,bodyLanguage:"original"};
const api=createServer((req,res)=>{
 const p=new URL(req.url!,"http://local").pathname;res.setHeader("Content-Type","application/json");
 if(p==="/api/site/meta")return res.end(JSON.stringify({changelogVersion:"fixture"}));
 if(p==="/api/reader/session")return res.end(JSON.stringify({enabled:false,providers:[],user:null}));
 if(p==="/api/health")return res.end("{}");
 if(p==="/api/site/track"){res.statusCode=204;return res.end();}
 if(p==="/api/site/items/unverified-fixture")return res.end(JSON.stringify(item));
 if(p==="/api/site/pool")return res.end(JSON.stringify({filters:{channel:"all",category:null,tag:null,q:null,tab:"time"},items:[item],page:1,pageCount:1,total:1,todayCount:1,freshness:at}));
 if(p==="/api/site/timeline")return res.end(JSON.stringify({filters:{channel:"all",category:null,tag:null},cards:[{key:item.id,anchorAt:at,item,group:null}],nextCursor:null,hot:null,dayCounts:{"2026-10-26":1}}));
 if(p==="/api/site/hot")return res.end(JSON.stringify({computedAt:at,entries:[],windowHours:48}));
 if(p==="/api/language/texts")return res.end(JSON.stringify({translations:[]}));
 res.statusCode=404;res.end('{}');
});
let web:WebServer;let browser:Browser;
before(async()=>{web=await startWebServer(api);browser=await chromium.launch({channel:"chromium"});});
after(async()=>{await browser?.close();await web?.stop();});
for(const width of [390,1440])test(`unverified notice stays visible on feed and detail at ${width}px without selection`,async()=>{
 const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();
 try{
  await page.goto(web.origin+"/all");
  await expect(page.locator('article[data-item-id="unverified-fixture"]').getByText('未经独立核实',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:item.title,exact:true}).click();
  await expect(page.locator('article').getByText('未经独立核实',{exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'Switch to English',exact:true}).click();
  await expect(page.locator('article').getByText('Not independently verified',{exact:true})).toBeVisible();
 }finally{await context.close();}
});
