(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ── 날짜 (한국시간 기준 YYYYMMDD) ──
const kstDate = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3);
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const TODAY = ymd(kstDate());
const WEEK_END = ymd(kstDate(6));
const dow = kstDate().getUTCDay();                       // 0=일 … 6=토
const satOff = dow === 0 ? -1 : 6 - dow;
const WKND = [ymd(kstDate(satOff)), ymd(kstDate(satOff + 1))];
const NEXT_WEEK = [ymd(kstDate(7)), ymd(kstDate(13))];
const _t = kstDate(), _y = _t.getUTCFullYear(), _m = _t.getUTCMonth();
const ymdUTC = (y, m, d) => ymd(new Date(Date.UTC(y, m, d)));
const MONTH_END = ymdUTC(_y, _m + 1, 0);                         // 이번 달 말일
const NEXT_MONTH = [ymdUTC(_y, _m + 1, 1), ymdUTC(_y, _m + 2, 0)];  // 다음 달 1일~말일
const md = s => `${+s.slice(4, 6)}.${+s.slice(6, 8)}`;
const span = f => f.start === f.end ? md(f.start) : `${md(f.start)} ~ ${md(f.end)}`;
const diffDays = (a, b) => Math.round((Date.UTC(b.slice(0,4), b.slice(4,6)-1, b.slice(6)) - Date.UTC(a.slice(0,4), a.slice(4,6)-1, a.slice(6))) / 86400e3);
const overlaps = (f, a, b) => f.start <= b && f.end >= a;

const isLong = f => diffDays(f.start, f.end) > 45;
function status(f) {
  if (isLong(f) && f.start <= TODAY) return { cls: 'later', label: '상시' };
  if (f.start <= TODAY && f.end >= TODAY) {
    const left = diffDays(TODAY, f.end);
    return { cls: 'live', label: left === 0 ? '오늘까지' : '진행 중' };
  }
  const d = diffDays(TODAY, f.start);
  return d <= 7 ? { cls: 'soon', label: `D-${d}` } : { cls: 'later', label: `D-${d}` };
}

// ── 지역·테마 ──
const REGION = [['서울','서울'],['부산','부산'],['대구','대구'],['인천','인천'],['광주','광주'],['대전','대전'],['울산','울산'],['세종','세종'],
  ['경기','경기'],['강원','강원'],['충청북','충북'],['충북','충북'],['충청남','충남'],['충남','충남'],['전라북','전북'],['전북','전북'],
  ['전라남','전남'],['전남','전남'],['경상북','경북'],['경북','경북'],['경상남','경남'],['경남','경남'],['제주','제주']];
const CITY = {영주:'경북',포항:'경북',경주:'경북',안동:'경북',구미:'경북',청송:'경북',통영:'경남',창원:'경남',김해:'경남',진주:'경남',
  수원:'경기',고양:'경기',성남:'경기',용인:'경기',춘천:'강원',강릉:'강원',원주:'강원',청주:'충북',충주:'충북',천안:'충남',공주:'충남',
  전주:'전북',군산:'전북',여수:'전남',순천:'전남',목포:'전남'};
const regionOf = f => {
  const a = (f.addr || f.region || '').trim();
  const r = REGION.find(([k]) => a.startsWith(k));
  if (r) return r[1];
  const c = Object.keys(CITY).find(k => a.startsWith(k));
  return c ? CITY[c] : '기타';
};
const THEMES = [
  ['꽃·자연', /꽃|국화|벚꽃|장미|튤립|억새|단풍|코스모스|수국|유채|핑크뮬리|정원|숲/],
  ['먹거리', /먹거리|음식|맛|한우|김치|김장|과메기|대게|전어|굴|떡|막걸리|와인|맥주|커피|빵|사과|감귤|딸기|인삼|홍삼|고추|쌀|한과|곶감|축산|수산/],
  ['빛·불꽃', /빛|불꽃|등|조명|야간|별|루미나|일루미/],
  ['전통·역사', /전통|문화제|민속|역사|궁|향교|농악|탈|씨름|장터|한복|선비|제례/],
  ['공연·음악', /음악|재즈|락|록|뮤직|페스티벌|공연|콘서트|버스킹|댄스|영화/],
  ['겨울', /겨울|눈|얼음|빙어|송어|산타|크리스마스|해맞이|해넘이|일출/],
];
// 보드게임처럼 권역마다 색 그룹
const GROUP = { 서울:'red', 경기:'red', 인천:'red', 강원:'teal', 충북:'yellow', 충남:'yellow', 대전:'yellow', 세종:'yellow',
  전북:'green', 전남:'green', 광주:'green', 경북:'blue', 대구:'blue', 경남:'purple', 부산:'purple', 울산:'purple', 제주:'pink', 기타:'gray' };
