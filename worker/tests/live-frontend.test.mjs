import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
const code=readFileSync(new URL('../../site-live/payment/payment-client.js',import.meta.url),'utf8');
function scenario({mode='live',enabled=true,storedLicense=null,licenseStatus=200,pendingConfirmation=false,recoveryIssueFailsAfterFirst=false,merchantReady=true}={}){
 const buy={disabled:true,textContent:'',click:null,addEventListener(kind,cb){if(kind==='click')this.click=cb}};
 const status={textContent:''};
 const newControl=()=>({hidden:false,disabled:false,textContent:'',value:'',click:null,addEventListener(k,cb){if(k==='click')this.click=cb;}});
 const recoveryIssue=newControl(),recoveryIssueBtn=newControl(),recoveryRedeem=newControl(),recoveryRedeemBtn=newControl();
 const purchaseHistory=newControl(),historyOrder=newControl(),historyAmount=newControl(),historyDate=newControl(),historyRefresh=newControl(),historyStatus=newControl();
 purchaseHistory.hidden=true;
 const recoveryInput=newControl(),recoveryCodeBox=newControl(),recoveryCodeText=newControl(),recoveryCopy=newControl(),recoveryDownload=newControl(),recoveryStatus=newControl();
 const deliveryPanel=newControl(),deliveryStatus=newControl();
 deliveryPanel.hidden=true;
 recoveryIssue.hidden=true;recoveryCodeBox.hidden=true;
 const agreement={checked:false,change:null,addEventListener(kind,cb){if(kind==='change')this.change=cb;}};
 const confirmRetryPanel=newControl(),confirmRetryButton=newControl(),confirmRetryStatus=newControl();
 confirmRetryPanel.hidden=true;
 const recoveryControls={
  '#moment-confirm-retry':confirmRetryPanel,'#moment-confirm-retry-btn':confirmRetryButton,'#moment-confirm-retry-status':confirmRetryStatus,
  '#moment-purchase-history':purchaseHistory,'#moment-history-order':historyOrder,
  '#moment-history-amount':historyAmount,'#moment-history-date':historyDate,
  '#moment-history-refresh':historyRefresh,'#moment-history-status':historyStatus,
  '#moment-recovery-issue':recoveryIssue,'#moment-recovery-issue-btn':recoveryIssueBtn,
  '#moment-recovery-redeem':recoveryRedeem,'#moment-recovery-redeem-btn':recoveryRedeemBtn,
  '#moment-recovery-input':recoveryInput,'#moment-recovery-code':recoveryCodeBox,
  '#moment-recovery-code-value':recoveryCodeText,'#moment-recovery-copy':recoveryCopy,'#moment-recovery-download':recoveryDownload,
  '#moment-premium-ready':deliveryPanel,'#moment-premium-ready-status':deliveryStatus,
  '#moment-recovery-status':recoveryStatus};
 const panel={innerHTML:'',className:'',querySelector:s=>s==='#moment-buy'?buy:s==='#moment-policy-ack'?agreement:recoveryControls[s]||status};
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
 const local=new Map(storedLicense?[['moment_live_premium_receipt_v1',storedLicense]]:[]);
 const session=new Map(),calls=[],orderBodies=[],recoveryBodies=[];let activated=0;
 if(pendingConfirmation){
   session.set('moment_live_order_MOMENT_1234567','a'.repeat(64));
   session.set('moment_live_pending_confirm_v1',JSON.stringify({orderId:'MOMENT_1234567',paymentKey:'payment_key_pending_abc',amount:9900,savedAt:Date.now()}));
 }
 const TossPayments=key=>({payment:({customerKey})=>({requestPayment:async data=>calls.push({key,customerKey,data})})});
 const config={enabled,mode,amount:9900,currency:'KRW',clientKey:mode==='live'?'live_ck_mock':'test_ck_mock'};
 const fetch=async(url,opts={})=>{
  const path=new URL(url).pathname;
  if(path==='/api/config')return {ok:true,json:async()=>config};
  if(path==='/api/confirm')return {ok:true,json:async()=>({paid:true,license:'f'.repeat(64)})};
  if(path==='/api/orders'){orderBodies.push(JSON.parse(opts.body));return {ok:true,json:async()=>({amount:9900,orderId:'MOMENT_1234567',checkoutSecret:'a'.repeat(64)})};}
  if(path==='/api/recovery/issue'){recoveryIssueCalls++;return recoveryIssueFailsAfterFirst&&recoveryIssueCalls>1?{ok:false,json:async()=>({message:'토스 확인에 실패했어요.'})}:{ok:true,json:async()=>({recoveryCode:'e'.repeat(64)})};}
  if(path==='/api/recovery/redeem'){recoveryBodies.push(JSON.parse(opts.body));return {ok:true,json:async()=>({license:'f'.repeat(64),recoveryCode:'d'.repeat(64)})};}
  if(path==='/api/purchases/me')return {ok:true,json:async()=>({status:'paid',orderId:'MOMENT_TEST_123',amount:9900,paidAt:1793100000000})};
  if(path==='/api/license')return {ok:licenseStatus===200,status:licenseStatus,json:async()=>({active:licenseStatus===200})};
  if(path.startsWith('/api/assets/'))return {ok:true,blob:async()=>new Blob(['sample'],{type:'image/webp'})};
  throw Error('Unknown '+path);
 };
 let recoveryIssueCalls=0;
 const downloadedFiles=[],revokedUrls=[];
 class TestURL extends URL {
  static createObjectURL(blob){downloadedFiles.push({blob});return 'blob:mock-recovery-file-'+downloadedFiles.length;}
  static revokeObjectURL(url){revokedUrls.push(url);}
 }
 const window={MOMENT_MERCHANT:{ready:merchantReady},confirm:()=>true,MOMENT_PAYMENT_API:'https://example.workers.dev',
  MOMENT_ACCESS:{async activate(files){activated++;assert.equal(Object.keys(files).length,6)}},TossPayments};
 const document={baseURI:'https://example.workers.dev/',getElementById:id=>id==='premiumActions'?note:null,
   body:{appendChild(el){}},
   querySelector:query,createElement:tag=>tag==='section'?panel:tag==='a'?
     {href:'',download:'',click(){const last=downloadedFiles[downloadedFiles.length-1];last.fileName=this.download;last.href=this.href;},remove(){}}:null};
 runInNewContext(code,{window,document,localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
   sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},
   fetch,URL:TestURL,Blob,crypto:webcrypto,setTimeout:cb=>cb(),navigator:{clipboard:{writeText:async()=>{}}}});
 return {buy,agreement,calls,orderBodies,session,plan,planTitle,badge,policy,note,local,status,
  recoveryIssue,recoveryIssueBtn,recoveryRedeem,recoveryRedeemBtn,recoveryInput,recoveryCodeBox,recoveryCodeText,recoveryDownload,recoveryBodies,recoveryStatus,
  deliveryPanel,deliveryStatus,downloadedFiles,revokedUrls,
  confirmRetryPanel,confirmRetryButton,confirmRetryStatus,
  purchaseHistory,historyOrder,historyAmount,historyDate,historyRefresh,historyStatus,
  get activated(){return activated}};
}

