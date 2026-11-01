// 검색엔진용 정적 페이지 만들기 (매일 데이터 갱신 뒤 실행)
//  - f/<id>.html        축제마다 한 페이지 (축제명 검색용, Event 구조화 데이터)
//  - area/<지역>.html    시·도, 시·군·구별 '가볼만한 곳' 페이지
//  - month/<YYYY-MM>.html 월별 축제 일정
//  - sitemap.xml, robots.txt, rss.xml
//  - index.html 안의 <!--SSR:...--> 구간에 정적 목록·링크를 넣어 자바스크립트 없이도 읽히게
// 실행: SITE_URL=https://example.com node scripts/build-pages.mjs

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SITE = (process.env.SITE_URL || 'https://bluesiten.github.io/festival').replace(/\/$/, '');
const BRAND = '대한민국 축제의 모든 것';
const VERIFY_NAVER = process.env.NAVER_SITE_VERIFICATION || '';
const VERIFY_GOOGLE = process.env.GOOGLE_SITE_VERIFICATION || '';

const data = JSON.parse(await fs.readFile(path.join(ROOT, 'data/festivals.json'), 'utf8'));
const kst = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3);
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const TODAY = ymd(kst());
const NOW_ISO = new Date().toISOString();

// ── 공통 도구 ──
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dt = s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
const iso = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const kday = s => `${+s.slice(4, 6)}월 ${+s.slice(6, 8)}일(${WD[dt(s).getUTCDay()]})`;
const kspan = f => f.start === f.end ? `${f.start.slice(0, 4)}년 ${kday(f.start)}`
  : `${f.start.slice(0, 4)}년 ${kday(f.start)} ~ ${f.start.slice(0, 4) === f.end.slice(0, 4) ? '' : f.end.slice(0, 4) + '년 '}${kday(f.end)}`;
const sspan = f => { const m = s => `${+s.slice(4, 6)}.${+s.slice(6, 8)}`; return f.start === f.end ? m(f.start) : `${m(f.start)} ~ ${m(f.end)}`; };
const days = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
const isLong = f => days(f.start, f.end) > 45;
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; };
const https = u => (u || '').replace(/^http:/, 'https:');

const REGION = [['서울', '서울'], ['부산', '부산'], ['대구', '대구'], ['인천', '인천'], ['광주', '광주'], ['대전', '대전'], ['울산', '울산'], ['세종', '세종'],
  ['경기', '경기'], ['강원', '강원'], ['충청북', '충북'], ['충북', '충북'], ['충청남', '충남'], ['충남', '충남'], ['전라북', '전북'], ['전북', '전북'],
  ['전남광주', '전남'], ['전라남', '전남'], ['전남', '전남'], ['경상북', '경북'], ['경북', '경북'], ['경상남', '경남'], ['경남', '경남'], ['제주', '제주']];
const REGION_FULL = { 서울: '서울', 부산: '부산', 대구: '대구', 인천: '인천', 광주: '광주', 대전: '대전', 울산: '울산', 세종: '세종', 경기: '경기도',
  강원: '강원도', 충북: '충청북도', 충남: '충청남도', 전북: '전라북도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도', 제주: '제주도' };
const ORDER = ['서울', '경기', '인천', '강원', '충북', '충남', '대전', '세종', '전북', '전남', '광주', '경북', '대구', '경남', '부산', '울산', '제주'];
const regionOf = f => (REGION.find(([k]) => (f.addr || f.region || '').startsWith(k)) || [, ''])[1];
const cityOf = f => { const w = (f.addr || '').split(/\s+/)[1] || ''; return /[시군구]$/.test(w) && w.length >= 2 ? w : ''; };
// '청송군' → '청송', '서울 종로구' 처럼 구는 그대로
const cityShort = c => /[시군]$/.test(c) && c.length > 2 ? c.slice(0, -1) : c;
const slug = s => s.replace(/\s+/g, '-');
const areaFile = (r, c) => `area/${slug(c ? `${r}-${c}` : r)}.html`;

// ── 데이터 정리 ──
const ALL = (data.festivals || []).filter(f => f.id && f.title && f.start && f.end && !f.sample)
  .map(f => ({ ...f, _r: regionOf(f), _c: cityOf(f) }));
const LIVE = ALL.filter(f => f.end >= TODAY);                     // 끝나지 않은 축제
const byStart = (a, b) => (isLong(a) - isLong(b)) || (a.start < TODAY ? TODAY : a.start).localeCompare(b.start < TODAY ? TODAY : b.start) || a.end.localeCompare(b.end);