const COLOR = { red:'#ff4d4d', teal:'#22c3b5', yellow:'#ffd23f', green:'#3dbe5b', blue:'#3a86ff', purple:'#8a4fff', pink:'#ff5da2', gray:'#9a97ad' };
const rc = r => COLOR[GROUP[r] || 'gray'];
const rt = r => GROUP[r] === 'yellow' ? '#1f1d3d' : '#fff';
const rcVars = r => `--rc:${rc(r)};--rt:${rt(r)}`;
const PIPS = { 1:[5], 2:[1,9], 3:[1,5,9], 4:[1,3,7,9], 5:[1,3,5,7,9], 6:[1,3,4,6,7,9] };
const dieHTML = n => `<span class="pipdie" style="width:100%;height:100%">${Array.from({ length: 9 }, (_, i) =>
  PIPS[n].includes(i + 1) ? `<i class="${n === 1 ? 'r' : ''}"></i>` : '<span></span>').join('')}</span>`;
const cityName = f => { const w = (f.addr || '').split(/\s+/)[1] || ''; return /[시군구]$/.test(w) ? w : ''; };
const themesOf = f => THEMES.filter(([, re]) => re.test(f.title + ' ' + (f.overview || ''))).map(([n]) => n);

// 이미지가 없을 때 쓰는 색 블록
const PAL = [['#ff7a59','#ffb36b'],['#5b8def','#8fb8ff'],['#20b486','#7fd8a8'],['#a66cff','#d2a8ff'],['#f25f8a','#ffa3bf'],['#f0a400','#ffd36b']];
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
function imgStyle(f, big) {
  const src = big ? f.image || f.thumb : f.thumb || f.image;
  if (src) return { cls: 'img', style: `background-image:url('${esc(src.replace(/^http:/, 'https:'))}')`, text: '' };
  const [a, b] = PAL[hash(f.title) % PAL.length];
  return { cls: 'img ph', style: `background-image:linear-gradient(135deg,${a},${b})`, text: esc(f.title.replace(/^샘플\s*/, '').slice(0, 10)) };
}

// ── 상태 ──
let ALL = [], map, cluster, markers = new Map();
const state = { q: '', region: '', period: 'week', theme: '' };

function periodOK(f, p) {
  if (p === 'now') return overlaps(f, TODAY, TODAY);
  if (p === 'week') return overlaps(f, TODAY, WEEK_END);
  if (p === 'nextweek') return overlaps(f, NEXT_WEEK[0], NEXT_WEEK[1]);
  if (p === 'month') return overlaps(f, TODAY, MONTH_END);
  if (p === 'nextmonth') return overlaps(f, NEXT_MONTH[0], NEXT_MONTH[1]);
  return true;
}
function filtered() {
  const q = state.q.trim().toLowerCase();
  return ALL.filter(f => {
    if (state.region && f._region !== state.region) return false;
    if (state.theme && !f._themes.includes(state.theme)) return false;
    if (!periodOK(f, state.period)) return false;
    if (q && !(f.title + ' ' + f.addr + ' ' + (f.overview || '')).toLowerCase().includes(q)) return false;
    return true;
  });
}

