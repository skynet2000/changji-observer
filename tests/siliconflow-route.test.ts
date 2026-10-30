import { stub, Reply, tag } from './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { z } from 'zod';
import { chatJson } from '@aihot/backend/providers/llm';
import { closeDb, sql } from '@aihot/backend/db';
import { reserveModelCost } from '@aihot/backend/providers/model-cost';
import { failureKind } from '@aihot/backend/providers/model-health';
after(closeDb);
const answer = { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 12, completion_tokens: 6 } };
const ask = (model = 'intern-flash') => chatJson({ model, purpose: 'siliconflow-test', subject: tag(), promptVersion: tag(), system: 'JSON', user: tag(), schema: z.object({ok:z.boolean()}) });
async function providers(middle: Parameters<typeof stub>[0], run: (p:Awaited<ReturnType<typeof stub>>,m:Awaited<ReturnType<typeof stub>>,f:Awaited<ReturnType<typeof stub>>) => Promise<void>) {
 const p=await stub(()=>new Reply(429,{error:'quota exceeded'})),m=await stub(middle),third=await stub(()=>new Reply(402,{error:"Insufficient Balance"})),f=await stub(()=>answer);
 const env={INTERN_BASE_URL:p.url,INTERN_API_KEY:'test',SILICONFLOW_BASE_URL:m.url,SILICONFLOW_API_KEY:'test',AIHUBMIX_BASE_URL:third.url,AIHUBMIX_API_KEY:"test",DEEPSEEK_BASE_URL:f.url,DEEPSEEK_API_KEY:'test'};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 try {await run(p,m,f);}finally{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}await Promise.all([p.close(),m.close(),third.close(),f.close()]);}
}
test('SiliconFlow serves normal and thinking tasks before paid fallback with provider-specific parameters',async()=>{
 const modes:boolean[]=[];
 await providers((_hit,req)=>{const body=JSON.parse(req.body);assert.equal(body.model,'deepseek-ai/DeepSeek-V4.1-Flash');assert.equal(body.thinking,undefined);modes.push(body.enable_thinking);if(body.enable_thinking)assert.equal(body.thinking_budget,12000);return answer;},async(p,m,f)=>{
  assert.equal((await ask()).model,'siliconflow-flash');
  assert.equal((await ask('intern-flash-think')).model,'siliconflow-flash-think');
  assert.deepEqual(modes,[false,true]);assert.equal(f.hits(),0);assert.equal(p.hits(),1);assert.equal(m.hits(),2);
 });
});
test('SiliconFlow 402 is not retried and shares quota cooldown before the official fallback',async()=>{
 assert.equal(failureKind(402,'Insufficient Balance'),'quota');
 await providers(()=>new Reply(402,{error:'Insufficient Balance'}),async(p,m,f)=>{
  const r=await ask();assert.equal(r.model,'deepseek-flash');
  assert.equal((await ask('intern-flash-think')).model,'deepseek-flash-think');
  assert.equal(m.hits(),1);assert.equal(f.hits(),2);
  const rows=await sql`SELECT service,status FROM receipts WHERE subject=(SELECT subject FROM receipts WHERE id=${r.receiptId}) ORDER BY id`;
  assert.deepEqual(rows.map(r=>[r.service,r.status]),[['intern','failed'],['siliconflow','failed'],['aihubmix','failed'],['deepseek','received']]);
 });
});
test('SiliconFlow reserves verified peak prices including a separate reasoning budget under a finite cap',()=>{
 const old=process.env.LLM_DAILY_BUDGET_CNY;process.env.LLM_DAILY_BUDGET_CNY='0.5';
 try{
  const body={model:'deepseek-ai/DeepSeek-V4.1-Flash',max_tokens:512,messages:[{content:'test'}],enable_thinking:true,thinking_budget:12000};
  const result=reserveModelCost('https://api.siliconflow.cn/v1',body)!;
  assert.equal(result.currency,'CNY');assert.equal(result.dailyLimit,0.5);assert.ok(result.maxAmount>=12512*8/1e6);
  assert.throws(()=>reserveModelCost('https://api.siliconflow.cn/other/v1',body));
  assert.throws(()=>reserveModelCost('https://api.siliconflow.cn/v1',{...body,thinking_budget:-1}));
 }finally{if(old===undefined)delete process.env.LLM_DAILY_BUDGET_CNY;else process.env.LLM_DAILY_BUDGET_CNY=old;}
});
