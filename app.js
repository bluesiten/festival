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

function status(f) {
  if (f.start <= TODAY && f.end >= TODAY) {
    const left = diffDays(TODAY, f.end);
    return { cls: 'live', label: left === 0 ? '오늘 마감' : '진행 중' };
  }
  const d = diffDays(TODAY, f.start);
  return d <= 7 ? { cls: 'soon', label: `D-${d}` } : { cls: 'later', label: `D-${d}` };
}

// ── 지역·테마 ──
const REGION = [['서울','서울'],['부산','부산'],['대구','대구'],['인천','인천'],['광주','광주'],['대전','대전'],['울산','울산'],['세종','세종'],
  ['경기','경기'],['강원','강원'],['충청북','충북'],['충북','충북'],['충청남','충남'],['충남','충남'],['전라북','전북'],['전북','전북'],
  ['전라남','전남'],['전남','전남'],['경상북','경북'],['경북','경북'],['경상남','경남'],['경남','경남'],['제주','제주']];
const regionOf = f => (REGION.find(([k]) => (f.region || f.addr || '').startsWith(k)) || [, '기타'])[1];
const THEMES = [
  ['꽃·자연', /꽃|국화|벚꽃|장미|튤립|억새|단풍|코스모스|수국|유채|핑크뮬리|정원|숲/],
  ['먹거리', /먹거리|음식|맛|한우|김치|김장|과메기|대게|전어|굴|떡|막걸리|와인|맥주|커피|빵|사과|감귤|딸기|인삼|홍삼|고추|쌀|한과|곶감|축산|수산/],
  ['빛·불꽃', /빛|불꽃|등|조명|야간|별|루미나|일루미/],
  ['전통·역사', /전통|문화제|민속|역사|궁|향교|농악|탈|씨름|장터|한복|선비|제례/],
  ['공연·음악', /음악|재즈|락|록|뮤직|페스티벌|공연|콘서트|버스킹|댄스|영화/],
  ['겨울', /겨울|눈|얼음|빙어|송어|산타|크리스마스|해맞이|해넘이|일출/],
];
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
  const score = f => (f.image ? 4 : 0) + (f.overview ? 2 : 0) - (diffDays(f.start, f.end) > 30 ? 3 : 0)
    + (f.start >= TODAY ? 1 : 0) - diffDays(TODAY, f.start > TODAY ? f.start : TODAY) * 0.1;
  const picks = ALL.filter(f => overlaps(f, TODAY, WEEK_END)).sort((a, b) => score(b) - score(a)).slice(0, 8);
  $('#weekRange').textContent = `${md(TODAY)} ~ ${md(WEEK_END)}`;
  $('#heroTrack').innerHTML = picks.map(f => {
    const st = status(f), im = imgStyle(f, true);
    return `<button class="hcard" data-id="${esc(f.id)}">
      <div class="${im.cls}" style="${im.style}">${im.text}<span class="badge ${st.cls}">${st.label}</span>${f.sample ? '<span class="sample">샘플</span>' : ''}</div>
      <div class="body"><h3>${esc(f.title)}</h3>
        <div class="meta">${span(f)} · ${esc(f._region)} ${esc((f.addr.split(' ')[1] || ''))}</div>
        ${f.overview ? `<p>${esc(f.overview)}</p>` : ''}</div></button>`;
  }).join('') || '<p class="empty" style="padding:20px">이번 주 등록된 축제가 없어요.</p>';
}

// ── 목록 ──
function renderList(items) {
  $('#count').innerHTML = `<b>${items.length}</b>개 축제`;
  $('#list').innerHTML = items.length ? items.map(f => {
    const st = status(f), im = imgStyle(f);
    return `<li class="item" data-id="${esc(f.id)}">
      <div class="${im.cls}" style="${im.style}">${im.text}</div>
      <div><h3>${esc(f.title)}</h3>
        <div class="meta"><span class="tag ${st.cls}">${st.label}</span>${span(f)}<br>${esc(f.addr)}</div></div></li>`;
  }).join('') : '<li class="empty">조건에 맞는 축제가 없어요.<br>기간이나 지역을 넓혀 보세요.</li>';
}

// ── 지도 (CARTO Positron: 군더더기 없는 밝은 지도) ──
function initMap() {
  if (!window.L) { $('#map').innerHTML = '<div class="nomap">지도를 불러오지 못했어요.</div>'; return; }
  map = L.map('map', { zoomControl: false, minZoom: 6, maxBounds: [[32.5, 123.5], [39.5, 132.5]] }).setView([36.3, 127.8], 7);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>' }).addTo(map);
  cluster = L.markerClusterGroup ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 }) : L.layerGroup();
  map.addLayer(cluster);
}
function renderMap(items) {
  if (!map) return;
  cluster.clearLayers(); markers.clear();
  const pts = [];
  for (const f of items) {
    if (!f.lat || !f.lng) continue;
    const st = status(f);
    const m = L.marker([f.lat, f.lng], { icon: L.divIcon({ className: '', html: `<div class="pin ${st.cls === 'live' ? 'live' : ''}"></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] }) });
    m.bindPopup(`<div class="pop"><b>${esc(f.title)}</b><span>${span(f)} · ${esc(f._region)}</span><br><button data-id="${esc(f.id)}">자세히 보기</button></div>`);
    cluster.addLayer(m); markers.set(f.id, m); pts.push([f.lat, f.lng]);
  }
  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 11 });
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
function update() { const items = filtered(); renderList(items); renderMap(items); }
let t; $('#q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; update(); }, 150); });
$('#region').addEventListener('change', e => { state.region = e.target.value; update(); });
$('#period').addEventListener('change', e => { state.period = e.target.value; update(); });
document.querySelectorAll('.toggle button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.toggle button').forEach(x => x.classList.toggle('on', x === b));
  $('main').dataset.view = b.dataset.view;
  if (map) setTimeout(() => map.invalidateSize(), 50);
}));

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
  renderHero(); initMap(); update();
}).catch(() => { $('#list').innerHTML = '<li class="empty">축제 데이터를 불러오지 못했어요.</li>'; });
})();