// ── 상단: 이번 주 주요 축제 ──
function renderHero() {
  const score = f => (f.image ? 4 : 0) + (f.overview ? 2 : 0) - (diffDays(f.start, f.end) > 30 ? 3 : 0) - (isLong(f) ? 5 : 0)
    + (/축제|페스티벌|대전|박람회|야행/.test(f.title) ? 1.5 : 0)
    - diffDays(TODAY, f.start > TODAY ? f.start : TODAY) * 0.1;
  // 진행 중 주요 축제(최대 5) + 이번 주 시작 예정(나머지) → 진행 중(끝나는 순) → D-1 → D-2 … 순서
  const pool = ALL.filter(f => overlaps(f, TODAY, WEEK_END) && !isLong(f)).sort((a, b) => score(b) - score(a));
  const live = pool.filter(f => f.start <= TODAY).slice(0, 5);
  const next = pool.filter(f => f.start > TODAY).slice(0, 10 - live.length);
  const picks = [...live.sort((a, b) => a.end.localeCompare(b.end)), ...next.sort((a, b) => a.start.localeCompare(b.start))];
  $('#weekRange').textContent = `THIS WEEK · ${md(TODAY)} – ${md(WEEK_END)}`;
  $('#heroTrack').innerHTML = picks.map(f => {
    const st = status(f), im = imgStyle(f, true);
    return `<button class="hcard" data-id="${esc(f.id)}" style="${rcVars(f._region)}">
      <div class="deed"><span class="rg">${esc(f._region)} ${esc(cityName(f))}</span><span class="badge ${st.cls}">${st.label}</span></div>
      <div class="${im.cls}" style="${im.style}">${im.text}${f.sample ? '<span class="sample">샘플</span>' : /^AI/.test(f.imageSource || '') ? '<span class="sample">AI 이미지</span>' : ''}</div>
      <div class="body"><h3>${esc(f.title)}</h3><div class="when">${span(f)}</div>
        ${f.overview ? `<p>${esc(f.overview)}</p>` : ''}</div></button>`;
  }).join('') || '<p class="empty" style="padding:20px">이번 주 등록된 축제가 없어요.</p>';
  // 상단 통계
  const wk = ALL.filter(f => overlaps(f, TODAY, WEEK_END));
  const liveN = wk.filter(f => f.start <= TODAY).length, soonN = wk.length - liveN;
  $('#heroSub').textContent = `이번 주 전국 ${wk.length}개 축제가 열려요. 어디부터 가볼까요?`;
  $('#stats').innerHTML = `<span class="stat"><i class="dot"></i>진행 중 <b>${liveN}</b></span><span class="stat soon"><i class="dot"></i>이번 주 시작 <b>${soonN}</b></span>`;
}

// ── 목록 ──
function renderList(items) {
  $('#count').innerHTML = `<b>${items.length}</b>개 축제`;
  $('#list').innerHTML = items.length ? items.map(f => {
    const st = status(f), im = imgStyle(f);
    return `<li class="item" data-id="${esc(f.id)}" style="${rcVars(f._region)}">
      <div class="${im.cls}" style="${im.style}">${im.text}${/^AI/.test(f.imageSource || '') ? '<span class="ai">AI</span>' : ''}</div>
      <div class="txt"><h3>${esc(f.title)}</h3>
        <div class="when"><span class="badge ${st.cls}">${st.label}</span>${span(f)}</div>
        <div class="where">${esc(f._region)} ${esc(cityName(f))}${f.place ? ' · ' + esc(f.place) : ''}</div></div></li>`;
  }).join('') : '<li class="empty">조건에 맞는 축제가 없어요.<br>기간이나 지역을 넓혀 보세요.</li>';
}

