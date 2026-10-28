import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
const code=readFileSync(new URL('../../site/payment/payment-client.js',import.meta.url),'utf8');
function scenario({mode='test',enabled=true,storedLicense=null,licenseStatus=200,pendingConfirmation=false}={}){
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
 const local=new Map(storedLicense?[['moment_premium_receipt_v1',storedLicense]]:[]);
 const session=new Map(),calls=[],orderBodies=[],recoveryBodies=[];let activated=0;
 if(pendingConfirmation){
   session.set('moment_order_MOMENT_1234567','a'.repeat(64));
   session.set('moment_pending_confirm_v1',JSON.stringify({orderId:'MOMENT_1234567',paymentKey:'payment_key_pending_abc',amount:9900,savedAt:Date.now()}));
 }
 const TossPayments=key=>({payment:({customerKey})=>({requestPayment:async data=>calls.push({key,customerKey,data})})});
 const config={enabled,mode,amount:9900,currency:'KRW',clientKey:mode==='test'?'test_ck_mock':'live_ck_mock'};
 const fetch=async(url,opts={})=>{
  const path=new URL(url).pathname;
  if(path==='/api/config')return {ok:true,json:async()=>config};
  if(path==='/api/confirm')return {ok:true,json:async()=>({paid:true,license:'f'.repeat(64)})};
  if(path==='/api/orders'){orderBodies.push(JSON.parse(opts.body));return {ok:true,json:async()=>({amount:9900,orderId:'MOMENT_1234567',checkoutSecret:'a'.repeat(64)})};}
  if(path==='/api/recovery/issue')return {ok:true,json:async()=>({recoveryCode:'e'.repeat(64)})};
  if(path==='/api/recovery/redeem'){recoveryBodies.push(JSON.parse(opts.body));return {ok:true,json:async()=>({license:'f'.repeat(64),recoveryCode:'d'.repeat(64)})};}
  if(path==='/api/purchases/me')return {ok:true,json:async()=>({status:'paid',orderId:'MOMENT_TEST_123',amount:9900,paidAt:1793100000000})};
  if(path==='/api/license')return {ok:licenseStatus===200,status:licenseStatus,json:async()=>({active:licenseStatus===200})};
  if(path.startsWith('/api/assets/'))return {ok:true,blob:async()=>new Blob(['sample'],{type:'image/webp'})};
  throw Error('Unknown '+path);
 };
 const downloadedFiles=[],revokedUrls=[];
 class TestURL extends URL {
  static createObjectURL(blob){downloadedFiles.push({blob});return 'blob:mock-recovery-file-'+downloadedFiles.length;}
  static revokeObjectURL(url){revokedUrls.push(url);}
 }
 const window={confirm:()=>true,MOMENT_PAYMENT_API:'https://example.workers.dev',
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
test('Build22: test config enables only test checkout button',async()=>{
 const ctx=scenario();await tick();assert.equal(ctx.buy.disabled,true);
 ctx.agreement.checked=true;ctx.agreement.change();
 assert.equal(ctx.buy.disabled,false);
 assert.match(ctx.buy.textContent,/테스트 결제/);await ctx.buy.click();
 assert.equal(ctx.calls.length,1);assert.equal(ctx.calls[0].key,'test_ck_mock');
 assert.equal(ctx.orderBodies[0].policyAcknowledged,true);
 assert.equal(ctx.orderBodies[0].policyVersion,'2026-10-28-v1');
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
 assert.equal(ctx.buy.disabled,true);
 ctx.agreement.checked=true;ctx.agreement.change();assert.equal(ctx.buy.disabled,false);
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
 assert.equal(ctx.buy.disabled,true);
 ctx.agreement.checked=true;ctx.agreement.change();
 assert.equal(ctx.buy.disabled,false);
});

test('Build34: no agreement keeps the purchase button disabled and cannot create an order',async()=>{
 const ctx=scenario();await tick();
 assert.equal(ctx.buy.disabled,true);
 await ctx.buy.click();
 assert.equal(ctx.orderBodies.length,0);
 assert.equal(ctx.calls.length,0);
 assert.match(ctx.status.textContent,/구매 안내를 확인/);
 ctx.agreement.checked=true;ctx.agreement.change();
 assert.equal(ctx.buy.disabled,false);
 ctx.agreement.checked=false;ctx.agreement.change();
 assert.equal(ctx.buy.disabled,true);
});

// Build35 UX: existing purchase offers an export; new browser can redeem saved code.
test('Build35: existing buyer issues a one-use code without another payment',async()=>{
 const ctx=scenario({storedLicense:'b'.repeat(64)});await tick();await tick();
 assert.equal(ctx.recoveryIssue.hidden,false);
 assert.equal(ctx.recoveryRedeem.hidden,true);
 await ctx.recoveryIssueBtn.click();await tick();
 assert.equal(ctx.recoveryCodeBox.hidden,false);
 assert.match(ctx.recoveryCodeText.textContent,/^eeeeeeee-/);
 assert.equal(ctx.calls.length,0);
});
test('Build35: new browser rejects malformed code, redeems valid code and stores new license',async()=>{
 const ctx=scenario();await tick();
 ctx.recoveryInput.value='too short';await ctx.recoveryRedeemBtn.click();
 assert.equal(ctx.recoveryBodies.length,0);
 ctx.recoveryInput.value='A'.repeat(64);await ctx.recoveryRedeemBtn.click();await tick();
 assert.equal(ctx.recoveryBodies.length,1);
 assert.equal(ctx.recoveryBodies[0].recoveryCode,'a'.repeat(64));
 assert.equal(ctx.local.get('moment_premium_receipt_v1'),'f'.repeat(64));
 assert.equal(ctx.activated,1);
 assert.equal(ctx.recoveryCodeBox.hidden,false);
 assert.match(ctx.recoveryCodeText.textContent,/^dddddddd-/);
});

test('Build36: purchase summary is hidden before payment and visible after verified license',async()=>{
 const guest=scenario();await tick();assert.equal(guest.purchaseHistory.hidden,true);
 const buyer=scenario({storedLicense:'b'.repeat(64)});await tick();await tick();
 assert.equal(buyer.purchaseHistory.hidden,false);
 assert.equal(buyer.historyOrder.textContent,'MOMENT_TEST_123');
 assert.equal(buyer.historyAmount.textContent,'9,900원');
 assert.match(buyer.historyStatus.textContent,/결제가 확인된/);
 assert.equal(buyer.calls.length,0);
});

test('Build36 hotfix: required checkout checkbox remains visible despite legacy appearance:none',async()=>{
 const style=readFileSync(new URL('../../site/payment/payment-style.css',import.meta.url),'utf8');
 assert.match(style,/\.moment-ack-label input\[type="checkbox"\]/);
 assert.match(style,/appearance:checkbox!important/);
 assert.match(style,/display:inline-block!important/);
 const ctx=scenario();await tick();
 const html=ctx.plan.appended.innerHTML;
 assert.match(html,/type="checkbox" id="moment-policy-ack"/);
 assert.ok(html.indexOf('moment-policy-ack')<html.indexOf('moment-buy'));
 assert.ok(html.indexOf('moment-buy')<html.indexOf('moment-pay-status'));
 assert.ok(html.indexOf('moment-pay-status')<html.indexOf('moment-recovery'));
 assert.equal(ctx.buy.disabled,true);
 ctx.agreement.checked=true;ctx.agreement.change();
 assert.equal(ctx.buy.disabled,false);
});

test('Build37: pending payment success callback can be resumed without a new checkout',async()=>{
 const ctx=scenario({pendingConfirmation:true});await tick();
 assert.equal(ctx.confirmRetryPanel.hidden,false);
 await ctx.confirmRetryButton.click();await tick();
 assert.equal(ctx.activated,1);
 assert.equal(ctx.calls.length,0);
 assert.equal(ctx.orderBodies.length,0);
 assert.equal(ctx.local.get('moment_premium_receipt_v1'),'f'.repeat(64));
 assert.equal(ctx.session.has('moment_pending_confirm_v1'),false);
 assert.equal(ctx.confirmRetryPanel.hidden,true);
});
test('Build37: pending retry button stays hidden without existing confirmed callback proof',async()=>{
 const ctx=scenario();await tick();assert.equal(ctx.confirmRetryPanel.hidden,true);
 const success=readFileSync(new URL('../../site/payment/success.html',import.meta.url),'utf8');
 assert.match(success,/moment_pending_confirm_v1/);
 assert.match(success,/sessionStorage\.setItem\(pendingKey/);
});

test('Build38: after paid access, show 6/6 premium originals and link to the existing PNG editor',async()=>{
 const guest=scenario();await tick();assert.equal(guest.deliveryPanel.hidden,true);
 const paid=scenario({storedLicense:'b'.repeat(64)});await tick();await tick();
 assert.equal(paid.deliveryPanel.hidden,false);
 assert.match(paid.deliveryStatus.textContent,/6\/6/);
 assert.match(paid.plan.appended.innerHTML,/id="moment-premium-go-studio" href="#studio4"/);
 assert.equal(paid.calls.length,0);
});
test('Build38: recovery code can be saved only after issuance, in an explicit local TXT file',async()=>{
 const paid=scenario({storedLicense:'b'.repeat(64)});await tick();await tick();
 await paid.recoveryDownload.click();
 assert.equal(paid.downloadedFiles.length,0);
 await paid.recoveryIssueBtn.click();
 assert.equal(paid.recoveryCodeBox.hidden,false);
 await paid.recoveryDownload.click();
 assert.equal(paid.downloadedFiles.length,1);
 assert.equal(paid.downloadedFiles[0].fileName,'MOMENT-recovery-code.txt');
 const saved=await paid.downloadedFiles[0].blob.text();
 assert.match(saved,/e{64}/);
 assert.doesNotMatch(saved,/b{64}/);
 assert.match(saved,/1회용 복원코드/);
 assert.equal(paid.revokedUrls.length,1);
 assert.equal(paid.calls.length,0);
 assert.equal(paid.orderBodies.length,0);
});
test('Build38: redeeming a code also offers a backup of the next one-time code',async()=>{
 const buyer=scenario();await tick();
 buyer.recoveryInput.value='a'.repeat(64);
 await buyer.recoveryRedeemBtn.click();await tick();
 await buyer.recoveryDownload.click();
 assert.equal(buyer.downloadedFiles.length,1);
 assert.match(await buyer.downloadedFiles[0].blob.text(),/d{64}/);
 assert.doesNotMatch(await buyer.downloadedFiles[0].blob.text(),/a{64}/);
});
