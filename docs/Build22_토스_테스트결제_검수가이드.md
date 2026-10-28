# MOMENT Build 22 — 비공개 테스트 결제 검수

## 현재 구조
- 개발 전용 Worker: moment-payments-test
- Worker 설정: PAYMENTS_ACTIVE=true, PAYMENTS_MODE=test, TEST_ACCESS_REQUIRED=true
- 기존 공개 GitHub Pages main 브랜치: 변경 없음
- TEST_ACCESS_SECRET는 Cloudflare Secret으로만 저장, 코드에 포함하지 않음
- TEST 키 형식: test_ck_... / test_sk_... (같은 토스 상점의 한 쌍)
- 결제 승인 전에는 R2 원본 다운로드 및 워터마크 해제 금지

## 검수 순서
1. Cloudflare Workers & Pages에서 moment-payments-test의 최신 배포가 성공했는지 확인
2. https://moment-payments-test.jsuk5993-1ae.workers.dev/api/payment-setup 열기
3. mode=test, clientKeyConfigured=true, secretKeyConfigured=true, orderDatabaseBound=true, premiumStorageBound=true, paymentsEnabled=true 확인
4. 테스트 주소 https://moment-payments-test.jsuk5993-1ae.workers.dev/ 접속 후 설정한 TEST_ACCESS_SECRET으로 로그인
5. 초대장 제작기 프리미엄 영역에서 '테스트 결제 시작 (실제 청구 없음)' 버튼 확인
6. 토스 테스트 결제창에서 카드 테스트 → 승인 후 제작기로 복귀 확인
7. '프리미엄 이용 중' 상태와 6종 배경 및 메인/오시는 길 2장 ZIP 다운로드 확인

## 오류/주의
- paymentsEnabled=false면 테스트를 진행하지 말고 Cloudflare 변수 및 배포 상태 확인
- 키는 접두사만 확인하고 Secret 전체 값은 채팅, GitHub, 스크린샷에 공개하지 않기
- '승인 상태 확인에 실패'하면 다시 결제하지 말고 성공 페이지에서 '승인 결과 다시 확인' 선택
- 결제창의 테스트 승인 결과는 실제 청구되지 않음 (토스 공식 테스트 환경 설명)
- 테스트 암호를 타인에게 배포하지 말 것. 외부 판매용 서비스가 아님
- 테스트를 끝내면 PAYMENTS_ACTIVE=false로 되돌리고 안전한 운영 정책 설계

## 확인 범위
오프라인 자동 테스트 28개 통과: 로그인/쿠키 접근 제어, 테스트 모드 제한, 주문금액 고정, 권한 복원, 테스트 결제 SDK 호출 등.
실제 토스 결제창에서 결제 요청→승인→PNG 두 장 저장까지는 사용자 브라우저에서 마지막 검수 필요.

Docs: https://docs.tosspayments.com/sdk/v2/js/payment