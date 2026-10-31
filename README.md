# 이번주 축제 — 전국 지역 축제 지도

- 데이터: 한국관광공사 TourAPI 4.0 (KorService2 `searchFestival2` + `detailCommon2` + `detailIntro2`)
- 지도: Leaflet + CARTO Positron(밝은 무채색 지도, 키 불필요)
- 배포: GitHub Pages (정적 사이트), 데이터는 GitHub Actions가 매일 새벽 5시에 갱신

## TourAPI 키 연결 (한 번만)
1. data.go.kr에서 **한국관광공사_국문 관광정보 서비스_GW** 활용신청 → 자동 승인
2. 마이페이지에서 **일반 인증키(Decoding)** 복사
3. GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret
   - Name: `TOURAPI_KEY` / Secret: 복사한 키
4. Actions 탭 → "축제 데이터 갱신" → Run workflow
   → `data/festivals.json`이 실제 데이터로 바뀌고, 샘플 표시가 사라집니다.

## 파일
- `index.html`, `style.css`, `app.js` — 화면
- `data/festivals.json` — 축제 데이터 (지금은 샘플)
- `scripts/fetch-festivals.mjs` — TourAPI 수집 스크립트
- `.github/workflows/update.yml` — 매일 자동 갱신
