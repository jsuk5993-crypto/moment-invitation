import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.mjs';
import {webcrypto as testCrypto} from 'node:crypto';
const TEST_STAGE_SECRET='test-only-stage-key-for-fixtures-32-characters';
const TEST_STAGE_EXPIRY=String(Date.now()+7*60*60*1000);
const TEST_STAGE_KEY=await testCrypto.subtle.importKey('raw',new TextEncoder().encode(TEST_STAGE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const TEST_STAGE_SIG=Buffer.from(await testCrypto.subtle.sign('HMAC',TEST_STAGE_KEY,new TextEncoder().encode('moment-stage-1:'+TEST_STAGE_EXPIRY))).toString('hex');
const TEST_STAGE_COOKIE='__Host-moment_stage='+TEST_STAGE_EXPIRY+'.'+TEST_STAGE_SIG;


const ORIGIN = 'https://jsuk5993-crypto.github.io';
const schema = readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8');
const API='https://api.moment.test';
const request = (path,method='GET',body,token,headers={}) => new Request(API+path, {
  method, headers:{Origin:ORIGIN,cookie:TEST_STAGE_COOKIE, ...(body!==undefined?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{}),...headers},
  body: body===undefined ? undefined : JSON.stringify(body)
});
const parsed = async(resp) => ({status:resp.status, body:await resp.json()});
function makeEnvironment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  const DB={
    async batch(statements){
      sqlite.exec('BEGIN');
      try{const outputs=[];for(const stmt of statements)outputs.push(await stmt.run());sqlite.exec('COMMIT');return outputs;}
      catch(e){sqlite.exec('ROLLBACK');throw e;}
    },
    prepare(sql) { return {
      async run(){const result=sqlite.prepare(sql).run();return {meta:{changes:result.changes}}},
      bind(...values) {return {
        async first(){return sqlite.prepare(sql).get(...values)??null},
        async run(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:result.changes}}}
      }}
    }}
  };
  const env={ TEST_ACCESS_REQUIRED:'true',TEST_ACCESS_SECRET:TEST_STAGE_SECRET,PAYMENTS_ACTIVE:'true',PAYMENTS_MODE:'test',PUBLIC_ORIGIN:ORIGIN,
    TOSS_CLIENT_KEY:'test_ck_mock_123',TOSS_SECRET_KEY:'test_sk_mock_123',
    DB, PREMIUM_ASSETS:{async get(key){if(key==='premium/disco.webp')return {body:new Blob(['WEBP'],{type:'image/webp'}).stream()};return null;}},
    ADMIN_SECRET:'integration-only-secret' };
  return {env,sqlite};
}
const ack={policyAcknowledged:true,policyVersion:'2026-10-28-v1'};
const newOrder=async(env) => (await parsed(await worker.fetch(request('/api/orders','POST',ack),env))).body;
const confirm=(env,o,additional={})=>worker.fetch(request('/api/confirm','POST',{orderId:o.orderId,paymentKey:'key_'+o.orderId,amount:9900,checkoutSecret:o.checkoutSecret,...additional}),env);
const payment=(o,status='DONE',amount=9900)=>({orderId:o.orderId,paymentKey:'key_'+o.orderId,totalAmount:amount,status});

// These are real SQLite constraints and SQL statements, not just a hand-written FakeDB.
test('D1 schema: order generated and SQL amount constraint prevents tampering',async()=>{
 const {env,sqlite}=makeEnvironment();try{
  const o=await newOrder(env);
  assert.equal(sqlite.prepare('SELECT amount FROM orders WHERE order_id = ?').get(o.orderId).amount,9900);
  assert.throws(()=>sqlite.prepare('UPDATE orders SET amount = 1 WHERE order_id = ?').run(o.orderId),/CHECK constraint failed/);
  const denied=await worker.fetch(request('/api/assets/disco'),env);
  assert.equal(denied.status,401);
 }finally{sqlite.close()}
});

