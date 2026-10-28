#!/usr/bin/env node
/**
 * MOMENT RC1 consolidated static release check.
 * Plain run checks technical packaging and leaves manual release pending.
 * --go-live additionally requires verified seller + explicit human approvals.
 */
import fs from 'node:fs';
import vm from 'node:vm';
const required=[
'site-live/index.html','site-live/merchant.js','site-live/merchant.html',
'site-live/privacy.html','site-live/terms.html','site-live/support.html',
'site-live/payment/payment-client.js','site-live/payment/payment-config.js',
'site-live/payment/payment-style.css','site-live/payment/purchase-policy.html',
'site-live/payment/receipt.html','site-live/payment/success.html','site-live/payment/fail.html',
'worker/wrangler.live.toml.example','worker/src/worker.mjs',
'worker/tests/live-release.test.mjs','worker/tests/live-frontend.test.mjs'
];
const errors=[];
for(const path of required)if(!fs.existsSync(path))errors.push('Missing: '+path);
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const publicFiles=required.filter(x=>x.startsWith('site-live/'));
for(const path of publicFiles){
 const s=read(path);
 if(s.includes('moment-payments-test.jsuk5993-1ae.workers.dev'))
  errors.push('TEST Worker URL embedded in public site: '+path);
 if(s.includes('test_sk_')||s.includes('live_sk_'))
  errors.push('Secret key prefix found in public site: '+path);
}
const scripts=read('site-live/payment/payment-client.js'),html=read('site-live/index.html');
const obsoleteCopy=["A PRODUCT IN TESTING","기존 Build 5 디자인","PREMIUM / 상품 준비 중","1회 구매 가정","출시 미정 · 현재 결제 불가","결제 준비 중이므로 미리보기만 가능합니다","결제 후 고화질 PNG 저장 제공 예정"];
for(const phrase of obsoleteCopy)if(html.includes(phrase))errors.push('Outdated storefront copy: '+phrase);
if(html.includes('A PRODUCT IN TESTING')||html.includes('TEST 전용'))errors.push('Customer-facing TEST wording');
if(!html.includes('PREMIUM / 1회 구매'))errors.push('Premium 9900 KRW product pricing missing');
if(!html.includes('구매 및 결제 관련 정보는 별도로 관리됩니다'))errors.push('Buyer-data disclosure warning missing');
if(!scripts.includes('moment_live_premium_receipt_v1'))errors.push('LIVE token storage is not separated');
if(!scripts.includes("cfg.mode!=='live'"))errors.push('LIVE SDK mode check missing');
if(!html.includes('merchant.html')||!html.includes('privacy.html')||!html.includes('support.html'))errors.push('Seller/legal/support navigation missing');
if(!read('worker/src/worker.mjs').includes("DEPLOYMENT_KIND==='public-live'"))errors.push('LIVE Worker isolation missing');
const sandbox={window:{}};
try{vm.runInNewContext(read('site-live/merchant.js'),sandbox,{timeout:500})}catch(e){errors.push('merchant.js cannot be parsed');}
const seller=sandbox.window.MOMENT_MERCHANT||{};
const sellerKeys=['name','representative','registrationNumber','ecommerceReport','address','phone','email','supportEmail'];
const sellerComplete=seller.ready===true&&sellerKeys.every(k=>typeof seller[k]==='string'&&seller[k].trim().length>=3)
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(seller.email);
const runtimeConfig=read('worker/wrangler.live.toml.example');
const separateInfra=runtimeConfig.includes('moment-orders-live')
 && runtimeConfig.includes('moment-premium-live-private') && !runtimeConfig.includes('moment-orders"');
const signoffs=['LIVE_PG_APPROVAL','LIVE_DEPLOY_HOST','LIVE_D1_ISOLATED','LIVE_R2_ISOLATED','LEGAL_SIGNOFF','SELLER_VERIFIED','SUPPORT_CONTACT_TESTED','RECEIPT_DELIVERY_REVIEWED','BROWSER_QA_APPROVED','LIVE_PAYMENT_E2E_VERIFIED'];
const approvals=Object.fromEntries(signoffs.map(x=>[x,process.env[x]||'NOT_APPROVED']));
const launchReady=sellerComplete&&separateInfra&&process.env.LIVE_PG_APPROVAL==='approved'
 && /^https:\/\//.test(process.env.LIVE_DEPLOY_HOST||'')
 && signoffs.filter(x=>!['LIVE_PG_APPROVAL','LIVE_DEPLOY_HOST'].includes(x)).every(x=>process.env[x]==='approved');
if(process.argv.includes('--go-live')&&!launchReady)errors.push('NO-GO: seller identity, PG, isolated services or final manual approvals missing');
console.log(JSON.stringify({
 release:'MOMENT RC1',technicalPackaging:errors.length?'FAIL':'PASS',
 sellerProfile:sellerComplete?'COMPLETE':'MISSING',
 isolatedLiveInfrastructureTemplate:separateInfra?'PRESENT':'MISSING',
 productionPaymentReady:launchReady,
 publicLivePayment:'DISABLED_BY_DEFAULT',
 manualApprovals:approvals,
 errors
},null,2));
process.exitCode=errors.length?1:0;
