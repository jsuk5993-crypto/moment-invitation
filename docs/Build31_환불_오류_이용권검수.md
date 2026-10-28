# MOMENT Build 31 — 결제 후 이용권 · 환불 · 장애 대응 검수

## 직접 확인된 사용자 테스트 (2026-10-28)
- Toss 테스트 결제 성공
- 프리미엄 6종 잠금 해제
- 메인 초대장 + 오시는 길 PNG 2장 저장 성공
- 동일 브라우저 재접속 시 구매 권한 유지

## Build 31 코드 변경
- `PAYMENTS_ACTIVE=false`는 새 주문/결제 승인만 중단합니다. **기존 paid 주문의 /api/license 및 /api/assets/** 는 TEST 접근 암호가 유지되는 동안 읽을 수 있습니다.
- 페이지 재접속/새로고침 시 `GET /api/license?verify=1`로 토스 결제 상태를 서버에서 재확인합니다.
- 토스 상태가 `CANCELED` 또는 `PARTIAL_CANCELED`면 D1 주문을 `refunded`로 전환하고 `license_hash`를 삭제합니다. 이후 R2 파일 API 이용을 차단합니다.
- 토스 응답이 5xx 또는 네트워크 오류이거나 주문번호/키/금액이 불일치하면 기존 라이선스를 지우지 않고 503을 반환합니다. 구매자에게 **중복 결제하지 말고 재시도**하도록 안내합니다.
- 결제 버튼이 꺼져 있어도 기존 영수증을 먼저 복원합니다.
- 로그인 암호 보호 및 TEST 전용 모드는 유지합니다. **이것은 라이브 판매용 인증 시스템이 아닙니다.**

## 권한 회수의 현실적 한계
- 이미 구매자 컴퓨터에 저장된 PNG/ZIP 또는 브라우저에서 내려받은 원본 이미지는 서버가 원격으로 삭제할 수 없습니다.
- 이 검증은 **차후 서버 접근/다시 다운로드를 제한**하는 것입니다.
- 재접속 전 구매 권한 회수가 긴급하다면 토스 웹훅 `PAYMENT_STATUS_CHANGED`를 연동하거나 관리자의 `/api/reconcile`을 사용해 D1을 즉시 동기화할 수 있습니다. 현재 웹훅 실제 등록/수신 및 취소 테스트는 아직 검증되지 않았습니다.
- 결제 실서비스 개방 전에는 라이브 인증, 취소/환불 운영 정책, 고객 문의/영수증/기기변경 지원이 추가로 필요합니다.

## 자동 회귀 테스트
`worker/tests/frontend.test.mjs`와 `worker/tests/d1-integration.test.mjs`에서 아래 시나리오를 추가했습니다.
1. 새 결제를 중단해도 기존 구매자 이용 가능
2. 환불 또는 부분 취소 확인 시 라이선스 회수
3. Toss 결제 상태 조회 실패 시 기록 보호 및 중복 결제 차단
4. 프리미엄 권한 복원 시 결제 중지 여부와 무관하게 파일 활성화
5. 구매 권한이 취소된 경우 저장된 오래된 라이선스 삭제

`/.github/workflows/moment-worker-checks.yml`는 GitHub 개발 브랜치 푸시 시 `npm run check` 및 `npm test`를 실행하도록 추가했습니다. 실제 워크플로 성공은 Actions 탭에서 별도 확인해야 합니다.

## 다음 실제 검수 (관리자)
1. GitHub Actions에서 Worker security tests가 녹색인지 확인
2. 현재 테스트용 결제 내역 중 **테스트 건 하나를 토스 개발자센터에서 취소**
3. 기존 브라우저 페이지를 새로고침
4. 기존 영수증이 취소 처리되어 프리미엄이 해제되는지 확인
5. 테스트 환불 전까지는 기존 정상 구매 권한 유지 상태를 확인

## 보안 및 비용
- 실결제에 사용하는 라이브 키는 아직 절대 활성화하지 않습니다.
- `PAYMENTS_MODE=test`와 `TEST_ACCESS_SECRET`으로 보호된 Worker에서만 테스트합니다.
- 기존 `main` GitHub Pages는 Build 13.2로 그대로 유지합니다.

공식 문서
- https://docs.tosspayments.com/reference
- https://docs.tosspayments.com/reference/using-api/webhook-events
- https://docs.tosspayments.com/guides/v2/cancel-payment
