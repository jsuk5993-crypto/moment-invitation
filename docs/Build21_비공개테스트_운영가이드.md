# MOMENT Build 21 — 비공개 통합 결제 테스트 화면

## 무엇이 추가됐나?
- `https://moment-payments-test.jsuk5993-1ae.workers.dev/`에서 **별도 개발용 MOMENT 편집기**를 제공합니다.
- Worker가 GitHub 개발 브랜치의 `site/` 파일들을 정적 자산으로 제공합니다.
- 전체 정적 파일은 Worker 코드를 먼저 통과하므로, 접근 암호 없이는 공개되지 않습니다.
- 기존 공개 사이트 `main` 브랜치와 GitHub Pages는 **변경하지 않습니다**.
- `PAYMENTS_ACTIVE = "false"` 그대로 유지. **키가 연결되어도 결제창은 비활성** 상태입니다.

## 지금 Cloudflare에서 해야 할 딱 한 가지
`Workers & Pages → moment-payments-test → Settings → Variables and Secrets → Add`

- 변수 이름: `TEST_ACCESS_SECRET`
- 유형: **Secret** (평문 Variable 아님)
- 값: 본인이 새로 만든 임의의 **길고 무작위인 32자 이상 테스트 암호** (영문+숫자 혼합 권장)
- `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`는 **변경할 필요 없습니다**.
- 반드시 **Deploy/저장**하여 적용. **암호 값 자체는 ChatGPT/스크린샷/GitHub에 올리지 마세요.**

## 확인 순서
1. Cloudflare의 **Build 21 GitHub 자동 배포 성공** 여부 확인
2. `https://moment-payments-test.jsuk5993-1ae.workers.dev/` 방문
3. MOMENT "PRIVATE PAYMENT TEST" 로그인 화면이 보이는지 확인
4. 방금 설정한 암호를 입력
5. 로그인 후 기존 초대장 편집기가 보이는지 확인
6. 프리미엄 구매 버튼은 **결제 준비 중 / 비활성화** 상태가 정상입니다.

## 뒤이어 진행할 테스트 결제
- 페이지 로그인 성공과 자동 테스트 확인 후에만 `PAYMENTS_ACTIVE`를 **테스트 모드에서만** 활성화합니다.
- 토스 테스트 카드 인증 → 서버 승인 → D1 기록 → R2 원본 다운로드 → PNG 두 장 저장을 실제 브라우저에서 검증합니다.
- 테스트 완료 후에는 다시 결제를 끄고 Test Secret을 교체/폐기합니다.

## 기술적 설명
- 테스트 로그인 이후 `HttpOnly; Secure; SameSite=Lax` 서명 쿠키가 8시간 발급됩니다.
- 테스트 비밀값이 누락되면 페이지/구매 API가 **안전하게 비활성화**됩니다.
- `/api/health`, `/api/db-health`, `/api/r2-health`, `/api/payment-setup` 진단은 공개로 유지하지만 주문/구매/상품 원본은 로그인 후에만 접근 가능합니다.
- Cloudflare 정적 자산 설정: `[assets] directory = "../site"`, `binding = "STAGING_ASSETS"`, `run_worker_first = true`.
- 세션 쿠키는 현재 테스트 전용입니다. 라이브 출시 전 별도의 구매자 인증·복원 정책 검수가 필요합니다.

Cloudflare 문서: https://developers.cloudflare.com/workers/static-assets/binding/