// ── 지도 ──
// 배경: OpenFreeMap 'Positron'(키 불필요, 단순한 회색톤 벡터 지도, 한글 지명)
//       실패하면 OpenStreetMap 기본 지도로 자동 전환
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
function setBaseMap() {
  let done = false;
  const osm = () => {
    if (done) return; done = true;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'osm-tiles', attribution: OSM_ATTR }).addTo(map);
  };
  if (!window.maplibregl || !L.maplibreGL) return osm();
  try {
    const layer = L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/positron',
      attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ' + OSM_ATTR }).addTo(map);
    const gl = layer.getMaplibreMap();
    const timer = setTimeout(() => { if (!gl.isStyleLoaded()) { map.removeLayer(layer); osm(); } }, 8000);
    gl.on('load', () => {
      done = true; clearTimeout(timer);
      for (const ly of gl.getStyle().layers) {        // 지명은 한글 우선
        if (ly.type === 'symbol' && gl.getLayoutProperty(ly.id, 'text-field'))
          gl.setLayoutProperty(ly.id, 'text-field', ['coalesce', ['get', 'name:ko'], ['get', 'name'], ['get', 'name_int']]);
      }
    });
    gl.on('error', e => { if (!done && /style|Failed to fetch|40\d|50\d/i.test(String(e?.error?.message || e?.error?.status || ''))) { clearTimeout(timer); map.removeLayer(layer); osm(); } });
  } catch (e) { osm(); }
}

let current = [];
const mapVisible = () => { const el = $('#map'); return el && el.offsetWidth > 0 && el.offsetHeight > 0; };
function ensureMap() {
  if (map || !mapVisible()) return !!map;
  if (!window.L) { $('#map').innerHTML = '<div class="nomap"><b>지도를 불러오지 못했어요</b>새로고침하거나 잠시 후 다시 열어 주세요.</div>'; return false; }
  map = L.map('map', { zoomControl: false, minZoom: 6, maxZoom: 18, maxBounds: [[32, 123], [39.8, 133]] }).setView([37.52, 127.0], 10);   // 첫 화면: 수도권
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  setBaseMap();
  cluster = L.markerClusterGroup ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, spiderfyDistanceMultiplier: 1.6,
    iconCreateFunction: c => { const n = c.getChildCount();
      return L.divIcon({ className: '', html: `<div class="cl ${n >= 20 ? 'big' : ''}">${n}</div>`, iconSize: [50, 50] }); } }) : L.layerGroup();
  map.addLayer(cluster);
  return true;
}
function renderMap(items, fit = false) {
  current = items;
  const n = items.filter(f => f.lat && f.lng).length;
  $('#mapCount').textContent = `${n}곳 표시 중`;
  if (!ensureMap()) return;
  cluster.clearLayers(); markers.clear();
  const pts = [];
  for (const f of items) {
    if (!f.lat || !f.lng) continue;
    const st = status(f), src = (f.thumb || f.image || '').replace(/^http:/, 'https:');
    const m = L.marker([f.lat, f.lng], { icon: L.divIcon({ className: '',
      html: `<div class="ppin ${st.cls === 'live' ? 'live' : ''}" style="${rcVars(f._region)}"><i style="${src ? `background-image:url('${esc(src)}')` : ''}"></i></div>`,
      iconSize: [44, 44], iconAnchor: [22, 50], popupAnchor: [0, -48] }) });
    m.bindPopup(`<div class="pop" style="${rcVars(f._region)}"><div class="pdeed">${esc(f._region)} ${esc(cityName(f))}</div>${src ? `<div class="pimg" style="background-image:url('${esc(src)}')"></div>` : ''}<div class="pb"><b>${esc(f.title)}</b><span>${st.label} · ${span(f)}</span><button data-id="${esc(f.id)}">자세히 보기</button></div></div>`);
    cluster.addLayer(m); markers.set(f.id, m); pts.push([f.lat, f.lng]);
  }
  if (fit && pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: 12 });
}

