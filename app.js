const $ = selector => document.querySelector(selector);
const sheet = $('#sheet');
const start = { lat: 37.5663, lng: 126.9779 };
const groups = {
  entry: ['출입 상태', { open: '출입 가능', locked: '출입 불가·잠김', unknown: '정보 없음' }],
  code: ['비밀번호', { no: '불필요', yes: '필요', unknown: '정보 없음' }],
  type: ['시설 유형', { flush: '수세식', squat: '푸세식', unknown: '정보 없음' }],
  public: ['외부인 이용', { yes: '가능', no: '불가', unknown: '정보 없음' }]
};
let places = [];
let center = start;
let area = '서울시청 주변';
let radius = 1000;
let query = '';
let openOnly = false;
let selected;
let shown = [];
let loadError = false;
let dialogTrigger;
let map;
let markers;
let mapHint;
let gps;
let selecting = false;
let ignoreMove = false;
let localPlaces = readLocalPlaces();

function readLocalPlaces() {
  try {
    const saved = JSON.parse(localStorage.getItem('ilbolttae.locations') || '[]');
    return Array.isArray(saved) ? saved.filter(place => place && Number.isFinite(place.lat) && Number.isFinite(place.lng)) : [];
  } catch {
    return [];
  }
}
function saveLocalPlaces(next) {
  localStorage.setItem('ilbolttae.locations', JSON.stringify(next));
  localPlaces = next;
}
function recenter(point, zoom) {
  if (!map) return;
  ignoreMove = true;
  map.setView([point.lat, point.lng], zoom, { animate: false });
  ignoreMove = false;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
function effective(place, key) {
  return place.conflicts?.includes(key) ? 'unknown' : place[key];
}
function label(place, key) {
  return groups[key][1][effective(place, key)];
}
function tone(place) {
  return { open: 'available', locked: 'locked', unknown: 'unknown' }[effective(place, 'entry')];
}
function distance(place) {
  const radians = degrees => degrees * Math.PI / 180;
  const a = Math.sin(radians(place.lat - center.lat) / 2) ** 2 +
    Math.cos(radians(center.lat)) * Math.cos(radians(place.lat)) *
    Math.sin(radians(place.lng - center.lng) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, a)));
}
function meters(place) {
  const value = distance(place);
  return value >= 1000 ? (value / 1000).toFixed(1) + 'km' : Math.round(value) + 'm';
}
function verified(place) {
  return place.verifiedAt ? new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(place.verifiedAt)) + ' 확인' : '현장 확인 이력 없음';
}
function showMessage(message) {
  $('#message').textContent = message;
  $('#message').hidden = !message;
}
function drawMap() {
  if (!markers) return;
  markers.clearLayers();
  if (gps) {
    L.circle([gps.lat, gps.lng], { radius: gps.accuracy, color: '#2563eb', fillOpacity: 0.1,
      weight: 1, interactive: false }).addTo(markers);
    L.circleMarker([gps.lat, gps.lng], { radius: 7, fillColor: '#2563eb', fillOpacity: 1,
      color: '#fff', weight: 2, interactive: false }).addTo(markers);
  }
  for (const place of shown) {
    const pin = L.divIcon({
      className: '', html: '<span class="pin ' + tone(place) + '" aria-hidden="true">WC</span>',
      iconSize: [44, 44], iconAnchor: [22, 22]
    });
    L.marker([place.lat, place.lng], { icon: pin, title: place.name, alt: place.name })
      .addTo(markers).on('click', event => {
        if (selecting) return chooseLocation(event.latlng);
        detail(place);
      });
  }
}

