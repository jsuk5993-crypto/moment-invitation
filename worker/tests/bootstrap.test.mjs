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
