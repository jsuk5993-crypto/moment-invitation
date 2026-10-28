import {test} from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/worker.mjs';
const testOrigin = 'https://jsuk5993-crypto.github.io';
const env = {PAYMENTS_ACTIVE:'false',PAYMENTS_MODE:'test',PUBLIC_ORIGIN:testOrigin};
const req=(method,path,origin=testOrigin)=>new Request('https://moment-payments-test.example.workers.dev'+path,{method,headers:{origin}});

test('Build16 bootstrap health is available without DB, R2, or Toss credentials',async()=>{
 const response=await app.fetch(req('GET','/api/health'),env);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.deepEqual(body,{ok:true,service:'moment-payments',build:'39',paymentsEnabled:false});
 assert.equal(response.headers.get('access-control-allow-origin'),testOrigin);
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('Build16 bootstrap does not expose a payment button or accept orders',async()=>{
 const config=await app.fetch(req('GET','/api/config'),env);
 assert.equal(config.status,503);
 assert.equal((await config.json()).error,'test_access_unconfigured');
 const order=await app.fetch(new Request('https://moment-payments-test.example.workers.dev/api/orders',{
  method:'POST',headers:{origin:testOrigin,'content-type':'application/json'},body:'{}'
 }),env);
 assert.equal(order.status,503);
 assert.equal((await order.json()).error,'test_access_unconfigured');
});
test('Build16 wrong-origin bootstrap requests are blocked',async()=>{
 const response=await app.fetch(req('GET','/api/health','https://attacker.example'),env);
 assert.equal(response.status,403);
});

test('Build17 DB status is disabled when no binding is set',async()=>{
 const response=await app.fetch(req('GET','/api/db-health'),env);
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{ok:false,databaseConnected:false,ordersTableReady:false});
});
test('Build17 DB status checks that the real orders table exists',async()=>{
 const readyEnv={...env, DB:{prepare(sql){
   assert.match(sql,/sqlite_master/);
   return {first:async()=>({name:'orders'})};
 }}};
 const response=await app.fetch(req('GET','/api/db-health'),readyEnv);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,databaseConnected:true,ordersTableReady:true});
 const missingEnv={...env,DB:{prepare:()=>({first:async()=>null})}};
 const noTable=await app.fetch(req('GET','/api/db-health'),missingEnv);
 assert.equal(noTable.status,503);
 assert.deepEqual(await noTable.json(),{ok:false,databaseConnected:true,ordersTableReady:false});
});

test('Build18 R2 readiness returns 503 without private bucket binding',async()=>{
 const response=await app.fetch(req('GET','/api/r2-health'),env);
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{ok:false,storageConnected:false,assetsReady:0,assetsExpected:6});
});
test('Build18 R2 readiness reports all six private objects without serving bytes',async()=>{
 const keys=[];
 const readyEnv={...env, PREMIUM_ASSETS:{
   async head(key){ keys.push(key); return {key}; },
   async get(){ throw new Error('readable object GET must not happen in readiness check'); }
 }};
 const response=await app.fetch(req('GET','/api/r2-health'),readyEnv);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,storageConnected:true,assetsReady:6,assetsExpected:6});
 assert.deepEqual(keys.sort(),['premium/city.webp','premium/disco.webp','premium/med.webp','premium/retro.webp','premium/stars.webp','premium/sunset.webp']);
});
test('Build18 R2 reports missing assets safely and keeps payment disabled',async()=>{
 const partialEnv={...env,PREMIUM_ASSETS:{head:async key=>key==='premium/disco.webp'?null:{key}}};
 const status=await app.fetch(req('GET','/api/r2-health'),partialEnv);
 assert.equal(status.status,503);
 assert.deepEqual(await status.json(),{ok:false,storageConnected:true,assetsReady:5,assetsExpected:6});
 const order=await app.fetch(new Request('https://moment-payments-test.example.workers.dev/api/orders',{method:'POST',headers:{origin:testOrigin,'content-type':'application/json'},body:'{}'}),partialEnv);
 assert.equal(order.status,503);
 assert.equal((await order.json()).error,'test_access_unconfigured');
});

test('Build19 payment readiness exposes only key-format booleans, with checkout still OFF',async()=>{
 const valid={...env,PAYMENTS_ACTIVE:'false',TOSS_CLIENT_KEY:'test_ck_example',TOSS_SECRET_KEY:'test_sk_example',
   DB:{},PREMIUM_ASSETS:{}};
 const response=await app.fetch(req('GET','/api/payment-setup'),valid);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,mode:'test',clientKeyPresent:true,secretKeyPresent:true,
   clientKeyConfigured:true,secretKeyConfigured:true,orderDatabaseBound:true,premiumStorageBound:true,paymentSwitchActive:false,
   build:'39',testAccessRequired:true,testAccessSecretConfigured:false,
   testAccessReady:false,publicOriginConfigured:true,paymentsEnabled:false});
 const responseText=await (await app.fetch(req('GET','/api/payment-setup'),valid)).text();
 assert.equal(responseText.includes('test_ck_example'),false);
 assert.equal(responseText.includes('test_sk_example'),false);
});
test('Build19 refuses widget-only gck/gsk keys for payment() checkout',async()=>{
 const mismatched={...env,PAYMENTS_ACTIVE:'true',TOSS_CLIENT_KEY:'test_gck_example',
   TOSS_SECRET_KEY:'test_gsk_example',DB:{},PREMIUM_ASSETS:{}};
 const status=await app.fetch(req('GET','/api/payment-setup'),mismatched);
 const info=await status.json();
 assert.equal(info.clientKeyConfigured,false);
 assert.equal(info.secretKeyConfigured,false);
 assert.equal(info.paymentsEnabled,false);
 const cfg=await app.fetch(req('GET','/api/config'),mismatched);
 assert.equal(cfg.status,503);
 assert.equal((await cfg.json()).error,'test_access_unconfigured');
});