test('D1 integration: Toss DONE -> paid -> license -> R2 asset -> browser reload restore',async()=>{
 const {env,sqlite}=makeEnvironment();const o=await newOrder(env),oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
  assert.match(String(url),/\/payments\/confirm$/);
  assert.equal(JSON.parse(opts.body).amount,9900);
  assert.match(opts.headers['idempotency-key'],/^moment-MOMENT_/);
  return Response.json(payment(o));
 };
 try{
  const done=await parsed(await confirm(env,o));assert.equal(done.status,200);
  assert.equal(done.body.paid,true);assert.match(done.body.license,/^[a-f0-9]{64}$/);
  const order=sqlite.prepare('SELECT status,license_hash,payment_key FROM orders WHERE order_id = ?').get(o.orderId);
  assert.equal(order.status,'paid');assert.notEqual(order.license_hash,done.body.license);
  const license=await parsed(await worker.fetch(request('/api/license','GET',undefined,done.body.license),env));
  assert.equal(license.body.active,true);assert.equal(license.body.designs.length,6);
  const img=await worker.fetch(request('/api/assets/disco','GET',undefined,done.body.license),env);
  assert.equal(img.status,200);assert.equal(await img.text(),'WEBP');
  // A token stored in localStorage is enough to restore without a new payment.
  assert.equal((await worker.fetch(request('/api/license','GET',undefined,done.body.license),env)).status,200);
 }finally{globalThis.fetch=oldFetch;sqlite.close()}
});

test('D1 integration: failed 503/timeout confirmation recovers by querying Toss, without second charge',async()=>{
 const {env,sqlite}=makeEnvironment();const o=await newOrder(env),oldFetch=globalThis.fetch;let confirmCount=0;
 globalThis.fetch=async(url)=>{
  if(String(url).endsWith('/confirm')){confirmCount++;return Response.json({error:'GATEWAY_TIMEOUT'},{status:503});}
  return Response.json(payment(o,'IN_PROGRESS'));
 };
 try{
  const pending=await parsed(await confirm(env,o));assert.equal(pending.status,502);
  assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id = ?').get(o.orderId).status,'confirming');
  // Network recovered, Toss now reports actual final state. Retry must only GET.
  globalThis.fetch=async(url)=>{assert.equal(String(url).includes('/confirm'),false);return Response.json(payment(o));};
  const done=await parsed(await confirm(env,o));assert.equal(done.status,200);assert.equal(done.body.paid,true);
  assert.equal(confirmCount,1);
 }finally{globalThis.fetch=oldFetch;sqlite.close()}
});

test('D1 integration: full refund revokes the license and blocks R2',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
  const done=await parsed(await confirm(env,o));
  assert.equal(done.status,200);
  globalThis.fetch=async()=>Response.json(payment(o,'CANCELED'));
  const result=await parsed(await worker.fetch(request('/api/toss-webhook','POST',{eventType:'PAYMENT_STATUS_CHANGED',data:{orderId:o.orderId,paymentKey:'key_'+o.orderId}}),env));
  assert.equal(result.status,200);
  assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id = ?').get(o.orderId).status,'refunded');
  assert.equal((await worker.fetch(request('/api/license','GET',undefined,done.body.license),env)).status,401);
  // An old checkout proof cannot resurrect the previous buyer session.
  assert.equal((await confirm(env,o)).status,403);
  assert.equal((await worker.fetch(request('/api/assets/disco','GET',undefined,done.body.license),env)).status,401);
 }finally{globalThis.fetch=oldFetch;sqlite.close()}
});

test('D1 integration: tampered price, order, and wrong origin rejected',async()=>{
 const {env,sqlite}=makeEnvironment();try{
  const o=await newOrder(env);
  assert.equal((await confirm(env,o,{amount:1})).status,400);
  assert.equal((await confirm(env,o,{checkoutSecret:'0'.repeat(64)})).status,403);
  assert.equal((await worker.fetch(request('/api/orders','POST',{},undefined,{Origin:'https://evil.invalid'}),env)).status,403);
  assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id = ?').get(o.orderId).status,'created');
 }finally{sqlite.close()}
});

