# MOMENT Build 17 — D1 주문 DB 생성 및 연결

## 현재 상태
- Cloudflare Worker: `moment-payments-test`
- Worker Health: `/api/health` 에서 `paymentsEnabled:false`
- **결제는 아직 비활성화**되어 있음
- 새 DB가 만들어져도 아직 결제 활성화하지 않음

## 1. Cloudflare에서 D1 만들기 (사용자 계정에서)
1. Cloudflare 대시보드 → **Storage & databases / 스토리지 및 데이터베이스** → **D1 SQL Database**
2. **Create database / 데이터베이스 만들기**
3. DB 이름: `moment-orders`
4. Location hint는 선택사항. 한국 사용자 위주면 `APAC / Asia-Pacific`을 선택 가능
5. 생성 후 데이터베이스 화면 **Console / 콘솔**로 이동

## 2. 콘솔에서 SQL 실행
```sql
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL CHECK (amount = 9900),
  status TEXT NOT NULL CHECK (status IN ('created','confirming','paid','refunded')),
  checkout_hash TEXT NOT NULL,
  payment_key TEXT UNIQUE,
  license_hash TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS orders_paid_idx ON orders(status, paid_at);
CREATE UNIQUE INDEX IF NOT EXISTS orders_license_idx ON orders(license_hash);
```

위 코드는 GitHub `worker/sql/schema.sql`과 동일하며 샘플 결제 데이터는 넣지 않습니다.
Execute / 실행 버튼을 누르고, Tables / 테이블 화면에서 `orders`가 생성됐는지 확인합니다.

검증용 질의:
```sql
SELECT name FROM sqlite_master WHERE type='table' AND name='orders';
```
결과로 `orders`가 한 줄 나오면 정상입니다.

## 3. Worker 바인딩
D1을 만들면 Cloudflare가 `database_id` (UUID)를 발급합니다. **이 ID는 비밀키가 아닙니다.**
그 ID가 확인된 뒤 개발 브랜치의 `worker/wrangler.toml`에 아래 설정을 추가합니다.

```toml
[[d1_databases]]
binding = "DB"
database_name = "moment-orders"
database_id = "실제_Cloudflare_D1_UUID"
```

GitHub 연동이 되어 있으므로 바인딩을 Wrangler 파일에 유지하는 것이 중요합니다. 대시보드에서 바인딩만 일시적으로 추가하면 후속 GitHub 배포에서 설정 불일치가 발생할 수 있습니다.

## 주의
- `PAYMENTS_ACTIVE = "false"` 그대로 유지
- 아직 R2 프리미엄 비공개 원본, Toss 테스트 키를 연결하지 않음
- TOSS_SECRET_KEY, ADMIN_SECRET를 GitHub 또는 채팅에 공유하지 않음
- D1 ID와 테이블 생성 완료 여부만 확인하면 다음 바인딩 작업 가능

공식 문서: https://developers.cloudflare.com/d1/get-started/