test('Build23 setup diagnostics isolate the stage password and disabled switch without returning secrets',async()=>{
 const base={...env,PAYMENTS_ACTIVE:'true',TEST_ACCESS_REQUIRED:'true',TEST_ACCESS_SECRET:'a'.repeat(32),
  TOSS_CLIENT_KEY:'test_ck_secret-never-display',TOSS_SECRET_KEY:'test_sk_secret-never-display',
  DB:{},PREMIUM_ASSETS:{}};
 const ready=await app.fetch(req('GET','/api/payment-setup'),base);
 const checks=await ready.json();
 assert.equal(checks.paymentsEnabled,true);
 assert.equal(checks.paymentSwitchActive,true);
 assert.equal(checks.testAccessRequired,true);
 assert.equal(checks.testAccessReady,true);
 const raw=JSON.stringify(checks);
 assert.equal(raw.includes(base.TEST_ACCESS_SECRET),false);
 assert.equal(raw.includes(base.TOSS_SECRET_KEY),false);
 const short=await (await app.fetch(req('GET','/api/payment-setup'),{...base,TEST_ACCESS_SECRET:'short'})).json();
 assert.equal(short.testAccessReady,false);
 assert.equal(short.paymentsEnabled,false);
 const off=await (await app.fetch(req('GET','/api/payment-setup'),{...base,PAYMENTS_ACTIVE:'false'})).json();
 assert.equal(off.paymentSwitchActive,false);
 assert.equal(off.paymentsEnabled,false);
});

test('Build28 diagnostics distinguish missing secret bindings from wrong key format without disclosure',async()=>{
 const base={...env,DB:{},PREMIUM_ASSETS:{}};
 const missing=await (await app.fetch(req('GET','/api/payment-setup'),base)).json();
 assert.equal(missing.build,'39');
 assert.equal(missing.clientKeyPresent,false);
 assert.equal(missing.secretKeyPresent,false);
 assert.equal(missing.clientKeyConfigured,false);
 assert.equal(missing.secretKeyConfigured,false);
 const wrong={...base,TOSS_CLIENT_KEY:'test_gck_redacted',TOSS_SECRET_KEY:'test_gsk_redacted'};
 const misconfigured=await (await app.fetch(req('GET','/api/payment-setup'),wrong)).json();
 assert.equal(misconfigured.clientKeyPresent,true);
 assert.equal(misconfigured.secretKeyPresent,true);
 assert.equal(misconfigured.clientKeyConfigured,false);
 assert.equal(misconfigured.secretKeyConfigured,false);
 const output=JSON.stringify(misconfigured);
 assert.equal(output.includes('test_gck_redacted'),false);
 assert.equal(output.includes('test_gsk_redacted'),false);
});

test('Build36 hotfix: public UI health checks staged CSS and JS without returning private page contents',async()=>{
 const good={
  ...env,
  STAGING_ASSETS:{async fetch(request){
    const path=new URL(request.url).pathname;
    return new Response(path.endsWith('.css')?'/* Build 36 hotfix: the legacy app globally sets input */':path.endsWith('success.html')?'moment_pending_confirm_v1':path.endsWith('index.html')?'function b12PNGValid(bytes) INVALID_PNG_PAIR b12-zip-help PNG 2장이 담긴 ZIP 다운로드를 요청했어요':'구매 안내를 확인하려면 위 안내문 아래의 네모 체크박스 · 기존 결제 승인 다시 확인 · MOMENT-recovery-code.txt · moment-recovery-download · moment-premium-go-studio · 프리미엄 배경 다운로드 확인 중');
  }}
 };
 const valid=await app.fetch(req('GET','/api/ui-health'),good);
 assert.equal(valid.status,200);
 assert.deepEqual(await valid.json(),{ok:true,checkboxStyleReady:true,checkoutClientReady:true,checkoutResumeReady:true,recoveryBackupReady:true,premiumDeliveryGuideReady:true,pngZipVerified:true});
 const missing=await app.fetch(req('GET','/api/ui-health'),env);
 assert.equal(missing.status,503);
 assert.deepEqual(await missing.json(),{ok:false,checkboxStyleReady:false,checkoutClientReady:false,checkoutResumeReady:false,recoveryBackupReady:false,premiumDeliveryGuideReady:false,pngZipVerified:false});
 const wrong=await app.fetch(req('GET','/api/ui-health'),{...env,STAGING_ASSETS:{fetch:async()=>new Response('old-version')}});
 assert.equal(wrong.status,503);
 assert.equal((await wrong.json()).ok,false);
});
