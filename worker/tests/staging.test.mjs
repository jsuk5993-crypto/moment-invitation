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
