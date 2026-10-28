# MOMENT Build 18 — R2 프리미엄 원본 저장소 연결

## 현재 검증된 상태
- Worker `moment-payments-test` 배포 완료; `/api/health` 정상
- D1 `moment-orders` 주문 테이블 연결; `/api/db-health` 정상
- 결제 스위치 `PAYMENTS_ACTIVE = "false"` 유지
- 프리미엄 원본은 **GitHub에 절대 포함하지 않음**

## Cloudflare 대시보드
1. **Storage & databases → R2 Object Storage → Create bucket**
2. Bucket name: **`moment-premium-private`**
3. Storage class: **Standard** (R2 무료 사용량 적용 대상)
4. Public Development URL(`r2.dev`) 및 Custom Domains **비활성/미연결 유지**
5. 버킷 객체 화면에서 **Create folder → `premium`** 생성
6. 제공한 **Build 18 업로드 패키지 ZIP을 로컬에서 압축 해제**, `premium` 폴더에 있는 WebP **6개**를 R2 `premium` 폴더 안에서 Upload 실행

### 정확한 객체 Key (폴더 경로 포함)
```text
premium/city.webp
premium/stars.webp
premium/sunset.webp
premium/retro.webp
premium/med.webp
premium/disco.webp
```

**ZIP 파일 자체를 업로드하지 않도록 주의합니다.** `premium/premium/` 중복 경로도 피해야 합니다.

## 버킷 생성 뒤 추가할 Wrangler 바인딩 (현재는 미적용)
```toml
[[r2_buckets]]
binding = "PREMIUM_ASSETS"
bucket_name = "moment-premium-private"
```

- Worker는 `env.PREMIUM_ASSETS.get('premium/' + design + '.webp')`로 객체를 찾습니다.
- 이 다운로드 경로는 정상 결제 라이선스가 없으면 접근을 거부하도록 구현되어 있습니다.
- 버킷 생성 전에 바인딩을 배포하면 실패할 수 있으므로, **버킷 확인 이후** 위 설정을 추가합니다.
- `PAYMENTS_ACTIVE`는 R2 연결 이후에도 **false** 유지; 실제 테스트키 결제 완료 전 LIVE 전환 금지.

## 유의사항
- R2는 기본 비공개입니다. `r2.dev` 공개 URL을 켜면 유료 원본이 노출되므로 켜지 마세요.
- Standard 클래스는 월 무료 사용량이 있지만, R2 구독/결제정보 입력을 요청할 수 있으며 무료 한도를 넘으면 비용이 발생합니다.
- 비밀키, API 토큰, 개인 결제정보는 GitHub 및 채팅에 입력하지 않습니다.

참고:
- https://developers.cloudflare.com/r2/get-started/
- https://developers.cloudflare.com/r2/objects/upload-objects/
- https://developers.cloudflare.com/r2/buckets/public-buckets/
