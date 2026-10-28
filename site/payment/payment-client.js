/* MOMENT Build 14: payments are disabled until a verified API is explicitly configured.
 * This script is appended AFTER the original invitation app so it can use MOMENT_ACCESS.
 */
(() => {
  'use strict';
  const api = String(window.MOMENT_PAYMENT_API || '').replace(/\/$/, '');
  const tokenStorageKey='moment_premium_receipt_v1';
  const policyVersion='2026-10-28-v1';
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
    <div class="moment-purchase-info"><strong>결제·환불 사전 안내</strong>
      <p>프리미엄 6종은 결제 승인 즉시 제공돼요. 제공이 시작된 디지털 콘텐츠는 법정 요건을 충족하는 경우 단순 변심 청약철회가 제한될 수 있습니다. 다만 제공 오류·중복 결제·설명과 다른 상품 등 법정 권리는 유지됩니다.</p>
      <a href="payment/purchase-policy.html" target="_blank" rel="noopener noreferrer">상품 내용과 환불 기준 자세히 보기</a>
      <label class="moment-ack-label"><input type="checkbox" id="moment-policy-ack">
      <span>워터마크 미리보기 제공, 결제 후 즉시 콘텐츠 제공 및 청약철회 제한 가능성에 대한 안내를 확인했습니다. <strong>(필수 · 체크해야 결제 가능)</strong></span></label>
    </div>
    <button type="button" id="moment-buy" disabled>결제 준비 중</button>
    <p class="moment-payment-status" id="moment-pay-status" role="status" aria-live="polite">결제 연동이 완료되면 이용할 수 있어요.</p>
    <div id="moment-confirm-retry" class="moment-confirm-retry" hidden>
      <strong>이전에 진행한 TEST 결제가 있나요?</strong>
      <p>기존 주문의 승인 결과만 다시 조회합니다. 결제창을 새로 열거나 새 주문을 만들지 않습니다.</p>
      <button type="button" id="moment-confirm-retry-btn">기존 결제 승인 다시 확인</button>
      <p id="moment-confirm-retry-status" role="status" aria-live="polite"></p>
    </div>
    <section id="moment-premium-ready" class="moment-premium-ready" hidden aria-label="프리미엄 이용 준비 완료">
      <strong>프리미엄 원본 준비 완료</strong>
      <p id="moment-premium-ready-status">프리미엄 배경을 확인하고 있어요.</p>
      <a id="moment-premium-go-studio" href="#studio4">초대장 편집기로 이동 · PNG 2장 저장하기</a>
      <p>편집기에서 프리미엄 디자인을 고르고 초대 정보를 입력한 다음 저장하세요. 이 버튼 자체가 PNG를 저장하는 것은 아닙니다.</p>
    </section>
    <section class="moment-purchase-history" id="moment-purchase-history" hidden aria-label="내 구매내역">
      <strong>내 구매내역</strong>
      <dl><dt>주문번호</dt><dd id="moment-history-order">-</dd>
        <dt>구매금액</dt><dd id="moment-history-amount">-</dd>
        <dt>구매일시</dt><dd id="moment-history-date">-</dd>
        <dt>구매상품</dt><dd>MOMENT 프리미엄 초대장 6종</dd></dl>
      <button type="button" id="moment-history-refresh">구매내역 다시 확인</button>
      <p id="moment-history-status" role="status" aria-live="polite"></p>
      <p>결제 또는 구매 권한 문의 시 주문번호와 토스 결제내역을 준비해 주세요. 주문번호만으로 구매 권한을 재발급하지 않습니다.</p>
    </section>
    <section class="moment-recovery" aria-label="기존 구매 복원">
      <strong>기존 구매 복원 · 기기 변경</strong>
      <p>이미 결제했다면 구매 당시 따로 보관한 1회용 복원코드로 새 기기에서 이용할 수 있어요. 코드가 없으면 자동 복원할 수 없습니다.</p>
      <div id="moment-recovery-redeem"><label for="moment-recovery-input">복원코드</label>
        <input type="text" id="moment-recovery-input" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="90" placeholder="64자리 복원코드 입력">
        <button type="button" id="moment-recovery-redeem-btn">기존 구매 복원</button></div>
      <div id="moment-recovery-issue" hidden><p>현재 구매 권한이 확인됐어요. 기기 변경에 대비해 복원코드를 발급해 안전하게 보관하세요. 재발급하면 이전 코드는 폐기됩니다.</p>
        <button type="button" id="moment-recovery-issue-btn">1회용 복원코드 발급·재발급</button></div>
      <div id="moment-recovery-code" hidden role="status" aria-live="polite"><p>이 코드는 다시 표시되지 않아요. 반드시 따로 저장하세요. 다른 사람이 알면 구매 권한을 이전할 수 있습니다.</p>
        <code id="moment-recovery-code-value"></code>
        <button type="button" id="moment-recovery-copy">복원코드 복사</button>
        <button type="button" id="moment-recovery-download">복원코드 TXT 파일로 저장</button>
        <p class="moment-code-storage-note">파일에는 기기 이전에 필요한 비밀 코드가 포함됩니다. 개인 기기에만 보관하고 공유·업로드하지 마세요.</p></div>
      <p id="moment-recovery-status" role="status" aria-live="polite"></p>
    </section>`;
  plan.append(panel);
  const buy=panel.querySelector('#moment-buy'),status=panel.querySelector('#moment-pay-status');
  const agreement=panel.querySelector('#moment-policy-ack');
  const pendingKey='moment_pending_confirm_v1';
  const confirmRetryPanel=panel.querySelector('#moment-confirm-retry');
  const confirmRetryButton=panel.querySelector('#moment-confirm-retry-btn');
  const confirmRetryStatus=panel.querySelector('#moment-confirm-retry-status');
  const pendingPayment=()=>{
    try{
      const p=JSON.parse(sessionStorage.getItem(pendingKey)||'null');
      if(p && typeof p.orderId==='string'&&/^MOMENT_[a-zA-Z0-9_-]{6,64}$/.test(p.orderId)
        && typeof p.paymentKey==='string'&&p.paymentKey.length>=6&&p.paymentKey.length<=200
        && p.amount===9900 && Number.isFinite(p.savedAt)&&Date.now()-p.savedAt>=0&&Date.now()-p.savedAt<60*60*1000
        && /^[a-f0-9]{64}$/.test(sessionStorage.getItem('moment_order_'+p.orderId)||''))return p;
    }catch{}
    return null;
  };
  confirmRetryPanel.hidden=!pendingPayment();
  confirmRetryButton.addEventListener('click',async()=>{
    const pending=pendingPayment();
    if(!pending){confirmRetryStatus.textContent='이 브라우저에 복구 가능한 기존 주문 정보가 없어요. 새 결제는 하지 마세요.';return;}
    confirmRetryButton.disabled=true;
    confirmRetryStatus.textContent='기존 주문의 승인 상태를 다시 확인하고 있어요. 새 결제는 발생하지 않습니다.';
    try{
      const response=await fetch(api+'/api/confirm',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({orderId:pending.orderId,paymentKey:pending.paymentKey,amount:9900,checkoutSecret:sessionStorage.getItem('moment_order_'+pending.orderId)})});
      const result=await response.json();
      if(!response.ok||result.paid!==true||!/^[a-f0-9]{64}$/.test(result.license||''))
        throw Error(result.message||'기존 주문의 승인을 아직 확인하지 못했어요.');
      localStorage.setItem(tokenStorageKey,result.license);
      confirmRetryStatus.textContent='결제 확인 완료. 프리미엄 이미지를 확인하고 있어요.';
      if(!await unlock(result.license))throw Error('구매 권한 확인에 실패했어요.');
      sessionStorage.removeItem('moment_order_'+pending.orderId);
      sessionStorage.removeItem(pendingKey);
      confirmRetryPanel.hidden=true;
    }catch(e){confirmRetryStatus.textContent=(e.message||'결제 상태 조회 실패')+' 새로 결제하지 말고 다시 시도해 주세요.';}
    finally{confirmRetryButton.disabled=false;}
  });
  const deliveryPanel=panel.querySelector('#moment-premium-ready');
  const deliveryStatus=panel.querySelector('#moment-premium-ready-status');
  const purchaseHistory=panel.querySelector('#moment-purchase-history');
  const historyOrder=panel.querySelector('#moment-history-order');
  const historyAmount=panel.querySelector('#moment-history-amount');
  const historyDate=panel.querySelector('#moment-history-date');
  const historyRefresh=panel.querySelector('#moment-history-refresh');
  const historyStatus=panel.querySelector('#moment-history-status');
  const loadPurchaseInfo=async(token)=>{
    historyStatus.textContent='토스 결제 상태 확인 중…';
    try{
      const response=await get('/api/purchases/me',{headers:{authorization:'Bearer '+token}});
      const result=await response.json();
      if(!response.ok||result.status!=='paid')throw Error(result.message||'구매내역을 확인하지 못했어요.');
      historyOrder.textContent=String(result.orderId||'-');
      historyAmount.textContent=Number(result.amount)===9900?'9,900원':'확인 필요';
      historyDate.textContent=Number.isFinite(result.paidAt)&&result.paidAt>0?new Date(result.paidAt).toLocaleString('ko-KR'):'확인 필요';
      historyStatus.textContent='결제가 확인된 구매내역입니다.';
    }catch(e){historyStatus.textContent=(e.message||'조회가 지연되고 있어요.')+' 중복 결제하지 마세요.';}
  };
  historyRefresh.addEventListener('click',()=>{
    const receipt=localStorage.getItem(tokenStorageKey);
    if(receipt)void loadPurchaseInfo(receipt);
    else historyStatus.textContent='구매 권한을 먼저 복원해 주세요.';
  });
  const recoveryIssue=panel.querySelector('#moment-recovery-issue');
  const recoveryIssueBtn=panel.querySelector('#moment-recovery-issue-btn');
  const recoveryRedeem=panel.querySelector('#moment-recovery-redeem');
  const recoveryInput=panel.querySelector('#moment-recovery-input');
  const recoveryRedeemBtn=panel.querySelector('#moment-recovery-redeem-btn');
  const recoveryCodeBox=panel.querySelector('#moment-recovery-code');
  const recoveryCodeText=panel.querySelector('#moment-recovery-code-value');
  const recoveryCopy=panel.querySelector('#moment-recovery-copy');
  const recoveryDownload=panel.querySelector('#moment-recovery-download');
  const recoveryStatus=panel.querySelector('#moment-recovery-status');
  let plainRecoveryCode='';
  const sayRecovery=s=>recoveryStatus.textContent=s;
  const showRecoveryCode=code=>{
    plainRecoveryCode=code;
    recoveryCodeText.textContent=code.match(/.{1,8}/g).join('-');
    recoveryCodeBox.hidden=false;
  };
  const say=(s)=>status.textContent=s;
  let checkoutReady=false;
  const syncBuy=()=>{
    buy.disabled=!checkoutReady || !agreement.checked;
    if(checkoutReady && !agreement.checked) say('구매 안내를 확인하려면 위 안내문 아래의 네모 체크박스를 선택해 주세요. 선택하면 결제 버튼이 활성화됩니다.');
    else if(checkoutReady) say('토스 TEST 환경입니다. 실제 카드에 돈이 청구되지 않아요.');
  };
  agreement.addEventListener('change',syncBuy);
  recoveryIssueBtn.addEventListener('click',async()=>{
    const receipt=localStorage.getItem(tokenStorageKey);
    if(!receipt){sayRecovery('구매 권한을 먼저 확인해 주세요.');return;}
    if(!window.confirm('새 복원코드를 발급할까요? 이전에 발급한 코드는 무효화됩니다.'))return;
    recoveryIssueBtn.disabled=true;
    recoveryCodeBox.hidden=true;plainRecoveryCode='';
    sayRecovery('토스 구매 상태 확인 후 복원코드를 발급하고 있어요.');
    try{
      const res=await get('/api/recovery/issue',{method:'POST',headers:{authorization:'Bearer '+receipt}});
      const data=await res.json();
      if(!res.ok||!/^[a-f0-9]{64}$/.test(data.recoveryCode||''))throw Error(data.message||'코드를 발급하지 못했어요.');
      showRecoveryCode(data.recoveryCode);
      sayRecovery('발급 완료. 코드를 지금 안전하게 복사해 두세요.');
    }catch(e){sayRecovery(e.message||'복원코드를 발급하지 못했습니다.');}
    finally{recoveryIssueBtn.disabled=false;}
  });
  recoveryCopy.addEventListener('click',async()=>{
    if(!plainRecoveryCode)return;
    try{await navigator.clipboard.writeText(plainRecoveryCode);sayRecovery('복원코드를 복사했어요. 안전한 곳에 보관하세요.');}
    catch{sayRecovery('자동 복사가 차단됐어요. 위 코드를 직접 선택해 복사해 주세요.');}
  });
  recoveryDownload.addEventListener('click',()=>{
    // The code is only available in memory immediately after issue/redeem.
    // A user action is mandatory; never auto-save or put a code into a URL.
    if(!/^[a-f0-9]{64}$/.test(plainRecoveryCode)){
      sayRecovery('현재 화면에 표시된 복원코드가 없어요. 구매 권한으로 새 코드를 발급해 주세요.');
      return;
    }
    let url='';
    try{
      const lines=[
        'MOMENT · 프리미엄 기기 변경용 복원코드 (TEST)',
        '',
        '1회용 복원코드: '+plainRecoveryCode,
        '',
        '사용 방법: MOMENT 비공개 TEST 사이트에서 기존 구매 복원에 입력하세요.',
        '사용하면 이 코드는 폐기되고 새 복원코드를 반드시 다시 저장해야 합니다.',
        '이 파일을 타인에게 공유하거나 공개 저장소에 업로드하지 마세요.',
        '이 파일은 영수증이나 결제 증명서가 아닙니다.'
      ];
      const content=lines.join('\n');
      const file=new Blob([content],{type:'text/plain;charset=utf-8'});
      url=URL.createObjectURL(file);
      const a=document.createElement('a');
      a.href=url;
      a.download='MOMENT-recovery-code.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Delay revocation to let mobile browsers finish initiating the download.
      setTimeout(()=>URL.revokeObjectURL(url),1500);
      sayRecovery('복원코드 파일 저장을 요청했어요. 실제 저장 여부를 확인하고 안전하게 보관해 주세요.');
    }catch(e){
      if(url)URL.revokeObjectURL(url);
      sayRecovery('파일 저장이 지원되지 않는 브라우저예요. 복원코드 복사 버튼을 이용해 주세요.');
    }
  });
  recoveryRedeemBtn.addEventListener('click',async()=>{
    const code=recoveryInput.value.replace(/[\s-]/g,'').toLowerCase();
    if(!/^[a-f0-9]{64}$/.test(code)){sayRecovery('64자리 복원코드를 입력해 주세요.');return;}
    recoveryRedeemBtn.disabled=true;
    sayRecovery('토스 구매 상태를 확인하고 권한을 복원하고 있어요.');
    try{
      const res=await get('/api/recovery/redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({recoveryCode:code})});
      const data=await res.json();
      if(!res.ok||!/^[a-f0-9]{64}$/.test(data.license||'')||!/^[a-f0-9]{64}$/.test(data.recoveryCode||''))throw Error(data.message||'복원에 실패했어요.');
      localStorage.setItem(tokenStorageKey,data.license);
      recoveryInput.value='';
      showRecoveryCode(data.recoveryCode);
      sayRecovery('복원 완료! 이전 복원코드는 폐기됐어요. 새 코드를 반드시 저장하세요.');
      // Paid access is activated immediately; old device's bearer token is rotated.
      await unlock(data.license);
    }catch(e){sayRecovery(e.message||'복원 상태가 불확실해요. 다시 결제하지 마세요.');}
    finally{recoveryRedeemBtn.disabled=false;}
  });
  const get=(path,options={})=>fetch(api+path,{cache:'no-store',...options});
  const available = () => api.startsWith('https://') && api.length>12;
  async function unlock(token) {
    const check=await get('/api/license?verify=1',{headers:{authorization:'Bearer '+token}});
    if(check.status===401){localStorage.removeItem(tokenStorageKey);return false;}
    if(!check.ok)throw new Error('구매 상태 확인이 일시적으로 지연되고 있어요. 다시 결제하지 말고 새로고침해 주세요.');
    const photos={};
    deliveryPanel.hidden=true;
    let loaded=0;
    for(const id of PREMIUM){
      const res=await get('/api/assets/'+id,{headers:{authorization:'Bearer '+token}});
      if(!res.ok)throw new Error('원본 이미지 제공 준비가 끝나지 않았어요.');
      const blob=await res.blob();
      if(!blob.type.startsWith('image/'))throw new Error('이미지 데이터가 올바르지 않아요.');
      photos[id]=blob;
      loaded++;
      say('프리미엄 배경 다운로드 확인 중… '+loaded+'/'+PREMIUM.length);
    }
    await window.MOMENT_ACCESS.activate(photos);
    deliveryStatus.textContent='프리미엄 배경 '+loaded+'/'+PREMIUM.length+'종을 불러왔어요. 이제 편집기에서 초대장을 완성하고 고화질 PNG 세트를 저장하세요.';
    deliveryPanel.hidden=false;
    buy.disabled=true;buy.textContent='프리미엄 이용 중';
    confirmRetryPanel.hidden=true;
    recoveryIssue.hidden=false;recoveryRedeem.hidden=true;
    purchaseHistory.hidden=false;void loadPurchaseInfo(token);
    say('구매 권한이 확인됐어요. 고화질 PNG 2장 저장이 가능합니다. 기기 변경용 복원코드를 꼭 보관해 주세요.');
    return true;
  }
  function ensureTossSDK(){return new Promise((resolve,reject)=>{if(typeof window.TossPayments==='function')return resolve();const script=document.createElement('script');script.src='https://js.tosspayments.com/v2/standard';script.onload=resolve;script.onerror=()=>reject(Error('SDK_load_failed'));document.head.appendChild(script);});}
  async function init(){
    if(!available()){say('테스트 서버 주소가 설정되지 않았어요.');return;}
    try{
      const res=await get('/api/config');
      if(!res.ok){say('테스트 서버 접근이 확인되지 않았어요. 비공개 로그인 상태를 확인해 주세요.');return;}
      const cfg=await res.json();
      if(cfg.mode!=='test' && cfg.enabled){say('테스트 전용 화면에서는 실결제를 사용할 수 없어요.');return;}
      const receipt=localStorage.getItem(tokenStorageKey);
      if(receipt){
        try{if(await unlock(receipt))return;}
        catch(e){say(e.message||'구매 권한 확인이 지연돼요. 중복 결제하지 마세요.');return;}
      }
      if(!cfg.enabled){say('새 결제는 일시 중단됐지만 기존 구매자의 이용은 계속 가능합니다.');return;}
      if(!Number.isInteger(cfg.amount)||cfg.amount!==9900 || !cfg.clientKey){say('테스트 결제 설정을 확인할 수 없어요.');return;}
      try{await ensureTossSDK()}catch{say('결제 화면을 불러오지 못했습니다. 새로고침해 주세요.');return;}
      checkoutReady=true;
      buy.textContent='테스트 결제 시작 · 9,900원 (실제 청구 없음)';
      syncBuy();
      buy.addEventListener('click',async()=>{
        if(!checkoutReady || !agreement.checked){syncBuy();return;}
        buy.disabled=true;say('주문을 준비하고 있어요…');
        try {
          const response=await get('/api/orders',{method:'POST',headers:{'content-type':'application/json'},
            body:JSON.stringify({policyAcknowledged:true,policyVersion})});
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
