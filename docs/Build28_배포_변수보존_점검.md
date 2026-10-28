# Build 28 — Cloudflare Workers 자동 배포 시 환경변수 보존

## 해결 방법
기존 GitHub → Wrangler 자동 배포에서 Cloudflare 대시보드에 직접 등록한 변수가 여러 차례 누락됐습니다.
공식 문서에 따라 `worker/wrangler.toml`의 최상위에 **`keep_vars = true`**를 설정했습니다.

- `keep_vars`는 **대시보드 변수 보존** 설정입니다. Cloudflare의 공식 문서에 따르면 진짜 Secret은 이 설정이 없어도 정상 Wrangler 배포 시 보존되어야 합니다.
- Secret이 진단에서 보이지 않는다면 Production Worker에 실제로 Secret으로 등록되고 Deploy까지 완료됐는지, 해당 Worker의 설정과 배포 버전을 확인해야 합니다.
- `PAYMENTS_ACTIVE="false"`, `PAYMENTS_MODE="test"`는 그대로 유지합니다.
- 테스트 접근 암호는 별도 일반 변수 없이 코드에 의해 **항상 필수**입니다.

## 새 진단
https://moment-payments-test.jsuk5993-1ae.workers.dev/api/payment-setup

- `build:"28"`: 새로운 Worker 코드가 배포된 것
- `clientKeyPresent`, `secretKeyPresent`: 두 키의 **존재** 확인
- `clientKeyConfigured`, `secretKeyConfigured`: 키 형식(`test_ck_`, `test_sk_`)까지 확인
- `testAccessSecretConfigured`: 비공개 테스트 접근 암호 존재 확인
- `testAccessReady`: 접근 암호 24자 이상 + TEST 모드
- `paymentsEnabled:false`: 정상, 결제는 아직 의도적으로 꺼둠

## 실제 적용 순서
1. GitHub 커밋의 Cloudflare 자동 배포가 Success인지 확인.
2. `build:"28"` 확인.
3. Cloudflare **정확히 `moment-payments-test` Worker**의 **Settings → Variables and Secrets** 목록에
   `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `TEST_ACCESS_SECRET` 세 Secret이 있는지 확인.
4. 누락됐다면 **Secret 유형**으로 등록하고 **Deploy**까지 마무리.
5. 새 진단에서 존재 여부/형식 여부와 접근 암호 준비 여부 확인.
6. 이후 신규 GitHub 배포에서 그대로 유지되는지 확인하기 전에는 실제 결제 활성화 금지.

**보안:** Secret 값 전체를 GitHub, 채팅, 스크린샷에 올리지 않습니다. 이전에 노출된 테스트 시크릿 키는 회전 권장.

Official docs:
- https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth
- https://developers.cloudflare.com/workers/configuration/secrets/
