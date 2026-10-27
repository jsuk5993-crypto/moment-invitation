# MOMENT Build 14 — 검증형 결제 / 프리미엄 자동 해제 (개발 검수판)

이 패키지는 **실제 결제를 활성화하지 않았습니다**. 기존 공개 GitHub Pages 사이트는 유지하며, 별도의 결제 개발용 버전에서 승인 검증 구조를 구현했습니다.

## 준비한 기능

- 토스페이먼츠 SDK V2 카드 결제창 연동 (설정 활성화 후)
- 서버에 미리 저장한 주문번호·9,900원 금액 검증
- 토스페이먼츠 서버 승인 `POST /v1/payments/confirm` 완료 후 구매 라이선스 발급
- 승인 여부가 불명확하면 재조회하며, 중복 승인은 방지
- 정식 승인된 라이선스만 비공개 R2 프리미엄 배경 6종에 접근 가능
- 프리미엄 6종의 **메인 초대장 + 오시는 길** PNG 다운로드 활성화
- 환불/결제취소 웹훅은 무조건 Toss 서버 재조회 후 권한 철회
- 브라우저가 임의로 보낸 가격·주문번호만으로는 권한 부여 불가
- PG/백엔드가 없으면 구매 버튼은 자동 비활성화

## 패키지 구조

```text
site/index.html                      사이트 개발 검수판 (기존 10종 유지)
site/payment/payment-config.js      공개 Worker 주소만 입력 (기본값 공란)
site/payment/payment-client.js      결제창·권한 복원 클라이언트
site/payment/payment-style.css      결제 패널 UI
site/payment/success.html           승인 후 자동 잠금 해제
site/payment/fail.html              결제 취소/오류 안내
worker/src/worker.mjs               결제 금액·서버 승인·라이선스 API
worker/sql/schema.sql              D1 주문/권한 DB 테이블
worker/wrangler.toml.example        Cloudflare Worker 배포 설정 틀
worker/tests/worker.test.mjs        모의 결제 7가지 자동검사
private_assets/*.webp              비공개 판매 원본 6종 — 절대 공개 GitHub 업로드 금지
docs/build14_*.png                  로컬 브라우저 검수 사진
```

## 테스트 상태

- Node 22 `node --test worker/tests/worker.test.mjs`: 7/7 통과
- Chrome 로컬 콘텐츠 검수: 10종 테마 버튼 확인, 개발판 구매 버튼 비활성화, JavaScript 오류 0건
- **미실시:** Toss 상점 실제 테스트키 테스트, D1/R2 실서버, 실제 결제, 실환불, 대규모 보안/침투 테스트

## 실제 작동까지 남은 필수 설정

1. 토스페이먼츠 개발자센터 계정 및 사용 가능한 PG 가맹점/테스트키 확보. 한국 내 실제 매출·정산 전 사업자등록·판매자 정보 등 요건 확인.
2. Cloudflare Worker, D1 데이터베이스, **비공개 R2 버킷** 준비. R2 구독/결제정보가 요청될 수 있습니다.
3. D1에 `worker/sql/schema.sql` 적용. R2에 `premium/city.webp`, `premium/stars.webp`, `premium/sunset.webp`, `premium/retro.webp`, `premium/med.webp`, `premium/disco.webp` 업로드. **버킷 public access OFF**.
4. Worker에 `TOSS_CLIENT_KEY` 및 `TOSS_SECRET_KEY` 등 환경 변수와 보안 시크릿을 설정. 절대 공개 GitHub에 붙여넣지 마세요.
5. `PAYMENTS_MODE=test`, `PAYMENTS_ACTIVE=true`로 Test Key 연동. `site/payment/payment-config.js`에 Worker의 `https://...workers.dev` 주소 설정.
6. Toss 테스트 결제 → 승인 → 라이선스 → 배경 다운로드 → PNG 저장 → 취소/환불 검증 순으로 실환경 시나리오 확인.
7. 고객 지원·재발급·환불 정책·결제 실패 복구·사업자 표시 등을 준비한 후에만 LIVE 모드로 전환.

### 중요한 주의점

- 이 코드나 사이트 내 성공 URL로 방문한 것만으로는 구매 권한이 발급되지 않습니다. 실제 Toss 승인 응답에서 주문번호/금액/상태를 다시 검증합니다.
- 영수증 토큰은 구입한 브라우저의 `localStorage`에 저장됩니다. 다른 기기 재다운로드/기기 분실 복구는 별도 고객지원 수단 마련 전에는 제한됩니다.
- 테스트 결제라고 해도 진짜 Toss 테스트 키가 필요합니다. 현재 이 패키지에 어떤 키도 포함되지 않습니다.
- 카드사의 PG 수수료와 실제 판매 관련 세금/신고 비용은 별도입니다. 9,900원이 순수익은 아닙니다.
- 공개 GitHub에 premium 원본 6종을 올리면 상품 보호가 성립하지 않습니다.
- 백엔드 소스의 안전성 검토와 라이브 승인 처리 재시도 복구 검증은 추가 QA가 필요하며, 판매 개시 전 보완하는 것이 안전합니다.

## 공식 문서

- https://docs.tosspayments.com/guides/v2/get-started/payment-flow
- https://docs.tosspayments.com/guides/v2/payment-window/integration
- https://docs.tosspayments.com/reference
- https://developers.cloudflare.com/d1/
- https://developers.cloudflare.com/r2/get-started/