// ── 상세 ──
function openDetail(id) {
  const f = ALL.find(x => x.id === id); if (!f) return;
  const st = status(f), im = imgStyle(f, true);
  // 지도 검색어: 축제명이 아니라 장소. 장소명이 깔끔하면 '시군 + 장소', 아니면 주소
  const placeClean = (f.place || '').split(/[,·/+()]|\s및\s|일원|일대/)[0].trim();
  const where = placeClean && placeClean.length <= 20 && !/미정|전역|온라인/.test(placeClean)
    ? `${cityName(f) || f._region} ${placeClean}`.trim() : (f.addr || placeClean || f.title);
  const wq = encodeURIComponent(where);
  const label = encodeURIComponent(placeClean || f.title);
  const rows = [['기간', `${span(f)} (${f.start.slice(0, 4)})`], ['장소', f.place || f.addr], ['주소', f.place ? f.addr : ''],
    ['시간', f.playtime], ['요금', f.fee], ['주최', f.host], ['문의', f.tel]].filter(r => r[1]);
  const d = $('#detail');
  d.setAttribute('style', rcVars(f._region));
  d.innerHTML = `<div class="d-deed"><span class="rg">${esc(f._region)} ${esc(cityName(f))}</span><button class="d-close" aria-label="닫기">✕</button></div>
    <div class="${im.cls} d-img" style="${im.style}">${im.text}</div>
    <div class="d-body"><div class="top"><span class="badge ${st.cls}">${st.label}</span><span class="when">${span(f)}</span></div>
      <h2>${esc(f.title)}</h2>
      ${f.overview ? `<p class="ov">${esc(f.overview)}</p>` : ''}
      ${f.image && f.imageSource ? `<p class="credit">사진: ${f.imageLink ? `<a href="${esc(f.imageLink)}" target="_blank" rel="noopener">${esc(f.imageSource)}</a>` : esc(f.imageSource)}${f.imageLicense ? ` (${esc(f.imageLicense)})` : ''}${/^AI/.test(f.imageSource) ? ' — 실제 축제 사진이 아니에요' : /장소|지역|관련/.test(f.imageSource) ? ' — 축제 현장 사진이 아닐 수 있어요' : ''}</p>` : ''}
      <dl class="d-info">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="d-btns">
        ${f.homepage ? `<a class="primary" href="${esc(f.homepage)}" target="_blank" rel="noopener">공식 홈페이지 →</a>` : ''}
        <a href="https://map.kakao.com/link/${f.lat ? `to/${label},${f.lat},${f.lng}` : `search/${wq}`}" target="_blank" rel="noopener">카카오맵 길찾기</a>
        <a href="https://map.naver.com/p/search/${wq}" target="_blank" rel="noopener">네이버 지도</a>
      </div></div>`;
  d.showModal();
  d.scrollTop = 0;
  d.querySelector('.d-close').onclick = () => d.close();
}
$('#detail').addEventListener('click', e => { if (e.target.id === 'detail') e.target.close(); });
document.addEventListener('click', e => {
  const el = e.target.closest('[data-id]');
  if (el && !el.closest('dialog')) openDetail(el.dataset.id);
});

// ── 이벤트 ──
function sorted(items) {
  const key = f => (isLong(f) ? '1' : '0') + (f.start < TODAY ? TODAY : f.start) + f.end;
  return items.sort((a, b) => key(a).localeCompare(key(b)));
}
// 지도 이동: 지역을 고르면 그 지역으로, 검색 결과가 적으면 결과로. 기간·테마만 바꿀 땐 보던 위치 유지
function update(move = false) { const items = sorted(filtered()); renderList(items); renderMap(items, move); renderTiles(); }

