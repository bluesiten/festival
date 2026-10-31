// TourAPI 4.0 (KorService2) → data/festivals.json
// 실행: TOURAPI_KEY=발급받은키 node scripts/fetch-festivals.mjs
// GitHub Actions에서 매일 자동 실행됩니다 (.github/workflows/update.yml)

import fs from 'node:fs/promises';

const BASE = 'https://apis.data.go.kr/B551011/KorService2';
let KEY = process.env.TOURAPI_KEY || '';
if (!KEY) { console.error('TOURAPI_KEY 환경변수가 없습니다.'); process.exit(1); }
// '인코딩 키'를 넣어도 동작하도록 한 번 디코딩
if (KEY.includes('%')) KEY = decodeURIComponent(KEY);

const OUT = new URL('../data/festivals.json', import.meta.url);
const kst = () => new Date(Date.now() + 9 * 3600e3);
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const addDays = (d, n) => new Date(d.getTime() + n * 86400e3);

async function call(op, params) {
  const qs = new URLSearchParams({
    serviceKey: KEY, MobileOS: 'ETC', MobileApp: 'FestivalMap', _type: 'json', ...params,
  });
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${BASE}/${op}?${qs}`);
      const text = await res.text();
      if (text.trim().startsWith('<')) throw new Error('XML 오류 응답: ' + text.slice(0, 200));
      const json = JSON.parse(text);
      const h = json.response?.header;
      if (h && h.resultCode !== '0000') throw new Error(`${h.resultCode} ${h.resultMsg}`);
      return json.response.body;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}
const items = body => {
  const it = body?.items?.item;
  return !it ? [] : Array.isArray(it) ? it : [it];
};

// 1) 목록: 60일 전 시작분부터 받아서 오늘 이후 끝나는 것만 남김
const today = kst();
const list = [];
for (let page = 1; page < 20; page++) {
  const body = await call('searchFestival2', {
    eventStartDate: ymd(addDays(today, -60)), arrange: 'A', numOfRows: 500, pageNo: page,
  });
  list.push(...items(body));
  if (list.length >= body.totalCount) break;
}
const todayStr = ymd(today), horizon = ymd(addDays(today, 120));
const active = list.filter(f => f.eventenddate >= todayStr && f.eventstartdate <= horizon);
console.log(`받은 축제 ${list.length}개 → 유효 ${active.length}개`);

// 2) 기존 파일의 상세정보 캐시 (호출 수 절약: 개발계정 하루 1,000건)
let cache = {};
try {
  const prev = JSON.parse(await fs.readFile(OUT, 'utf8'));
  for (const f of prev.festivals || []) if (f.overview) cache[f.id] = f;
} catch {}

let prevAll = [];
try { prevAll = JSON.parse(await fs.readFile(OUT, 'utf8')).festivals || []; } catch {}
const prevById = Object.fromEntries(prevAll.map(f => [f.id, f]));

// 3) 앞으로 14일 안에 열리는 축제는 소개글·프로그램 상세까지 받기
const soon = ymd(addDays(today, 14));
let detailCalls = 0;
const out = [];
for (const f of active) {
  const base = {
    id: f.contentid,
    title: f.title,
    start: f.eventstartdate,
    end: f.eventenddate,
    addr: [f.addr1, f.addr2].filter(Boolean).join(' '),
    region: (f.addr1 || '').split(' ')[0] || '',
    lat: +f.mapy || null,
    lng: +f.mapx || null,
    image: f.firstimage || '',
    thumb: f.firstimage2 || f.firstimage || '',
    tel: f.tel || '',
    copyright: f.cpyrhtDivCd || '',
    modified: f.modifiedtime || '',
  };
  const pv = prevById[base.id];
  if (!base.image && pv?.image) Object.assign(base, { image: pv.image, thumb: pv.thumb, imageSource: pv.imageSource, imageChecked: pv.imageChecked });
  if (!base.image && pv?.imageChecked) base.imageChecked = pv.imageChecked;
  const c = cache[base.id];
  if (c && c.modified === base.modified) {
    Object.assign(base, { overview: c.overview, homepage: c.homepage, place: c.place, playtime: c.playtime, fee: c.fee, host: c.host });
  } else if (base.start <= soon && detailCalls < 400) {
    try {
      const [common] = items(await call('detailCommon2', { contentId: base.id }));
      const [intro] = items(await call('detailIntro2', { contentId: base.id, contentTypeId: 15 }));
      detailCalls += 2;
      const strip = s => (s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
      base.overview = strip(common?.overview);
      base.homepage = (common?.homepage || '').match(/https?:\/\/[^"'<>\s]+/)?.[0] || '';
      base.place = strip(intro?.eventplace);
      base.playtime = strip(intro?.playtime);
      base.fee = strip(intro?.usetimefestival);
      base.host = strip(intro?.sponsor1);
    } catch (e) { console.warn('상세 실패', base.title, e.message); }
  }
  out.push(base);
}
// ─────────────────────────────────────────────
// 4) 전국문화축제표준데이터 (지자체 등록 축제, 인증키 불필요)
// ─────────────────────────────────────────────

const norm = t => (t || '').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]|「.*?」|〈.*?〉/g, '')
  .replace(/제?\s*\d+\s*회|\d{4}년?|[^가-힣a-z0-9]/g, '');
const days = (a, b) => Math.abs((Date.UTC(a.slice(0,4), a.slice(4,6)-1, a.slice(6)) - Date.UTC(b.slice(0,4), b.slice(4,6)-1, b.slice(6))) / 864e5);
const sameFest = (a, b) => {
  const x = norm(a.title), y = norm(b.title);
  if (x.length < 3 || y.length < 3) return false;
  const nameHit = x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)));
  return nameHit && (a.start <= b.end && b.start <= a.end || days(a.start, b.start) <= 3);
};
const hashId = s => 'std-' + [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);

let stdAdded = 0, stdMerged = 0;
try {
  const COLS = ['FSTVL_NM','OPAR','FSTVL_START_DATE','FSTVL_END_DATE','FSTVL_CO','MNNST_NM','AUSPC_INSTT_NM','SUPRT_INSTT_NM',
    'PHONE_NUMBER','HOMEPAGE_URL','RELATE_INFO','RDNMADR','LNMADR','LATITUDE','LONGITUDE','REFERENCE_DATE'];
  const qs = new URLSearchParams({ publicDataPk: '15013104', svcTableNm: 'tn_pubr_public_cltur_fstvl_svc',
    perPage: '10000', page: '1', totalCount: '1000000' });
  COLS.forEach(c => qs.append('colNmList', c));
  const res = await fetch('https://www.data.go.kr/download/standard.json?' + qs, { signal: AbortSignal.timeout(60000) });
  const rows = JSON.parse(await res.text());
  if (!Array.isArray(rows)) throw new Error('예상과 다른 응답');
  const d8 = v => (v || '').replace(/\D/g, '').slice(0, 8);
  const clean = v => (v || '').toString().trim();
  let seen = new Set();
  for (const r of rows) {
    const f = {
      title: clean(r.FSTVL_NM), start: d8(r.FSTVL_START_DATE), end: d8(r.FSTVL_END_DATE) || d8(r.FSTVL_START_DATE),
    };
    if (!f.title || f.start.length !== 8 || f.end < todayStr || f.start > horizon) continue;
    const addr = clean(r.RDNMADR) || clean(r.LNMADR);
    const extra = {
      overview: clean(r.FSTVL_CO), place: clean(r.OPAR), tel: clean(r.PHONE_NUMBER),
      homepage: (clean(r.HOMEPAGE_URL).match(/https?:\/\/\S+/) || [''])[0] || (clean(r.HOMEPAGE_URL) && !/\s/.test(clean(r.HOMEPAGE_URL)) ? 'http://' + clean(r.HOMEPAGE_URL) : ''),
      host: clean(r.AUSPC_INSTT_NM) || clean(r.MNNST_NM),
    };
    const twin = out.find(o => sameFest(o, f));
    if (twin) {                                   // TourAPI에 이미 있음 → 빈 칸만 보충
      for (const k of ['overview', 'place', 'tel', 'homepage', 'host']) if (!twin[k] && extra[k]) twin[k] = extra[k];
      stdMerged++; continue;
    }
    const key = norm(f.title) + f.start;
    if (seen.has(key)) continue; seen.add(key);
    const id = hashId(key);
    const old = prevById[id] || {};
    out.push({
      id, ...f, addr, region: addr.split(' ')[0] || '',
      lat: +r.LATITUDE || null, lng: +r.LONGITUDE || null,
      image: old.image || '', thumb: old.thumb || '', imageSource: old.imageSource || '', imageChecked: old.imageChecked || '',
      ...extra, source: 'std',
    });
    stdAdded++;
  }
  console.log(`표준데이터 ${rows.length}행 → 신규 ${stdAdded}개, TourAPI와 중복 ${stdMerged}개`);
} catch (e) { console.warn('표준데이터 수집 실패(건너뜀):', e.message); }

// ─────────────────────────────────────────────
// 5) 이미지 없는 축제: 검색해서 대표 이미지 채우기
//    ① TourAPI 키워드 검색(축제명 → 개최장소) — 관광공사 공식 사진
//    ② NAVER_CLIENT_ID/SECRET 이 있으면 네이버 이미지 검색
//    한 번 찾아본 축제는 imageChecked로 기록해 다시 검색하지 않음
// ─────────────────────────────────────────────
const NAVER_ID = process.env.NAVER_CLIENT_ID, NAVER_SECRET = process.env.NAVER_CLIENT_SECRET;
let tourHits = 0, naverHits = 0, searched = 0;
const shortName = t => t.replace(/\(.*?\)|\[.*?\]/g, '').replace(/제?\s*\d+\s*회|\d{4}년?/g, '').replace(/\s+/g, ' ').trim();
async function tourImage(keyword, label = '한국관광공사') {
  if (!keyword || keyword.length < 2) return null;
  const list = items(await call('searchKeyword2', { keyword, arrange: 'Q', numOfRows: 5, pageNo: 1 }));
  const k = norm(keyword);
  const hit = list.find(x => x.firstimage && k.length >= 3 && (norm(x.title).includes(k) || k.includes(norm(x.title))));
  return hit ? { image: hit.firstimage, thumb: hit.firstimage2 || hit.firstimage, imageSource: label } : null;
}
async function naverImage(q) {
  const res = await fetch('https://openapi.naver.com/v1/search/image?' + new URLSearchParams({ query: q, display: '5', sort: 'sim', filter: 'large' }),
    { headers: { 'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SECRET } });
  if (!res.ok) throw new Error('네이버 ' + res.status);
  const it = (await res.json()).items?.[0];
  return it ? { image: it.thumbnail, thumb: it.thumbnail, imageSource: '네이버 이미지 검색', imageLink: it.link } : null;
}
for (const f of out) {
  if (f.image || searched >= 250) continue;
  if (f.imageChecked === (NAVER_ID ? 'naver' : 'tour')) continue;
  searched++;
  try {
    let hit = await tourImage(shortName(f.title));
    if (!hit && f.place) hit = await tourImage(shortName(f.place.split(/[,·/]/)[0]), '개최 장소 사진(한국관광공사)');
    if (hit) tourHits++;
    if (!hit && NAVER_ID) {
      hit = await naverImage(`${shortName(f.title)} ${f.region || ''}`.trim());
      if (hit) naverHits++;
    }
    if (hit) Object.assign(f, hit);
    f.imageChecked = NAVER_ID ? 'naver' : 'tour';
  } catch (e) { console.warn('이미지 검색 실패', f.title, e.message); }
}
console.log(`이미지 검색 ${searched}건 → 관광공사 ${tourHits}, 네이버 ${naverHits}`);

out.sort((a, b) => a.start.localeCompare(b.start));
await fs.writeFile(OUT, JSON.stringify({
  updated: new Date().toISOString(), source: '한국관광공사 TourAPI · 전국문화축제표준데이터', festivals: out,
}, null, 0));
console.log(`저장 완료: ${out.length}개, 상세 호출 ${detailCalls}건`);
