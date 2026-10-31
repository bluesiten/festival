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
  if (!base.image && pv?.image && !/네이버/.test(pv.imageSource || '')) Object.assign(base, { image: pv.image, thumb: pv.thumb, imageSource: pv.imageSource, imageLicense: pv.imageLicense, imageLink: pv.imageLink, imageChecked: pv.imageChecked });
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
      ...(old.image && !/네이버/.test(old.imageSource || '') ? { image: old.image, thumb: old.thumb, imageSource: old.imageSource,
        imageLicense: old.imageLicense || '', imageLink: old.imageLink || '' } : { image: '', thumb: '' }),
      imageChecked: old.imageChecked || '',
      ...extra, source: 'std',
    });
    stdAdded++;
  }
  console.log(`표준데이터 ${rows.length}행 → 신규 ${stdAdded}개, TourAPI와 중복 ${stdMerged}개`);
} catch (e) { console.warn('표준데이터 수집 실패(건너뜀):', e.message); }

// ─────────────────────────────────────────────
// 5) 이미지 없는 축제: 저작권이 확실한 곳에서만 찾기
//    ① 한국관광공사 TourAPI 키워드 검색 (공공누리)
//    ② 한국관광공사 관광사진갤러리 (공공누리, 별도 활용신청 필요)
//    ③ Wikimedia Commons (CC0·퍼블릭도메인·CC BY/BY-SA, 저작자 표기)
//    → 못 찾으면 색 블록. 네이버 등 일반 검색 이미지는 쓰지 않음
// ─────────────────────────────────────────────
const IMG_VER = 'v2';
let galleryOn = true, hits = { tour: 0, gallery: 0, commons: 0 }, searched = 0;
const shortName = t => t.replace(/\(.*?\)|\[.*?\]|「.*?」|〈.*?〉/g, '').replace(/제?\s*\d+\s*회|\d{4}년?/g, '').replace(/\s+/g, ' ').trim();
const related = (cand, k) => { const c = norm(cand); return k.length >= 3 && c.length >= 2 && (c.includes(k) || (c.length >= 3 && k.includes(c))); };

async function tourImage(keyword, label) {
  const k = norm(keyword); if (k.length < 3) return null;
  const hit = items(await call('searchKeyword2', { keyword, arrange: 'Q', numOfRows: 5, pageNo: 1 }))
    .find(x => x.firstimage && related(x.title, k));
  return hit ? { image: hit.firstimage, thumb: hit.firstimage2 || hit.firstimage,
    imageSource: label, imageLicense: '공공누리', imageLink: '' } : null;
}
async function galleryImage(keyword, label) {
  const k = norm(keyword); if (!galleryOn || k.length < 3) return null;
  const qs = new URLSearchParams({ serviceKey: KEY, MobileOS: 'ETC', MobileApp: 'FestivalMap', _type: 'json',
    keyword, numOfRows: '10', pageNo: '1', arrange: 'A' });
  const text = await (await fetch('https://apis.data.go.kr/B551011/PhotoGalleryService1/gallerySearchList1?' + qs)).text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  const code = json?.response?.header?.resultCode;
  if (!json || (code && code !== '0000')) {
    galleryOn = false;
    console.warn('관광사진갤러리 사용 불가(활용신청 필요할 수 있음):', (code || '') + ' ' + text.slice(0, 120));
    return null;
  }
  const hit = items(json.response.body).find(x => x.galWebImageUrl && (related(x.galTitle, k) || related(x.galSearchKeyword || '', k)));
  return hit ? { image: hit.galWebImageUrl, thumb: hit.galWebImageUrl,
    imageSource: label + (hit.galPhotographer ? ` · 촬영 ${hit.galPhotographer}` : ''), imageLicense: '공공누리', imageLink: '' } : null;
}
async function commonsImage(keyword, label) {
  const k = norm(keyword); if (k.length < 3) return null;
  const qs = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrnamespace: '6',
    gsrsearch: `${keyword} filetype:bitmap`, gsrlimit: '8', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '900',
    iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName', origin: '*' });
  const res = await fetch('https://commons.wikimedia.org/w/api.php?' + qs,
    { headers: { 'User-Agent': 'FestivalMap/1.0 (https://bluesiten.github.io/festival/)' } });
  if (!res.ok) return null;
  const pages = Object.values((await res.json()).query?.pages || {});
  const OK = /^(cc0|public domain|pd|cc by(-sa)? [\d.]+)/i;
  for (const p of pages.sort((a, b) => a.index - b.index)) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const m = ii.extmetadata || {};
    const lic = (m.LicenseShortName?.value || '').trim();
    const name = p.title.replace(/^File:|\.[a-z]+$/gi, '') + ' ' + (m.ObjectName?.value || '');
    if (!OK.test(lic) || /\bnc\b|\bnd\b/i.test(lic) || !related(name, k)) continue;
    const artist = (m.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 60);
    return { image: ii.thumburl || ii.url, thumb: ii.thumburl || ii.url,
      imageSource: `${label}${artist ? ' · ' + artist : ''}`, imageLicense: lic, imageLink: ii.descriptionurl };
  }
  return null;
}

for (const f of out) {
  if (f.image) {                                  // TourAPI 축제 사진
    if (!f.imageSource) Object.assign(f, { imageSource: '한국관광공사',
      imageLicense: f.copyright === 'Type3' ? '공공누리 제3유형' : '공공누리 제1유형' });
    continue;
  }
  const ver = IMG_VER + (galleryOn ? 'g' : '');
  if (f.imageChecked === ver || searched >= 200) continue;
  searched++;
  const name = shortName(f.title), place = f.place ? shortName(f.place.split(/[,·/]/)[0]) : '';
  try {
    let hit = await tourImage(name, '한국관광공사');
    if (hit) hits.tour++;
    if (!hit) { hit = await galleryImage(name, '한국관광공사 관광사진갤러리'); if (hit) hits.gallery++; }
    if (!hit) { hit = await commonsImage(name, 'Wikimedia Commons'); if (hit) hits.commons++; }
    if (!hit && place) {                          // 축제 사진이 없으면 개최 장소 사진
      hit = await tourImage(place, '개최 장소 사진 · 한국관광공사')
        || await galleryImage(place, '개최 장소 사진 · 한국관광공사 관광사진갤러리')
        || await commonsImage(place, '개최 장소 사진 · Wikimedia Commons');
      if (hit) hits[/Commons/.test(hit.imageSource) ? 'commons' : /갤러리/.test(hit.imageSource) ? 'gallery' : 'tour']++;
    }
    if (hit) Object.assign(f, hit);
    f.imageChecked = IMG_VER + (galleryOn ? 'g' : '');
  } catch (e) { console.warn('이미지 검색 실패', f.title, e.message); }
}
console.log(`이미지 검색 ${searched}건 → 관광공사 ${hits.tour}, 관광사진갤러리 ${hits.gallery}, 위키미디어 ${hits.commons}`);

out.sort((a, b) => a.start.localeCompare(b.start));
await fs.writeFile(OUT, JSON.stringify({
  updated: new Date().toISOString(), source: '한국관광공사 TourAPI · 전국문화축제표준데이터', festivals: out,
}, null, 0));
console.log(`저장 완료: ${out.length}개, 상세 호출 ${detailCalls}건`);
