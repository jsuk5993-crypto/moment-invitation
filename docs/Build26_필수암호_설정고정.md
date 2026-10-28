# Build 26 — 전용 테스트 서버 비공개 설정 고정

## 변경 이유
Cloudflare 대시보드에서 수정된 일반 변수 `TEST_ACCESS_REQUIRED`가 다음 배포 때 누락되거나 바뀌는 문제가 반복됐습니다. 테스트 서버가 이 변수를 신뢰하지 않도록 개선했습니다.

## 적용 결과
- 테스트 서버에 접속 암호는 **항상 필수**입니다.
- `TEST_ACCESS_REQUIRED`라는 별도 일반 변수는 더 이상 필요하지 않습니다. Cloudflare 변수 목록에 남아 있더라도 기능에 영향을 주지 않습니다.
- Cloudflare **Secret** `TEST_ACCESS_SECRET`이 24자 이상이어야 로그인 페이지가 동작합니다.
- 설정 진단 `/api/payment-setup`은 다음 필드를 보여줍니다.
  - `build: "26"` — 이 버전이 실제 배포됨
  - `testAccessRequired: true` — 코드에서 의무화, 변수와 무관
  - `testAccessSecretConfigured: true` — Secret 존재 여부
  - `testAccessReady: true` — Secret 길이와 테스트 모드 정상
- `PAYMENTS_ACTIVE=false` 유지. 결제는 일부러 꺼 둡니다.
- D1, R2, 기존 Toss 테스트 Secret 2개는 유지.
- 암호 전체 값은 채팅, 스크린샷, GitHub에 게시하지 마세요.

## 확인 방법
1. GitHub 개발 브랜치 feat/build14-payment-test의 Build26 배포 성공 여부 확인
2. https://moment-payments-test.jsuk5993-1ae.workers.dev/api/payment-setup
3. `build:"26"`, `testAccessRequired:true`, `testAccessSecretConfigured:true`, `testAccessReady:true`, `paymentsEnabled:false` 확인
4. 비공개 제작기 주소를 열어 로그인 창이 나오고 기존 접근 암호가 작동하는지 확인

`testAccessSecretConfigured:false`이면 Cloudflare Production Secrets에 `TEST_ACCESS_SECRET`을 추가해야 합니다.

공식 참조: https://developers.cloudflare.com/workers/wrangler/configuration/
