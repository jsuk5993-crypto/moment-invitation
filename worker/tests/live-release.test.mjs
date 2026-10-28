import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{isEnabled,isReaderReady,merchantReady} from '../src/worker.mjs';
const base=()=>({
 DEPLOYMENT_KIND:'public-live',PAYMENTS_MODE:'live',PAYMENTS_ACTIVE:'true',
 LIVE_LAUNCH_APPROVED:'true',LIVE_PG_APPROVED:'true',
 PUBLIC_ORIGIN:'https://moment.example.com',TOSS_CLIENT_KEY:'live_ck_fixture',
 TOSS_SECRET_KEY:'live_sk_fixture',DB:{},PREMIUM_ASSETS:{},
 SELLER_NAME:'테스트 상점',SELLER_REPRESENTATIVE:'테스트 대표',SELLER_ADDRESS:'서울시 테스트로 100',
 SELLER_PHONE:'02-1234-5678',SELLER_EMAIL:'merchant@example.com',
 SELLER_REGISTRATION_NUMBER:'123-45-67890',SELLER_ECOMMERCE_REPORT:'2026-서울테스트-0001',
 STAGING_ASSETS:{fetch:async()=>new Response('<h1>상품 준비 중</h1>',{headers:{'content-type':'text/html'}})}
});
const req=(path,method='GET',origin)=>new Request('https://moment.example.com'+path,{method,headers:origin?{origin}:{}});
test('RC1 release gate fails closed until every seller/PG condition is satisfied',()=>{
 const good=base();assert.equal(merchantReady(good),true);assert.equal(isEnabled(good),true);
 for(const k of ['LIVE_LAUNCH_APPROVED','LIVE_PG_APPROVED','SELLER_ADDRESS','SELLER_EMAIL','SELLER_REGISTRATION_NUMBER','SELLER_ECOMMERCE_REPORT','TOSS_SECRET_KEY','PUBLIC_ORIGIN','DB','PREMIUM_ASSETS']){
   const bad={...good,[k]:k==='DB'||k==='PREMIUM_ASSETS'?null:''};
   assert.equal(isEnabled(bad),false,'should not go live without '+k);
 }
 assert.equal(isEnabled({...good,DEPLOYMENT_KIND:'staging'}),false);
 assert.equal(isEnabled({...good,PAYMENTS_MODE:'test'}),false);
 assert.equal(isEnabled({...good,TOSS_CLIENT_KEY:'test_ck_fixture'}),false);
});
test('RC1 public website is separate from locked TEST page; API checkout remains disabled until approved',async()=>{
 const blocked={...base(),LIVE_LAUNCH_APPROVED:'false'};
 const page=await worker.fetch(req('/'),blocked);
 assert.equal(page.status,200);
 assert.match(await page.text(),/상품 준비 중/);
 const cfg=await worker.fetch(req('/api/config'),blocked);
 assert.equal(cfg.status,200);
 assert.equal((await cfg.json()).enabled,false);
 const missingOrigin=await worker.fetch(req('/api/orders','POST'),base());
 assert.equal(missingOrigin.status,403);
 assert.equal((await missingOrigin.json()).error,'origin_required');
 const wrong=await worker.fetch(req('/api/config','GET','https://evil.invalid'),base());
 assert.equal(wrong.status,403);
});
test('RC1 production cannot be unlocked with test credentials or a staging session',async()=>{
 const e={...base(),PAYMENTS_MODE:'test',TEST_ACCESS_SECRET:'not-a-real-access-secret-of-at-least-24'};
 const res=await worker.fetch(req('/api/config'),e);
 assert.equal(res.status,503);
 assert.equal(isReaderReady(e),false);
 const page=await worker.fetch(req('/'),e);
 assert.equal(page.status,503);
});
