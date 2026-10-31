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
out.sort((a, b) => a.start.localeCompare(b.start));

await fs.writeFile(OUT, JSON.stringify({
  updated: new Date().toISOString(), source: '한국관광공사 TourAPI', festivals: out,
}, null, 0));
console.log(`저장 완료: ${out.length}개, 상세 호출 ${detailCalls}건`);