// 보드 칸: 지역별 축제 수(현재 기간·테마·검색 기준)
function renderTiles() {
  const base = { ...state, region: '' };
  const q = base.q.trim().toLowerCase();
  const cnt = {};
  for (const f of ALL) {
    if (base.theme && !f._themes.includes(base.theme)) continue;
    if (!periodOK(f, base.period)) continue;
    if (q && !(f.title + ' ' + f.addr + ' ' + (f.overview || '')).toLowerCase().includes(q)) continue;
    cnt[f._region] = (cnt[f._region] || 0) + 1;
  }
  const total = Object.values(cnt).reduce((a, b) => a + b, 0);
  const order = ['서울','경기','인천','강원','충북','충남','대전','세종','전북','전남','광주','경북','대구','경남','부산','울산','제주'];
  $('#tiles').innerHTML = `<button class="tile start ${state.region ? '' : 'on'}" data-region=""><span class="band"></span><span class="nm">전국</span><span class="ct">${total}곳</span></button>`
    + order.map(r => `<button class="tile ${state.region === r ? 'on' : ''} ${cnt[r] ? '' : 'zero'}" data-region="${r}" style="${rcVars(r)}"><span class="band"></span><span class="nm">${r}</span><span class="ct">${cnt[r] || 0}곳</span></button>`).join('');
}
function setRegion(r) {
  state.region = r; $('#region').value = r;
  if (r) update(true); else { update(false); if (map) map.setView([37.52, 127.0], 10); }
}
$('#tiles').addEventListener('click', e => {
  const t = e.target.closest('.tile'); if (!t) return;
  setRegion(t.dataset.region);
  $('.mapsec').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// 주사위: 이번 주 축제 중 하나를 무작위로 뽑기
let rollFace = 5;
function drawDie(n) { $('#die').innerHTML = dieHTML(n); }
$('#roll').addEventListener('click', () => {
  const pool = sorted(filtered()).filter(f => !isLong(f));
  const cand = pool.length ? pool : ALL.filter(f => overlaps(f, TODAY, WEEK_END) && !isLong(f));
  if (!cand.length) return;
  const die = $('#die'); die.classList.remove('rolling'); void die.offsetWidth; die.classList.add('rolling');
  let k = 0; const spin = setInterval(() => drawDie(1 + (k++ % 6)), 90);
  setTimeout(() => {
    clearInterval(spin);
    rollFace = 1 + Math.floor(Math.random() * 6); drawDie(rollFace);
    const f = cand[Math.floor(Math.random() * cand.length)];
    toast(`🎲 ${rollFace}! ${f._region} · ${f.title.length > 14 ? f.title.slice(0, 14) + '…' : f.title}`);
    setTimeout(() => openDetail(f.id), 650);
  }, 900);
});
let tt; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2200); }
let t; $('#q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; const n = filtered().length; update(!!state.q && n > 0 && n <= 40); }, 250); });
$('#region').addEventListener('change', e => setRegion(e.target.value));
$('#period').addEventListener('change', e => { state.period = e.target.value; update(); });
addEventListener('resize', () => { if (map) map.invalidateSize(); });

// ── 시작 ──
fetch('data/festivals.json', { cache: 'no-cache' }).then(r => r.json()).then(data => {
  ALL = (data.festivals || []).filter(f => f.end >= TODAY).map(f => ({ ...f, _region: regionOf(f), _themes: themesOf(f) }));
  const u = new Date(data.updated);
  $('#updated').textContent = `${u.getMonth() + 1}.${u.getDate()} 업데이트`;
  if (data.source) $('#source').textContent = data.source;
  const regions = [...new Set(ALL.map(f => f._region))].sort((a, b) => REGION.findIndex(r => r[1] === a) - REGION.findIndex(r => r[1] === b));
  $('#region').insertAdjacentHTML('beforeend', regions.map(r => `<option>${r}</option>`).join(''));
  $('#themes').innerHTML = ['전체', ...THEMES.map(t => t[0])].map((n, i) => `<button class="chip ${i ? '' : 'on'}" data-theme="${i ? n : ''}">${n}</button>`).join('');
  $('#themes').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    document.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
    state.theme = c.dataset.theme; update();
  });
  drawDie(5); renderHero(); update();
}).catch(e => { console.error(e); $('#list').innerHTML = '<li class="empty">축제 데이터를 불러오지 못했어요.</li>'; });
})();