test('D1 integration: malformed JSON and over-limit payload return 400, never 500',async()=>{
 const {env,sqlite}=makeEnvironment();try{
  const malformed=new Request(API+'/api/orders',{method:'POST',headers:{Origin:ORIGIN,cookie:TEST_STAGE_COOKIE,'content-type':'application/json'},body:'{oops'});
  assert.equal((await worker.fetch(malformed,env)).status,400);
  const tooLong=await worker.fetch(request('/api/orders','POST',{payload:'x'.repeat(8500)}),env);
  assert.equal(tooLong.status,400);
  const wrongType=new Request(API+'/api/orders',{method:'POST',headers:{Origin:ORIGIN,cookie:TEST_STAGE_COOKIE,'content-type':'text/plain'},body:'hello'});
  assert.equal((await worker.fetch(wrongType,env)).status,400);
 }finally{sqlite.close()}
});

test('D1 integration: simultaneous confirm requests cannot both call Toss approval',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),oldFetch=globalThis.fetch;
 let release;let count=0;const gate=new Promise(resolve=>release=resolve);
 globalThis.fetch=async(url)=>{
   if(String(url).endsWith('/confirm')){count++;await gate;return Response.json(payment(o));}
   return Response.json(payment(o,'IN_PROGRESS'));
 };
 try{
  const first=confirm(env,o);
  // Let the first request reach and claim confirming state before racing a second one.
  for(let i=0;i<15&&count===0;i++)await new Promise(r=>setTimeout(r,2));
  assert.equal(count,1);
  const second=await parsed(await confirm(env,o));assert.equal(second.status,409);
  release();const done=await parsed(await first);assert.equal(done.status,200);
  assert.equal(count,1);
 }finally{release?.();globalThis.fetch=oldFetch;sqlite.close()}
});

test('D1 integration: wrong Toss order or payment key does not grant access',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),oldFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>Response.json({...payment(o),orderId:'OTHER_ORDER'});
 try{
  const result=await parsed(await confirm(env,o));assert.equal(result.status,502);
  assert.notEqual(sqlite.prepare('SELECT status FROM orders WHERE order_id=?').get(o.orderId).status,'paid');
 }finally{globalThis.fetch=oldFetch;sqlite.close()}
});

test('D1 integration: no admin secret, invalid design and arbitrary token are denied',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
  const paid=await parsed(await confirm(env,o));
  assert.equal((await worker.fetch(request('/api/assets/arbitrary','GET',undefined,paid.body.license),env)).status,404);
  assert.equal((await worker.fetch(request('/api/license','GET',undefined,'a'.repeat(64)),env)).status,401);
  assert.equal((await worker.fetch(request('/api/reconcile','POST',{orderId:o.orderId}),env)).status,403);
 }finally{globalThis.fetch=oldFetch;sqlite.close()}
});

