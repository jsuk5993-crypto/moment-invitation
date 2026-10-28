import {handleStagingRequest,hasStageSession,stageGateReady} from './staging.mjs';
/* MOMENT checkout API — Cloudflare Worker / D1 / R2
 * Payment succeeds ONLY after server-side Toss confirmation.
 * Never deploy with real keys in source control. PAYMENTS_ACTIVE defaults OFF.
 */
const PRICE_KRW = 9900;
// Build 35: accountless recovery codes are single-use, 256-bit secrets kept hashed in D1.
const PURCHASE_POLICY_VERSION = '2026-10-28-v1';
const ASSETS = new Set(['city', 'stars', 'sunset', 'retro', 'med', 'disco']);
const MAX_ORDER_AGE_MS = 60 * 60 * 1000;
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const now = () => Date.now();
const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
const sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), x => x.toString(16).padStart(2,'0')).join('');
const normalizeOrigin = (s) => {try {return new URL(s).origin;} catch {return ''}};
// The SDK below uses tossPayments.payment(), which requires API-individual ck/sk keys.
// gck/gsk are for widgets, not for the legacy payment() SDK.
const keyPairReady = (env) => {
  const prefix = env.PAYMENTS_MODE === 'test' ? 'test_' : env.PAYMENTS_MODE === 'live' ? 'live_' : '';
  return !!prefix && typeof env.TOSS_CLIENT_KEY === 'string' && typeof env.TOSS_SECRET_KEY === 'string'
    && env.TOSS_CLIENT_KEY.startsWith(prefix + 'ck_') && env.TOSS_SECRET_KEY.startsWith(prefix + 'sk_');
};
// FAIL CLOSED: this Worker is a staging-only payment server.
 // Test checkout MUST NOT become public even when Cloudflare dashboard overrides Wrangler flags.
const isReaderReady = (env) => env.PAYMENTS_MODE === 'test'
  && stageGateReady(env) && !!env.DB && !!env.PREMIUM_ASSETS
  && typeof env.TOSS_SECRET_KEY === 'string' && env.TOSS_SECRET_KEY.startsWith('test_sk_')
  && !!env.PUBLIC_ORIGIN;
// Enabling/disabling new checkout must NEVER revoke access for earlier paid orders.
const isEnabled = (env) => env.PAYMENTS_ACTIVE === 'true' && isReaderReady(env)
  && keyPairReady(env);