// ── 페이지 틀 ──
function page({ url, title, desc, image, body, jsonld = [], depth = 1, type = 'website' }) {
  const up = '../'.repeat(depth);
  const canon = encodeURI(`${SITE}/${url}`.replace(/\/index\.html$/, '/'));
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canon)}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canon)}">
<meta property="og:image" content="${esc(image || `${SITE}/og.png`)}">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="${up}pages.css">
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<header class="bar"><a class="home" href="${up}">${BRAND}</a><a class="find" href="${up}#controls">축제 검색</a></header>
<main class="wrap">
${body}
</main>
<footer class="foot">
  <nav aria-label="지역별 축제">${ORDER.map(r => `<a href="${up}${areaFile(r)}">${r}</a>`).join('')}</nav>
  <p>축제 정보: 한국관광공사 TourAPI · 전국문화축제표준데이터. 일정은 바뀔 수 있으니 방문 전 공식 안내를 확인하세요.</p>
</footer>
</body>
</html>
`;
}
const crumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: encodeURI(`${SITE}/${url}`.replace(/\/index\.html$/, '/')) })) });
const crumbHTML = (items, depth) => `<nav class="crumbs" aria-label="현재 위치">${items.map(([n, u], i) =>
  i === items.length - 1 ? `<span>${esc(n)}</span>` : `<a href="${'../'.repeat(depth)}${u === 'index.html' ? '' : u}">${esc(n)}</a>`).join(' › ')}</nav>`;

// 목록 한 줄(지역·월 페이지, 축제 페이지 하단)
const row = (f, depth) => {
  const img = https(f.thumb || f.image);
  return `<li><a class="row" href="${'../'.repeat(depth)}f/${esc(f.id)}.html">
  ${img ? `<img src="${esc(img)}" alt="${esc(f.title)}" width="96" height="96" loading="lazy">` : '<span class="noimg"></span>'}
  <span class="t"><b>${esc(f.title)}</b><span class="m">${sspan(f)} · ${esc([f._r, f._c].filter(Boolean).join(' '))}${f.place ? ' · ' + esc(clip(f.place, 24)) : ''}</span>
  ${f.overview ? `<span class="o">${esc(clip(f.overview, 70))}</span>` : ''}</span></a></li>`;
};
// 상태 표시는 방문 시점 기준으로 계산(정적 페이지라 날짜가 지나도 맞게)
const statusScript = `<script>(function(){var e=document.querySelector('[data-start]');if(!e)return;var d=new Date(Date.now()+9*36e5).toISOString().slice(0,10).replace(/-/g,''),s=e.dataset.start,t=e.dataset.end,l='';
if(t<d)l='종료된 축제예요';else if(s<=d)l=t===d?'오늘까지 열려요':'지금 진행 중';else{var n=Math.round((Date.UTC(s.slice(0,4),s.slice(4,6)-1,s.slice(6))-Date.UTC(d.slice(0,4),d.slice(4,6)-1,d.slice(6)))/864e5);l='D-'+n}
e.textContent=l;e.className='status '+(t<d?'end':s<=d?'live':'soon')})()</script>`;

// ── 1) 축제 페이지 ──
await fs.mkdir(path.join(ROOT, 'f'), { recursive: true });
const urls = [];
for (const f of ALL) {
  const area = [f._r, f._c].filter(Boolean).join(' ');
  const yr = f.start.slice(0, 4);
  const hasYear = /20\d\d/.test(f.title);
  const title = `${f.title}${hasYear ? '' : ' ' + yr} 일정·장소 | ${sspan(f)} ${area || '축제'}`;
  const desc = clip(`${f.title}${hasYear ? '' : ` ${yr}`} – ${kspan(f)}, ${f.place || f.addr || area}. ${f.overview || `${area} 축제 정보와 가는 길.`}`, 150);
  const img = https(f.image || f.thumb);
  const near = LIVE.filter(x => x.id !== f.id && x._r === f._r && !isLong(x)).sort((a, b) => (b._c === f._c) - (a._c === f._c) || byStart(a, b)).slice(0, 6);
  const q = encodeURIComponent(f.place ? `${cityShort(f._c) || f._r} ${String(f.place).split(/[,·/+()]/)[0].trim()}` : (f.addr || f.title));
  const rows = [['기간', kspan(f)], ['장소', f.place], ['주소', f.addr], ['시간', f.playtime], ['요금', f.fee], ['주최', f.host], ['문의', f.tel]].filter(r => r[1]);
  const event = {
    '@context': 'https://schema.org', '@type': 'Event', name: f.title,
    startDate: iso(f.start), endDate: iso(f.end),
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: f.place || area || f.addr,
      address: { '@type': 'PostalAddress', streetAddress: f.addr || '', addressLocality: f._c || undefined, addressRegion: REGION_FULL[f._r] || f._r || undefined, addressCountry: 'KR' },
      ...(f.lat && f.lng ? { geo: { '@type': 'GeoCoordinates', latitude: f.lat, longitude: f.lng } } : {}) },
    ...(img ? { image: [img] } : {}),
    description: clip(f.overview || desc, 300),
    ...(f.host ? { organizer: { '@type': 'Organization', name: f.host, ...(f.homepage ? { url: f.homepage } : {}) } } : {}),
    ...(/^무료/.test(f.fee || '') ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: 0, priceCurrency: 'KRW', availability: 'https://schema.org/InStock', url: f.homepage || `${SITE}/f/${f.id}.html` } } : {}),
  };
  const cr = [['홈', 'index.html'], [`${f._r} 가볼만한 곳`, areaFile(f._r)], ...(f._c ? [[`${cityShort(f._c)} 가볼만한 곳`, areaFile(f._r, f._c)]] : []), [f.title, `f/${f.id}.html`]];
  const body = `${crumbHTML(cr, 1)}
