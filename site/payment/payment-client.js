/* MOMENT Build 14: payments are disabled until a verified API is explicitly configured.
 * This script is appended AFTER the original invitation app so it can use MOMENT_ACCESS.
 */
(() => {
  'use strict';
  const api = String(window.MOMENT_PAYMENT_API || '').replace(/\/$/, '');
  const tokenStorageKey='moment_premium_receipt_v1';
  const PREMIUM=['city','stars','sunset','retro','med','disco'];
  // Keep the CTA visible on the 9,900원 plan itself, not in the editor's
  // premiumActions (which is hidden until a premium theme is chosen).
  const plan=document.querySelector('#plans4 .pricing4 .plan4.active');
  const notice=document.getElementById('premiumActions');
  if (!plan || !window.MOMENT_ACCESS) return;
  const planName=plan.querySelector('.plan-name');
  const priceHint=plan.querySelector('.money span');
  const badge=plan.querySelector('.pill-note');
  const benefit=plan.querySelector('ul li:last-child');
  const intro=document.querySelector('#plans4 .business-intro p');
  const policy=document.querySelector('#plans4 .test-explain');
  const divider=document.querySelector('.collection-divider.paid small');
  if(planName)planName.textContent='PREMIUM / TEST 전용';
  if(priceHint)priceHint.textContent='/ 1회 구매 · 가상 결제';
  if(badge)badge.textContent='비공개 TEST · 실제 청구 없음';
  if(benefit)benefit.textContent='테스트 승인 후 프리미엄 PNG 2장 저장';
  if(intro)intro.textContent='베이직 4종은 무료입니다. 프리미엄 6종은 비공개 테스트 환경에서 결제와 고화질 PNG 저장까지 확인할 수 있어요.';
  if(policy)policy.textContent='테스트 전용 페이지입니다. 토스 테스트 키만 사용하며 실제 결제금액은 청구되지 않습니다. 정식 판매는 아직 시작하지 않았습니다.';
  if(divider)divider.textContent='TEST · 9,900원';
  if(notice)notice.innerHTML='<strong>프리미엄 테스트 결제</strong>이 페이지 위쪽 9,900원 프리미엄 카드에서 가상 결제를 시작해 주세요. <a href="#plans4">결제 카드로 이동</a>';
  const panel=document.createElement('section');
  panel.className='moment-checkout';
  panel.innerHTML=`<div class="moment-payment-topline">PREMIUM ACCESS <span>1회 구매 · 9,900원</span></div>
    <p class="moment-payment-explain">테스트 결제 승인 후 프리미엄 디자인 6종과 워터마크 없는 PNG 2장 저장을 확인합니다.</p>
    <button type="button" id="moment-buy" disabled>결제 준비 중</button>
    <p class="moment-payment-status" id="moment-pay-status" role="status" aria-live="polite">결제 연동이 완료되면 이용할 수 있어요.</p>`;
  plan.append(panel);
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
    if(!available()){say('테스트 서버 주소가 설정되지 않았어요.');return;}
    try{
      const res=await get('/api/config');
      if(!res.ok){say('테스트 서버 접근이 확인되지 않았어요. 비공개 로그인 상태를 확인해 주세요.');return;}
      const cfg=await res.json();
      if(!cfg.enabled){say('현재 서버에서 테스트 결제가 비활성화되어 있어요.');return;}
      if(cfg.mode!=='test'){say('테스트 전용 화면에서는 실결제를 사용할 수 없어요.');return;}
      if(!Number.isInteger(cfg.amount)||cfg.amount!==9900 || !cfg.clientKey){say('테스트 결제 설정을 확인할 수 없어요.');return;}
      const receipt=localStorage.getItem(tokenStorageKey);
      if(receipt){
        try{if(await unlock(receipt))return;}catch(e){say('이전에 구매한 상품을 복원하지 못했어요. 잠시 뒤 다시 확인해 주세요.');}
      }
      try{await ensureTossSDK()}catch{say('결제 화면을 불러오지 못했습니다. 새로고침해 주세요.');return;}
      buy.disabled=false;buy.textContent='테스트 결제 시작 · 9,900원 (실제 청구 없음)';
      say('토스 TEST 환경입니다. 실제 카드에 돈이 청구되지 않아요.');
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
