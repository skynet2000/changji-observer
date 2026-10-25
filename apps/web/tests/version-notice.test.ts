import assert from "node:assert/strict";
import { createServer } from "node:http";
import { before, after, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { startWebServer, type WebServer } from "./web-server.ts";
let release = "old-release", healthOk = true, web: WebServer, browser: Browser;
const api = createServer((req,res) => {
  res.setHeader("content-type","application/json");
  const p=new URL(req.url!,"http://fixture").pathname;
  if(p==='/api/health'){ if(!healthOk)res.statusCode=503; return res.end(JSON.stringify({ok:healthOk,release})); }
  if(p==='/api/site/meta')return res.end('{"changelogVersion":null}');
  if(p==='/api/reader/session')return res.end('{"enabled":false,"providers":[],"user":null}');
  if(p==='/api/language/lookup')return res.end('{"translations":{}}');
  if(p==='/api/site/pool')return res.end('{"filters":{"category":null,"tag":null,"q":null,"tab":"time"},"items":[],"total":0,"page":1,"pageCount":1,"todayCount":0,"freshness":"2026-10-25T00:00:00Z"}');
  if(p==='/api/site/timeline')return res.end('{"filters":{"category":null,"tag":null,"channel":"all"},"cards":[],"nextCursor":null,"hot":null,"dayCounts":{}}');
  res.end('{}');
});
before(async()=>{web=await startWebServer(api,{AIHOT_RELEASE:'old-release'});browser=await chromium.launch({channel:'chromium'});});
after(async()=>{await browser?.close();await web?.stop();});

test('healthy old tabs offer a responsive update choice; failures never reload and edits require confirmation',async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  try{
    const healthProbe=()=>page.waitForResponse(r=>new URL(r.url()).pathname==='/api/health');
    const advanceProbe=async()=>{const response=healthProbe();await page.clock.fastForward(301000);const result=await response;await result.finished();return result;};
    release='old-release';healthOk=true;await page.clock.install();
    // Let hydration and the initial HTTP probe finish before jumping the simulated clock.
    const initial=healthProbe();await page.goto(web.origin+'/all?tag=version-check#reading');await(await initial).finished();
    await expect(page.getByText('网站已更新',{exact:true})).toHaveCount(0);
    release='new-release';healthOk=false;assert.equal((await advanceProbe()).status(),503);
    await expect(page.getByText('网站已更新',{exact:true})).toHaveCount(0);
    healthOk=true;assert.equal((await advanceProbe()).status(),200);
    await expect(page.getByText('网站已更新',{exact:true})).toBeVisible();
    const box=await page.getByRole('status').filter({hasText:'网站已更新'}).boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=390);
    await page.evaluate(()=>{const t=document.createElement('textarea');t.setAttribute('aria-label','未保存输入');document.body.append(t);});
    await page.getByRole('textbox',{name:'未保存输入'}).fill('未提交');
    page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'刷新查看',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'未保存输入'})).toHaveValue('未提交');
    await page.getByRole('button',{name:'稍后',exact:true}).click();await advanceProbe();
    await expect(page.getByText('网站已更新',{exact:true})).toHaveCount(0);
    release='third-release';await advanceProbe();await expect(page.getByText('网站已更新',{exact:true})).toBeVisible();
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'刷新查看',exact:true}).click();
    await page.waitForLoadState('domcontentloaded');assert.ok(page.url().endsWith('/all?tag=version-check#reading'));
  }finally{await context.close();}
});
