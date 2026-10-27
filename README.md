# MOMENT Build 15 — 결제 연결 전 통합 검수 완료

> **주의:** 이 버전은 판매·과금 가능 상태가 아닙니다. 테스트용 Worker가 실제로 배포되지 않았고, 토스페이먼츠 키를 연결하지 않았습니다. 공개 사이트 Build 13.2는 변경하지 않습니다.

## 개선 내용

- 기존 Build 14 결제 프런트/Worker/D1/R2 코드 유지
- JSON 본문 크기 제한을 Content-Length에만 의존하지 않고 **실제 수신 크기 8KB** 기준으로 검증
- 잘못된 JSON 요청을 서버 오류(500)가 아닌 사용자 요청 오류(400)로 반환
- 결제 조회를 통한 관리자인증/환불 확인 경로에 결제키 비교 추가
- 가짜 D1이 아닌 **실제 SQLite 스키마**를 이용한 9개 통합 검수 시나리오 추가
- 기존 7개 테스트 포함 총 **16개 검사 통과**
- 실제 결제 테스트에 필요한 설정 순서/비밀키 관리/남은 위험 문서화

## 경로

```
site/index.html                       고객 UI · 결제 비활성 개발판
site/payment/*                        결제창·승인 리다이렉트·복원 UI
worker/src/worker.mjs                 9,900원 금액 검증·권한 발급 Worker
worker/sql/schema.sql                 D1 저장소 스키마
worker/tests/worker.test.mjs          7개 단위/가짜 DB 테스트
worker/tests/d1-integration.test.mjs  9개 실제 SQLite 통합 테스트
worker/package.json                  npm test / npm run check
worker/wrangler.toml.example          배포 템플릿 (시크릿 없음)
docs/Build15_결제테스트_설정가이드.md   계정 설정·클라우드 연결 설명
```

## 오프라인 검수

Node.js 22 이상에서 `cd worker` 후 `npm test` 또는 `node --test worker/tests/*.test.mjs`.

**중요:** 이 ZIP 안에는 상품 원본 6종이 없습니다. 원본은 이전 단계의 별도 **비공개 R2 업로드용 ZIP**을 사용해야 합니다.
