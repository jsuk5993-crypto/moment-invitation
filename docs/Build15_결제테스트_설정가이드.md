# MOMENT Build 15 — 실제 결제 테스트 연결 가이드

## 현재 상태 (2026-10-28)

- 공개 사이트: **기존 Build 13.2 유지.** 실결제/테스트 결제 버튼 공개 활성화 없음.
- GitHub 개발 브랜치: `feat/build14-payment-test` 에 Build 15 검증형 소스 반영 예정.
- 서버 검수: Node 22+ / 실제 SQLite 스키마 / 가짜 Toss 응답으로 **16개 테스트 통과**.
- **실제 Toss API 연결, 실제 Cloudflare D1/R2 배포, 실결제 및 환불 테스트는 미실시.**

## 왜 바로 고객에게 결제 버튼을 열면 안 될까?

Toss 결제 과정은 인증 완료 이후 **서버 승인**을 거쳐야 하며, 서버는 주문번호와 9,900원 금액을 데이터베이스와 대조해야 합니다. 구매자가 보는 성공 화면만으로 결제 완료로 간주하면 안 됩니다. 테스트키 연결 없이 서버가 검증했다고 표시하면 잘못된 판매가 시작될 수 있습니다.

## 준비해야 하는 서비스

1. **토스페이먼츠 개발자센터** — 테스트용 클라이언트 키와 시크릿 키 확보. 실판매 자격·사업자/정산 조건은 토스페이먼츠 안내 확인.
2. **Cloudflare** — Worker API, D1 주문 데이터베이스, R2 **비공개** 저장소. 과금/구독 정보를 요구할 수 있습니다.
3. **GitHub Pages** — 기존 공개 사이트는 계속 이용. 개발 코드는 별도 브랜치에서 검수.

**중요:** 비밀키, 사업자 서류, 카드 정보, 계정 비밀번호는 이 채팅이나 GitHub 저장소에 보내지 마세요. 테스트키 중 시크릿 키도 Cloudflare 비밀 변수에만 저장합니다.

## 설정 순서

1. Cloudflare에서 D1 데이터베이스 이름을 `moment-orders`로 생성한 뒤, `worker/sql/schema.sql` 문장을 실행합니다.
2. R2에서 버킷 `moment-premium-private`를 만들고 **Public Development URL/사용자 지정 도메인 공개를 끄세요.** 별도 제공된 `MOMENT_Build14_프리미엄원본_R2전용.zip`의 `premium/*.webp` 6개만 이 버킷에 업로드합니다. 원본 ZIP을 공개 저장소에 업로드하지 않습니다.
3. `worker/wrangler.toml.example`을 참고해 Worker 이름·D1 데이터베이스 ID·버킷 바인딩을 설정합니다. `PAYMENTS_ACTIVE=false`로 시작합니다.
4. Worker에 `TOSS_SECRET_KEY`와 `ADMIN_SECRET`를 **Secrets**로, `TOSS_CLIENT_KEY`를 환경 변수(공개키)로 등록합니다. `PUBLIC_ORIGIN=https://jsuk5993-crypto.github.io`, `PAYMENTS_MODE=test`로 설정합니다.
5. Cloudflare Worker를 배포한 뒤 `https://[worker-address]/api/config`에 접속합니다. 아직 `PAYMENTS_ACTIVE=false`이므로 `enabled:false`가 나와야 정상입니다.
6. 서버와 R2/D1 바인딩을 검증한 뒤, **비공개 테스트에서만** `PAYMENTS_ACTIVE=true`로 전환합니다. `site/payment/payment-config.js`의 공개 Worker URL을 연결하고 테스트 사이트에서만 결제창을 실행합니다.
7. 결제 테스트키로 9,900원 요청 → 토스 승인 → `/api/license` 활성화 → 원본 6종 다운로드 → 메인/오시는 길 이미지 저장 → 페이지 재방문 권한 복원 → 전체/부분 환불 시 차단 검증을 실행합니다.
8. 취소/환불 약관, 판매자 정보, 고객 지원/구매 복구 방법을 확정한 후에만 LIVE 결제 활성화를 검토합니다.

## 개발자가 확인할 필수 로그

- 결제 생성: POST `/api/orders` → **금액 9900 서버 저장**
- 결제 인증: Toss의 성공 리다이렉트 URL에 들어온 `paymentKey/orderId/amount`와 저장된 값 대조
- 결제 승인: POST `/api/confirm` → Toss `/v1/payments/confirm` 서버 요청
- 승인 불분명/중복: Toss 결제 조회 API로 상태 재조회
- 이용권: GET `/api/license` 에 Bearer 구매 토큰 필수
- 원본: GET `/api/assets/{design}` 은 구매 토큰 검증된 사용자에게만 제공
- 취소: 서버 재조회 결과 취소 상태일 때 토큰 폐기

## 서비스 오픈 전에 남는 한계

- 고객이 브라우저 데이터를 삭제하면 **현재 구매 토큰 자동 복구가 어렵습니다**. 주문 조회·재발급/고객지원 방식 필요.
- 주문 생성 API 남용/봇 트래픽을 막기 위한 서버측 속도 제한, 비용 알림, 보안 설정 필요.
- R2에서 이미 다운로드한 파일은 환불 이후 회수할 수 없습니다. 따라서 사용 범위/환불 정책을 별도로 정해야 합니다.
- 실제 토스 계정·D1·R2 연결 및 모바일/PC 결제 UI 종합 검수 전에는 상업용 출시 완료로 간주할 수 없습니다.

## 공식 문서

- Toss 결제 흐름: https://docs.tosspayments.com/guides/v2/get-started/payment-flow
- Toss SDK/결제창: https://docs.tosspayments.com/guides/v2/payment-window/integration
- Cloudflare Wrangler: https://developers.cloudflare.com/workers/wrangler/configuration/
