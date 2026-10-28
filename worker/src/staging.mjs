/* Build 21 — private MOMENT integration-test UI (Cloudflare Worker, same origin).
 * The login secret is configured ONLY in Cloudflare Secrets. Never log, hardcode
 * or expose it. This is a test-only gate, not live customer authentication.
 */
const COOKIE_NAME='__Host-moment_stage';
const SESSION_MS=8*60*60*1000;
const encoder=new TextEncoder();
const noStore={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
// Dedicated test Worker: protection is mandatory, not controlled by an overridable dashboard toggle.
export const stageGateReady=env=>env.PAYMENTS_MODE==='test' && typeof env.TEST_ACCESS_SECRET==='string' && env.TEST_ACCESS_SECRET.length>=24;
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function signature(secret,expiry){
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,encoder.encode('moment-stage-1:'+expiry)));
}
function sameHex(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0;}
export async function hasStageSession(req,env){
 if(!stageGateReady(env))return false;
 const value=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE_NAME+'='));
 const m=value?.slice(COOKIE_NAME.length+1).match(/^(\d{13})\.([a-f0-9]{64})$/);
 if(!m)return false;
 const expiry=Number(m[1]);
 if(!Number.isSafeInteger(expiry)||expiry<=Date.now()||expiry>Date.now()+SESSION_MS+60000)return false;
 return sameHex(m[2],await signature(env.TEST_ACCESS_SECRET,m[1]));
}
function loginDocument(message){
 const note=message==='error'?'접근 코드가 일치하지 않습니다. 다시 확인해 주세요.':message==='unconfigured'?'Cloudflare에 TEST_ACCESS_SECRET을 먼저 설정해 주세요.':'테스트 접근 코드를 입력하면 개발용 초대장 제작기를 열 수 있어요.';
 const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOMENT | 결제 테스트</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f5f1f8;color:#352d40;display:grid;place-items:center;font:16px/1.6 system-ui,"Malgun Gothic",sans-serif}.card{width:min(440px,calc(100% - 40px));background:white;padding:40px 32px;border:1px solid #e9e2ef;border-radius:20px;box-shadow:0 22px 70px #25123b15}.logo{font:24px Georgia,serif;letter-spacing:.23em;color:#66518a}h1{font-size:22px;margin:20px 0 8px}p{color:#6e6578;font-size:14px}label{font-size:13px;font-weight:700}input{display:block;width:100%;padding:13px;margin:8px 0 16px;border:1px solid #cfc4dd;border-radius:10px;font:inherit}button{display:block;width:100%;padding:13px;border:0;border-radius:10px;background:#5b4387;color:white;font:inherit;font-weight:700;cursor:pointer}.tag{font-size:12px;color:#8052aa;letter-spacing:.11em}</style></head><body><main class="card"><div class="logo">MOMENT</div><div class="tag">PRIVATE PAYMENT TEST</div><h1>결제 통합 테스트</h1><p>'+note+'</p><form method="POST" action="/__test/login"><label for="code">테스트 접근 코드</label><input id="code" name="access_code" type="password" minlength="24" autocomplete="off" required><button type="submit">테스트 화면 열기</button></form><p>이 화면은 실제 판매 사이트가 아닙니다. 테스트 결제에서도 실결제는 발생하지 않아야 합니다.</p></main></body></html>';
 return new Response(html,{status:message==='unconfigured'?503:message==='error'?401:200,headers:{...noStore,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
function redirect(cookie){return new Response(null,{status:303,headers:{...noStore,location:'/',...(cookie?{'set-cookie':cookie}:{})}});}
export async function handleStagingRequest(req,env,pathname){
 if(!stageGateReady(env))return loginDocument('unconfigured');
 if(pathname==='/__test/login' && req.method==='POST'){
  const length=Number(req.headers.get('content-length')||0);
  if(length>2048)return loginDocument('error');
  const data=await req.formData().catch(()=>null);
  const input=data?.get('access_code');
  if(typeof input!=='string'||input.length>256 || !(await matchesSecret(input,env.TEST_ACCESS_SECRET)))return loginDocument('error');
  const expiry=String(Date.now()+SESSION_MS);
  const token=expiry+'.'+await signature(env.TEST_ACCESS_SECRET,expiry);
  return redirect(COOKIE_NAME+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=28800');
 }
 if(!(await hasStageSession(req,env)))return loginDocument();
 if(pathname==='/__test/logout')return redirect(COOKIE_NAME+'=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
 if(req.method!=='GET'&&req.method!=='HEAD')return new Response('Method not allowed',{status:405,headers:noStore});
 if(!env.STAGING_ASSETS)return new Response('Static assets not deployed.',{status:503,headers:noStore});
 const response=await env.STAGING_ASSETS.fetch(req);
 const result=new Response(response.body,response);
 for(const [key,value] of Object.entries(noStore))result.headers.set(key,value);
 return result;
}
async function matchesSecret(input,secret){
 const a=await crypto.subtle.digest('SHA-256',encoder.encode(input));
 const b=await crypto.subtle.digest('SHA-256',encoder.encode(secret));
 return sameHex(hex(a),hex(b));
}
