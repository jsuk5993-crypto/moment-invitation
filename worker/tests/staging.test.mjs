import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import {stageGateReady} from '../src/staging.mjs';
const base='https://moment-payments-test.example.workers.dev';
const env={TEST_ACCESS_REQUIRED:'true',PAYMENTS_MODE:'test',PAYMENTS_ACTIVE:'false',
 TEST_ACCESS_SECRET:'QA-not-a-public-password-2026-please-change',
 PUBLIC_ORIGIN:'https://jsuk5993-crypto.github.io',
 STAGING_ASSETS:{async fetch(){return new Response('<h1>Test editor</h1>',{headers:{'content-type':'text/html'}})}}};
const req=(path,opts={})=>new Request(base+path,opts);
async function cookie(){
 const data=new URLSearchParams({access_code:env.TEST_ACCESS_SECRET});
 const res=await worker.fetch(req('/__test/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:data.toString()}),env);
 assert.equal(res.status,303);
 const value=res.headers.get('set-cookie');assert.match(value,/HttpOnly.*SameSite=Lax/);
 return value.split(';')[0];
}
test('Stage requires Cloudflare secret before serving the editor',async()=>{
 const bad=await worker.fetch(req('/'),{...env,TEST_ACCESS_SECRET:undefined});
 assert.equal(bad.status,503);
 assert.equal(stageGateReady({...env,TEST_ACCESS_SECRET:undefined}),false);
 const anon=await worker.fetch(req('/'),env);
 assert.equal(anon.status,200);
 assert.match(await anon.text(),/테스트 접근 코드/);
 assert.equal(anon.headers.get('cache-control'),'no-store');
});
test('Wrong password receives no cookie',async()=>{
 const body=new URLSearchParams({access_code:'wrong'}).toString();
 const res=await worker.fetch(req('/__test/login',{method:'POST',body,headers:{'content-type':'application/x-www-form-urlencoded'}}),env);
 assert.equal(res.status,401);
 assert.equal(res.headers.get('set-cookie'),null);
});
test('Correct password gets HttpOnly cookie and editor',async()=>{
 const session=await cookie();
 const page=await worker.fetch(req('/',{headers:{cookie:session}}),env);
 assert.equal(page.status,200);
 assert.match(await page.text(),/Test editor/);
 const logout=await worker.fetch(req('/__test/logout',{headers:{cookie:session}}),env);
 assert.equal(logout.status,303);
 assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});
test('Anonymous requests never reach protected payment APIs',async()=>{
 const cfg=await worker.fetch(req('/api/config'),env);
 assert.equal(cfg.status,401);
 assert.equal((await cfg.json()).error,'test_access_required');
 const order=await worker.fetch(req('/api/orders',{method:'POST',body:'{}',headers:{origin:base,'content-type':'application/json'}}),env);
 assert.equal(order.status,401);
});
test('Health works anonymously while checkout remains OFF with session',async()=>{
 const session=await cookie();
 const health=await worker.fetch(req('/api/health'),env);
 assert.equal(health.status,200);
 const cfg=await worker.fetch(req('/api/config',{headers:{cookie:session}}),env);
 assert.equal(cfg.status,200);
 const value=await cfg.json();
 assert.equal(value.enabled,false);
 assert.equal(value.clientKey,null);
});
test('Invalid origin rejected even with valid session',async()=>{
 const session=await cookie();
 const res=await worker.fetch(req('/api/config',{headers:{cookie:session,origin:'https://attacker.example'}}),env);
 assert.equal(res.status,403);
});

test('Build22: test checkout enabled only for signed session',async()=>{
 const on={...env,PAYMENTS_ACTIVE:'true',TOSS_CLIENT_KEY:'test_ck_qa',TOSS_SECRET_KEY:'test_sk_qa',
  DB:{prepare(){return {bind(){return {run:async()=>({meta:{changes:1}})}}}}},PREMIUM_ASSETS:{}};
 assert.equal((await worker.fetch(req('/api/config'),on)).status,401);
 const session=await cookie();
 const config=await worker.fetch(req('/api/config',{headers:{cookie:session}}),on);
 assert.equal(config.status,200);
 assert.deepEqual(await config.json(),{enabled:true,mode:'test',amount:9900,currency:'KRW',clientKey:'test_ck_qa'});
 const order=await worker.fetch(req('/api/orders',{method:'POST',headers:{cookie:session,'content-type':'application/json',origin:base},body:'{}'}),on);
 assert.equal(order.status,201);
 const payload=await order.json();assert.equal(payload.amount,9900);
 assert.match(payload.checkoutSecret,/^[a-f0-9]{64}$/);
});
test('Build22: accidentally setting LIVE while staging never enables checkout',async()=>{
 const live={...env,PAYMENTS_ACTIVE:'true',PAYMENTS_MODE:'live',TOSS_CLIENT_KEY:'live_ck_qa',
   TOSS_SECRET_KEY:'live_sk_qa',DB:{},PREMIUM_ASSETS:{}};
 const response=await worker.fetch(req('/api/config',{headers:{cookie:await cookie()}}),live);
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'test_access_unconfigured');
 const setup=await worker.fetch(req('/api/payment-setup'),live);
 assert.equal((await setup.json()).paymentsEnabled,false);
});

test('Build26: removing/overriding legacy stage toggle cannot disable password protection',async()=>{
 const unsafe={...env,TEST_ACCESS_REQUIRED:'false',PAYMENTS_ACTIVE:'true',
  TOSS_CLIENT_KEY:'test_ck_demo',TOSS_SECRET_KEY:'test_sk_demo',DB:{},PREMIUM_ASSETS:{}};
 const diag=await worker.fetch(req('/api/payment-setup'),unsafe);
 const setup=await diag.json();
 assert.equal(setup.clientKeyConfigured,true);
 assert.equal(setup.secretKeyConfigured,true);
 assert.equal(setup.paymentSwitchActive,true);
 assert.equal(setup.testAccessRequired,true);
 assert.equal(setup.testAccessSecretConfigured,true);
 assert.equal(setup.testAccessReady,true);
 assert.equal(setup.paymentsEnabled,true); // Only safe because session gating always remains enforced.
 const page=await worker.fetch(req('/'),unsafe);
 assert.equal(page.status,200);
 assert.match(await page.text(),/테스트 접근 코드/);
 const cfg=await worker.fetch(req('/api/config'),unsafe);
 assert.equal(cfg.status,401);
 assert.equal((await cfg.json()).error,'test_access_required');
 const order=await worker.fetch(req('/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),unsafe);
 assert.equal(order.status,401);
 const asset=await worker.fetch(req('/api/assets/disco'),unsafe);
 assert.equal(asset.status,401);
});
test('Build24 fail-closed: short stage secret cannot enable test payments',async()=>{
 const invalid={...env,TEST_ACCESS_SECRET:'short',PAYMENTS_ACTIVE:'true',
  TOSS_CLIENT_KEY:'test_ck_demo',TOSS_SECRET_KEY:'test_sk_demo',DB:{},PREMIUM_ASSETS:{}};
 const setup=await (await worker.fetch(req('/api/payment-setup'),invalid)).json();
 assert.equal(setup.paymentsEnabled,false);
 const order=await worker.fetch(req('/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),invalid);
 assert.equal(order.status,503);
});

test('Build26: missing legacy flag cannot affect protected test editor or signed login',async()=>{
 const noToggle={...env,TEST_ACCESS_REQUIRED:undefined};
 assert.equal(stageGateReady(noToggle),true);
 const anonymous=await worker.fetch(req('/'),noToggle);
 assert.equal(anonymous.status,200);
 assert.match(await anonymous.text(),/테스트 접근 코드/);
 const paidApi=await worker.fetch(req('/api/license'),noToggle);
 assert.equal(paidApi.status,401);
 const config=await worker.fetch(req('/api/payment-setup'),noToggle);
 const state=await config.json();
 assert.equal(state.build,'31');
 assert.equal(state.testAccessRequired,true);
 assert.equal(state.testAccessSecretConfigured,true);
 assert.equal(state.testAccessReady,true);
 assert.equal(state.paymentsEnabled,false);
 const loggedIn=await worker.fetch(req('/',{headers:{cookie:await cookie()}}),noToggle);
 assert.equal(loggedIn.status,200);
 assert.match(await loggedIn.text(),/Test editor/);
});
