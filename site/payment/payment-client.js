/* MOMENT Build 14: payments are disabled until a verified API is explicitly configured.
 * This script is appended AFTER the original invitation app so it can use MOMENT_ACCESS.
 */
(() => {
  'use strict';
  const api = String(window.MOMENT_PAYMENT_API || '').replace(/\/$/, '');
  const tokenStorageKey='moment_premium_receipt_v1';
  const PREMIUM=['city','stars','sunset','retro','med','disco'];
  const notice=document.getElementById('premiumActions');
  if (!notice || !window.MOMENT_ACCESS) return;
  const panel=document.createElement('section');
  panel.className='moment-checkout';
  panel.innerHTML=`<div class="moment-payment-topline">PREMIUM ACCESS <span>1회 구매 · 9,900원</span></div>
    <p class="moment-payment-explain">프리미엄 6종을 이용하고 메인 초대장 + 오시는 길을 워터마크 없이 저장할 수 있습니다.</p>
    <button type="button" id="moment-buy" disabled>결제 준비 중</button>
    <p class="moment-payment-status" id="moment-pay-status" role="status" aria-live="polite">결제 연동이 완료되면 이용할 수 있어요.</p>`;
  notice.append(panel);
  const buy=panel.querySelector('#moment-buy'),status=panel.querySelector('#moment-pay-status');
  const say=(s)=>status.textContent=s;
  const get=(path,options={})=>fetch(api+path,{cache:'no-store',...options});
  const available = () => api.startsWith('https://') && api.length>12;
  async function unlock(token) {
    const check=await get('/api/license',{headers:{authorization:'Bearer '+token}});
    if(!check.ok)return false;
    const photos={};
    for(const id of PREMIUM){
      const res=await get('/api/assets/'+id,{headers:{authorization:'Bearer '+token}});
      if(!res.ok)throw new Error('원본 이미지 제공 준비가 끝나지 않았어요.');
      const blob=await res.blob();
      if(!blob.type.startsWith('image/'))throw new Error('이미지 데이터가 올바르지 않아요.');
      photos[id]=blob;
    }
    await window.MOMENT_ACCESS.activate(photos);
    buy.disabled=true;buy.textContent='프리미엄 이용 중';say('구매 권한이 확인됐어요. 이제 고화질 PNG 2장 세트를 저장할 수 있습니다.');
    return true;
  }
  function ensureTossSDK(){return new Promise((resolve,reject)=>{if(typeof window.TossPayments==='function')return resolve();const script=document.createElement('script');script.src='https://js.tosspayments.com/v2/standard';script.onload=resolve;script.onerror=()=>reject(Error('SDK_load_failed'));document.head.appendChild(script);});}
  async function init(){
    if(!available())return;
    try{
      const res=await get('/api/config');const cfg=await res.json();
      if(!cfg.enabled || cfg.mode!=='test')return; // staging NEVER accepts LIVE config
      if(!Number.isInteger(cfg.amount)||cfg.amount!==9900)return;
      if(!cfg.clientKey)return;
      const receipt=localStorage.getItem(tokenStorageKey);
      if(receipt){
        try{if(await unlock(receipt))return;}catch(e){say('이전에 구매한 상품을 복원하지 못했어요. 잠시 뒤 다시 확인해 주세요.');}
      }
      try{await ensureTossSDK()}catch{say('결제 화면을 불러오지 못했습니다. 새로고침해 주세요.');return;}
      buy.disabled=false;buy.textContent=cfg.mode==='test'?'테스트 결제 시작 (실제 청구 없음)':'프리미엄 9,900원 결제하기';
      say(cfg.mode==='test'?'테스트 연동 환경입니다. 실제 금액이 청구되지 않아요.':'결제 승인 후 자동으로 다운로드 권한이 열립니다.');
      buy.addEventListener('click',async()=>{
        buy.disabled=true;say('주문을 준비하고 있어요…');
        try {
          const response=await get('/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
          if(!response.ok)throw new Error('주문 생성에 실패했어요.');
          const order=await response.json();
          if(order.amount!==9900 || !order.checkoutSecret || !order.orderId)throw new Error('주문 정보가 올바르지 않아요.');
          sessionStorage.setItem('moment_order_'+order.orderId,order.checkoutSecret);
          const toss=window.TossPayments(cfg.clientKey);
          const customerKey=sessionStorage.getItem('moment_test_customer_v1') || crypto.randomUUID();
          sessionStorage.setItem('moment_test_customer_v1',customerKey);
          const payment=toss.payment({customerKey});
          // Navigate in the SAME tab so sessionStorage survives Toss redirect.
          await payment.requestPayment({
            method:'CARD', amount:{value:9900,currency:'KRW'}, orderId:order.orderId,
            orderName:'MOMENT 프리미엄 초대장 6종',
            successUrl:new URL('payment/success.html',document.baseURI).href,
            failUrl:new URL('payment/fail.html',document.baseURI).href,
            windowTarget:'self'
          });
        }catch(err){buy.disabled=false;say(err.message||'결제창을 열지 못했어요.');}
      });
    }catch(e){say('결제 서버가 아직 준비되지 않았어요. 잠시 후 다시 이용해 주세요.');}
  }
  init();
})();
