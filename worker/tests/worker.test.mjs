import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import {webcrypto as testCrypto} from 'node:crypto';
const TEST_STAGE_SECRET='test-only-stage-key-for-fixtures-32-characters';
const TEST_STAGE_EXPIRY=String(Date.now()+7*60*60*1000);
const TEST_STAGE_KEY=await testCrypto.subtle.importKey('raw',new TextEncoder().encode(TEST_STAGE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const TEST_STAGE_SIG=Buffer.from(await testCrypto.subtle.sign('HMAC',TEST_STAGE_KEY,new TextEncoder().encode('moment-stage-1:'+TEST_STAGE_EXPIRY))).toString('hex');
const TEST_STAGE_COOKIE='__Host-moment_stage='+TEST_STAGE_EXPIRY+'.'+TEST_STAGE_SIG;

const ORIGIN='https://jsuk5993-crypto.github.io';
class FakeDB {
  constructor(){this.rows=new Map()}
  prepare(sql){return { bind:(...values)=>({
    first:async()=>{
      if(sql.startsWith('SELECT * FROM orders'))return this.rows.get(values[0])||null;
      if(sql.startsWith('SELECT order_id, status FROM orders WHERE license_hash')){
        for(const x of this.rows.values())if(x.license_hash===values[0])return {order_id:x.order_id,status:x.status};return null;
      } throw Error('Unexpected first SQL: '+sql);
    },
    run:async()=>{
      if(sql.startsWith('INSERT INTO orders')){const [id,amount,status,checkout_hash,created_at]=values;this.rows.set(id,{order_id:id,amount,status,checkout_hash,created_at,payment_key:null,license_hash:null});return {meta:{changes:1}}}
      if(sql.startsWith('UPDATE orders SET status = ?, payment_key = ? WHERE order_id = ? AND status = ?')){
        const [status,key,id,expected]=values,r=this.rows.get(id);
        if(!r||r.status!==expected)return {meta:{changes:0}};r.status=status;r.payment_key=key;return {meta:{changes:1}};
      }
      if(sql.startsWith('UPDATE orders SET status = ?, payment_key = ?, paid_at = ?')){
        const [status,key,date,id,a,b]=values,r=this.rows.get(id);
        if(!r||![a,b].includes(r.status))return {meta:{changes:0}};r.status=status;r.payment_key=key;r.paid_at=date;return {meta:{changes:1}};
      }
      if(sql.startsWith('UPDATE orders SET license_hash = ?')){
        const [hash,id,expected]=values,r=this.rows.get(id);if(r?.status===expected)r.license_hash=hash;return {meta:{changes:r?.status===expected?1:0}};
      }
      if(sql.startsWith('UPDATE orders SET status = ?, payment_key = NULL')){
        const [status,id,expected]=values,r=this.rows.get(id);if(r?.status===expected){r.status=status;r.payment_key=null;}return {meta:{changes:r?.status===expected?1:0}};
      }
      if(sql.startsWith('UPDATE orders SET status = ?, license_hash = NULL')){
        const [status,id]=values,r=this.rows.get(id);if(r){r.status=status;r.license_hash=null;}return {meta:{changes:r?1:0}};
      }
      throw Error('Unexpected run SQL: '+sql);
    }
  })};}
}
function env(){return {TEST_ACCESS_REQUIRED:'true',TEST_ACCESS_SECRET:TEST_STAGE_SECRET,PAYMENTS_ACTIVE:'true',PAYMENTS_MODE:'test',PUBLIC_ORIGIN:ORIGIN,TOSS_CLIENT_KEY:'test_ck_dummy',TOSS_SECRET_KEY:'test_sk_dummy',DB:new FakeDB(),PREMIUM_ASSETS:{get:async(k)=>({body:new Blob(['test image bytes'],{type:'image/webp'}).stream()})},ADMIN_SECRET:'not-public-secret'};}
const req=(path,method='GET',body,token,origin=ORIGIN)=>new Request('https://pay.example.workers.dev'+path,{method,headers:{Origin:origin,cookie:TEST_STAGE_COOKIE,...(body?{'content-type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
const parse=async(resp)=>({status:resp.status,body:await resp.json()});
const create=async(e)=>parse(await worker.fetch(req('/api/orders','POST',{}),e));
const confirm=(e,order,extra={})=>worker.fetch(req('/api/confirm','POST',{orderId:order.orderId,checkoutSecret:order.checkoutSecret,paymentKey:'key_dummy_'+order.orderId,amount:9900,...extra}),e);

test('payment OFF by default; no checkout is available',async()=>{
 const e=env();e.PAYMENTS_ACTIVE='false';
 const c=await parse(await worker.fetch(req('/api/config'),e));assert.equal(c.body.enabled,false);
 const o=await create(e);assert.equal(o.status,503);
});
test('wrong origin cannot create an order',async()=>{
 const e=env();const r=await worker.fetch(req('/api/orders','POST',{},null,'https://malicious.example'),e);assert.equal(r.status,403);
});
test('server fixes price to 9900 even when browser sends a fake amount',async()=>{
 const e=env();const {status,body}=await parse(await worker.fetch(req('/api/orders','POST',{amount:1}),e));
 assert.equal(status,201);assert.equal(body.amount,9900);assert.equal(e.DB.rows.get(body.orderId).amount,9900);
});
test('no payment proof cannot unlock, and assets require paid license',async()=>{
 const e=env();const {body}=await create(e);
 const fake=await parse(await confirm(e,body,{amount:1}));assert.equal(fake.status,400);
 const wrong=await parse(await confirm(e,body,{checkoutSecret:'0'.repeat(64)}));assert.equal(wrong.status,403);
 const asset=await worker.fetch(req('/api/assets/disco'),e);assert.equal(asset.status,401);
});
test('only verified Toss DONE approval grants license and private assets',async()=>{
 const e=env(),{body}=await create(e);
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,opt)=>{
  if(String(url).endsWith('/confirm'))return Response.json({status:'DONE',paymentKey:'key_dummy_'+body.orderId,orderId:body.orderId,totalAmount:9900});
  throw Error('unexpected external fetch');
 };
 try {
  const success=await parse(await confirm(e,body));assert.equal(success.status,200);assert.equal(success.body.paid,true);
  assert.match(success.body.license,/^[a-f0-9]{64}$/);
  const license=await parse(await worker.fetch(req('/api/license','GET',null,success.body.license),e));assert.equal(license.body.active,true);
  const premium=await worker.fetch(req('/api/assets/disco','GET',null,success.body.license),e);assert.equal(premium.status,200);assert.equal(premium.headers.get('content-type'),'image/webp');
  const duplicate=await parse(await confirm(e,body));assert.equal(duplicate.body.paid,true);
  assert.notEqual(duplicate.body.license,success.body.license,'re-confirm requires checkout proof and rotates token');
  assert.equal((await worker.fetch(req('/api/license','GET',null,success.body.license),e)).status,401);
 } finally {globalThis.fetch=oldFetch;}
});
test('Toss reports a mismatched price: no license is issued',async()=>{
 const e=env(),{body}=await create(e);const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(String(url).endsWith('/confirm'))return Response.json({status:'DONE',paymentKey:'key_dummy_'+body.orderId,orderId:body.orderId,totalAmount:1});
  return Response.json({status:'FAILED',paymentKey:'key_dummy_'+body.orderId,orderId:body.orderId,totalAmount:1});
 };
 try{const r=await parse(await confirm(e,body));assert.equal(r.status,502);assert.notEqual(e.DB.rows.get(body.orderId).status,'paid');}finally{globalThis.fetch=oldFetch;}
});
test('refunded order loses license',async()=>{
 const e=env(),{body}=await create(e);const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(String(url).endsWith('/confirm'))return Response.json({status:'DONE',paymentKey:'key_dummy_'+body.orderId,orderId:body.orderId,totalAmount:9900});
  return Response.json({status:'CANCELED',paymentKey:'key_dummy_'+body.orderId,orderId:body.orderId,totalAmount:9900});
 };
 try{
  const paid=await parse(await confirm(e,body));
  const reconcile=await parse(await worker.fetch(new Request('https://pay.example.workers.dev/api/reconcile',{method:'POST',headers:{Origin:ORIGIN,cookie:TEST_STAGE_COOKIE,'content-type':'application/json','x-admin-secret':e.ADMIN_SECRET},body:JSON.stringify({orderId:body.orderId})}),e));
  assert.equal(reconcile.body.status,'refunded');
  assert.equal((await worker.fetch(req('/api/license','GET',null,paid.body.license),e)).status,401);
 }finally{globalThis.fetch=oldFetch;}
});