// Build31: do not revoke already-paid customers when merchant pauses new checkout.
test('Build31: existing license and R2 downloads survive PAYMENTS_ACTIVE=false; new orders blocked',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
   const confirmed=await parsed(await confirm(env,o));
   assert.equal(confirmed.status,200);
   env.PAYMENTS_ACTIVE='false';
   const cfg=await parsed(await worker.fetch(request('/api/config'),env));
   assert.equal(cfg.body.enabled,false);
   assert.equal((await worker.fetch(request('/api/orders','POST',{}),env)).status,503);
   const verified=await worker.fetch(request('/api/license?verify=1','GET',undefined,confirmed.body.license),env);
   assert.equal(verified.status,200);
   const asset=await worker.fetch(request('/api/assets/disco','GET',undefined,confirmed.body.license),env);
   assert.equal(asset.status,200);
   assert.equal(await asset.text(),'WEBP');
 }finally{globalThis.fetch=originalFetch;sqlite.close()}
});
test('Build31: verified cancellation revokes license on restore even without webhook',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
   const confirmed=await parsed(await confirm(env,o));
   env.PAYMENTS_ACTIVE='false';
   globalThis.fetch=async()=>Response.json(payment(o,'CANCELED'));
   const verified=await worker.fetch(request('/api/license?verify=1','GET',undefined,confirmed.body.license),env);
   assert.equal(verified.status,401);
   assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id=?').get(o.orderId).status,'refunded');
   assert.equal((await worker.fetch(request('/api/assets/disco','GET',undefined,confirmed.body.license),env)).status,401);
 }finally{globalThis.fetch=originalFetch;sqlite.close()}
});
test('Build31: partial cancellation revokes license on restore while keeping new checkout closed',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
   const confirmed=await parsed(await confirm(env,o));
   env.PAYMENTS_ACTIVE='false';
   globalThis.fetch=async()=>Response.json(payment(o,'PARTIAL_CANCELED'));
   const verified=await worker.fetch(request('/api/license?verify=1','GET',undefined,confirmed.body.license),env);
   assert.equal(verified.status,401);
   assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id=?').get(o.orderId).status,'refunded');
 }finally{globalThis.fetch=originalFetch;sqlite.close()}
});
test('Build31: Toss inquiry downtime does not revoke valid paid license or allow another charge',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
   const confirmed=await parsed(await confirm(env,o));
   env.PAYMENTS_ACTIVE='false';
   globalThis.fetch=async()=>Response.json({error:'TEMPORARY_UNAVAILABLE'},{status:503});
   const pending=await worker.fetch(request('/api/license?verify=1','GET',undefined,confirmed.body.license),env);
   assert.equal(pending.status,503);
   assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id=?').get(o.orderId).status,'paid');
   assert.equal((await worker.fetch(request('/api/orders','POST',{}),env)).status,503);
   globalThis.fetch=async()=>Response.json(payment(o));
   const retry=await worker.fetch(request('/api/license?verify=1','GET',undefined,confirmed.body.license),env);
   assert.equal(retry.status,200);
 }finally{globalThis.fetch=originalFetch;sqlite.close()}
});

test('Build31: unauthenticated Toss webhook independently verifies a claimed cancellation',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
   const done=await parsed(await confirm(env,o));
   assert.equal(done.status,200);
   env.PAYMENTS_ACTIVE='false';
   const untrustedBody={eventType:'PAYMENT_STATUS_CHANGED',data:{
     orderId:o.orderId,paymentKey:'key_'+o.orderId,status:'CANCELED'}};
   const unsigned=()=>new Request(API+'/api/toss-webhook',{
     method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(untrustedBody)});
   // A spoofed webhook does not revoke rights while Toss's authoritative status is DONE.
   const forged=await parsed(await worker.fetch(unsigned(),env));
   assert.equal(forged.status,200);
   assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id=?').get(o.orderId).status,'paid');
   // Only the independently verified cancellation revokes the token.
   globalThis.fetch=async()=>Response.json(payment(o,'CANCELED'));
   const real=await parsed(await worker.fetch(unsigned(),env));
   assert.equal(real.status,200);
   assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id=?').get(o.orderId).status,'refunded');
   assert.equal((await worker.fetch(request('/api/assets/disco','GET',undefined,done.body.license),env)).status,401);
 }finally{globalThis.fetch=originalFetch;sqlite.close()}
});