<article class="fest">
  <p class="kick"><span data-start="${f.start}" data-end="${f.end}" class="status"></span> ${esc(area)}</p>
  <h1>${esc(f.title)}</h1>
  <p class="when">${esc(kspan(f))}${f.place ? ` · ${esc(f.place)}` : ''}</p>
  ${img ? `<figure><img src="${esc(img)}" alt="${esc(f.title)} 대표 사진" width="1200" height="800">${f.imageSource ? `<figcaption>사진: ${f.imageLink ? `<a href="${esc(f.imageLink)}" rel="nofollow noopener" target="_blank">${esc(f.imageSource)}</a>` : esc(f.imageSource)}${f.imageLicense ? ` (${esc(f.imageLicense)})` : ''}${/장소|지역|관련/.test(f.imageSource) ? ' — 축제 현장 사진이 아닐 수 있어요' : ''}</figcaption>` : ''}</figure>` : ''}
  ${f.overview ? `<h2>${esc(f.title)}는 어떤 축제인가요</h2>${String(f.overview).split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}` : ''}
  <h2>일정과 장소</h2>
  <dl class="info">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  <p class="btns">${f.homepage ? `<a class="primary" href="${esc(f.homepage)}" rel="noopener" target="_blank">공식 홈페이지</a>` : ''}
    <a href="https://map.naver.com/p/search/${q}" rel="noopener" target="_blank">네이버 지도</a>
    <a href="https://map.kakao.com/link/${f.lat ? `to/${encodeURIComponent(f.place || f.title)},${f.lat},${f.lng}` : `search/${q}`}" rel="noopener" target="_blank">카카오맵 길찾기</a></p>