const cors = (origin) => ({'access-control-allow-origin':origin, 'vary':'Origin', 'access-control-allow-methods':'GET,POST,OPTIONS', 'access-control-allow-headers':'content-type,authorization', 'access-control-max-age':'600'});
class ClientInputError extends Error {}
const errors = { disabled: '결제 연결 준비 중입니다.', invalid: '요청 정보를 확인해 주세요.', denied: '구매 권한이 확인되지 않았습니다.', unexpected: '결제 상태 확인이 지연되고 있습니다. 중복 결제하지 말고 고객센터에 문의해 주세요.' };
const paymentAuth = (env) => 'Basic ' + btoa(env.TOSS_SECRET_KEY + ':');
function checkPayment(p, order) { return p && p.orderId === order.order_id && p.totalAmount === PRICE_KRW && p.status === 'DONE' && typeof p.paymentKey === 'string' && p.paymentKey.length > 0; }
async function tossConfirm(env, paymentKey, orderId) {
  return fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: { 'authorization': paymentAuth(env), 'content-type':'application/json', 'idempotency-key':'moment-' + orderId },
    body: JSON.stringify({ paymentKey, orderId, amount: PRICE_KRW })
  });
}
async function tossQuery(env, paymentKey) {
  return fetch('https://api.tosspayments.com/v1/payments/' + encodeURIComponent(paymentKey), {
    headers: { authorization: paymentAuth(env) }
  });
}
async function issueLicense(env, orderId) {
  const token = randomSecret();
  const hash = await sha(token);
  await env.DB.prepare('UPDATE orders SET license_hash = ? WHERE order_id = ? AND status = ?').bind(hash, orderId, 'paid').run();
  return token;
}
async function ensureRecoveryTable(env) {
  // Upgrade existing TEST D1 databases without modifying orders or checkout proofs.
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS purchase_recovery (order_id TEXT PRIMARY KEY, recovery_hash TEXT NOT NULL UNIQUE, updated_at INTEGER NOT NULL, FOREIGN KEY (order_id) REFERENCES orders(order_id))').run();
}
async function readOrder(env, orderId) { return env.DB.prepare('SELECT * FROM orders WHERE order_id = ?').bind(orderId).first(); }
async function updatePaid(env, orderId, paymentKey) {
  await env.DB.prepare('UPDATE orders SET status = ?, payment_key = ?, paid_at = ? WHERE order_id = ? AND status IN (?, ?)').bind('paid', paymentKey, now(), orderId, 'confirming', 'paid').run();
}
async function revokeLicense(env, orderId) {
  await env.DB.prepare('UPDATE orders SET status = ?, license_hash = NULL WHERE order_id = ? AND status = ?')
    .bind('refunded', orderId, 'paid').run();
}
// Called on a paid buyer's restore attempt. Verify status at Toss before returning assets.
// This is a single remote lookup on page reload, not one remote call per image.
async function verifyLicenseWithToss(env, order) {
  const full=await readOrder(env,order.order_id);
  if(!full || full.status!=='paid' || !full.payment_key) return 'inactive';
  try {
    const response=await tossQuery(env,full.payment_key);
    if(!response.ok) return 'unavailable';
    const p=await response.json();
    if(p.orderId!==full.order_id || p.paymentKey!==full.payment_key || p.totalAmount!==PRICE_KRW)
      return 'unavailable';
    if(['CANCELED','PARTIAL_CANCELED'].includes(p.status)) {
      await revokeLicense(env,full.order_id);
      return 'inactive';
    }
    return p.status==='DONE' ? 'active' : 'unavailable';
  }catch {return 'unavailable';}
}
const authToken = (req) => {const h=req.headers.get('authorization')||'';return /^Bearer [a-f0-9]{64}$/.test(h) ? h.slice(7) : '';};
async function licenseOrder(req, env) {
  const token = authToken(req);
  if (!token) return null;
  return env.DB.prepare('SELECT order_id, status FROM orders WHERE license_hash = ?').bind(await sha(token)).first();
}
async function readJSON(req) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ClientInputError('invalid_type');
  const size=Number(req.headers.get('content-length')||0);
  if (!Number.isFinite(size) || size > 8000) throw new ClientInputError('large');
  // Content-Length can be absent or forged. Read a bounded stream instead of req.json().
  // Prevent large unauthenticated requests from consuming excessive memory/CPU.
  const reader=req.body?.getReader();
  if (!reader) throw new ClientInputError('invalid_json');
  const chunks=[];let total=0;
  try {
    while(true){
      const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;
      if(total>8000){await reader.cancel();throw new ClientInputError('large');}
      chunks.push(value);
    }
  }catch(err){if(err instanceof ClientInputError)throw err;throw new ClientInputError('invalid_json');}
  const bytes=new Uint8Array(total);let at=0;
  for(const part of chunks){bytes.set(part,at);at+=part.byteLength;}
  let data;
  try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw new ClientInputError('invalid_json');}
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ClientInputError('invalid_json');
  return data;
}
async function handle(req, env, pathname) {
  if (pathname === '/api/health' && req.method === 'GET') {
    // Safe public bootstrap diagnostic: never exposes credentials or purchase data.
    return json({ok:true, service:'moment-payments', build:'35', paymentsEnabled:isEnabled(env)});
  }
  if (pathname === '/api/db-health' && req.method === 'GET') {
    // Public read-only diagnostic. Never returns order records or credentials.
    if (!env.DB) return json({ok:false, databaseConnected:false, ordersTableReady:false},503);
    try {
      const table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orders'").first();
      const ready=!!table;
      return json({ok:ready, databaseConnected:true, ordersTableReady:ready},ready?200:503);
    } catch {
      return json({ok:false, databaseConnected:true, ordersTableReady:false},503);
    }
  }
  if (pathname === '/api/r2-health' && req.method === 'GET') {
    // Read-only probe: HEAD checks never return premium contents or R2 URLs.
    if (!env.PREMIUM_ASSETS || typeof env.PREMIUM_ASSETS.head !== 'function') {
      return json({ok:false, storageConnected:false, assetsReady:0, assetsExpected:ASSETS.size},503);
    }
    try {
      const checks = await Promise.all([...ASSETS].map(design => env.PREMIUM_ASSETS.head('premium/' + design + '.webp')));
      const ready = checks.filter(Boolean).length;
      const ok = ready === ASSETS.size;
      return json({ok, storageConnected:true, assetsReady:ready, assetsExpected:ASSETS.size},ok?200:503);
    } catch {
      return json({ok:false, storageConnected:true, assetsReady:0, assetsExpected:ASSETS.size},503);
    }
  }
  if (pathname === '/api/payment-setup' && req.method === 'GET') {
    // Only returns booleans. NEVER echo client/secret keys or payment credentials.
    const mode = env.PAYMENTS_MODE === 'test' ? 'test' : env.PAYMENTS_MODE === 'live' ? 'live' : 'off';
    const prefix = mode === 'test' ? 'test_' : mode === 'live' ? 'live_' : '';
    const clientKeyPresent=typeof env.TOSS_CLIENT_KEY==='string' && env.TOSS_CLIENT_KEY.length>0;
    const secretKeyPresent=typeof env.TOSS_SECRET_KEY==='string' && env.TOSS_SECRET_KEY.length>0;
    const clientKeyConfigured = !!prefix && clientKeyPresent && env.TOSS_CLIENT_KEY.startsWith(prefix + 'ck_');
    const secretKeyConfigured = !!prefix && secretKeyPresent && env.TOSS_SECRET_KEY.startsWith(prefix + 'sk_');
    return json({ok:true,mode,clientKeyPresent,secretKeyPresent,clientKeyConfigured,secretKeyConfigured,
      orderDatabaseBound:!!env.DB,premiumStorageBound:!!env.PREMIUM_ASSETS,
      paymentSwitchActive:env.PAYMENTS_ACTIVE==='true',
      // Build28: this is an immutable security rule, NOT an env variable.
      build:'35',testAccessRequired:true,
      testAccessSecretConfigured:typeof env.TEST_ACCESS_SECRET==='string' && env.TEST_ACCESS_SECRET.length>0,
      testAccessReady:stageGateReady(env),
      publicOriginConfigured:!!env.PUBLIC_ORIGIN,
      paymentsEnabled:isEnabled(env)});
  }
  if (pathname === '/api/config' && req.method === 'GET') {
    const enabled=isEnabled(env);
    return json({ enabled, mode: enabled ? env.PAYMENTS_MODE : 'off', amount: PRICE_KRW, currency:'KRW', clientKey: enabled ? env.TOSS_CLIENT_KEY : null });
  }
  // Orders/confirmation can be paused, while already paid customers retain read access.
  const readerOnly = pathname==='/api/license' || pathname.startsWith('/api/assets/')
    || pathname==='/api/reconcile' || pathname==='/api/toss-webhook'
    || pathname==='/api/recovery/issue' || pathname==='/api/recovery/redeem';
  if(!isEnabled(env) && !(readerOnly && isReaderReady(env)))
    return json({error:'disabled',message:errors.disabled},503);
  if (pathname === '/api/orders' && req.method === 'POST') {
    // The merchant fixes price and policy. Neither comes from the browser.
    const request=await readJSON(req);
    if(request.policyAcknowledged!==true || request.policyVersion!==PURCHASE_POLICY_VERSION)
      return json({error:'policy_ack_required',message:'결제 전에 프리미엄 이용 및 환불 안내를 확인해 주세요.'},400);
    const orderId='MOMENT_'+crypto.randomUUID().replaceAll('-','').slice(0,25);
    const checkoutSecret=randomSecret();
    const acceptedAt=now();
    // D1 already has orders; an idempotent CREATE upgrades existing test DBs automatically.
    // The order is NOT returned for checkout unless the acknowledgement is persisted.
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS purchase_acknowledgements (order_id TEXT PRIMARY KEY, policy_version TEXT NOT NULL, acknowledged_at INTEGER NOT NULL, FOREIGN KEY (order_id) REFERENCES orders(order_id))').run();
    await env.DB.prepare('INSERT INTO orders (order_id, amount, status, checkout_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(orderId, PRICE_KRW, 'created', await sha(checkoutSecret), acceptedAt).run();
    await env.DB.prepare('INSERT INTO purchase_acknowledgements (order_id, policy_version, acknowledged_at) VALUES (?, ?, ?)')
      .bind(orderId, PURCHASE_POLICY_VERSION, acceptedAt).run();
    return json({ orderId, amount: PRICE_KRW, currency: 'KRW', checkoutSecret },201);
  }
  if (pathname === '/api/confirm' && req.method === 'POST') {
    const b=await readJSON(req);
    if (!/^[a-zA-Z0-9_-]{6,64}$/.test(b.orderId||'') || typeof b.paymentKey !== 'string' || b.paymentKey.length<6 || b.paymentKey.length>200 || !/^[a-f0-9]{64}$/.test(b.checkoutSecret||'') || b.amount!==PRICE_KRW) return json({error:'invalid',message:errors.invalid},400);
    const order=await readOrder(env,b.orderId);
    if (!order || order.checkout_hash !== await sha(b.checkoutSecret) || order.amount!==PRICE_KRW || now()-order.created_at>MAX_ORDER_AGE_MS || order.status==='refunded') return json({error:'denied',message:errors.denied},403);
    if (order.status === 'paid') {
      if (order.payment_key !== b.paymentKey) return json({error:'denied',message:errors.denied},403);
      return json({ paid:true, license: await issueLicense(env,order.order_id) });
    }
    if (order.status === 'confirming') {
      if (order.payment_key !== b.paymentKey) return json({error:'denied',message:errors.denied},403);
      // A preceding confirm request may have timed out after Toss approved it.
      try {
        const result=await tossQuery(env,b.paymentKey);
        if(result.ok){const info=await result.json();
          if(checkPayment(info,order) && info.paymentKey === b.paymentKey){
            await updatePaid(env,b.orderId,b.paymentKey);
            return json({paid:true,license:await issueLicense(env,b.orderId)});
          }
        }
      } catch {}
      return json({error:'processing', message: '승인 여부를 다시 확인 중입니다. 잠시 뒤 다시 시도해 주세요.'},409);
    }
    if (order.status !== 'created') return json({error:'denied',message:errors.denied},403);
    const claim = await env.DB.prepare('UPDATE orders SET status = ?, payment_key = ? WHERE order_id = ? AND status = ?').bind('confirming',b.paymentKey,b.orderId,'created').run();
    if (claim?.meta?.changes !== 1) return json({error:'processing',message:'동일 주문을 처리 중입니다.'},409);
    let approved = null, unambiguousFailure = false;
    try {
      const resp=await tossConfirm(env,b.paymentKey,b.orderId);
      const reply=await resp.json().catch(()=>({}));
      if (resp.ok && checkPayment(reply,order) && reply.paymentKey===b.paymentKey) approved=reply;
      else if (resp.status>=400 && resp.status<500 && !resp.ok) unambiguousFailure = true;
      // A network/5xx error may follow successful payment. Ask Toss about real status.
      if (!approved && !unambiguousFailure) {
        const status = await tossQuery(env,b.paymentKey);
        if (status.ok) {const obj=await status.json();if(checkPayment(obj,order) && obj.paymentKey===b.paymentKey) approved=obj;}
      }
    } catch (e) { /* leave as confirming unless a confirmed payment lookup succeeds */
      try {const r=await tossQuery(env,b.paymentKey);if(r.ok){const obj=await r.json();if(checkPayment(obj,order)&&obj.paymentKey===b.paymentKey)approved=obj;}} catch {}
    }
    if (!approved) {
      if (unambiguousFailure) await env.DB.prepare('UPDATE orders SET status = ?, payment_key = NULL WHERE order_id = ? AND status = ?').bind('created',b.orderId,'confirming').run();
      return json({error:'approval_pending',message:errors.unexpected},502);
    }
    await updatePaid(env,b.orderId,b.paymentKey);
    return json({paid:true,license:await issueLicense(env,b.orderId)});
  }
  if (pathname === '/api/recovery/issue' && req.method === 'POST') {
    // Only a current paid bearer license can issue/rotate a recovery code.
    // Every issue replaces the previous code. Never store plaintext codes.
    const owned=await licenseOrder(req,env);
    if(owned?.status!=='paid') return json({error:'denied'},401);
    const verified=await verifyLicenseWithToss(env,owned);
    if(verified==='inactive')return json({error:'denied'},401);
    if(verified!=='active')return json({error:'verification_unavailable',message:errors.unexpected},503);
    await ensureRecoveryTable(env);
    const recoveryCode=randomSecret();
    const result=await env.DB.prepare('INSERT INTO purchase_recovery (order_id,recovery_hash,updated_at) SELECT order_id, ?, ? FROM orders WHERE order_id=? AND status=? AND license_hash=? ON CONFLICT(order_id) DO UPDATE SET recovery_hash=excluded.recovery_hash,updated_at=excluded.updated_at')
      .bind(await sha(recoveryCode),now(),owned.order_id,'paid',await sha(authToken(req))).run();
    if(result?.meta?.changes!==1)return json({error:'denied'},401);
    return json({recoveryCode,oneTime:true,warning:'이전 복원코드는 무효화됩니다. 새 코드를 안전하게 보관하세요.'});
  }
  if (pathname === '/api/recovery/redeem' && req.method === 'POST') {
    // Possession of a random recovery code, not an order ID or email, is proof.
    const b=await readJSON(req);
    const code=typeof b.recoveryCode==='string' ? b.recoveryCode.replace(/[\s-]/g,'').toLowerCase() : '';
    if(!/^[a-f0-9]{64}$/.test(code))return json({error:'invalid_code'},400);
    await ensureRecoveryTable(env);
    const oldHash=await sha(code);
    const found=await env.DB.prepare('SELECT order_id FROM purchase_recovery WHERE recovery_hash=?').bind(oldHash).first();
    if(!found)return json({error:'invalid_code',message:'복원코드가 유효하지 않거나 이미 사용됐어요.'},401);
    const order=await readOrder(env,found.order_id);
    if(order?.status!=='paid')return json({error:'denied'},401);
    const verified=await verifyLicenseWithToss(env,order);
    if(verified==='inactive')return json({error:'denied'},401);
    if(verified!=='active')return json({error:'verification_unavailable',message:errors.unexpected},503);
    const license=randomSecret(),nextCode=randomSecret(),invalidatedCheckout=randomSecret();
    // D1 batch is transactional. Both the one-use code rotation and the license
    // rotation succeed together, or neither does. A racing re-use cannot win twice.
    const results=await env.DB.batch([
      env.DB.prepare("UPDATE purchase_recovery SET recovery_hash=?,updated_at=? WHERE order_id=? AND recovery_hash=? AND EXISTS (SELECT 1 FROM orders WHERE order_id=? AND status='paid')")
        .bind(await sha(nextCode),now(),order.order_id,oldHash,order.order_id),
      env.DB.prepare("UPDATE orders SET license_hash=?,checkout_hash=? WHERE order_id=? AND status='paid' AND EXISTS (SELECT 1 FROM purchase_recovery WHERE order_id=? AND recovery_hash=?)")
        .bind(await sha(license),await sha(invalidatedCheckout),order.order_id,order.order_id,await sha(nextCode))
    ]);
    if(results?.[0]?.meta?.changes!==1 || results?.[1]?.meta?.changes!==1)
      return json({error:'code_used',message:'이미 사용한 복원코드예요.'},409);
    return json({restored:true,license,recoveryCode:nextCode,oneTime:true});
  }
  if (pathname === '/api/license' && req.method === 'GET') {
    const order=await licenseOrder(req,env);
    if(order?.status!=='paid') return json({active:false},401);
    if(new URL(req.url).searchParams.get('verify')==='1') {
      const checked=await verifyLicenseWithToss(env,order);
      if(checked==='inactive') return json({active:false},401);
      if(checked!=='active') return json({error:'verification_unavailable',message:'결제 상태를 확인하지 못했습니다. 중복 결제하지 말고 다시 시도해 주세요.'},503);
    }
    return json({active:true,designs:[...ASSETS]});
  }
  if (pathname.startsWith('/api/assets/') && req.method === 'GET') {
    const order=await licenseOrder(req,env);
    if (!order || order.status !== 'paid') return json({error:'denied'},401);
    const design=pathname.substring('/api/assets/'.length);
    if (!ASSETS.has(design)) return json({error:'not_found'},404);
    const object=await env.PREMIUM_ASSETS.get('premium/' + design + '.webp');
    if (!object) return json({error:'asset_unavailable'},503);
    return new Response(object.body,{headers:{'content-type':'image/webp','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  if (pathname === '/api/toss-webhook' && req.method === 'POST') {
    // General PAYMENT_STATUS_CHANGED has no universal signature header.
    // NEVER trust the POST body as proof of a refund; independently query Toss.
    const b=await readJSON(req);
    if (b.eventType !== 'PAYMENT_STATUS_CHANGED' || !b.data?.orderId || !b.data?.paymentKey) return json({received:true});
    const order=await readOrder(env,b.data.orderId);
    if (!order || order.status !== 'paid' || order.payment_key !== b.data.paymentKey) return json({received:true});
    const lookup=await tossQuery(env,order.payment_key);
    if (!lookup.ok)return json({error:'lookup_pending'},503);
    const verified=await lookup.json();
    if (verified.orderId !== order.order_id || verified.paymentKey !== order.payment_key || verified.totalAmount !== PRICE_KRW) return json({error:'mismatch'},409);
    if (['CANCELED','PARTIAL_CANCELED'].includes(verified.status))
      await revokeLicense(env,order.order_id);
    return json({received:true});
  }
  if (pathname === '/api/reconcile' && req.method === 'POST') {
    if (!env.ADMIN_SECRET || req.headers.get('x-admin-secret') !== env.ADMIN_SECRET) return json({error:'denied'},403);
    const b=await readJSON(req);const order=await readOrder(env,b.orderId);
    if (!order?.payment_key) return json({error:'not_found'},404);
    const status=await tossQuery(env,order.payment_key);
    if (!status.ok) return json({error:'lookup_failed'},502);
    const info=await status.json();
    if (info.orderId!==order.order_id || info.paymentKey!==order.payment_key || info.totalAmount!==PRICE_KRW) return json({error:'mismatch'},409);
    if (info.status === 'DONE' && order.status === 'confirming' && checkPayment(info, order)) {
      await updatePaid(env, order.order_id, order.payment_key);
      return json({status:'paid',note:'Buyer can retry success page with original checkout proof.'});
    }
    if (['CANCELED','PARTIAL_CANCELED'].includes(info.status)) {
      await revokeLicense(env,order.order_id);
      return json({status:'refunded',note:'Partial cancellations are treated as revoked until reviewed.'});
    }
    return json({status: info.status});
  }
  return json({error:'not_found'},404);
}
export default {
  async fetch(req, env) {
    const pathname=new URL(req.url).pathname;
    if(!pathname.startsWith('/api/'))return handleStagingRequest(req,env,pathname);
    const origin = req.headers.get('origin');
    const allowed=normalizeOrigin(env.PUBLIC_ORIGIN||'');
    const selfOrigin=new URL(req.url).origin;
    const siteOrigin=origin ? normalizeOrigin(origin) : '';
    const validStagingOrigin=stageGateReady(env) && siteOrigin===selfOrigin;
    if (!allowed || (origin && siteOrigin !== allowed && !validStagingOrigin)) return json({error:'origin_denied'},403);
    const headers=cors(validStagingOrigin?selfOrigin:allowed);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    // Toss webhooks cannot carry the test editor's login cookie. Their payload is NOT trusted:
    // the handler verifies the actual payment status with Toss before any change.
    const publicChecks=new Set(['/api/health','/api/db-health','/api/r2-health','/api/payment-setup','/api/toss-webhook']);
    // Protected test checkout cannot be opted out via a dashboard variable override.
    if(!publicChecks.has(pathname)){
      if(!stageGateReady(env))return json({error:'test_access_unconfigured'},503,headers);
      if(!(await hasStageSession(req,env)))return json({error:'test_access_required'},401,headers);
    }
    let response;
    try {response=await handle(req,env,new URL(req.url).pathname);} catch (e) {
      response=e instanceof ClientInputError ? json({error:'bad_request',message:'요청 형식 또는 크기를 확인해 주세요.'},400) : json({error:'server_error',message:'요청 처리 중 오류가 발생했어요.'},500);
    }
    for(const [k,v] of Object.entries(headers)) response.headers.set(k,v);
    response.headers.set('x-content-type-options','nosniff');
    return response;
  }
};
export { PRICE_KRW, isEnabled, checkPayment };
