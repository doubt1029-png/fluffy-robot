const $ = selector => document.querySelector(selector);
const sheet = $('#sheet');
const start = { lat: 37.5558, lng: 126.9228 };
const groups = {
  entry: ['출입 상태', { open: '출입 가능', locked: '출입 불가·잠김', unknown: '정보 없음' }],
  code: ['비밀번호', { no: '불필요', yes: '필요', unknown: '정보 없음' }],
  type: ['시설 유형', { flush: '수세식', squat: '푸세식', unknown: '정보 없음' }],
  public: ['외부인 이용', { yes: '가능', no: '불가', unknown: '정보 없음' }]
};
let places = [];
let center = start;
let area = '홍대입구 주변';
let radius = 1000;
let query = '';
let openOnly = false;
let selected;
let shown = [];
let loadError = false;
let dialogTrigger;

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
function project(point, width, height) {
  const longitudeScale = 111320 * Math.cos(center.lat * Math.PI / 180);
  const scale = Math.min(width, height) * 0.44 / radius;
  return [width / 2 + (point.lng - center.lng) * longitudeScale * scale,
    height / 2 - (point.lat - center.lat) * 111320 * scale];
}
function drawMap() {
  const canvas = $('#drawing');
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#e9eff3';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-0.29);
  for (let x = -width; x < width; x += 78) {
    for (let y = -height; y < height; y += 56) {
      ctx.fillStyle = (x + y) % 5 === 0 ? '#d4e7dc' : '#dfe7ee';
      ctx.fillRect(x, y, 69, 47);
    }
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  for (let x = -width; x < width; x += 78) {
    ctx.beginPath();
    ctx.moveTo(x - 5, -height);
    ctx.lineTo(x - 5, height);
    ctx.stroke();
  }
  ctx.restore();
  const pins = $('#pins');
  pins.replaceChildren();
  function placeAt(element, point) {
    const [x, y] = project(point, width, height);
    element.style.left = x + 'px';
    element.style.top = Math.max(28, Math.min(height - 36, y)) + 'px';
    pins.append(element);
  }
  const origin = document.createElement('span');
  origin.className = 'origin';
  origin.setAttribute('aria-hidden', 'true');
  placeAt(origin, center);
  for (const place of shown.slice().reverse()) {
    const pin = document.createElement('button');
    pin.className = 'pin ' + tone(place);
    pin.textContent = 'WC';
    pin.setAttribute('aria-label', place.name + ' ' + meters(place) + ' ' + label(place, 'entry'));
    pin.onclick = () => detail(place);
    placeAt(pin, place);
  }
}
function render() {
  shown = places.filter(place => (query ? matches(place, query) : distance(place) <= radius) &&
    (!openOnly || effective(place, 'entry') === 'open')).sort((a, b) => distance(a) - distance(b));
  $('#area').textContent = area;
  $('#count').textContent = loadError ? '' : shown.length + '곳 · 직선거리순';
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
  return normalize(place.name + place.address + place.area).includes(normalize(term));
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
    '<p class="meta">예시 시설 정보이며 실제 이용 가능 여부는 현장에서 확인해주세요.</p>' +
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
  const match = places.find(place => matches(place, term));
  query = term;
  center = match || start;
  radius = 1000;
  const matchesInArea = places.filter(place => matches(place, term));
  if (matchesInArea.length) radius = Math.max(radius, ...matchesInArea.map(distance));
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
  showMessage('');
  render();
};
$('#locate').onclick = () => {
  const button = $('#locate');
  const failure = () => {
    button.disabled = false;
    showMessage('현재 위치를 확인할 수 없습니다. 지역을 직접 검색해주세요.');
  };
  if (!navigator.geolocation) return failure();
  button.disabled = true;
  showMessage('현재 위치를 확인하고 있습니다.');
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    center = coords;
    query = '';
    $('#query').value = '';
    radius = 1000;
    area = '현재 위치 주변';
    button.disabled = false;
    showMessage('');
    render();
  }, failure, { timeout: 8000 });
};
new ResizeObserver(drawMap).observe($('#drawing'));
fetch('/api/places').then(response => {
  if (!response.ok) throw new Error();
  return response.json();
}).then(data => {
  places = data;
  render();
}).catch(() => {
  loadError = true;
  showMessage('화장실 정보를 불러오지 못했습니다. 연결을 확인하고 새로고침해주세요.');
  render();
});