</article>
${near.length ? `<section class="more"><h2>${esc(cityShort(f._c) || f._r)} 근처 가볼만한 곳 · 함께 열리는 축제</h2><ul class="rows">${near.map(x => row(x, 1)).join('')}</ul>
<p class="see"><a href="../${areaFile(f._r, f._c || '')}">${esc(f._c ? cityShort(f._c) : f._r)} 가볼만한 곳 전체 보기 →</a></p></section>` : ''}
${statusScript}`;
  await fs.writeFile(path.join(ROOT, 'f', `${f.id}.html`), page({ url: `f/${f.id}.html`, title, desc, image: img, body, depth: 1, type: 'article',
    jsonld: [event, crumbs(cr)] }));
  if (f.end >= ymd(kst(-60))) urls.push([`f/${f.id}.html`, '0.7']);
}

// ── 2) 지역 페이지 (가볼만한 곳) ──
await fs.mkdir(path.join(ROOT, 'area'), { recursive: true });
const month = +TODAY.slice(4, 6);
const groups = new Map();
for (const f of LIVE) {
  if (!f._r) continue;
  (groups.get(f._r) || groups.set(f._r, []).get(f._r)).push(f);
  if (f._c) { const k = `${f._r}|${f._c}`; (groups.get(k) || groups.set(k, []).get(k)).push(f); }
}
const areaLinks = [];
for (const r of ORDER) if (!groups.has(r)) groups.set(r, []);
for (const [key, list] of groups) {
  const [r, c] = key.split('|');
  const name = c ? cityShort(c) : r, full = c ? `${r} ${c}` : (REGION_FULL[r] || r);
  const fest = list.filter(f => !isLong(f)).sort(byStart), always = list.filter(isLong).sort(byStart);
  const now = fest.filter(f => f.start <= TODAY).length;
  const title = `${name} 가볼만한 곳 ${month}월 · ${full} 축제 일정 ${fest.length ? fest.length + '곳' : ''} | ${BRAND}`.replace(/\s+\|/, ' |');
  const desc = clip(fest.length
    ? `${month}월 ${full} 가볼만한 곳: 지금 열리거나 곧 열리는 축제 ${fest.length}곳(${fest.slice(0, 4).map(f => f.title).join(', ')} 등). 일정, 장소, 가는 길을 한 번에.`
    : `${full}에서 열리는 축제와 가볼만한 곳 정보를 모았어요. 새 축제가 등록되면 매일 갱신돼요.`, 150);
  const subs = !c ? [...groups.keys()].filter(k => k.startsWith(r + '|')).map(k => k.split('|')[1]).sort() : [];
  const sibs = c ? [...groups.keys()].filter(k => k.startsWith(r + '|') && k !== key).map(k => k.split('|')[1]).sort() : [];
  const cr = [['홈', 'index.html'], [`${r} 가볼만한 곳`, areaFile(r)], ...(c ? [[`${name} 가볼만한 곳`, areaFile(r, c)]] : [])];
  const itemList = { '@context': 'https://schema.org', '@type': 'ItemList', name: `${name} 가볼만한 곳 · 축제`,
    itemListElement: fest.slice(0, 30).map((f, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/f/${f.id}.html`, name: f.title })) };
  const body = `${crumbHTML(cr, 1)}
<h1>${esc(name)} 가볼만한 곳 · ${month}월 축제</h1>
<p class="lead">${fest.length ? `${esc(full)}에서 지금 열리고 있거나 곧 열리는 축제 <b>${fest.length}곳</b>을 날짜순으로 모았어요.${now ? ` 그중 ${now}곳은 지금 진행 중이에요.` : ''}` : `${esc(full)}에는 지금 등록된 축제가 없어요. 새 축제가 등록되면 매일 이곳에 추가돼요.`}</p>
${subs.length ? `<p class="chips">${subs.map(s => `<a href="../${areaFile(r, s)}">${esc(cityShort(s))}</a>`).join('')}</p>` : ''}
${fest.length ? `<h2>${esc(name)} 축제 일정</h2><ul class="rows">${fest.map(f => row(f, 1)).join('')}</ul>` : ''}
${always.length ? `<h2>${esc(name)}에서 늘 볼 수 있는 공연·행사</h2><ul class="rows">${always.map(f => row(f, 1)).join('')}</ul>` : ''}
${sibs.length ? `<h2>${esc(r)}의 다른 가볼만한 곳</h2><p class="chips">${sibs.map(s => `<a href="../${areaFile(r, s)}">${esc(cityShort(s))}</a>`).join('')}<a href="../${areaFile(r)}">${esc(r)} 전체</a></p>` : ''}`;
  const file = areaFile(r, c);
  await fs.writeFile(path.join(ROOT, file), page({ url: file, title, desc, image: https((fest[0] || always[0] || {}).image), body, depth: 1,
    jsonld: [itemList, crumbs(cr)] }));
  urls.push([file, c ? '0.6' : '0.8']);
  if (!c) areaLinks.push([r, file, fest.length]);
}

