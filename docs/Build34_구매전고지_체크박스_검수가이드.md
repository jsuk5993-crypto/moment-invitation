# Build 34 — 디지털 콘텐츠 구매 전 고지 + 확인 기록

## 구현
- 9,900원 PREMIUM 카드에서 상품/청약철회 안내문과 상세 안내 링크 제공
- **체크박스 기본 미선택**; 구매자가 직접 선택해야 TEST 결제 버튼 활성화
- JS 미동작/버튼 상태 조작에 대비, Worker `POST /api/orders`에서도 아래 2개 값 강제 확인:
  `{ "policyAcknowledged": true, "policyVersion": "2026-10-28-v1" }`
- 서버는 접수한 사실을 D1 `purchase_acknowledgements` 테이블에 **주문 ID, 정책 버전, 확인 시각**만 저장. IP/이메일/비밀번호 기록 안 함.
- 이미 운영 중인 D1에는 첫 신규 주문 시 `CREATE TABLE IF NOT EXISTS`로 표를 자동 생성. 기존 `orders` 데이터는 수정하지 않음. `worker/sql/schema.sql`에도 포함.
- 기존 구매자의 재접속/다운로드는 새 체크박스와 무관하게 작동.
- /api/payment-setup의 build 필드가 34인지 확인. TEST 전용, LIVЕ 차단 유지.

## 구매 안내 법률 요약
- 디지털 콘텐츠 제공이 개시된 경우 법이 정한 조건에서 청약철회가 제한될 수 있음.
- 한편 표시·광고 또는 계약과 다른 상품, 하자, 중복 결제 등 법정 소비자 권리를 임의로 박탈해서는 안 됨.
- 전자상거래법 제13조상 판매자 신원정보, 이용조건, 환불 절차, 계약내용 교부 등에 관한 조치 필요.
- 시행령 제21조의2는 미리보기 등 시험 사용 제공 방법을 제시함.

## 출시 전 필수 추가사항
- 상호/대표자/사업자등록 및 법정 신고사항(해당하는 경우)/연락처 및 고객 지원 이메일
- 결제 승인 계약내용 교부 또는 영수증 전달 절차
- 다른 기기에서 라이선스 복원하는 정식 구매자 인증
- 라이브 결제 환경과 TEST 환경 분리; 정산·환불·세금 및 개인정보 처리정책 검수
- 실제 청약철회 제한 요건이 충족되는지 전문가 또는 관계기관 확인

참고:
- https://www.law.go.kr/LSW/lsInfoP.do?efYd=20260721&lsiSeq=282793
- https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=02&joNo=0021&lsiSeq=288143&urlMode=lsScJoRltInfoR
