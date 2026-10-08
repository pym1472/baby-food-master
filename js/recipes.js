'use strict';
/* 2차: 레시피(단계 안내·타이머) · 냉동 큐브 재고 · 장보기(식재료/밀키트/완제품) */
Object.assign(ui, { recSel: null, recQ: '', recStage: 'all', recSrc: 'all', shopTab: 'list', shopFrom: todayISO(), shopTo: addDays(todayISO(), 6), stepDone: {} });

const STAGES = { early: '초기', mid: '중기', late: '후기', done: '완료기' };
const SHOP_M = { ing: { label: '식재료', emoji: '🥕' }, kit: { label: '밀키트', emoji: '📦' }, ready: { label: '완제품', emoji: '🥣' } };
const STORES = { coupang: '쿠팡', local: '동네마트', mart: '대형마트', naver: '네이버', kurly: '마켓컬리', etc: '기타(직접입력)' };
const storeLabel = key => { const v = (S.shopStore || {})[key]; return v ? (v.s === 'etc' ? (v.t || '기타') : STORES[v.s]) : ''; };
const storeTag = key => storeLabel(key) ? ` · 🏬 ${esc(storeLabel(key))}` : '';
const storeText = key => storeLabel(key) ? ` [${storeLabel(key)}]` : '';
function storeCell(key) {
  const v = (S.shopStore || {})[key] || {};
  return `<select data-chg="shopStore" data-k="${key}" style="min-width:120px" aria-label="구매처"><option value="">선택 안 함</option>${Object.entries(STORES).map(([k, l]) => `<option value="${k}" ${v.s === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`
    + (v.s === 'etc' ? `<input type="text" data-chg="shopStoreTxt" data-k="${key}" value="${esc(v.t || '')}" placeholder="구매처 입력" style="margin-top:6px;min-width:120px" aria-label="구매처 직접 입력">` : '');
}
const storeSum = meals => { const names = [...new Set(meals.map(x => storeLabel(x.key)).filter(Boolean))]; return names.length ? ` · 🏬 ${names.map(esc).join(', ')}` : ''; };
/* ============ 식재료 구매 기록 (구매처·수량·메모) → 재료 도감 연동 ============ */
const BUY_UNITS = ['g', 'kg', 'ml', 'L', '개', '봉', '팩', '단', '통', '알'];
const buyRef = k => shopKey('ing:' + k);
const buyByRef = ref => S.buys.find(b => b.ref === ref);
const buyStoreLabel = b => b.s ? (b.s === 'etc' ? (b.t || '기타') : STORES[b.s]) : '구매처 미지정';
const buyEmpty = b => !(b.qty > 0) && !b.memo && !b.s;
function buyFields(it) {
  const ref = buyRef(it.k), b = buyByRef(ref) || { date: todayISO(), unit: 'g', s: '', t: '', memo: '' }, k = esc(it.k);
  const f = (field, extra = '') => `data-chg="buyField" data-k="${k}" data-f="${field}" ${extra}`;
  return `<div class="buyf">
    <div><label class="f">구매처</label><select ${f('s')}><option value="">선택 안 함</option>${Object.entries(STORES).map(([v, l]) => `<option value="${v}" ${b.s === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${b.s === 'etc' ? `<input type="text" ${f('t')} value="${esc(b.t || '')}" placeholder="구매처 입력" style="margin-top:6px">` : ''}</div>
    <div><label class="f">구매량</label><div class="row" style="gap:6px"><input type="number" min="0" step="any" ${f('qty')} value="${b.qty ?? ''}" placeholder="수량" style="min-width:0"><select ${f('unit')} style="width:78px">${BUY_UNITS.map(u => `<option ${b.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
    <div><label class="f">구매일</label><input type="date" ${f('date')} value="${b.date || todayISO()}"></div>
    <div class="buymemo"><label class="f">메모 · 특이사항 (품질·가격·배송 문제 등 → 재료 도감에 표시)</label><input type="text" ${f('memo')} value="${esc(b.memo || '')}" placeholder="예: 쿠팡 로켓프레시 — 포장이 터져서 도착"></div></div>`;
}
function buyStats(ingId) {
  const all = S.buys.filter(b => b.ing === ingId), buys = all.filter(b => b.qty > 0), t = todayISO();
  const units = {}; buys.forEach(b => { units[b.unit] = (units[b.unit] || 0) + b.qty; });
  const dates = [...new Set(buys.map(b => b.date))].sort();
  const stores = {}; all.forEach(b => { const n = buyStoreLabel(b), o = stores[n] = stores[n] || { n, cnt: 0, units: {}, last: '', memos: 0 }; if (b.qty > 0) { o.cnt++; o.units[b.unit] = (o.units[b.unit] || 0) + b.qty; } if (b.date > o.last) o.last = b.date; if (b.memo) o.memos++; });
  return { all, buys, units, last: dates.at(-1) || null, first: dates[0] || null,
    interval: dates.length > 1 ? diffDays(dates[0], dates.at(-1)) / (dates.length - 1) : null,
    recent30: buys.filter(b => diffDays(b.date, t) <= 30 && diffDays(b.date, t) >= 0).length,
    stores: Object.values(stores).sort((a, b) => b.cnt - a.cnt), memos: all.filter(b => b.memo).sort((a, b) => b.date.localeCompare(a.date)) };
}
const fmtUnits = u => Object.entries(u).map(([k, v]) => `${+v.toFixed(2)}${k}`).join(' + ') || '-';
function detailBuy(g) {
  const s = buyStats(g.id), used = useOf(g.id);
  return `<div class="dsec"><div class="dtitle">구매 기록</div>
    <div class="tiles"><div class="tile"><b>${s.buys.length}</b><span>구매 횟수</span></div><div class="tile"><b style="font-size:16px">${fmtUnits(s.units)}</b><span>총 구매량</span></div>
      <div class="tile"><b>${s.interval == null ? '-' : s.interval.toFixed(1)}</b><span>평균 구매 간격(일)</span></div><div class="tile"><b>${s.recent30}</b><span>최근 30일 구매</span></div></div>
    <div class="small" style="margin:8px 0">${s.last ? `마지막 구매 ${fmtShort(s.last)} · ` : ''}식단 반영 ${used.meals}끼 / 구매 ${s.buys.length}회</div>
    ${s.memos.length ? `<div class="dtitle" style="margin-top:12px">⚠ 구매 특이사항</div><div class="memos">${s.memos.map(b => `<div class="memoitem"><b>${esc(buyStoreLabel(b))}</b> <span class="muted small">${fmtShort(b.date)}</span><div>${esc(b.memo)}</div></div>`).join('')}</div>` : ''}
    ${s.stores.length ? `<div class="dtitle" style="margin-top:12px">구매처별</div><div class="scroll"><table><tr><th>구매처</th><th class="num">횟수</th><th class="num">총량</th><th>최근</th><th>메모</th></tr>
      ${s.stores.map(o => `<tr><td>${esc(o.n)}</td><td class="num">${o.cnt}</td><td class="num">${fmtUnits(o.units)}</td><td>${o.last ? fmtShort(o.last) : '-'}</td><td>${o.memos ? `⚠ ${o.memos}건` : '-'}</td></tr>`).join('')}</table></div>` : ''}
    <div class="dtitle" style="margin-top:12px">기록 목록</div>
    ${s.all.length ? `<div class="scroll"><table><tr><th>구매일</th><th>구매처</th><th class="num">구매량</th><th></th></tr>${[...s.all].sort((a, b) => b.date.localeCompare(a.date)).map(b => `<tr><td>${fmtShort(b.date)}</td><td>${esc(buyStoreLabel(b))}${b.memo ? ' ⚠' : ''}</td><td class="num">${b.qty > 0 ? `${b.qty}${b.unit}` : '-'}</td>
      <td style="white-space:nowrap"><button class="btn sm" data-act="buyEdit" data-id="${b.id}">수정</button> <button class="btn sm dan" data-act="buyDel" data-id="${b.id}">삭제</button></td></tr>`).join('')}</table></div>` : '<div class="muted small">아직 구매 기록이 없어요. 장보기 화면의 식재료 항목에서 구매량·구매처·메모를 입력하면 여기에 쌓여요.</div>'}
    <div class="row wrap" style="margin-top:10px"><button class="btn sm pri" data-act="buyAdd" data-ing="${g.id}">+ 구매 기록 추가</button>
      <button class="btn sm" data-act="goShop">🛒 장보기로 이동</button></div>
    <div class="muted small" style="margin-top:6px">구매량은 단위(g·개·봉 등)가 달라 단위별로 따로 합산해요. 식단 반영은 끼니 수 기준이에요.</div></div>`;
}
function buyModal(id, ingId) {
  const b = id ? S.buys.find(x => x.id === id) : { ing: ingId, date: todayISO(), unit: 'g', s: '', t: '', memo: '' };
  modal(`<h3>${id ? '구매 기록 수정' : '+ 구매 기록 추가'} — ${esc(ING[b.ing]?.name || b.ing)}</h3><div class="stack">
    <div class="fgrid"><div><label class="f">구매일</label><input type="date" id="bm_date" value="${b.date}"></div>
      <div><label class="f">구매처</label><select id="bm_s" data-chg="bmstore"><option value="">선택 안 함</option>${Object.entries(STORES).map(([v, l]) => `<option value="${v}" ${b.s === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div id="bm_tbox" ${b.s === 'etc' ? '' : 'hidden'}><label class="f">구매처 직접 입력</label><input type="text" id="bm_t" value="${esc(b.t || '')}"></div>
    <div class="fgrid"><div><label class="f">구매량</label><input type="number" min="0" step="any" id="bm_qty" value="${b.qty ?? ''}"></div>
      <div><label class="f">단위</label><select id="bm_unit">${BUY_UNITS.map(u => `<option ${b.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
    <div><label class="f">메모 · 특이사항</label><textarea id="bm_memo">${esc(b.memo || '')}</textarea></div></div>
    <div class="actions"><button class="btn" data-act="closeModal">취소</button><button class="btn pri" data-act="buySave" data-id="${id || ''}" data-ing="${esc(b.ing)}">저장</button></div>`);
}
const recById = id => S.recipes.find(r => r.id === id);
const recUse = id => Object.values(S.plan).reduce((n, day) => n + Object.values(day).filter(m => m.recipeId === id).length, 0);
const parseSteps = text => text.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
  const m = line.match(/\((\d+)\s*분\)\s*$/);
  return m ? { t: line.replace(m[0], '').trim(), min: +m[1] } : { t: line, min: 0 };
});
const stepsText = r => r.steps.map(s => s.t + (s.min ? ` (${s.min}분)` : '')).join('\n');
/* ============ 유튜브 영상 ============ */
function ytId(url) {
  const m = String(url || '').trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}
const ytSearchUrl = r => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(r.title.replace(/\(.*?\)/g, '').trim() + ' 이유식') + '&sp=CAM%253D';
function videoCard(r) {
  const v = r.video, more = `<a class="btn sm" href="${esc(ytSearchUrl(r))}" target="_blank" rel="noopener">🔎 유튜브에서 더 찾기 (조회수순)</a>`;
  const tools = `<div class="row wrap" style="margin-top:8px">${more}<button class="btn sm" data-act="recVideo" data-id="${r.id}">${v ? '영상 변경' : '영상 직접 연결'}</button>${v ? `<button class="btn sm ghost" data-act="recVideoDel" data-id="${r.id}">연결 해제</button>` : ''}</div>`;
  if (!v) return `<div class="sec-title" style="margin:16px 0 6px;font-size:14px">▶ 유튜브 이유식 영상</div><div class="muted small">연결된 영상이 없어요. 아래 버튼으로 이유식 영상을 찾아 연결할 수 있어요.</div>${tools}`;
  const meta = [v.ch, v.len, v.views ? `조회수 ${Number(v.views).toLocaleString('ko-KR')}회` : ''].filter(Boolean).join(' · ');
  return `<div class="sec-title" style="margin:16px 0 6px;font-size:14px">▶ 유튜브 이유식 영상</div>
    <a class="vcard" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener" aria-label="유튜브에서 영상 보기: ${esc(v.title)}">
      <div class="vthumb"><img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'"><span class="vplay">▶</span>${v.len ? `<span class="vlen">${esc(v.len)}</span>` : ''}</div>
      <div class="vinfo"><div class="vt">${esc(v.title)}</div><div class="muted small">${esc(meta)}</div>
        <div class="muted small">${v.checked ? `${v.checked} 유튜브 검색(조회수순) 기준 · ` : ''}레시피 재료가 제목에 들어간 이유식 영상 중 조회수 최고${v.note ? ` (${esc(v.note)})` : ''}</div></div></a>${tools}`;
}
// 저장돼 있던 기본 레시피에 영상 정보가 없으면 채움
(function migrateVideos() {
  let changed = false;
  S.recipes.forEach(r => { const n = /^seed-(\d+)$/.exec(r.id)?.[1]; if (n && SEED_VIDEOS[n] && !('video' in r)) { r.video = { ...SEED_VIDEOS[n], checked: YT_CHECKED }; changed = true; } });
  if (changed) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
})();

const linkSrc = src => src?.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.detail || src.url)}</a>` : esc(src?.detail || '');

/* ============ 타이머 ============ */
const timers = [];
let _audio = null, _tick = null;
function beep() {
  try {
    _audio = _audio || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.3, 0.6].forEach(t => { const o = _audio.createOscillator(), g = _audio.createGain(); o.connect(g); g.connect(_audio.destination); o.frequency.value = 880; g.gain.value = 0.15; o.start(_audio.currentTime + t); o.stop(_audio.currentTime + t + 0.18); });
  } catch (e) { /* 소리 불가 환경은 화면 알림만 */ }
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { }
}
function renderTimers() {
  const box = $('#timers'); if (!box) return;
  const now = Date.now();
  box.innerHTML = timers.map(t => {
    const left = Math.max(0, Math.ceil((t.end - now) / 1000)), m = Math.floor(left / 60), s = left % 60;
    return `<div class="tm ${left === 0 ? 'done' : ''}"><span>⏲ ${esc(t.label)}</span><b>${left === 0 ? '완료!' : `${pad(m)}:${pad(s)}`}</b><button data-act="timerClose" data-id="${t.id}" aria-label="타이머 닫기">✕</button></div>`;
  }).join('');
}
function tickTimers() {
  const now = Date.now();
  timers.forEach(t => { if (!t.done && now >= t.end) { t.done = true; beep(); toast(`⏲ ${t.label} 타이머가 끝났어요`); } });
  renderTimers();
  if (!timers.length) { clearInterval(_tick); _tick = null; }
}

/* ============ 레시피 ============ */
function recList() {
  const q = ui.recQ.trim();
  const list = S.recipes.filter(r => (ui.recStage === 'all' || r.stage === ui.recStage) && (ui.recSrc === 'all' || (r.src?.type || 'etc') === ui.recSrc) && (!q || r.title.includes(q) || mealNames(r).some(n => n.includes(q))));
  return list.map(r => `<button class="rcard" data-act="recOpen" data-id="${r.id}">
      ${r.img ? `<img class="rcimg" src="${esc(r.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div class="remo">${(r.ing || []).slice(0, 4).map(i => ING[i]?.emoji || '').join('') || '🍲'}</div>
      <div class="rt">${esc(r.title)}</div>
      <div class="row wrap" style="gap:5px"><span class="badge">${STAGES[r.stage] || '-'}</span>${srcBadge(r)}</div>
      <div class="muted small" style="margin-top:6px">${mealNames(r).map(esc).join(' · ')}</div>
      <div class="muted small">식단 ${recUse(r.id)}끼 · ${r.steps.length}단계</div></button>`).join('') || '<div class="empty-box" style="grid-column:1/-1">조건에 맞는 레시피가 없어요</div>';
}
function recDetail(r) {
  const done = i => ui.stepDone[`${r.id}:${i}`], doneN = r.steps.filter((_, i) => done(i)).length;
  return `<div class="row" style="margin-bottom:10px"><button class="btn sm" data-act="recBack">◀ 목록</button><span class="right row wrap">
      <button class="btn sm" data-act="recDup" data-id="${r.id}">복제</button><button class="btn sm" data-act="recEdit" data-id="${r.id}">편집</button><button class="btn sm dan" data-act="recDel" data-id="${r.id}">삭제</button></span></div>
    <div class="card"><div class="row wrap"><h2 style="font-size:22px">${esc(r.title)}</h2><span class="badge">${STAGES[r.stage] || '-'}</span>${srcBadge(r)}</div>
      <div class="small muted" style="margin-top:4px">출처: ${linkSrc(r.src) || '직접 작성'}</div>
      <div class="row wrap" style="margin-top:10px;align-items:flex-start">
        ${r.img ? `<img class="recimg" src="${esc(r.img)}" alt="" referrerpolicy="no-referrer" onerror="this.classList.add('missing')">` : ''}
        <div class="row wrap"><button class="btn sm" data-act="recImg" data-id="${r.id}">🖼 대표 이미지 ${r.img ? '변경' : '설정'}</button>${r.img ? `<button class="btn sm ghost" data-act="recImgDel" data-id="${r.id}">해제</button>` : ''}</div></div>
      <div class="sec-title" style="margin:14px 0 6px;font-size:14px">🧂 재료</div>
      <div class="ingtags">${(r.ing || []).map(i => `<button class="chiplink" data-act="ingGo" data-id="${i}">${ING[i]?.emoji || ''} ${esc(ING[i]?.name || i)}</button>`).join('')}${tokens(r.extra).map(n => `<span>${esc(n)}</span>`).join('')}</div>
      ${r.amount ? `<div class="small" style="margin-top:6px">분량 · ${esc(r.amount)}</div>` : ''}
      ${(r.ing || []).filter(i => isAllergy(ING[i] || {}) && ING[i]).map(i => `<div class="warnline">⚠ ${ING[i].name}은(는) 알레르기 주의 재료로 설정돼 있어요.</div>`).join('')}
      ${videoCard(r)}
      <div class="sec-title" style="margin:16px 0 6px;font-size:14px">👩‍🍳 조리 단계 <span class="badge">${doneN}/${r.steps.length}</span></div>
      <ol class="steps">${r.steps.map((s, i) => `<li class="${done(i) ? 'done' : ''}"><label><input type="checkbox" ${done(i) ? 'checked' : ''} data-act="stepToggle" data-k="${r.id}:${i}"><span>${esc(s.t)}</span></label>
        ${s.min ? `<button class="btn sm" data-act="timerStart" data-m="${s.min}" data-l="${esc(r.title)} ${i + 1}단계">⏲ ${s.min}분 타이머</button>` : ''}</li>`).join('')}</ol>
      ${doneN ? `<button class="btn sm ghost" data-act="stepReset" data-id="${r.id}">체크 초기화</button>` : ''}
      ${r.storage ? `<div class="descbox" style="margin-top:12px"><b>🧊 보관</b><br>${esc(r.storage)}</div>` : ''}
      ${r.note ? `<div class="muted small" style="margin-top:8px">📝 ${esc(r.note)}</div>` : ''}
      <div class="row wrap" style="margin-top:14px"><button class="btn pri" data-act="recToPlan" data-id="${r.id}">📅 식단에 넣기</button><button class="btn" data-act="stockAdd" data-rid="${r.id}">🧊 큐브 재고에 추가</button>
        <span class="small muted">식단 ${recUse(r.id)}끼에 사용됨</span></div></div>`;
}
VIEWS.rec = () => {
  if (ui.recSel && recById(ui.recSel)) return topbar() + recDetail(recById(ui.recSel));
  return `${topbar()}
  <div class="sec-title" style="margin-top:0">📖 레시피 <span class="badge">${S.recipes.length}개</span></div>
  <div class="row wrap" style="margin-bottom:10px"><input type="text" id="recq" placeholder="레시피·재료 검색" value="${esc(ui.recQ)}" data-inp="recq" style="flex:1;min-width:160px">
    <select data-chg="recsrc" style="width:auto"><option value="all">모든 출처</option>${Object.entries(SRC).map(([k, v]) => `<option value="${k}" ${ui.recSrc === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
    <button class="btn" data-act="aiRecipe">🤖 AI로 가져오기</button><button class="btn pri" data-act="recNew">+ 새 레시피</button></div>
  <div class="chips" style="margin-bottom:12px">${[['all', '전체'], ...Object.entries(STAGES)].map(([k, l]) => `<button class="btn sm ${ui.recStage === k ? 'pri' : ''}" data-act="recStage" data-k="${k}">${l}</button>`).join('')}</div>
  <div class="grid g2" id="reclist">${recList()}</div>
  <div class="disc">기본 레시피는 일반적인 조리 방법을 정리한 참고용이며 자유롭게 수정·삭제할 수 있어요. 조리 시간은 불 세기와 양에 맞게 조절하세요.</div>`;
};
function recForm(r, asNew) {   // asNew: AI 분석 결과처럼 미리 채운 값으로 '새 레시피'를 열 때
  const x = r || { title: '', stage: 'early', ing: [], extra: '', amount: '', steps: [], storage: '', src: { type: 'self', detail: '', url: '' }, note: '' };
  modal(`<h3>${r && !asNew ? '레시피 편집' : asNew ? '🤖 AI가 읽은 레시피 — 확인 후 저장' : '+ 새 레시피'}</h3>${asNew ? '<div class="banner" style="margin-bottom:10px">AI가 자료에서 읽은 내용이에요. 틀린 부분이 있을 수 있으니 재료·분량·단계를 꼭 확인하고 저장하세요.</div>' : ''}<div class="stack">
    <div><label class="f">이름</label><input type="text" id="rc_title" value="${esc(x.title)}"></div>
    <div class="fgrid"><div><label class="f">적용 단계</label><select id="rc_stage">${Object.entries(STAGES).map(([k, v]) => `<option value="${k}" ${x.stage === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label class="f">분량·농도</label><input type="text" id="rc_amount" placeholder="예: 쌀 1 : 물 10" value="${esc(x.amount)}"></div></div>
    <div><label class="f">재료 선택</label>${Object.keys(CATS).map(c => `<div class="small muted" style="margin:6px 0 4px">${CATS[c]}</div><div class="chips">${INGREDIENTS.filter(g => g.cat === c).map(g => `<label class="chip"><input type="checkbox" name="rcing" value="${g.id}" ${x.ing.includes(g.id) ? 'checked' : ''}><span>${g.emoji} ${g.name}</span></label>`).join('')}</div>`).join('')}</div>
    <div><label class="f">그 외 재료 (쉼표로 구분)</label><input type="text" id="rc_extra" value="${esc(x.extra)}"></div>
    <div><label class="f">조리 단계 (한 줄에 한 단계 · 끝에 (10분) 을 쓰면 타이머 버튼)</label><textarea id="rc_steps" style="min-height:140px">${esc(stepsText(x))}</textarea></div>
    <div><label class="f">보관 방법</label><input type="text" id="rc_storage" value="${esc(x.storage)}"></div>
    <div class="fgrid"><div><label class="f">출처 종류</label><select id="rc_src">${Object.entries(SRC).map(([k, v]) => `<option value="${k}" ${(x.src?.type || 'self') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div><label class="f">출처 상세 (책 제목/쪽, 계정 등)</label><input type="text" id="rc_srcd" value="${esc(x.src?.detail || '')}"></div></div>
    <div><label class="f">출처 링크 (선택)</label><input type="text" id="rc_url" placeholder="https://" value="${esc(x.src?.url || '')}"></div>
    <div><label class="f">메모</label><textarea id="rc_note">${esc(x.note)}</textarea></div></div>
    <div class="actions"><button class="btn" data-act="closeModal">취소</button><button class="btn pri" data-act="recSave" data-id="${r && !asNew ? r.id : ''}">저장</button></div>`);
}
function recToPlanModal(r) {
  const t = todayISO();
  modal(`<h3>📅 식단에 넣기</h3><div class="muted" style="margin-bottom:10px">${esc(r.title)}</div><div class="stack">
    <div class="fgrid"><div><label class="f">날짜</label><input type="date" id="rp_date" value="${t}"></div>
      <div><label class="f">끼니</label><select id="rp_slot">${SLOTS.map(s => `<option value="${s}">${SLOT_EMOJI[s]} ${slotLabel(t, s)}</option>`).join('')}</select></div>
      <div><label class="f">조리 방식</label><select id="rp_prep">${Object.entries(PREP).map(([k, v]) => `<option value="${k}" ${k === 'cube' ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('')}</select></div></div></div>
    <div class="actions"><button class="btn" data-act="closeModal">취소</button><button class="btn pri" data-act="recDoPlan" data-id="${r.id}">넣기</button></div>`);
}

/* ============ 냉동 큐브 재고 ============ */
const stockExp = x => x.expire || addDays(x.madeDate, S.profile.freezeDays || 7);
function stockStatus(x) {
  if (x.qty <= 0) return { cls: 's-none', label: '소진' };
  const left = diffDays(todayISO(), stockExp(x));
  if (left < 0) return { cls: 's-caution', label: `기한 ${-left}일 지남` };
  if (left <= 2) return { cls: 's-obs', label: left === 0 ? '오늘까지' : `D-${left}` };
  return { cls: 's-pass', label: `D-${left}` };
}
function stockWarn() {
  const bad = S.stock.filter(x => x.qty > 0 && diffDays(todayISO(), stockExp(x)) <= 2);
  return bad.map(x => { const s = stockStatus(x); return `<div class="banner ${s.cls === 's-caution' ? 'warn' : ''}">🧊 <b>${esc(x.name)}</b> ${x.qty}개 — ${s.label} (${fmtShort(stockExp(x))}까지)</div>`; }).join('');
}
const stockCover = id => S.stock.filter(x => x.qty > 0 && (x.ing || []).includes(id)).reduce((a, x) => a + x.qty, 0);
function stockModal(rid) {
  const r = rid ? recById(rid) : null, t = todayISO();
  modal(`<h3>🧊 냉동 큐브 추가</h3><div class="stack">
    <div><label class="f">이름</label><input type="text" id="sk_name" value="${esc(r?.title || '')}" placeholder="예: 단호박 미음 큐브"></div>
    <div><label class="f">레시피 연결 (선택)</label><select id="sk_rec" data-chg="skrec"><option value="">없음</option>${S.recipes.map(x => `<option value="${x.id}" ${r?.id === x.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></div>
    <div class="fgrid"><div><label class="f">개수</label><input type="number" min="1" id="sk_qty" value="10"></div>
      <div><label class="f">만든 날</label><input type="date" id="sk_made" value="${t}" data-chg="skmade"></div>
      <div><label class="f">소진 권장일</label><input type="date" id="sk_exp" value="${addDays(t, S.profile.freezeDays || 7)}"></div></div>
    <div class="muted small">소진 권장일 기본값 = 만든 날 + ${S.profile.freezeDays || 7}일 (설정에서 변경). 질병관리청 안내는 냉동 1주일 이내 보관입니다.</div></div>
    <div class="actions"><button class="btn" data-act="closeModal">취소</button><button class="btn pri" data-act="stockSave" data-rid="${r?.id || ''}">추가</button></div>`);
}
// 먹은 기록 직후: 큐브 조리 끼니면 재고 차감 제안
function afterRecord(d, s) {
  const m = S.plan[d]?.[s];
  if (!m || m.prep !== 'cube') return;
  const items = S.stock.filter(x => x.qty > 0);
  if (!items.length) return;
  const score = x => (m.recipeId && x.recipeId === m.recipeId ? 100 : 0) + (x.ing || []).filter(i => (m.ing || []).includes(i) && i !== 'rice').length;
  const best = [...items].sort((a, b) => score(b) - score(a))[0];
  modal(`<h3>🧊 냉동 큐브 차감</h3><div class="muted" style="margin-bottom:10px">${esc(m.title || '')} — 사용한 큐브 개수를 입력해 주세요.</div><div class="stack">
    ${items.map(x => `<div class="row"><span style="flex:1">${esc(x.name)} <span class="muted small">(재고 ${x.qty}개 · ${stockStatus(x).label})</span></span><input type="number" min="0" max="${x.qty}" style="width:80px" data-sk="${x.id}" value="${x === best && score(x) > 0 ? 1 : 0}"></div>`).join('')}</div>
    <div class="actions"><button class="btn" data-act="closeModal">건너뛰기</button><button class="btn pri" data-act="stockUse">차감</button></div>`);
}

/* ============ 장보기 ============ */
function shopData() {
  const meals = [];
  for (let d = ui.shopFrom; d <= ui.shopTo; d = addDays(d, 1)) SLOTS.forEach(s => { const m = S.plan[d]?.[s]; if (m) meals.push({ d, s, m, key: `${d}|${s}` }); });
  const defM = m => ({ cube: 'ing', daily: 'ing', kit: 'kit', ready: 'ready' }[m.prep] || 'ing');
  meals.forEach(x => { x.method = S.shopOv[x.key] || defM(x.m); });
  const ing = {};
  meals.filter(x => x.method === 'ing').forEach(x => {
    [...(x.m.ing || []).filter(id => ING[id]).map(id => ({ k: id, name: ING[id].name, emoji: ING[id].emoji, id })), ...tokens(x.m.extra).map(n => ({ k: 'x:' + n, name: n, emoji: '🛒' }))]
      .forEach(it => { (ing[it.k] = ing[it.k] || { ...it, meals: [] }).meals.push(x); });
  });
  return { meals, ing: Object.values(ing).sort((a, b) => b.meals.length - a.meals.length), kit: meals.filter(x => x.method === 'kit'), ready: meals.filter(x => x.method === 'ready') };
}
const shopKey = k => `${ui.shopFrom}~${ui.shopTo}|${k}`;
const isBought = k => !!S.shopDone[shopKey(k)];
function shopList() {
  const bad = ui.shopTo < ui.shopFrom ? '종료일은 시작일 이후여야 해요' : diffDays(ui.shopFrom, ui.shopTo) > 60 ? '최대 61일까지 조회할 수 있어요' : '';
  if (bad) return `<div class="banner warn">${bad}</div>`;
  const D = shopData(), extra = S.shopExtra;
  const chk = (k, label, sub) => `<label class="shopi ${isBought(k) ? 'got' : ''}"><input type="checkbox" ${isBought(k) ? 'checked' : ''} data-act="shopCheck" data-k="${esc(k)}"><span class="shl">${label}${sub ? `<span class="muted small"> ${sub}</span>` : ''}</span></label>`;
  const mealLbl = x => `${fmtShort(x.d)}(${DOW[parse(x.d).getDay()]}) ${slotLabel(x.d, x.s)}`;
  const total = D.ing.length + D.kit.length + D.ready.length;
  return `<div class="card"><div class="row wrap"><b>${fmtShort(ui.shopFrom)} ~ ${fmtShort(ui.shopTo)}</b><span class="muted small">식단 ${D.meals.length}끼 · 식재료 ${D.ing.length}종 · 밀키트 ${D.kit.length}끼 · 완제품 ${D.ready.length}끼</span>
      <button class="btn sm right" data-act="shopCopy">📋 목록 복사</button></div></div>
    ${D.meals.length ? '' : '<div class="empty-box" style="margin-top:12px">이 기간에 식단이 없어요. 식단을 만들면 장보기 목록이 자동으로 만들어져요.</div>'}
    ${D.meals.length ? `<details class="card" style="margin-top:12px"><summary><b>끼니별 구매 방식</b> <span class="muted small">식재료 / 밀키트 / 완제품을 끼니마다 바꿀 수 있어요</span></summary>
      <div class="scroll" style="margin-top:8px"><table><tr><th>끼니</th><th>메뉴</th><th>구매 방식</th><th>구매처</th></tr>${D.meals.map(x => `<tr><td>${mealLbl(x)}</td><td>${esc(x.m.title || mealNames(x.m).join('·'))}</td>
        <td><select data-chg="shopOv" data-k="${x.key}" style="min-width:110px">${Object.entries(SHOP_M).map(([k, v]) => `<option value="${k}" ${x.method === k ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('')}</select></td>
        <td>${storeCell(x.key)}</td></tr>`).join('')}</table></div>
      <div class="muted small" style="margin-top:6px">기본값은 식단의 조리 방식(대량 큐브·당일 조리 → 식재료, 밀키트, 완제품)을 따라요.</div></details>` : ''}
    ${D.ing.length ? `<div class="sec-title">🥕 식재료 <span class="badge">${D.ing.length}종</span></div><div class="card shoplist">${D.ing.map(it => {
      const cov = it.id ? stockCover(it.id) : 0;
      return chk('ing:' + it.k, `${it.emoji} ${esc(it.name)}`, `${it.meals.length}끼 · ${new Set(it.meals.map(x => x.d)).size}일`) +
        `<div class="shsub muted small">${it.meals.slice(0, 6).map(x => mealLbl(x)).join(', ')}${it.meals.length > 6 ? ` 외 ${it.meals.length - 6}끼` : ''}${cov ? ` · 🧊 큐브 재고 ${cov}개 보유` : ''}${storeSum(it.meals)}</div>` + buyFields(it); }).join('')}</div>` : ''}
    ${D.kit.length ? `<div class="sec-title">📦 밀키트 <span class="badge">${D.kit.length}끼</span></div><div class="card shoplist">${D.kit.map(x => chk('kit:' + x.key, esc(x.m.title || mealNames(x.m).join('·')), mealLbl(x) + storeTag(x.key))).join('')}</div>` : ''}
    ${D.ready.length ? `<div class="sec-title">🥣 완제품 <span class="badge">${D.ready.length}끼</span></div><div class="card shoplist">${D.ready.map(x => chk('ready:' + x.key, esc(x.m.title || mealNames(x.m).join('·')), mealLbl(x) + storeTag(x.key))).join('')}</div>` : ''}
    <div class="sec-title">➕ 직접 추가 항목</div><div class="card shoplist">
      ${extra.map(e => `<div class="row">${chk('extra:' + e.id, `${SHOP_M[e.method]?.emoji || ''} ${esc(e.name)}`, SHOP_M[e.method]?.label)}<button class="btn sm ghost" data-act="shopExtraDel" data-id="${e.id}" aria-label="삭제">✕</button></div>`).join('') || '<div class="muted small">없음</div>'}
      <div class="row wrap" style="margin-top:10px"><input type="text" id="sx_name" placeholder="예: 큐브 트레이, 분유" style="flex:1;min-width:140px">
        <select id="sx_m" style="width:auto">${Object.entries(SHOP_M).map(([k, v]) => `<option value="${k}">${v.emoji} ${v.label}</option>`).join('')}</select><button class="btn sm pri" data-act="shopExtraAdd">추가</button></div></div>`;
}
function stockView() {
  const items = [...S.stock].sort((a, b) => (b.qty > 0) - (a.qty > 0) || stockExp(a).localeCompare(stockExp(b)));
  const total = S.stock.filter(x => x.qty > 0).reduce((a, x) => a + x.qty, 0);
  return `<div class="card"><div class="row wrap"><b>🧊 냉동 큐브 재고</b><span class="badge">${total}개</span><button class="btn sm pri right" data-act="stockAdd">+ 큐브 추가</button></div>
    <div class="muted small" style="margin-top:4px">소진 권장일은 만든 날 + ${S.profile.freezeDays || 7}일입니다. 먹은 기록을 남기면 큐브 조리 끼니에서 차감할 수 있어요.</div></div>
    ${items.length ? `<div class="card scroll" style="margin-top:12px"><table class="stk"><tr><th>이름</th><th>만든 날</th><th>소진 권장</th><th>상태</th><th>재고</th><th></th></tr>
      ${items.map(x => { const s = stockStatus(x); return `<tr><td>${esc(x.name)}<div class="muted small">${(x.ing || []).map(i => ING[i]?.emoji || '').join('')}</div></td><td>${fmtShort(x.madeDate)}</td><td>${fmtShort(stockExp(x))}</td>
        <td><span class="badge ${s.cls}">${s.label}</span></td>
        <td style="white-space:nowrap"><button class="btn sm" data-act="stockInc" data-id="${x.id}" data-n="-1" aria-label="하나 줄이기">−</button> <b>${x.qty}</b> <button class="btn sm" data-act="stockInc" data-id="${x.id}" data-n="1" aria-label="하나 늘리기">+</button></td>
        <td><button class="btn sm ghost" data-act="stockDel" data-id="${x.id}" aria-label="삭제">🗑</button></td></tr>`; }).join('')}</table></div>`
    : '<div class="empty-box" style="margin-top:12px">아직 재고가 없어요. 레시피에서 [큐브 재고에 추가]를 누르거나 [+ 큐브 추가]로 등록하세요.</div>'}`;
}
VIEWS.shop = () => `${topbar()}
  <div class="toolbar"><div class="seg"><button class="${ui.shopTab === 'list' ? 'on' : ''}" data-act="shopTab" data-k="list">🛒 장보기</button><button class="${ui.shopTab === 'stock' ? 'on' : ''}" data-act="shopTab" data-k="stock">🧊 큐브 재고</button></div></div>
  ${ui.shopTab === 'stock' ? stockView() : `
  <div class="card"><div class="fgrid"><div><label class="f">시작일</label><input type="date" id="sh_from" value="${ui.shopFrom}" data-chg="shopFrom"></div><div><label class="f">종료일</label><input type="date" id="sh_to" value="${ui.shopTo}" data-chg="shopTo"></div></div>
    <div class="row wrap" style="margin-top:10px">${[['week', '이번 주'], ['next', '다음 주'], ['7', '오늘부터 7일'], ['14', '14일']].map(([k, l]) => `<button class="btn sm" data-act="shopPreset" data-k="${k}">${l}</button>`).join('')}</div></div>
  <div style="margin-top:12px">${shopList()}</div>`}
  <div class="disc">재료 수량(g)은 아기마다 달라 끼니 수 기준으로만 보여줘요. 조리 방식별 장보기 방식은 [끼니별 구매 방식]에서 바꿀 수 있어요.</div>`;

/* ============ 액션 ============ */
Object.assign(ACT, {
  goShop: () => { ui.view = 'shop'; ui.shopTab = 'list'; render(); window.scrollTo(0, 0); },
  buyAdd: el => buyModal(null, el.dataset.ing),
  buyEdit: el => buyModal(el.dataset.id),
  buySave: el => {
    const id = el.dataset.id, qty = $('#bm_qty').value === '' ? null : Math.max(0, +$('#bm_qty').value), s = $('#bm_s').value, memo = $('#bm_memo').value.trim(), date = $('#bm_date').value;
    if (!date) return toast('구매일을 선택해 주세요');
    if (!(qty > 0) && !memo && !s) return toast('구매량, 구매처, 메모 중 하나는 입력해 주세요');
    const data = { date, s, t: s === 'etc' ? $('#bm_t').value.trim() : '', qty, unit: $('#bm_unit').value, memo };
    if (id) Object.assign(S.buys.find(x => String(x.id) === id), data); else S.buys.push({ id: Date.now() + Math.random().toString(36).slice(2, 5), ing: el.dataset.ing, ...data });
    closeModal(); commit(); toast('구매 기록을 저장했어요');
  },
  buyDel: el => ask('구매 기록 삭제', '이 구매 기록을 삭제할까요?', [{ label: '취소' }, { label: '삭제', cls: 'dan', fn: () => { const snap = JSON.stringify(S.buys); S.buys = S.buys.filter(b => String(b.id) !== el.dataset.id); commit(); toast('삭제했어요', () => { S.buys = JSON.parse(snap); commit(); }); } }]),
  recOpen: el => { ui.view = 'rec'; ui.recSel = el.dataset.id; render(); window.scrollTo(0, 0); },
  recBack: () => { ui.recSel = null; render(); },
  recStage: el => { ui.recStage = el.dataset.k; render(); },
  recNew: () => recForm(null),
  recEdit: el => recForm(recById(el.dataset.id)),
  recSave: el => {
    const title = $('#rc_title').value.trim(); if (!title) return toast('이름을 입력해 주세요');
    const steps = parseSteps($('#rc_steps').value); if (!steps.length) return toast('조리 단계를 한 줄 이상 입력해 주세요');
    const url = $('#rc_url').value.trim();
    if (url && !/^https?:\/\//i.test(url)) return toast('링크는 http:// 또는 https:// 로 시작해야 해요');
    const data = { title, stage: $('#rc_stage').value, amount: $('#rc_amount').value.trim(), ing: [...document.querySelectorAll('input[name=rcing]:checked')].map(i => i.value), extra: $('#rc_extra').value.trim(), steps,
      storage: $('#rc_storage').value.trim(), src: { type: $('#rc_src').value, detail: $('#rc_srcd').value.trim(), url }, note: $('#rc_note').value.trim() };
    const id = el.dataset.id;
    if (id) Object.assign(recById(id), data); else { const nid = 'r' + Date.now(); S.recipes.push({ id: nid, ...data, createdAt: todayISO() }); ui.recSel = nid; }
    closeModal(); commit(); toast('저장했어요');
  },
  recDup: el => { const r = recById(el.dataset.id), n = { ...JSON.parse(JSON.stringify(r)), id: 'r' + Date.now(), title: r.title + ' (복사)', createdAt: todayISO() }; S.recipes.push(n); ui.recSel = n.id; commit(); toast('복제했어요'); },
  recDel: el => {
    const r = recById(el.dataset.id), n = recUse(r.id);
    ask('레시피 삭제', `<b>${esc(r.title)}</b> 레시피를 삭제할까요?${n ? `<br><span class="muted small">식단 ${n}끼에 연결돼 있어요. 식단은 그대로 남고 레시피 연결만 사라져요.</span>` : ''}`, [
      { label: '취소' }, { label: '삭제', cls: 'dan', fn: () => { const snap = JSON.stringify(S.recipes); S.recipes = S.recipes.filter(x => x.id !== r.id); ui.recSel = null; commit(); toast('삭제했어요', () => { S.recipes = JSON.parse(snap); commit(); }); } }]);
  },
  recVideo: el => {
    const r = recById(el.dataset.id);
    modal(`<h3>▶ 유튜브 영상 연결</h3><div class="muted" style="margin-bottom:10px">${esc(r.title)}</div><div class="stack">
      <div><label class="f">유튜브 링크</label><input type="text" id="yt_url" placeholder="https://www.youtube.com/watch?v=..." value="${r.video ? `https://www.youtube.com/watch?v=${esc(r.video.id)}` : ''}"></div>
      <div><label class="f">영상 제목 (선택 · 비우면 '유튜브 영상')</label><input type="text" id="yt_title" value="${esc(r.video?.title || '')}"></div>
      <div><label class="f">채널명 (선택)</label><input type="text" id="yt_ch" value="${esc(r.video?.ch || '')}"></div>
      <div class="muted small">링크를 붙여넣으면 썸네일은 자동으로 표시돼요. 제목과 채널은 직접 입력해 주세요.</div></div>
      <div class="actions"><button class="btn" data-act="closeModal">취소</button><button class="btn pri" data-act="recVideoSave" data-id="${r.id}">저장</button></div>`);
  },
  recVideoSave: el => {
    const r = recById(el.dataset.id), id = ytId($('#yt_url').value);
    if (!id) return toast('유튜브 영상 링크를 확인해 주세요 (youtube.com/watch?v=… 또는 youtu.be/…)');
    const same = r.video && r.video.id === id;
    r.video = { id, title: $('#yt_title').value.trim() || (same ? r.video.title : '유튜브 영상'), ch: $('#yt_ch').value.trim() || (same ? r.video.ch : ''), len: same ? r.video.len : '', views: same ? r.video.views : null, checked: same ? r.video.checked : null, note: same ? r.video.note : '', manual: true };
    closeModal(); commit(); toast('영상을 연결했어요');
  },
  recVideoDel: el => { const r = recById(el.dataset.id), old = r.video; delete r.video; commit(); toast('영상 연결을 해제했어요', () => { r.video = old; commit(); }); },
  recToPlan: el => recToPlanModal(recById(el.dataset.id)),
  recDoPlan: el => {
    const r = recById(el.dataset.id), date = $('#rp_date').value, slot = $('#rp_slot').value, prep = $('#rp_prep').value;
    if (!date) return toast('날짜를 선택해 주세요');
    const snap = JSON.stringify(S.plan);
    (S.plan[date] = S.plan[date] || {})[slot] = { title: r.title, ing: [...r.ing], extra: r.extra || '', prep, basis: 'self', method: S.profile.method, src: { type: r.src?.type || 'self', detail: r.src?.detail || '' }, note: r.amount || '', recipeId: r.id };
    closeModal(); commit(); toast(`${fmtKo(date)} ${slotLabel(date, slot)}에 넣었어요`, () => { S.plan = JSON.parse(snap); commit(); });
  },
  stepToggle: el => { const k = el.dataset.k; ui.stepDone[k] = !ui.stepDone[k]; render(); },
  stepReset: el => { Object.keys(ui.stepDone).filter(k => k.startsWith(el.dataset.id + ':')).forEach(k => delete ui.stepDone[k]); render(); },
  timerStart: el => {
    const m = +el.dataset.m; timers.push({ id: Date.now() + Math.random().toString(36).slice(2, 6), label: el.dataset.l, end: Date.now() + m * 60000, done: false });
    try { _audio = _audio || new (window.AudioContext || window.webkitAudioContext)(); _audio.resume && _audio.resume(); } catch (e) { }
    if (!_tick) _tick = setInterval(tickTimers, 1000);
    renderTimers(); toast(`⏲ ${m}분 타이머를 시작했어요`);
  },
  timerClose: el => { const i = timers.findIndex(t => t.id === el.dataset.id); if (i >= 0) timers.splice(i, 1); renderTimers(); },
  ingGo: el => { ui.view = 'ing'; ui.ingSel = el.dataset.id; ui.ingTab = 'info'; render(); window.scrollTo(0, 0); },

  shopTab: el => { ui.shopTab = el.dataset.k; render(); },
  shopPreset: el => {
    const t = todayISO(), k = el.dataset.k;
    if (k === 'week') { ui.shopFrom = weekStart(t); ui.shopTo = addDays(weekStart(t), 6); }
    else if (k === 'next') { ui.shopFrom = addDays(weekStart(t), 7); ui.shopTo = addDays(weekStart(t), 13); }
    else { ui.shopFrom = t; ui.shopTo = addDays(t, +k - 1); }
    render();
  },
  shopCheck: el => { const k = shopKey(el.dataset.k); if (S.shopDone[k]) delete S.shopDone[k]; else S.shopDone[k] = true; commit(); },
  shopExtraAdd: () => { const name = $('#sx_name').value.trim(); if (!name) return toast('항목 이름을 입력해 주세요'); S.shopExtra.push({ id: Date.now(), name, method: $('#sx_m').value }); commit(); },
  shopExtraDel: el => { S.shopExtra = S.shopExtra.filter(e => String(e.id) !== el.dataset.id); commit(); },
  shopCopy: () => {
    const D = shopData(), L = [`[장보기 ${fmtShort(ui.shopFrom)}~${fmtShort(ui.shopTo)}]`];
    const sec = (t, arr) => { if (arr.length) { L.push('', `■ ${t}`); arr.forEach(s => L.push('- ' + s)); } };
    sec('식재료', D.ing.map(i => `${i.name} (${i.meals.length}끼)`)); sec('밀키트', D.kit.map(x => (x.m.title || mealNames(x.m).join('·')) + storeText(x.key))); sec('완제품', D.ready.map(x => (x.m.title || mealNames(x.m).join('·')) + storeText(x.key)));
    sec('직접 추가', S.shopExtra.map(e => `${e.name} (${SHOP_M[e.method]?.label})`));
    const text = L.join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('장보기 목록을 복사했어요'), () => modal(`<h3>장보기 목록</h3><textarea style="min-height:220px">${esc(text)}</textarea><div class="actions"><button class="btn" data-act="closeModal">닫기</button></div>`));
  },
  stockAdd: el => stockModal(el.dataset.rid),
  stockSave: el => {
    const name = $('#sk_name').value.trim(), qty = +$('#sk_qty').value, made = $('#sk_made').value, exp = $('#sk_exp').value;
    if (!name) return toast('이름을 입력해 주세요'); if (!(qty > 0)) return toast('개수를 입력해 주세요'); if (!made) return toast('만든 날을 선택해 주세요');
    const r = recById($('#sk_rec').value);
    S.stock.push({ id: Date.now(), name, recipeId: r?.id, ing: r ? [...r.ing] : [], qty, madeDate: made, expire: exp || undefined });
    ui.view = 'shop'; ui.shopTab = 'stock'; closeModal(); commit(); toast('재고에 추가했어요');
  },
  stockInc: el => { const x = S.stock.find(s => String(s.id) === el.dataset.id); x.qty = Math.max(0, x.qty + +el.dataset.n); commit(); },
  stockDel: el => ask('재고 삭제', '이 재고 항목을 삭제할까요?', [{ label: '취소' }, { label: '삭제', cls: 'dan', fn: () => { const snap = JSON.stringify(S.stock); S.stock = S.stock.filter(s => String(s.id) !== el.dataset.id); commit(); toast('삭제했어요', () => { S.stock = JSON.parse(snap); commit(); }); } }]),
  stockUse: () => {
    const snap = JSON.stringify(S.stock); let n = 0;
    document.querySelectorAll('input[data-sk]').forEach(i => { const x = S.stock.find(s => String(s.id) === i.dataset.sk), q = Math.min(Math.max(0, +i.value || 0), x.qty); x.qty -= q; n += q; });
    closeModal(); if (!n) return; commit(); toast(`큐브 ${n}개를 차감했어요`, () => { S.stock = JSON.parse(snap); commit(); });
  }
});
Object.assign(CHG, {
  recsrc: el => { ui.recSrc = el.value; render(); },
  recpick: el => {
    const r = recById(el.value); if (!r) return;
    $('#e_title').value = r.title; $('#e_extra').value = r.extra || ''; $('#e_note').value = r.amount || '';
    document.querySelectorAll('input[name=eing]').forEach(i => { i.checked = r.ing.includes(i.value); });
    $('#e_src').value = r.src?.type || 'self'; $('#e_srcd').value = r.src?.detail || '';
  },
  skrec: el => { const r = recById(el.value); if (r && !$('#sk_name').value.trim()) $('#sk_name').value = r.title; },
  skmade: el => { if (el.value) $('#sk_exp').value = addDays(el.value, S.profile.freezeDays || 7); },
  shopFrom: el => { ui.shopFrom = el.value || ui.shopFrom; render(); },
  shopTo: el => { ui.shopTo = el.value || ui.shopTo; render(); },
  buyField: el => {
    const k = el.dataset.k, f = el.dataset.f, ref = buyRef(k); let b = buyByRef(ref);
    if (!b) { b = { id: Date.now() + Math.random().toString(36).slice(2, 5), ref, ing: k, date: todayISO(), qty: null, unit: 'g', s: '', t: '', memo: '' }; S.buys.push(b); }
    let v = el.value;
    if (f === 'qty') v = v === '' ? null : Math.max(0, +v); else if (!['date', 's', 'unit'].includes(f)) v = v.trim();
    b[f] = v; if (f === 's' && v !== 'etc') b.t = '';
    if (buyEmpty(b)) S.buys = S.buys.filter(x => x !== b);
    commit();
    if (f === 's' && v === 'etc') document.querySelector(`input[data-f="t"][data-k="${CSS.escape(k)}"]`)?.focus();
  },
  bmstore: el => { $('#bm_tbox').hidden = el.value !== 'etc'; },
  shopStore: el => {
    S.shopStore = S.shopStore || {}; const k = el.dataset.k;
    if (!el.value) delete S.shopStore[k]; else S.shopStore[k] = { s: el.value, t: el.value === 'etc' ? (S.shopStore[k]?.t || '') : '' };
    commit(); const dt = document.querySelector('details.card'); if (dt) dt.open = true;
    if (el.value === 'etc') document.querySelector(`input[data-chg=shopStoreTxt][data-k="${k}"]`)?.focus();
  },
  shopStoreTxt: el => {
    S.shopStore = S.shopStore || {}; const k = el.dataset.k; if (!S.shopStore[k]) return;
    S.shopStore[k].t = el.value.trim(); commit(); const dt = document.querySelector('details.card'); if (dt) dt.open = true;
  },
  shopOv: el => {
    const k = el.dataset.k, d = { cube: 'ing', daily: 'ing', kit: 'kit', ready: 'ready' }[S.plan[k.split('|')[0]]?.[k.split('|')[1]]?.prep] || 'ing';
    if (el.value === d) delete S.shopOv[k]; else S.shopOv[k] = el.value;
    commit();
    const dt = document.querySelector('details.card'); if (dt) dt.open = true;
  }
});
document.addEventListener('input', e => { if (e.target.dataset.inp === 'recq') { ui.recQ = e.target.value; $('#reclist').innerHTML = recList(); } });
