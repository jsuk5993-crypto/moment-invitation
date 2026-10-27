# MOMENT Build 16 — Node.js 설치 없이 Cloudflare 테스트 Worker 연결

## 현재 단계
- GitHub 개발 브랜치: `feat/build14-payment-test`
- Cloudflare Worker 배포 설정: `worker/wrangler.toml`
- 첫 배포는 결제 비활성(`PAYMENTS_ACTIVE=false`), 결제키·DB·R2 연결 없음
- 성공 확인: `https://<Cloudflare에서 받은 Worker 주소>/api/health`
- 정상 응답 예시: `{"ok":true,"service":"moment-payments","build":"16","paymentsEnabled":false}`
- 이것은 서버 부팅 검사이지 실제 카드 결제 테스트가 아닙니다.

## Cloudflare 대시보드에서 한 번 연결
1. https://dash.cloudflare.com/ 로그인 또는 가입.
2. Workers & Pages → Create application → GitHub 선택 (화면 문구는 변경될 수 있음).
3. 저장소 `jsuk5993-crypto/moment-invitation` 지정.
4. 브랜치 `feat/build14-payment-test`, 프로젝트 루트 디렉터리 `worker`, Worker 이름 `moment-payments-test`.
5. Build command는 `npm run check`를 권장합니다. Deploy command는 `npx wrangler deploy`; 설정파일은 `worker/wrangler.toml`입니다.
6. 배포한 뒤 Cloudflare가 제공한 workers.dev 주소에 `/api/health`를 붙여 확인.
7. `paymentsEnabled:false`면 초기 단계 성공. 결제는 여전히 비활성 상태가 정상입니다.
8. Worker URL은 공유해도 되지만 **비밀키나 관리자키는 이 채팅·GitHub에 올리지 마세요**.

## 이후 단계
- Cloudflare D1 `moment-orders`에 `worker/sql/schema.sql` 적용, 바인딩명 `DB`
- 비공개 R2 버킷 `moment-premium-private` 생성, 바인딩명 `PREMIUM_ASSETS`. 공개 URL 비활성 유지
- 토스페이먼츠 테스트 키 연결: `TOSS_CLIENT_KEY` (공개용), `TOSS_SECRET_KEY` (Secret), `ADMIN_SECRET` (Secret)
- D1의 실제 데이터베이스 ID를 `wrangler.toml`에 적용하고 R2 바인딩도 배포 설정에 추가
- 개발 환경에서만 테스트 결제 활성화 및 9,900원 주문/승인/프리미엄 복원 검수
- 최종 검수까지 GitHub `main`의 공개 사이트 변경 금지

프리미엄 원본 6종 ZIP은 비공개 R2에만 넣습니다. 공개 GitHub나 사이트에 올리지 마세요.

공식 문서:
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://docs.tosspayments.com/guides/v2/payment-window/integration
