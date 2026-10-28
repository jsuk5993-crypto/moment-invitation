import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
const code=readFileSync(new URL('../../site/payment/payment-client.js',import.meta.url),'utf8');
function scenario({mode='test',enabled=true,storedLicense=null,licenseStatus=200}={}){
 const buy={disabled:true,textContent:'',click:null,addEventListener(kind,cb){if(kind==='click')this.click=cb}};
 const status={textContent:''};
 const panel={innerHTML:'',className:'',querySelector:s=>s==='#moment-buy'?buy:status};
 const note={innerHTML:''};
 const planTitle={textContent:''},priceHint={textContent:''},badge={textContent:''},benefit={textContent:''};
 const intro={textContent:''},policy={textContent:''},divider={textContent:''};
 const plan={appended:null,append(x){assert.equal(x,panel);this.appended=x},
   querySelector(selector){return new Map([['.plan-name',planTitle],['.money span',priceHint],['.pill-note',badge],['ul li:last-child',benefit]]).get(selector)||null;}};
 const query=(selector)=>new Map([
  ['#plans4 .pricing4 .plan4.active',plan],
  ['#plans4 .business-intro p',intro],
  ['#plans4 .test-explain',policy],
  ['.collection-divider.paid small',divider]
 ]).get(selector)||null;
 const local=new Map(storedLicense?[['moment_premium_receipt_v1',storedLicense]]:[]);
 const session=new Map(),calls=[];let activated=0;
 const TossPayments=key=>({payment:({customerKey})=>({requestPayment:async data=>calls.push({key,customerKey,data})})});
 const config={enabled,mode,amount:9900,currency:'KRW',clientKey:mode==='test'?'test_ck_mock':'live_ck_mock'};
 const fetch=async(url)=>{
  const path=new URL(url).pathname;
  if(path==='/api/config')return {ok:true,json:async()=>config};
  if(path==='/api/orders')return {ok:true,json:async()=>({amount:9900,orderId:'MOMENT_1234567',checkoutSecret:'a'.repeat(64)})};
  if(path==='/api/license')return {ok:licenseStatus===200,status:licenseStatus,json:async()=>({active:licenseStatus===200})};
  if(path.startsWith('/api/assets/'))return {ok:true,blob:async()=>new Blob(['sample'],{type:'image/webp'})};
  throw Error('Unknown '+path);
 };
 const window={MOMENT_PAYMENT_API:'https://example.workers.dev',
  MOMENT_ACCESS:{async activate(files){activated++;assert.equal(Object.keys(files).length,6)}},TossPayments};
 const document={baseURI:'https://example.workers.dev/',getElementById:id=>id==='premiumActions'?note:null,
   querySelector:query,createElement:tag=>tag==='section'?panel:null};
 runInNewContext(code,{window,document,localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
   sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v)},
   fetch,URL,Blob,crypto:webcrypto});
 return {buy,calls,session,plan,planTitle,badge,policy,note,local,status,get activated(){return activated}};
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

test('Build29: purchase button is visibly mounted on the PREMIUM pricing plan without selecting a theme',async()=>{
 const ctx=scenario();await tick();
 assert.ok(ctx.plan.appended);
 assert.equal(ctx.plan.appended.querySelector('#moment-buy'),ctx.buy);
 assert.equal(ctx.buy.disabled,false);
 assert.match(ctx.planTitle.textContent,/TEST/);
 assert.match(ctx.badge.textContent,/실제 청구 없음/);
 assert.match(ctx.policy.textContent,/정식 판매는 아직/);
 assert.match(ctx.note.innerHTML,/결제 카드로 이동/);
});

// Build31 regression cases: don't charge existing customers when checkout is paused.
test('Build31: paid buyer can restore access even when new checkout is disabled',async()=>{
 const ctx=scenario({enabled:false,storedLicense:'b'.repeat(64)});
 await tick();await tick();
 assert.equal(ctx.activated,1);
 assert.equal(ctx.buy.disabled,true);
 assert.equal(ctx.buy.textContent,'프리미엄 이용 중');
 assert.equal(ctx.calls.length,0);
});
test('Build31: temporarily unavailable Toss verification never triggers duplicate purchase',async()=>{
 const original='c'.repeat(64);
 const ctx=scenario({storedLicense:original,licenseStatus:503});
 await tick();await tick();
 assert.equal(ctx.activated,0);
 assert.equal(ctx.buy.disabled,true);
 assert.equal(ctx.calls.length,0);
 assert.equal(ctx.local.get('moment_premium_receipt_v1'),original);
 assert.match(ctx.status.textContent,/다시 결제하지 말고 새로고침해 주세요/);
});
test('Build31: refunded receipt removed and buyer may purchase a new TEST order',async()=>{
 const ctx=scenario({storedLicense:'d'.repeat(64),licenseStatus:401});
 await tick();await tick();
 assert.equal(ctx.local.has('moment_premium_receipt_v1'),false);
 assert.equal(ctx.buy.disabled,false);
});
