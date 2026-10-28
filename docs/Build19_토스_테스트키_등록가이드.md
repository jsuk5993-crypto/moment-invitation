# MOMENT Build 19 — 토스페이먼츠 테스트 API 키 준비

R2 6종, D1 주문 테이블 및 Cloudflare Worker 연결 검사를 완료한 다음 사용하는 단계입니다.

## 결제 방식과 정확한 테스트 키 종류
현재 코드에서 이용하는 브라우저 SDK: `TossPayments(clientKey).payment({customerKey: TossPayments.ANONYMOUS}).requestPayment(...)`.
이 방식은 **API 개별 연동 키**를 사용합니다.
- 브라우저용 키: `test_ck_...` (`TOSS_CLIENT_KEY`)
- 서버 승인용 키: `test_sk_...` (`TOSS_SECRET_KEY`)
- `test_gck_...`/`test_gsk_...`는 현재 `payment()` 구현에 맞지 않으므로 사용하지 않습니다.
- 같은 상점에 발급된 테스트 키 **한 쌍**을 사용해야 합니다.

## 1. 토스페이먼츠 개발자센터
- https://developers.tosspayments.com/
- 계정에 로그인하고 **API 키**에서 개발자 테스트 상점을 선택합니다.
- **API 개별 연동 키**의 테스트 클라이언트 키와 테스트 시크릿 키를 확인합니다.
- 전자결제 계약 전에도 개발자용 테스트 상점 키를 발급받을 수 있습니다.
- 실제 청구/정산에는 별도 계약과 라이브 키가 필요합니다.

## 2. Cloudflare (계정에서 직접 입력)
**Workers & Pages → moment-payments-test → Settings → Variables and Secrets → Add**

아래 두 값을 각각 등록합니다.
1. Type = **Secret**, Name = `TOSS_CLIENT_KEY`, Value = `test_ck_...` (브라우저 공개용 키이지만 한 곳에서 관리하도록 Secret 사용)
2. Type = **Secret**, Name = `TOSS_SECRET_KEY`, Value = `test_sk_...` (**절대 공개하면 안 됨**)

추가한 다음 Cloudflare가 요청하는 Deploy/적용을 진행합니다. **어떠한 키 값도 GitHub나 채팅에 보내지 않습니다.**

## 3. 설정 점검 (키 자체는 출력하지 않음)
https://moment-payments-test.jsuk5993-1ae.workers.dev/api/payment-setup

예상:
```json
{
  "ok": true,
  "mode": "test",
  "clientKeyConfigured": true,
  "secretKeyConfigured": true,
  "orderDatabaseBound": true,
  "premiumStorageBound": true,
  "paymentsEnabled": false
}
```

여기서 `paymentsEnabled:false`는 정상입니다. 아직 테스트 결제 UI 전용 실행 환경을 검수해야 합니다.

## 안전
- `worker/wrangler.toml`의 `PAYMENTS_ACTIVE = "false"`는 **그대로** 둡니다.
- `PAYMENTS_MODE = "test"`는 유지. **절대 `live`로 바꾸지 않습니다.**
- 공개 GitHub Pages의 Build 13.2는 그대로 둡니다.
- 테스트 결제 승인 화면 자체가 열리더라도 서버 승인 API가 성공하기 전에는 구매 권한을 발급하지 않습니다.
- API 키의 종류는 공식 SDK 안내에 따라 현재 `payment()` 구현에 맞춰 선택합니다.

공식 문서:
- https://docs.tosspayments.com/sdk/v2/js/environment
- https://docs.tosspayments.com/reference/using-api/api-keys
- https://developers.cloudflare.com/workers/configuration/secrets/
