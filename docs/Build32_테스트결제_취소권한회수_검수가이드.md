# MOMENT Build 32 — 토스 테스트 카드 취소 + 구매 권한 회수 검수

## 확인된 상태
- 사용자 수동 검증: 가상 테스트 결제 성공, 프리미엄 6종 실행, PNG 2장 다운로드, 새로고침/재접속 후 권한 복원
- Build 31: 토스 상태 재검증 + 환불 시 라이선스 자동 회수 + 이중 결제 방지 구조
- Build 32: 사용자 확인 버튼으로 테스트 카드 **전액 취소 API** 호출; 결제 취소 시 라이선스 즉시 제거
- GitHub Actions Build32: 총 60건/60건 통과
- 실제 카드 취소와 Cloudflare 배포 성공 여부는 별도 사용자 검증 필요

## 비공개 테스트 제작기에서 확인
1. Cloudflare `moment-payments-test` 최신 배포가 Success인지 확인
2. https://moment-payments-test.jsuk5993-1ae.workers.dev/api/payment-setup 에서 `build:"32"`, `mode:"test"`, `testAccessReady:true` 확인
3. https://moment-payments-test.jsuk5993-1ae.workers.dev/#plans4 접속하고 기존 테스트 암호로 로그인
4. 이미 결제한 브라우저에서 프리미엄 카드의 `프리미엄 이용 중` 아래 `내 테스트 결제 취소 · 권한 회수 검증` 버튼 확인
5. 버튼 클릭 후 브라우저 확인창에서 **취소를 원하는 경우에만** 확인
6. 성공 시 라이선스 삭제 + 페이지 새로고침 후 프리미엄 재잠금 확인
7. 재접속 후 워터마크 없는 PNG 다운로드 불가능한지 확인
8. 토스 개발자센터 → 내 테스트 결제내역에서 해당 거래의 `CANCELED` 상태 확인

## 작동 원리 및 안전장치
- 로그인 없이 `/api/test-cancel` 접근 불가. 현 사용자의 정확한 `Bearer` 구매 라이선스 필요.
- 토스 TEST `test_sk_` 서버 키만 취소 요청에 사용. LIVE 키는 Worker에서 허용하지 않음.
- API는 클라이언트에서 `paymentKey`나 `orderId`를 받지 않음. D1의 paid 라이선스로 해당 주문을 찾아 실제 토스 상태를 대조함.
- 전액 취소 요청 시 `cancelAmount`를 보내지 않음. 주문별 멱등키로 중복 취소 방지.
- 토스 조회/취소 응답이 불확실하면 기존 영수증과 라이선스를 함부로 삭제하지 않고 새로고침을 안내.
- 성공하면 D1 status refunded + license_hash=NULL 처리; R2 접근 불허.
- 구매자가 **이미 다운로드한 PNG/ZIP은 원격 삭제할 수 없음**.
- 현재 비공개 개발용 기능입니다. 사용자에게 환불 요청을 받고 자동으로 돈을 취소하는 정식 판매 기능은 아닙니다.

## 주의
- 취소 버튼을 실행하면 해당 테스트 구매의 프리미엄 이용권이 사라집니다. 이 상태가 정상 테스트 결과입니다.
- 테스트 취소를 검증하려면 이미 구매한 브라우저에서 버튼을 눌러야 합니다. 라이선스가 없으면 버튼이 보이지 않습니다.
- 정상 응답이 없을 경우 버튼을 반복해서 누르지 말고 **새로고침해서 토스 상태를 먼저 확인**하세요.
- Cloudflare에 등록된 테스트 키와 접근 암호는 그대로 두세요. 절대 채팅/스크린샷에 전체 값을 표시하지 마세요.
- 실제 라이브 결제나 상용 판매는 여전히 비활성/미검증입니다.

## 토스 공식 문서
- https://docs.tosspayments.com/guides/v2/cancel-payment
- https://docs.tosspayments.com/guides/v2/get-started/environment