test('Build34: D1 audit table persists exact policy version and timestamp with order',async()=>{
 const {env,sqlite}=makeEnvironment();try{
  const missing=await worker.fetch(request('/api/orders','POST',{}),env);
  assert.equal(missing.status,400);
  const old=await worker.fetch(request('/api/orders','POST',{policyAcknowledged:true,policyVersion:'2025-01-01'}),env);
  assert.equal(old.status,400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM purchase_acknowledgements').get().n,0);
  const o=await newOrder(env);
  const row=sqlite.prepare('SELECT order_id,policy_version,acknowledged_at FROM purchase_acknowledgements WHERE order_id = ?').get(o.orderId);
  assert.equal(row.order_id,o.orderId);
  assert.equal(row.policy_version,'2026-10-28-v1');
  assert.ok(row.acknowledged_at>0);
 }finally{sqlite.close()}
});

// Build35: accountless one-use recovery code, bound to an authoritative paid order.
test('Build35: current paid buyer issues code, new device redeems once, old token and code expire',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try {
  const done=await parsed(await confirm(env,o));
  const issued=await parsed(await worker.fetch(request('/api/recovery/issue','POST',undefined,done.body.license),env));
  assert.equal(issued.status,200);assert.match(issued.body.recoveryCode,/^[a-f0-9]{64}$/);
  const row=sqlite.prepare('SELECT recovery_hash FROM purchase_recovery WHERE order_id=?').get(o.orderId);
  assert.notEqual(row.recovery_hash,issued.body.recoveryCode);
  const recovered=await parsed(await worker.fetch(request('/api/recovery/redeem','POST',{recoveryCode:issued.body.recoveryCode}),env));
  assert.equal(recovered.status,200);assert.equal(recovered.body.restored,true);
  assert.match(recovered.body.license,/^[a-f0-9]{64}$/);
  assert.notEqual(recovered.body.license,done.body.license);
  assert.notEqual(recovered.body.recoveryCode,issued.body.recoveryCode);
  assert.equal((await worker.fetch(request('/api/license','GET',undefined,done.body.license),env)).status,401);
  assert.equal((await worker.fetch(request('/api/license?verify=1','GET',undefined,recovered.body.license),env)).status,200);
  assert.equal((await worker.fetch(request('/api/assets/disco','GET',undefined,recovered.body.license),env)).status,200);
  assert.equal((await worker.fetch(request('/api/recovery/redeem','POST',{recoveryCode:issued.body.recoveryCode}),env)).status,401);
  assert.equal((await worker.fetch(request('/api/recovery/redeem','POST',{recoveryCode:recovered.body.recoveryCode.toUpperCase().match(/.{1,8}/g).join('-')}),env)).status,200);
 }finally{globalThis.fetch=originalFetch;sqlite.close()}
});
test('Build35: wrong or malformed codes and missing purchase auth never grant access',async()=>{
 const {env,sqlite}=makeEnvironment();try{
  assert.equal((await worker.fetch(request('/api/recovery/issue','POST'),env)).status,401);
  assert.equal((await worker.fetch(request('/api/recovery/redeem','POST',{recoveryCode:'short'}),env)).status,400);
  assert.equal((await worker.fetch(request('/api/recovery/redeem','POST',{recoveryCode:'c'.repeat(64)}),env)).status,401);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM purchase_recovery').get().n,0);
 }finally{sqlite.close()}
});
test('Build35: refund, Toss outage, and paused checkout cannot bypass purchase verification',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
  const done=await parsed(await confirm(env,o));
  const issued=await parsed(await worker.fetch(request('/api/recovery/issue','POST',undefined,done.body.license),env));
  env.PAYMENTS_ACTIVE='false'; // recovery still permitted for already paid buyers
  globalThis.fetch=async()=>Response.json({error:'timeout'},{status:503});
  assert.equal((await worker.fetch(request('/api/recovery/redeem','POST',{recoveryCode:issued.body.recoveryCode}),env)).status,503);
  assert.equal((await worker.fetch(request('/api/recovery/issue','POST',undefined,done.body.license),env)).status,503);
  globalThis.fetch=async()=>Response.json(payment(o,'CANCELED'));
  assert.equal((await worker.fetch(request('/api/recovery/redeem','POST',{recoveryCode:issued.body.recoveryCode}),env)).status,401);
  assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id=?').get(o.orderId).status,'refunded');
  assert.equal((await worker.fetch(request('/api/recovery/redeem','POST',{recoveryCode:issued.body.recoveryCode}),env)).status,401);
 }finally{globalThis.fetch=originalFetch;sqlite.close()}
});
test('Build35: issuing another recovery code invalidates previous code',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
  const done=await parsed(await confirm(env,o));
  const issue=async()=> (await parsed(await worker.fetch(request('/api/recovery/issue','POST',undefined,done.body.license),env))).body.recoveryCode;
  const oldCode=await issue(),newCode=await issue();assert.notEqual(oldCode,newCode);
  assert.equal((await worker.fetch(request('/api/recovery/redeem','POST',{recoveryCode:oldCode}),env)).status,401);
  assert.equal((await worker.fetch(request('/api/recovery/redeem','POST',{recoveryCode:newCode}),env)).status,200);
 }finally{globalThis.fetch=oldFetch;sqlite.close()}
});