const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('RC1 LIVE: preview seller profile refuses checkout even with an approved server response',async()=>{
 const src=readFileSync(new URL('../../site-live/merchant.js',import.meta.url),'utf8');
 assert.match(src,/ready:false/);
 const source=readFileSync(new URL('../../site-live/payment/payment-client.js',import.meta.url),'utf8');
 assert.match(source,/MOMENT_MERCHANT\?\.ready/);
 assert.doesNotMatch(source,/moment-payments-test\./);
});
test('RC1 LIVE: real 9900 KRW checkout requires explicit agreement; never uses TEST keys',async()=>{
 const ctx=scenario();await tick();
 assert.equal(ctx.buy.disabled,true);
 assert.equal(ctx.calls.length,0);
 ctx.agreement.checked=true;ctx.agreement.change();
 assert.equal(ctx.buy.disabled,false);
 assert.match(ctx.buy.textContent,/프리미엄 구매/);
 await ctx.buy.click();
 assert.equal(ctx.calls.length,1);
 assert.equal(ctx.calls[0].key,'live_ck_mock');
 assert.equal(ctx.calls[0].data.amount.value,9900);
 assert.equal(ctx.calls[0].data.windowTarget,'self');
 assert.equal(ctx.orderBodies[0].policyAcknowledged,true);
 assert.equal(ctx.session.get('moment_live_order_MOMENT_1234567'),'a'.repeat(64));
});
test('RC1 LIVE: paused checkout does not allow new purchases, but retains existing purchased access',async()=>{
 const waiting=scenario({enabled:false});await tick();
 assert.equal(waiting.buy.disabled,true);
 assert.equal(waiting.calls.length,0);
 const buyer=scenario({enabled:false,storedLicense:'b'.repeat(64)});await tick();await tick();
 assert.equal(buyer.activated,1);
 assert.equal(buyer.buy.disabled,true);
 assert.equal(buyer.buy.textContent,'프리미엄 이용 중');
 assert.equal(buyer.calls.length,0);
});
test('RC1 LIVE: one-time recovery file and receipt token are isolated from TEST browser storage',async()=>{
 const buyer=scenario({storedLicense:'b'.repeat(64)});await tick();await tick();
 await buyer.recoveryIssueBtn.click();
 await buyer.recoveryDownload.click();
 assert.equal(buyer.downloadedFiles.length,1);
 assert.match(await buyer.downloadedFiles[0].blob.text(),/e{64}/);
 assert.equal(buyer.local.get('moment_live_premium_receipt_v1'),'b'.repeat(64));
 assert.equal(buyer.local.has('moment_premium_receipt_v1'),false);
 assert.equal(buyer.orderBodies.length,0);
});