function initMap() {
  if (!window.L) {
    $('#add-place').disabled = true;
    $('#real-map').textContent = '지도 라이브러리를 불러오지 못했습니다. 목록으로 검색할 수 있습니다.';
    return;
  }
  map = L.map('real-map').setView([center.lat, center.lng], 14);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  let loadedTile = false;
  tiles.on('tileload', () => {
    if (loadedTile) return;
    loadedTile = true;
    tiles.off('tileerror', tileError);
  });
  function tileError() {
    if (!loadedTile) showMessage('지도 배경 연결이 지연되고 있습니다. 위치 목록은 계속 이용할 수 있습니다.');
  }
  tiles.on('tileerror', tileError);
  markers = L.layerGroup().addTo(map);
  mapHint = document.createElement('div');
  mapHint.className = 'map-hint';
  mapHint.hidden = true;
  mapHint.innerHTML = '<p>지도에서 화장실 위치를 선택하세요.</p><button type="button">지도 중심 선택</button>';
  mapHint.querySelector('button').onclick = () => chooseLocation(map.getCenter());
  $('#real-map').parentElement.append(mapHint);
  map.on('click', event => { if (selecting) chooseLocation(event.latlng); });
  map.on('moveend', () => {
    if (ignoreMove || selecting) return;
    query = '';
    const next = map.getCenter();
    center = { lat: next.lat, lng: next.lng };
    radius = Math.max(500, map.distance(next, map.getBounds().getNorthEast()));
    area = '지도 중심 주변';
    showMessage('');
    render();
  });
}

function setSelecting(active) {
  selecting = active;
  mapHint.hidden = !active;
  $('#add-place').textContent = active ? '위치 추가 취소' : '＋ 위치 추가';
  $('#real-map').style.cursor = active ? 'crosshair' : '';
}

function chooseLocation(point) {
  setSelecting(false);
  openSheet('화장실 위치 추가', '<p>선택한 위치 ' +
    point.lat.toFixed(5) + ', ' + point.lng.toFixed(5) +
    '</p><form id="location-form"><label for="location-name">화장실 이름</label>' +
    '<input id="location-name" class="form-input" maxlength="80" required>' +
    '<label for="location-address">주소 또는 찾아가는 설명 (선택)</label>' +
    '<input id="location-address" class="form-input" maxlength="160">' +
    '<p id="form-error" role="alert"></p><div class="actions"><button id="pick-again" type="button">위치 다시 선택</button>' +
    '<button id="save-location" class="primary">위치 저장</button></div></form>');
  $('#pick-again').onclick = () => { sheet.close(); setSelecting(true); };
  $('#location-form').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('#save-location');
    const error = $('#form-error');
    const name = $('#location-name').value.trim();
    const address = $('#location-address').value.trim();
    if (!name || point.lat < 32.9 || point.lat > 38.7 || point.lng < 124.5 || point.lng > 132) {
      error.textContent = '이름과 국내 지도 좌표를 확인해주세요.';
      return;
    }
    button.disabled = true;
    error.textContent = '';
    try {
      const response = await fetch('/api/locations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address, lat: point.lat, lng: point.lng })
      });
      const result = await response.json();
      let place = result;
      if (!response.ok) {
        if (!result.localOnly) throw new Error(result.message);
        place = { id: 'local-' + crypto.randomUUID(), name, address, area: address,
          lat: point.lat, lng: point.lng, entry: 'unknown', code: 'unknown',
          type: 'unknown', public: 'unknown', source: 'local' };
        saveLocalPlaces([...localPlaces, place]);
      }
      places.push(place);
      center = place;
      query = '';
      openOnly = false;
      $('#available').setAttribute('aria-pressed', false);
      area = '추가한 위치 주변';
      radius = 1000;
      recenter(place, 16);
      showMessage(place.source === 'local' ? '이 브라우저에 위치를 저장했습니다.' : '공유 지도에 위치를 저장했습니다.');
      render();
      if (sheet.open && form.isConnected) detail(place);
    } catch (cause) {
      error.textContent = cause instanceof TypeError ? '연결을 확인하고 다시 시도해주세요.' : (cause.message || '위치를 저장하지 못했습니다.');
      button.disabled = false;
    }
  };
}

