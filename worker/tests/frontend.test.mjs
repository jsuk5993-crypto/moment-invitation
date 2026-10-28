import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
const code=readFileSync(new URL('../../site/payment/payment-client.js',import.meta.url),'utf8');
function scenario({mode='test',enabled=true,storedLicense=null}={}){
 const buy={disabled:true,textContent:'',click:null,addEventListener(kind,cb){if(kind==='click')this.click=cb}};
 const status={textContent:''};
 const panel={innerHTML:'',className:'',querySelector:s=>s==='#moment-buy'?buy:status};
 const note={append(x){assert.equal(x,panel)}};
 const local=new Map(storedLicense?[['moment_premium_receipt_v1',storedLicense]]:[]);
 const session=new Map(),calls=[];let activated=0;
 const TossPayments=key=>({payment:({customerKey})=>({requestPayment:async data=>calls.push({key,customerKey,data})})});
 const config={enabled,mode,amount:9900,currency:'KRW',clientKey:mode==='test'?'test_ck_mock':'live_ck_mock'};
 const fetch=async(url)=>{
  const path=new URL(url).pathname;
  if(path==='/api/config')return {json:async()=>config};
  if(path==='/api/orders')return {ok:true,json:async()=>({amount:9900,orderId:'MOMENT_1234567',checkoutSecret:'a'.repeat(64)})};
  if(path==='/api/license')return {ok:true,json:async()=>({active:true})};
  if(path.startsWith('/api/assets/'))return {ok:true,blob:async()=>new Blob(['sample'],{type:'image/webp'})};
  throw Error('Unknown '+path);
 };
 const window={MOMENT_PAYMENT_API:'https://example.workers.dev',
  MOMENT_ACCESS:{async activate(files){activated++;assert.equal(Object.keys(files).length,6)}},TossPayments};
 const document={baseURI:'https://example.workers.dev/',getElementById:id=>id==='premiumActions'?note:null,
   createElement:tag=>tag==='section'?panel:null};
 runInNewContext(code,{window,document,localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},
   sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v)},fetch,URL,Blob,crypto:webcrypto});
 return {buy,calls,session,get activated(){return activated}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('Build22: test config enables only test checkout button',async()=>{
 const ctx=scenario();await tick();assert.equal(ctx.buy.disabled,false);
 assert.match(ctx.buy.textContent,/테스트 결제/);await ctx.buy.click();
 assert.equal(ctx.calls.length,1);assert.equal(ctx.calls[0].key,'test_ck_mock');
 assert.match(ctx.calls[0].customerKey,/^[0-9a-f-]{36}$/);
 assert.equal(ctx.calls[0].data.windowTarget,'self');
 assert.equal(ctx.calls[0].data.amount.value,9900);
 assert.equal(ctx.session.get('moment_order_MOMENT_1234567'),'a'.repeat(64));
});
test('Build22: LIVE config never enables test editor checkout',async()=>{
 const ctx=scenario({mode:'live'});await tick();assert.equal(ctx.buy.disabled,true);assert.equal(ctx.calls.length,0);
});
test('Build22: disabled API config never enables checkout',async()=>{
 const ctx=scenario({enabled:false});await tick();assert.equal(ctx.buy.disabled,true);
});
test('Build22: receipt restores six premium images',async()=>{
 const ctx=scenario({storedLicense:'b'.repeat(64)});await tick();await tick();
 assert.equal(ctx.activated,1);assert.equal(ctx.buy.disabled,true);assert.equal(ctx.buy.textContent,'프리미엄 이용 중');
});