test('RC1 storefront: no legacy BUILD or TEST coming-soon claims in main customer page',()=>{
 const html=readFileSync(new URL('../../site-live/index.html',import.meta.url),'utf8');
 for(const phrase of ["A PRODUCT IN TESTING","기존 Build 5 디자인","PREMIUM / 상품 준비 중","1회 구매 가정","출시 미정 · 현재 결제 불가","결제 준비 중이므로 미리보기만 가능합니다","결제 후 고화질 PNG 저장 제공 예정"])assert.equal(html.includes(phrase),false,'old copy: '+phrase);
 assert.match(html,/PREMIUM \/ 1회 구매/);
 assert.match(html,/프리미엄 PNG 2장 ZIP 저장/);
 assert.match(html,/구매 및 결제 관련 정보는 별도로 관리됩니다/);
});
 
test('RC1 paused seller profile: existing paid buyers still restore full premium and cannot be charged again',async()=>{
 const buyer=scenario({enabled:false,merchantReady:false,storedLicense:'b'.repeat(64)});
 await tick();await tick();
 assert.equal(buyer.activated,1);
 assert.equal(buyer.buy.textContent,'프리미엄 이용 중');
 assert.equal(buyer.calls.length,0);
 const newcomer=scenario({enabled:true,merchantReady:false});
 await tick();
 assert.equal(newcomer.buy.disabled,true);
 assert.equal(newcomer.calls.length,0);
 assert.equal(newcomer.orderBodies.length,0);
 assert.match(newcomer.status.textContent,/새 결제를 받지 않습니다/);
});

test('RC1 customer storefront: no nonfunctional survey form is advertised as an active service',()=>{
 const html=readFileSync(new URL('../../site-live/index.html',import.meta.url),'utf8');
 assert.match(html,/<a href="support\.html">고객지원<\/a>/);
 assert.match(html,/section#survey4\{display:none!important\}/);
 assert.equal(html.includes('<a href="#survey4">사용 후기</a>'),false);
});
