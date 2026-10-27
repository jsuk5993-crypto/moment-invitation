# MOMENT — 프리미엄 초대장 · Build 16 결제 테스트 준비

공개 사이트는 안정적으로 Build 13.2를 유지합니다. 이 개발 브랜치는 **결제 비활성**이며 실제 카드 청구는 불가능합니다.

## 개발 브랜치 핵심 파일
- `site/index.html` · 기존 초대장/오시는 길 편집기와 결제 UI 테스트판
- `site/payment/` · 토스페이먼츠 결제 리다이렉트/권한복원 처리
- `worker/src/worker.mjs` · 결제 승인 서버, D1 주문 DB, 비공개 R2 이미지 검증
- `worker/wrangler.toml` · Cloudflare 최초 테스트 배포용 **PAYMENTS_ACTIVE=false**
- `worker/tests/` · 전체 19개 서버/DB 테스트
- `docs/Build16_Cloudflare_GitHub_연결가이드.md` · Node.js 설치 없이 GitHub→Cloudflare 연결 가이드

## 안전한 최초 서버 배포
Cloudflare Workers Builds를 통해 이 브랜치를 연결하고 **Root directory = worker**, **Worker name = moment-payments-test**, **Build command = npm run check**, **Deploy command = npx wrangler deploy**로 지정합니다.

배포 후 `https://[받은 Worker 주소]/api/health`에서 `paymentsEnabled:false`면 정상입니다.

**절대로 토스 시크릿키, 관리자키, 프리미엄 원본 이미지를 GitHub에 올리지 마세요.** 실제 결제 개방에는 토스페이먼츠 개발자 계정 및 Cloudflare D1/R2 연결과 추가 결제 검수가 필요합니다.

## Cloudflare 재배포 트리거
2026-10-28: `moment-payments-test`의 프로덕션 브랜치를 `feat/build14-payment-test`로 설정한 후 새 빌드를 실행하기 위한 문서 커밋입니다. `PAYMENTS_ACTIVE=false` 상태를 유지합니다.
