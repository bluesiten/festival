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
const MONTH_END = ymd(kstDate(30));
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

function filtered() {
  const q = state.q.trim().toLowerCase();
  return ALL.filter(f => {
    if (state.region && f._region !== state.region) return false;
    if (state.theme && !f._themes.includes(state.theme)) return false;
    if (state.period === 'now' && !overlaps(f, TODAY, TODAY)) return false;
    if (state.period === 'week' && !overlaps(f, TODAY, WEEK_END)) return false;
    if (state.period === 'weekend' && !overlaps(f, WKND[0], WKND[1])) return false;
    if (state.period === 'month' && !overlaps(f, TODAY, MONTH_END)) return false;
    if (q && !(f.title + ' ' + f.addr + ' ' + (f.overview || '')).toLowerCase().includes(q)) return false;
    return true;
  });
}

// ── 상단: 이번 주 주요 축제 ──
function renderHero() {
  const score = f => (f.image ? 4 : 0) + (f.overview ? 2 : 0) - (diffDays(f.start, f.end) > 30 ? 3 : 0) - (isLong(f) ? 5 : 0)
    + (/축제|페스티벌|대전|박람회|야행/.test(f.title) ? 1.5 : 0)
    + (f.start >= TODAY ? 1 : 0) - diffDays(TODAY, f.start > TODAY ? f.start : TODAY) * 0.1;
  const picks = ALL.filter(f => overlaps(f, TODAY, WEEK_END)).sort((a, b) => score(b) - score(a)).slice(0, 8);
  $('#weekRange').textContent = `THIS WEEK · ${md(TODAY)} – ${md(WEEK_END)}`;
  $('#heroTrack').innerHTML = picks.map(f => {
    const st = status(f), im = imgStyle(f, true);
    return `<button class="hcard" data-id="${esc(f.id)}">
      <div class="${im.cls}" style="${im.style}"></div>
      <span class="badge ${st.cls}">${st.label}</span>${f.sample ? '<span class="sample">샘플</span>' : /^AI/.test(f.imageSource || '') ? '<span class="sample">AI 이미지</span>' : ''}
      <div class="over"><h3>${esc(f.title)}</h3>
        <div class="meta"><span>${span(f)}</span><span>·</span><span>${esc(f._region)} ${esc(cityName(f))}</span></div>
        ${f.overview ? `<p>${esc(f.overview)}</p>` : ''}</div></button>`;
  }).join('') || '<p class="empty" style="padding:20px">이번 주 등록된 축제가 없어요.</p>';
}

// ── 목록 ──
function renderList(items) {
  $('#count').innerHTML = `<b>${items.length}</b>개 축제`;
  $('#list').innerHTML = items.length ? items.map(f => {
    const st = status(f), im = imgStyle(f);
    return `<li class="item" data-id="${esc(f.id)}">
      <div class="${im.cls}" style="${im.style}">${im.text}${/^AI/.test(f.imageSource || '') ? '<span class="ai">AI</span>' : ''}</div>
      <div class="txt"><h3>${esc(f.title)}</h3>
        <div class="when"><span class="tag ${st.cls}">${st.label}</span>${span(f)}</div>
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
    iconCreateFunction: c => L.divIcon({ className: '', html: `<div class="cl">${c.getChildCount()}</div>`, iconSize: [46, 46] }) }) : L.layerGroup();
  map.addLayer(cluster);
  return true;
}
function renderMap(items, fit = true) {
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
      html: `<div class="ppin ${st.cls === 'live' ? 'live' : ''}"><i style="${src ? `background-image:url('${esc(src)}')` : ''}"></i></div>`,
      iconSize: [44, 44], iconAnchor: [22, 50], popupAnchor: [0, -48] }) });
    m.bindPopup(`<div class="pop">${src ? `<div class="pimg" style="background-image:url('${esc(src)}')"></div>` : ''}<div class="pb"><b>${esc(f.title)}</b><span>${st.label} · ${span(f)} · ${esc(f._region)}</span><button data-id="${esc(f.id)}">자세히 보기</button></div></div>`);
    cluster.addLayer(m); markers.set(f.id, m); pts.push([f.lat, f.lng]);
  }
  if (!renderMap.done) { renderMap.done = true; return; }   // 첫 화면은 수도권 그대로
  if (fit && pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: 12 });
}

// ── 상세 ──
function openDetail(id) {
  const f = ALL.find(x => x.id === id); if (!f) return;
  const st = status(f), im = imgStyle(f, true);
  const q = encodeURIComponent(f.title);
  const rows = [['기간', `${span(f)} (${f.start.slice(0, 4)})`], ['장소', f.place || f.addr], ['주소', f.place ? f.addr : ''],
    ['시간', f.playtime], ['요금', f.fee], ['주최', f.host], ['문의', f.tel]].filter(r => r[1]);
  const d = $('#detail');
  d.innerHTML = `<div class="${im.cls} d-img" style="${im.style}">${im.text}<span class="badge ${st.cls}">${st.label}</span><button class="d-close" aria-label="닫기">×</button></div>
    <div class="d-body"><h2>${esc(f.title)}</h2><div class="when">${span(f)} · ${esc(f._region)}</div>
      ${f.overview ? `<p class="ov">${esc(f.overview)}</p>` : ''}
      ${f.image && f.imageSource ? `<p class="credit">사진: ${f.imageLink ? `<a href="${esc(f.imageLink)}" target="_blank" rel="noopener">${esc(f.imageSource)}</a>` : esc(f.imageSource)}${f.imageLicense ? ` (${esc(f.imageLicense)})` : ''}${/^AI/.test(f.imageSource) ? ' — 실제 축제 사진이 아니에요' : /장소|지역|관련/.test(f.imageSource) ? ' — 축제 현장 사진이 아닐 수 있어요' : ''}</p>` : ''}
      <dl class="d-info">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="d-btns">
        ${f.homepage ? `<a class="primary" href="${esc(f.homepage)}" target="_blank" rel="noopener">공식 홈페이지</a>` : ''}
        <a href="https://map.kakao.com/link/${f.lat ? `to/${q},${f.lat},${f.lng}` : `search/${q}`}" target="_blank" rel="noopener">카카오맵 길찾기</a>
        <a href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener">네이버 지도</a>
      </div></div>`;
  d.showModal();
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
function update() { const items = sorted(filtered()); renderList(items); renderMap(items); }
let t; $('#q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; update(); }, 150); });
$('#region').addEventListener('change', e => { state.region = e.target.value; update(); });
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
  renderHero(); update();
}).catch(e => { console.error(e); $('#list').innerHTML = '<li class="empty">축제 데이터를 불러오지 못했어요.</li>'; });
})();
