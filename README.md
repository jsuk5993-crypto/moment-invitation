# MOMENT — 모바일 초대장 제작기 (Build 5)

무료 체험과 수요 검증을 위한 정적 웹사이트입니다.

## 구성
- `index.html`: 사진 업로드·편집, 초대장 디자인 선택 및 PNG 다운로드
- `config.js`: 선택적 Formspree 설문 제출 주소
- `.nojekyll`: GitHub Pages용 파일

## 공개 방법
1. GitHub 저장소 Settings → Pages로 이동합니다.
2. Build and deployment에서 **Deploy from a branch**를 선택합니다.
3. Branch **main**, folder **/(root)**를 선택하고 Save를 누릅니다.
4. Settings → Pages에 표시되는 공개 주소를 확인합니다.

## 설문 자동 수집
1. https://formspree.io 에서 본인 계정으로 폼을 만듭니다.
2. `config.js`의 `formspreeEndpoint`에 Formspree에서 제공한 `https://formspree.io/f/...` 주소를 입력하고 커밋합니다.
3. 실제 공개 사이트에서 테스트 응답을 보내고 Formspree에서 도착 여부를 확인합니다.

설문 주소가 비어 있으면 온라인 자동 전송은 비활성화되고 응답 텍스트를 복사하는 방식만 동작합니다.

## 참고
- 실제 결제 기능은 구현되어 있지 않습니다.
- 고객이 첨부하는 사진과 초대 정보는 설문으로 전송하지 않도록 설계되었습니다.
- 공개 테스트 이전에 이용약관, 개인정보 처리, 저작권 및 폰트·이미지 사용권을 점검하세요.