// ── 3) 월별 페이지 ──
await fs.mkdir(path.join(ROOT, 'month'), { recursive: true });
const monthLinks = [];
for (let k = 0; k < 3; k++) {
  const y = kst().getUTCFullYear(), m0 = kst().getUTCMonth() + k;
  const a = ymd(new Date(Date.UTC(y, m0, 1))), b = ymd(new Date(Date.UTC(y, m0 + 1, 0)));
  const yy = a.slice(0, 4), mm = +a.slice(4, 6);
  const list = ALL.filter(f => f.start <= b && f.end >= a && !isLong(f)).sort(byStart);
  const file = `month/${yy}-${a.slice(4, 6)}.html`;
  const byR = ORDER.map(r => [r, list.filter(f => f._r === r)]).filter(([, l]) => l.length);
  const title = `${mm}월 가볼만한 곳 · ${yy}년 ${mm}월 전국 축제 일정 ${list.length}곳 | ${BRAND}`;
  const desc = clip(`${yy}년 ${mm}월에 열리는 전국 지역 축제 ${list.length}곳을 지역별로 정리했어요. ${list.slice(0, 5).map(f => f.title).join(', ')} 등.`, 150);
  const body = `${crumbHTML([['홈', 'index.html'], [`${mm}월 축제`, file]], 1)}
<h1>${mm}월 가볼만한 곳 · ${yy}년 ${mm}월 축제</h1>
<p class="lead">${yy}년 ${mm}월에 열리는 전국 지역 축제 <b>${list.length}곳</b>을 지역별로 모았어요.</p>
<p class="chips">${byR.map(([r, l]) => `<a href="#r-${r}">${r} ${l.length}</a>`).join('')}</p>
${byR.map(([r, l]) => `<h2 id="r-${r}">${r} ${mm}월 축제</h2><ul class="rows">${l.map(f => row(f, 1)).join('')}</ul><p class="see"><a href="../${areaFile(r)}">${r} 가볼만한 곳 전체 →</a></p>`).join('')}`;
  await fs.writeFile(path.join(ROOT, file), page({ url: file, title, desc, image: https((list[0] || {}).image), body, depth: 1,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: `${yy}년 ${mm}월 축제`,
      itemListElement: list.slice(0, 50).map((f, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/f/${f.id}.html`, name: f.title })) }] }));
  urls.push([file, '0.8']);
  monthLinks.push([`${mm}월 축제`, file, list.length]);
}

// ── 4) 메인 페이지: 정적 목록·링크·검색엔진 태그 ──
let index = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
const put = (name, html) => {
  const re = new RegExp(`<!--SSR:${name}-->[\\s\\S]*?<!--/SSR:${name}-->`);
  if (re.test(index)) index = index.replace(re, `<!--SSR:${name}-->${html}<!--/SSR:${name}-->`);
  else console.warn('표시 위치 없음:', name);
};
const wk = ymd(kst(6));
const thisWeek = LIVE.filter(f => f.start <= wk).sort(byStart);
put('list', thisWeek.map(f => `<li class="item"><a href="f/${esc(f.id)}.html">${esc(f.title)}</a> <span>${sspan(f)} · ${esc([f._r, f._c].filter(Boolean).join(' '))}</span></li>`).join(''));
put('links', `<nav class="seo-links" aria-label="지역·월별 축제"><p><b>지역별 가볼만한 곳</b> ${areaLinks.map(([r, u]) => `<a href="${u}">${r}</a>`).join(' ')}</p>
<p><b>월별 축제</b> ${monthLinks.map(([n, u]) => `<a href="${u}">${n}</a>`).join(' ')}</p></nav>`);
put('head', [
  `<link rel="canonical" href="${SITE}/">`,
  `<meta property="og:url" content="${SITE}/">`,
  `<meta property="og:image" content="${SITE}/og.png">`,
  `<meta property="og:type" content="website"><meta property="og:locale" content="ko_KR"><meta name="twitter:card" content="summary_large_image">`,
  `<link rel="alternate" type="application/rss+xml" title="${BRAND}" href="${SITE}/rss.xml">`,
  VERIFY_NAVER && `<meta name="naver-site-verification" content="${esc(VERIFY_NAVER)}">`,
  VERIFY_GOOGLE && `<meta name="google-site-verification" content="${esc(VERIFY_GOOGLE)}">`,
  `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: `${SITE}/`, inLanguage: 'ko-KR' })}</script>`,
].filter(Boolean).join('\n'));
await fs.writeFile(path.join(ROOT, 'index.html'), index);

// ── 5) sitemap · robots · rss ──
const day = new Date().toISOString().slice(0, 10);
const sm = [[ '', '1.0' ], ...urls].map(([u, p]) => `<url><loc>${esc(encodeURI(`${SITE}/${u}`))}</loc><lastmod>${day}</lastmod><priority>${p}</priority></url>`);
await fs.writeFile(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sm.join('\n')}\n</urlset>\n`);
await fs.writeFile(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
const rssItems = LIVE.filter(f => !isLong(f)).sort((a, b) => (b.modified || b.start).localeCompare(a.modified || a.start)).slice(0, 60);
await fs.writeFile(path.join(ROOT, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${BRAND}</title><link>${SITE}/</link><description>전국 지역 축제 일정과 가볼만한 곳</description><language>ko</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems.map(f => `<item><title>${esc(f.title)} (${sspan(f)}, ${esc([f._r, f._c].filter(Boolean).join(' '))})</title><link>${SITE}/f/${esc(f.id)}.html</link><guid>${SITE}/f/${esc(f.id)}.html</guid><description>${esc(clip(f.overview || kspan(f), 200))}</description></item>`).join('\n')}
</channel></rss>\n`);

console.log(`검색용 페이지: 축제 ${ALL.length} · 지역 ${[...groups.keys()].length} · 월 ${monthLinks.length} · 사이트맵 ${sm.length}개 주소 (${SITE})`);