test('Build36: paid buyer can read own receipt summary without payment or license secrets',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
  const confirmed=await parsed(await confirm(env,o));
  env.PAYMENTS_ACTIVE='false';
  const summary=await parsed(await worker.fetch(request('/api/purchases/me?orderId=forged'),env));
  assert.equal(summary.status,401);
  const owned=await parsed(await worker.fetch(request('/api/purchases/me?orderId=forged','GET',undefined,confirmed.body.license),env));
  assert.equal(owned.status,200);
  assert.equal(owned.body.orderId,o.orderId);
  assert.equal(owned.body.amount,9900);
  assert.equal(owned.body.status,'paid');
  assert.equal(owned.body.designCount,6);
  assert.equal(owned.body.pngPerDownload,2);
  for(const privateKey of ['paymentKey','payment_key','checkoutSecret','checkout_hash','license','license_hash','recoveryCode'])
   assert.equal(JSON.stringify(owned.body).includes(privateKey),false);
 }finally{globalThis.fetch=originalFetch;sqlite.close()}
});
test('Build36: refunds revoke receipt access; Toss outage returns 503 without removing paid order',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
  const done=await parsed(await confirm(env,o));
  globalThis.fetch=async()=>Response.json({error:'temp'},{status:503});
  assert.equal((await worker.fetch(request('/api/purchases/me','GET',undefined,done.body.license),env)).status,503);
  assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id=?').get(o.orderId).status,'paid');
  globalThis.fetch=async()=>Response.json(payment(o,'CANCELED'));
  assert.equal((await worker.fetch(request('/api/purchases/me','GET',undefined,done.body.license),env)).status,401);
  assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id=?').get(o.orderId).status,'refunded');
 }finally{globalThis.fetch=oldFetch;sqlite.close()}
});

test('Build37: retrying already paid order requires fresh Toss DONE check; cancellation denies token refresh',async()=>{
 const {env,sqlite}=makeEnvironment(),o=await newOrder(env),oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json(payment(o));
 try{
   const done=await parsed(await confirm(env,o));assert.equal(done.status,200);
   const retry=await parsed(await confirm(env,o));assert.equal(retry.status,200);
   assert.notEqual(retry.body.license,done.body.license);
   globalThis.fetch=async()=>Response.json(payment(o,'CANCELED'));
   const canceled=await parsed(await confirm(env,o));assert.equal(canceled.status,403);
   assert.equal(sqlite.prepare('SELECT status FROM orders WHERE order_id=?').get(o.orderId).status,'refunded');
   assert.equal((await worker.fetch(request('/api/license','GET',undefined,retry.body.license),env)).status,401);
 }finally{globalThis.fetch=oldFetch;sqlite.close()}
});
