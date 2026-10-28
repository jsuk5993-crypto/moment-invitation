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
 assert.deepEqual(body,{ok:true,service:'moment-payments',build:'16',paymentsEnabled:false});
 assert.equal(response.headers.get('access-control-allow-origin'),testOrigin);
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('Build16 bootstrap does not expose a payment button or accept orders',async()=>{
 const config=await app.fetch(req('GET','/api/config'),env);
 assert.equal(config.status,200);
 const c=await config.json();
 assert.equal(c.enabled,false);
 assert.equal(c.clientKey,null);
 const order=await app.fetch(new Request('https://moment-payments-test.example.workers.dev/api/orders',{
  method:'POST',headers:{origin:testOrigin,'content-type':'application/json'},body:'{}'
 }),env);
 assert.equal(order.status,503);
 assert.equal((await order.json()).error,'disabled');
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
 assert.equal((await order.json()).error,'disabled');
});