function render() {
  shown = places.filter(place => (query ? matches(place, query) : distance(place) <= radius) &&
    (!openOnly || effective(place, 'entry') === 'open')).sort((a, b) => distance(a) - distance(b)).slice(0, 35);
  $('#area').textContent = area;
  $('#count').textContent = loadError ? '' : shown.length + (shown.length === 35 ? '곳 표시' : '곳') + ' · 직선거리순';
  $('#expand').hidden = loadError || shown.length > 0 || radius >= 10000;
  $('#list').replaceChildren(...shown.map(place => {
    const item = document.createElement('button');
    item.className = 'card';
    item.innerHTML = '<span class="row"><strong class="name">' + escapeHtml(place.name) +
      '</strong><strong class="distance">' + meters(place) + '</strong></span><span class="meta">' +
      escapeHtml(place.address) + '</span><span class="badges"><span class="badge ' + tone(place) + '">' +
      label(place, 'entry') + '</span><span class="badge">비밀번호 ' + label(place, 'code') +
      '</span><span class="badge">' + label(place, 'type') + '</span></span><span class="meta">' +
      verified(place) + '</span>';
    item.onclick = () => detail(place);
    return item;
  }));
  if (!shown.length && !loadError) showMessage(openOnly ? '출입 가능으로 표시된 화장실이 없습니다.' : '검색 조건에 맞는 화장실이 없습니다.');
  drawMap();
}
function matches(place, term) {
  const normalize = text => text.toLowerCase().replace(/\s/g, '');
  return term.toLowerCase().trim().split(/\s+/).every(word => normalize(place.name + ' ' + place.address + ' ' + place.area).includes(normalize(word)));
}
function openSheet(title, body) {
  sheet.innerHTML = '<div class="row"><h2 id="sheet-title">' + escapeHtml(title) +
    '</h2><button class="close" aria-label="닫기">×</button></div><div class="sheet-body">' + body + '</div>';
  sheet.querySelector('.close').onclick = () => sheet.close();
  if (!sheet.open) {
    dialogTrigger = document.activeElement;
    sheet.showModal();
  } else {
    sheet.querySelector('.close').focus();
  }
}
sheet.addEventListener('close', () => {
  const fallback = $('#list button') || $('#query');
  (dialogTrigger?.isConnected ? dialogTrigger : fallback).focus();
});
function detail(place) {
  selected = place;
  openSheet(place.name, '<p>' + escapeHtml(place.address) + ' · 직선거리 ' + meters(place) +
    '</p><dl class="details">' + Object.entries(groups).map(([key, group]) =>
      '<div><dt>' + group[0] + '</dt><dd>' + label(place, key) + '</dd></div>').join('') +
    '</dl><p>' + verified(place) + '</p>' +
    (place.conflicts?.length ? '<p>서로 다른 제보가 있는 항목은 정보 없음으로 표시됩니다.</p>' : '') +
    (place.note && !place.conflicts?.length ? '<p>' + escapeHtml(place.note) + '</p>' : '') +
    ((place.hours ? '<p>표기된 개방시간 ' + escapeHtml(place.hours) + '</p>' : '') + '<p class="meta">' + (place.source === 'osm' ? 'OpenStreetMap 시설 정보' : place.source === 'local' ? '이 브라우저에 추가한 위치' : '사용자가 추가한 위치') + ' · 이용 조건은 현장에서 확인해주세요.</p>') +
    '<div class="actions"><button id="back">다른 화장실 찾기</button><button class="primary" id="report">정보 제보</button></div>');
  $('#back').onclick = () => sheet.close();
  $('#report').onclick = reportForm;
}
function reportForm() {
  const place = selected;
  openSheet('정보 제보', '<p>' + escapeHtml(place.name) + '</p><form id="report-form">' +
    Object.entries(groups).map(([key, [title, choices]]) =>
      '<fieldset><legend>' + title + '</legend><div class="choices">' +
      Object.entries(choices).map(([value, name]) => '<label><input required type="radio" name="' +
        key + '" value="' + value + '"><span>' + name + '</span></label>').join('') + '</div></fieldset>').join('') +
    '<label for="note">추가 설명 (선택)</label><textarea id="note" name="note" rows="2" maxlength="200" placeholder="출입 위치나 이용 조건을 적어주세요."></textarea>' +
    '<p class="meta"><span id="length">0</span>/200 · 실제 비밀번호는 입력하지 마세요.</p><p id="form-error" role="alert"></p>' +
    '<div class="actions"><button id="cancel" type="button">취소</button><button id="submit" class="primary">제보 제출</button></div></form>');
  $('#cancel').onclick = () => detail(place);
  $('#note').oninput = event => { $('#length').textContent = event.target.value.length; };
  $('#report-form').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $('#submit');
    const formError = $('#form-error');
    submit.disabled = true;
    formError.textContent = '';
    try {
      const values = Object.fromEntries(new FormData(form));
      if (place.source === 'local') {
        const record = { ...place, ...values, verifiedAt: new Date().toISOString() };
        saveLocalPlaces(localPlaces.map(item => item.id === place.id ? record : item));
        Object.assign(place, record);
        render();
        showMessage('이 브라우저에 이용 정보를 저장했습니다.');
        detail(place);
        return;
      }
      const response = await fetch('/api/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: place.id, ...Object.fromEntries(new FormData(form)) })
      });
      const result = await response.json();
      if (!response.ok) {
        formError.textContent = result.message || '제보를 저장하지 못했습니다. 다시 시도해주세요.';
        submit.disabled = false;
        return;
      }
      Object.assign(place, result);
      render();
      if (!sheet.open || !form.isConnected) return;
      openSheet('제보가 완료되었습니다', '<p>확인해주신 정보가 저장되었습니다.</p><div class="actions">' +
        '<button id="return-map">지도 돌아가기</button><button class="primary" id="return-detail">상세 정보 보기</button></div>');
      $('#return-map').onclick = () => sheet.close();
      $('#return-detail').onclick = () => detail(place);
    } catch {
      formError.textContent = '제보를 저장하지 못했습니다. 다시 시도해주세요.';
      submit.disabled = false;
    }
  };
}
$('#search').onsubmit = event => {
  event.preventDefault();
  const field = $('#query');
  const term = field.value.trim();
  if (term.length < 2) {
    field.setCustomValidity('검색어를 두 글자 이상 입력해주세요.');
    field.reportValidity();
    return;
  }
  const candidates = places.filter(place => matches(place, term));
  const match = candidates.find(place => place.name.includes(term) || place.address.includes(term)) || candidates[0];
  query = term;
  center = match || start;
  radius = 1000;
  if (match) recenter(match, 14);
  area = term + ' 검색 결과';
  showMessage('');
  render();
};
$('#query').oninput = event => event.target.setCustomValidity('');
$('#available').onclick = event => {
  openOnly = !openOnly;
  event.currentTarget.setAttribute('aria-pressed', openOnly);
  showMessage('');
  render();
};
$('#expand').onclick = () => {
  query = '';
  radius = Math.min(10000, radius * 2);
  area = '기준점 주변 ' + (radius / 1000) + 'km';
  recenter(center, map ? Math.max(6, map.getZoom() - 1) : 13);
  showMessage('');
  render();
};
$('#locate').onclick = () => {
  const button = $('#locate');
  const failure = error => {
    button.disabled = false;
    const reasons = {
      1: '위치 권한이 차단되어 있습니다. 브라우저 사이트 설정에서 허용하거나 지역명을 검색해주세요.',
      2: '기기에서 위치를 확인할 수 없습니다. 위치 서비스 설정을 확인해주세요.',
      3: '위치를 확인하는 데 시간이 걸립니다. 다시 시도하거나 지역명을 검색해주세요.'
    };
    showMessage(reasons[error?.code] || '위치 사용에는 HTTPS 또는 localhost 접속이 필요합니다.');
  };
  if (!window.isSecureContext || !navigator.geolocation) return failure();
  button.disabled = true;
  showMessage('현재 위치를 확인하고 있습니다.');
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    gps = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
    center = gps;
    query = '';
    $('#query').value = '';
    radius = 2000;
    area = '현재 위치 주변';
    button.disabled = false;
    recenter(gps, 14);
    showMessage('');
    render();
  }, failure, { timeout: 15000, maximumAge: 30000 });
};

initMap();
$('#add-place').onclick = () => setSelecting(!selecting);

async function loadPlaces() {
  const addButton = $('#add-place');
  addButton.disabled = true;
  try {
    const response = await fetch('/api/places');
    if (!response.ok) throw new Error();
    places = [...await response.json(), ...localPlaces];
  } catch {
    try {
      const fallback = await fetch('/data.json');
      if (!fallback.ok) throw new Error();
      places = [...await fallback.json(), ...localPlaces];
      showMessage('기본 지도 데이터를 표시하고 있습니다. 공유 위치와 제보는 잠시 후 다시 확인해주세요.');
    } catch {
      places = [...localPlaces];
      loadError = !places.length;
      showMessage('화장실 정보를 불러오지 못했습니다. 연결을 확인하고 새로고침해주세요.');
    }
  }
  addButton.disabled = !map;
  render();
}
loadPlaces();
