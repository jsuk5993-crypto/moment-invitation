# MOMENT — 정식 출시 후보 RC1

> **판정: 기술 출시 후보 구성 / 실제 판매 NO-GO (사업자 및 PG 승인 미입력).**
>
> 고객의 카드에 실제 청구되는 LIVE 판매는 아직 열리지 않습니다.
> 기존 TEST 배포와 공개 `main` 브랜치는 변경하지 않습니다.

## RC1 구성 (한번에)
- `site-live/`: 일반 고객용 별도 공개 사이트 소스. 무료 초대장 편집기·프리미엄 6종 설명, 정식 결제 UI, 구매/환불, 판매자 정보, 개인정보, 이용약관, 고객지원, 구매내역 출력.
- `worker/src/worker.mjs`: 기존 TEST 인증 보존 + 별도 `DEPLOYMENT_KIND=public-live` Worker만 LIVE 모드 지원. 기본 LIVE 판매 스위치 **꺼짐**, 사업자 필드/PG 승인 플래그 미완성 시 503 또는 구매 불가.
- `worker/wrangler.live.toml.example`: 독립 LIVE Worker / 별도 D1 / 별도 R2 구성 **템플릿**. 값 미입력 상태이므로 그대로 배포 금지.
- `worker/tests/live-release.test.mjs`, `worker/tests/live-frontend.test.mjs`: TEST와 LIVE 격리, 결제 버튼 게이트, 라이선스/다운로드·복원 보존.
- `release/scripts/preflight.mjs`: 코드 누락·TEST 서버 연결·라이브 정보 미입력 확인, `--go-live` 사용 시 실제 승인을 증빙할 환경 플래그 없으면 실패.

## 판매 개시 전 실제로 필요한 입력·승인
1. 사업자 등록/상호/대표자/주소/전화번호/공식 이메일/통신판매업 신고사항(면제 가능 여부는 개별 확인) 확정.
2. `site-live/merchant.js`와 LIVE Worker의 `SELLER_*` 값에 **일치하는 진짜 공개 판매자 정보** 입력.
3. 토스페이먼츠 상점 계약·심사 후 LIVE `live_ck_` 및 `live_sk_` 키를 독립 LIVE Worker secrets로 등록. **TEST 키 복사 금지.**
4. LIVE D1 신규 생성 및 `worker/sql/schema.sql` 적용, LIVE R2 비공개 버킷 생성 후 프리미엄 원본 6종 업로드. 기존 TEST 주문 데이터는 이관하지 않음.
5. 별도 정식 도메인 및 HTTPS 인증, 고객지원 이메일 실제 수신, 환불 신청 처리/소유권 확인 방법 마련.
6. 구매계약서/거래명세 교부 방식, 개인정보 처리·보유기간·위탁/국외 처리·정책 문구를 실제 운영 기준으로 검토. 표시·광고 시 판매자 신원·거래조건 표시.
7. PC·모바일 실기기 1회 이상: 신규 LIVE 결제 승인(승인된 테스트 수단으로), 영수증 출력, PNG ZIP 저장, 재접속, 복원코드, 환불·권한 회수, 장애·이중 결제 방지 검수.
8. 배포 승인 후에만 `LIVE_LAUNCH_APPROVED=true`, `LIVE_PG_APPROVED=true`, `PAYMENTS_ACTIVE=true` 활성화. 그 이전에는 일체 실결제 없음.

## 안전한 검증 명령
```sh
cd worker && npm test
cd .. && node release/scripts/preflight.mjs
node release/scripts/preflight.mjs --go-live
```
첫 2개는 코드 검수. 마지막은 실제 판매 허가 여부를 강제 검사하며 현재 **실패하는 것이 정상**입니다.

## 주의할 점
- 공개 `main`과 기존 `feat/build14-payment-test`는 모두 유지합니다. 정식 배포는 고객 도메인·결제사 승인 후 별도 LIVE Worker를 생성하여 수동 진행합니다.
- `merchant.js`는 발행 전 값이 비어 있고 `ready:false`입니다. 결제 화면은 판매자 정보가 없을 때 버튼을 활성화하지 않습니다.
- 현재 거래증빙 화면은 본인 구매내역의 인쇄/ PDF 저장 **보조 기능**이며, 법정 계약내용 서면 교부나 결제사 매출전표 발송을 자동으로 대신하지 않습니다.
- 현재 복원은 자가 보관하는 1회용 코드이며 코드와 원래 기기를 동시에 잃으면 자동 복구 불가능합니다. 고객지원의 정당한 소유권 확인 절차가 필요합니다.
- 대한민국 전자상거래법 제13조(사업자 정보 및 거래조건 고지), 제17조(청약철회, 디지털 콘텐츠)가 기준입니다:
  - https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1031806433
  - https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsId=009318&lsJoLnkSeq=1000527255&print=print

## 최종 판정
- **코드 통합 후보:** RC1 브랜치에서 자동 테스트 결과를 확인.
- **실판매 허가:** 현재 NO-GO — 필요한 사업자 정보/PG LIVE/실거래/법적 고지 및 지원 체계 미완료.
- **승인 후:** 출시 차단 항목을 모두 통과한 상태에서 `release/moment-rc1`의 전체 내용을 검수하고 정식 도메인에 배포. 불필요한 추가 Build 증식은 없음.
