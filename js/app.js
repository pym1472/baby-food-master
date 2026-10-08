'use strict';
/* ============ 유틸 ============ */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return toISO(d); };
const diffDays = (a, b) => { const A = parse(a), B = parse(b); return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 864e5); };
const todayISO = () => toISO(new Date());
const weekStart = s => addDays(s, -((parse(s).getDay() + 6) % 7));
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmtKo = s => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
const fmtShort = s => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };

/* ============ 상태/저장 ============ */
const KEY = 'iyusik-master-v1';
const defaultState = () => ({
  v: 1,
  // 개인 기본값(이름·생일·시작일)은 js/personal.js 에서 불러온다 — 공개 배포 시 이 파일은 올리지 않는다
  profile: { setup: !window.PERSONAL_PROFILE, name: '우리 아기', birth: addDays(todayISO(), -160), start: addDays(todayISO(), 3), ...(window.PERSONAL_PROFILE || {}), method: 'mix', feed: 'formula', allergies: '', family: '', iron: false, mealsPerDay: 'auto', observeDays: 3, freezeDays: 7, proxy: '', hospital: '' },
  photos: {},              // 사진 메타 { id: {kind, date, slot, ...} } — 사진 본체는 IndexedDB
  photoPick: {},           // 끼니별 대표 사진 선택 { 'date|slot': {mode:'web'|'upload', id} }
  recipes: seedRecipes(),  // 레시피
  stock: [],               // 냉동 큐브 재고
  shopOv: {},              // 끼니별 구매 방식 변경 { 'date|slot': 'ing'|'kit'|'ready' }
  buys: [],                // 식재료 구매 기록 [{id, ing, date, qty, unit, s, t, memo, ref?}]
  shopStore: {},           // 끼니별 구매처 { 'date|slot': {s:'coupang'|'naver'|'kurly'|'etc', t:'직접입력'} }
  shopDone: {},            // 장보기 체크
  shopExtra: [],           // 직접 추가한 장보기 항목
  plan: {},   // plan[date][slot] = meal
  logs: {},   // logs[date][slot] = {r, amt, note}
  react: [],  // 이상반응
  body: {},   // body[date] = {stoolCnt, stool, milkMl, milkCnt, note}
  ing: {}     // ing[id] = {status, first, note}
});
let S = load();
let ver = 0;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const o = JSON.parse(raw); const d = defaultState(); return { ...d, ...o, profile: { ...d.profile, ...(o.profile || {}) } }; }
  } catch (e) { console.warn('load failed', e); }
  return defaultState();
}
function save(noSync) {   // noSync: 클라우드에서 받은 변경을 저장할 때(다시 올리지 않음)
  ver++;
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠ 저장 공간이 부족하거나 저장이 차단되었어요. 백업을 내보내 주세요.'); }
  if (!noSync && typeof syncSchedule === 'function') syncSchedule();
}
function commit() { save(); render(); }

const ui = { view: 'home', planMode: 'month', cursor: todayISO(), logDate: todayISO(), ingF: 'all', ingC: 'all', ingQ: '', ingSort: 'def', ingSel: 'rice', ingTab: 'info', ingPage: 0 };

/* ============ 도메인 ============ */
function ageOn(date) {
  const b = parse(S.profile.birth), t = parse(date);
  let months = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth());
  let days = t.getDate() - b.getDate();
  if (days < 0) { months--; days += new Date(t.getFullYear(), t.getMonth(), 0).getDate(); }
  return { months: Math.max(0, months), days: Math.max(0, days), total: diffDays(S.profile.birth, date) };
}
function stageOn(date) {
  const m = ageOn(date).months;
  if (m < 5) return { name: '준비기', cnt: 0 };
  if (m < 7) return { name: '초기', cnt: 1 };
  if (m < 9) return { name: '중기', cnt: 2 };
  if (m < 12) return { name: '후기', cnt: 3 };
  return { name: '완료기', cnt: 3 };
}
function slotCount(date) {
  const a = S.profile.mealsPerDay;
  return a === 'auto' ? Math.max(1, stageOn(date).cnt) : +a;
}
function visibleSlots(date) {
  const set = SLOT_SET[slotCount(date)], day = S.plan[date] || {};
  return SLOTS.filter(s => set.includes(s) || day[s]);
}
function slotLabel(date, slot) {
  return slotCount(date) === 3 ? { am: '아침', noon: '점심', pm: '저녁' }[slot] : { am: '오전', noon: '점심', pm: '저녁' }[slot];
}
const filledSlots = date => SLOTS.filter(s => S.plan[date]?.[s]);
const dayEmpty = date => filledSlots(date).length === 0;
const obsDays = () => Math.max(2, +S.profile.observeDays || 3);

const ALIAS = { '우유': ['yogurt'], '유제품': ['yogurt'], '달걀': ['eggyolk'], '계란': ['eggyolk'], '난류': ['eggyolk'], '대두': ['tofu'], '콩': ['tofu'], '생선': ['whitefish'], '글루텐': ['oat'], '밀': ['oat'] };
const tokens = text => String(text || '').split(/[,，、/\s]+/).map(t => t.trim()).filter(Boolean);
const matchTok = (text, g) => tokens(text).some(t => g.name.includes(t) || t.includes(g.name) || (ALIAS[t] || []).includes(g.id));
const isAllergy = g => matchTok(S.profile.allergies, g);
const isFamily = g => matchTok(S.profile.family, g);
const isExcluded = id => { const g = ING[id]; return !!g && (isAllergy(g) || ['caution', 'excluded'].includes(S.ing[id]?.status)); };

let _fu = { ver: -1, map: {} };
function firstUseMap() {
  if (_fu.ver === ver) return _fu.map;
  const map = {};
  Object.keys(S.plan).sort().forEach(d => SLOTS.forEach(s => (S.plan[d][s]?.ing || []).forEach(id => { if (!map[id]) map[id] = d; })));
  _fu = { ver, map };
  return map;
}
const newIngsOn = d => Object.entries(firstUseMap()).filter(([id, fd]) => fd === d && id !== 'rice' && ING[id]).map(([id]) => id);

function ingState(id) {
  const o = S.ing[id] || {}, first = o.first || firstUseMap()[id] || null, t = todayISO(), obs = obsDays();
  let st = o.status;
  if (!st) st = !first || first > t ? 'none' : (diffDays(first, t) < obs ? 'observing' : 'review');
  return { st, first, until: first ? addDays(first, obs - 1) : null, left: first ? Math.max(0, obs - diffDays(first, t)) : 0 };
}

let _sch = { key: '', list: [] };
function schedule() {
  const p = S.profile, obs = obsDays();
  const ex = new Set(INGREDIENTS.filter(g => isExcluded(g.id)).map(g => g.id));
  const key = [p.start, p.birth, obs, [...ex].join(',')].join('|');
  if (_sch.key === key) return _sch.list;
  const list = [], used = new Set(['rice']);
  for (let b = 1; b <= 40; b++) {
    const date = addDays(p.start, b * obs), m = ageOn(date).months;
    const id = POOL.find(i => !used.has(i) && !ex.has(i) && ING[i].min <= m);
    if (!id) continue;
    used.add(id); list.push({ id, date });
  }
  _sch = { key, list };
  return list;
}

function warningsFor(date) {
  const day = S.plan[date], w = [];
  if (!day) return w;
  const m = ageOn(date).months, seen = new Set(), obs = obsDays(), fu = firstUseMap();
  SLOTS.forEach(s => (day[s]?.ing || []).forEach(id => {
    const g = ING[id]; if (!g || seen.has(id)) return; seen.add(id);
    if (isAllergy(g) || ['caution', 'excluded'].includes(S.ing[id]?.status)) w.push(`⚠ 주의 재료 포함: ${g.name}`);
    else if (isFamily(g)) w.push(`가족력 확인 필요: ${g.name}`);
    if (g.min > m) w.push(`${g.name}은(는) 보통 ${g.min}개월 이후 도입해요 (현재 ${m}개월)`);
  }));
  const news = newIngsOn(date);
  if (news.length > 1) w.push(`같은 날 신규 재료 ${news.length}개: ${news.map(i => ING[i].name).join(', ')}`);
  news.forEach(id => Object.entries(fu).forEach(([o, d]) => {
    if (o !== id && o !== 'rice' && ING[o] && d !== date && Math.abs(diffDays(d, date)) < obs)
      w.push(`신규 재료 간격: ${ING[id].name} ↔ ${ING[o].name} (${Math.abs(diffDays(d, date))}일 간격, 권장 ${obs}일 이상)`);
  }));
  return [...new Set(w)];
}

const mealNames = m => [...(m.ing || []).map(id => ING[id]?.name).filter(Boolean), ...tokens(m.extra)];

/* ============ 식단 조작 ============ */
function cleanDay(date) { if (S.plan[date] && !Object.keys(S.plan[date]).length) delete S.plan[date]; }
function guideMeal(date, idx, di) {
  const p = S.profile, obs = obsDays(), sch = schedule(), st = stageOn(date);
  let k = -1; sch.forEach((e, i) => { if (e.date <= date) k = i; });
  const cur = k >= 0 ? sch[k] : null;
  const prior = sch.slice(0, Math.max(k, 0)).map(e => e.id).filter(id => !isExcluded(id));
  const ings = ['rice'];
  if (cur) ings.push(cur.id);
  if (prior.length && di >= obs * 2) ings.push(prior[(di + idx) % prior.length]);
  const names = ings.slice(1).map(id => ING[id].name);
  let base = st.cnt <= 1 ? (di < 14 ? '쌀미음' : '쌀죽') : st.name === '중기' ? '으깬 죽' : st.name === '후기' ? '진밥' : '무른 밥';
  if (p.method === 'blw') base = '핑거푸드';
  const cons = st.cnt <= 1 ? (di < 14 ? '10배죽(미음)' : di < 28 ? '7~8배죽' : '5~6배죽')
    : st.name === '중기' ? '5배죽 · 으깬 질감' : st.name === '후기' ? '3배죽~진밥 · 잘게 썬 질감' : '진밥~무른 밥';
  const isNew = cur && cur.date === date;
  const note = [p.method === 'blw' ? '' : cons, di < obs ? '소량(1~2숟가락)부터 시작' : '', isNew ? `🆕 신규 재료 ${ING[cur.id].name} — ${obs}일 관찰` : ''].filter(Boolean).join(' · ');
  return { title: names.length ? `${base} + ${names.join('·')}` : base, ing: ings, extra: '', method: p.method, note, src: { type: 'guide', detail: '월령 표준 가이드(자동)' } };
}
function genGuide(date, basis, prep, mode) {
  const di = diffDays(S.profile.start, date);
  if (di < 0) return 0;
  let n = 0;
  SLOT_SET[slotCount(date)].forEach((slot, idx) => {
    if (mode === 'fill' && S.plan[date]?.[slot]) return;
    const meal = guideMeal(date, idx, di);
    meal.basis = basis; meal.prep = prep;
    (S.plan[date] = S.plan[date] || {})[slot] = meal; n++;
  });
  return n;
}
function copyDay(from, to, mode) {
  const src = S.plan[from]; if (!src || from === to) return 0;
  let n = 0;
  Object.keys(src).forEach(slot => {
    if (mode === 'fill' && S.plan[to]?.[slot]) return;
    (S.plan[to] = S.plan[to] || {})[slot] = JSON.parse(JSON.stringify(src[slot])); n++;
  });
  return n;
}
function withUndo(msg, fn) {
  const snap = JSON.stringify(S.plan);
  fn(); commit();
  toast(msg, () => { S.plan = JSON.parse(snap); commit(); });
}

/* ============ 모달/토스트 ============ */
function modal(html) {
  closeModal();
  const m = document.createElement('div');
  m.className = 'overlay';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  m.addEventListener('mousedown', e => { if (e.target === m) closeModal(); });
  document.body.appendChild(m);
  hydratePhotos(m);
}
function closeModal() { document.querySelectorAll('.overlay').forEach(n => n.remove()); }
function toast(msg, undo) {
  const wrap = $('#toast'), t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>실행 취소</button>' : ''}`;
  if (undo) t.querySelector('button').onclick = () => { undo(); t.remove(); };
  wrap.appendChild(t);
  setTimeout(() => t.remove(), undo ? 9000 : 3200);
}
let _ask = [];
function ask(title, msg, buttons) {
  _ask = buttons;
  modal(`<h3>${esc(title)}</h3><p style="margin:0">${msg}</p><div class="actions">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-act="askRun" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`);
}
const radio = name => document.querySelector(`input[name=${name}]:checked`)?.value;

/* ============ 공통 뷰 조각 ============ */
function topbar() {
  const p = S.profile, a = ageOn(todayISO());
  return `<div class="top"><div class="avatar">👶</div><div><h1>${esc(p.name)} <span class="chip-d">D+${a.total}</span> ${typeof syncBadge === 'function' ? syncBadge() : ''}</h1>
    <div class="muted small">${fmtKo(p.birth).replace(/ \(.\)/, '')} 생 · 생후 ${a.months}개월 ${a.days}일</div></div></div>`;
}
const srcBadge = m => {
  const s = SRC[m.src?.type || 'etc'] || SRC.etc;
  return `<span class="badge src" style="background:${s.color}" title="${esc(m.src?.detail || '')}">${s.label}</span>`;
};
function slotCard(date, slot) {
  const meal = S.plan[date]?.[slot], log = S.logs[date]?.[slot], lab = slotLabel(date, slot);
  const head = `<span>${SLOT_EMOJI[slot]} ${lab}</span>`;
  if (!meal) return `<div class="slotcard" style="--c:var(--${slot})"><div class="hd">${head}</div>
    <div class="muted small">비어 있어요</div>
    <div class="row" style="margin-top:8px"><button class="btn sm pri" data-act="editSlot" data-d="${date}" data-s="${slot}">+ 직접 입력</button></div></div>`;
  const pr = PREP[meal.prep] || PREP.daily;
  return `<div class="slotcard" style="--c:var(--${slot})">${photoThumb(date, slot)}
    <div class="hd">${head}<span class="right row"><span class="badge">${pr.emoji} ${pr.label}</span>${srcBadge(meal)}</span></div>
    <div class="meal-title">${esc(meal.title || mealNames(meal).join(' · '))}</div>
    <div class="ingtags">${mealNames(meal).map(n => `<span>${esc(n)}</span>`).join('')}</div>
    ${meal.note ? `<div class="${meal.note.includes('🆕') ? 'newline' : 'muted small'}">${esc(meal.note)}</div>` : ''}
    <div class="muted small">${BASIS[meal.basis] || ''} · ${METHOD[meal.method] || ''}${meal.src?.detail ? ' · ' + esc(meal.src.detail) : ''}</div>
    ${log ? `<div style="margin-top:8px"><span class="badge s-pass">${REACT[log.r].emoji} ${REACT[log.r].label}</span> <span class="small muted">${esc(log.amt || '')} ${esc(log.note || '')}</span></div>` : ''}
    <div class="row wrap" style="margin-top:10px">
      <button class="btn sm pri" data-act="record" data-d="${date}" data-s="${slot}">${log ? '기록 수정' : '먹은 기록'}</button>
      ${meal.recipeId && S.recipes.some(r => r.id === meal.recipeId) ? `<button class="btn sm" data-act="recOpen" data-id="${meal.recipeId}">📖 레시피</button>` : ''}
      <button class="btn sm" data-act="editSlot" data-d="${date}" data-s="${slot}">수정</button>
      <button class="btn sm dan" data-act="delSlot" data-d="${date}" data-s="${slot}">삭제</button></div></div>`;
}
const warnBlock = date => warningsFor(date).map(w => `<div class="banner warn">${esc(w)}</div>`).join('');

/* ============ 홈 ============ */
function viewHome() {
  const t = todayISO(), p = S.profile, st = stageOn(t), di = diffDays(p.start, t);
  const obs = INGREDIENTS.filter(g => g.id !== 'rice' && ingState(g.id).st === 'observing');
  const rev = INGREDIENTS.filter(g => g.id !== 'rice' && ingState(g.id).st === 'review');
  const slots = visibleSlots(t);
  return `${topbar()}
  <div class="card hero">
    <div class="muted small">${fmtKo(t)}</div>
    <div class="big">${di < 0 ? `이유식 시작까지 D-${-di}` : `이유식 ${di + 1}일차`}</div>
    <div class="muted">${di < 0 ? `${fmtKo(p.start)} 시작 예정` : `${fmtKo(p.start)} 시작`}</div>
    <div class="stat"><span>${st.name} 이유식</span><span>하루 ${slotCount(t)}회</span><span>${METHOD[p.method]}</span><span>${p.feed === 'formula' ? '분유 병행' : p.feed === 'breast' ? '모유 병행' : '혼합수유 병행'}</span></div>
  </div>
  ${p.setup ? '<div class="banner warn" style="margin-top:12px">👶 아기 이름·생일·이유식 시작일이 임시값이에요. <button class="chiplink" data-act="nav" data-v="set">설정에서 입력하기</button></div>' : ''}
  <div style="margin-top:12px">${obs.map(g => { const s = ingState(g.id); return `<div class="banner">${g.emoji} <b>${g.name}</b> 관찰 중 · ${s.left}일 남음 (${fmtShort(s.until)}까지) — 새 재료는 관찰이 끝난 뒤에 추가해요.</div>`; }).join('')}
  ${rev.map(g => `<div class="banner" style="background:#e9f4ff;border-color:#c5e0fa;color:#235a8c">${g.emoji} <b>${g.name}</b> 관찰 기간이 끝났어요. 반응을 확인하고 <a href="#" data-act="ingOpen" data-id="${g.id}">통과/주의</a>로 표시해 주세요.</div>`).join('')}
  ${stockWarn()}${warnBlock(t)}</div>
  <div class="sec-title">🍼 오늘의 식단</div>
  ${slots.length && !dayEmpty(t) ? slots.map(s => slotCard(t, s)).join('') : `<div class="empty-box">오늘 식단이 비어 있어요
      <div class="row wrap" style="justify-content:center;margin-top:12px">
      <button class="btn pri" data-act="gen" data-scope="day" data-d="${t}">+ 오늘 식단 생성</button>
      <button class="btn" data-act="editSlot" data-d="${t}" data-s="${slots[0] || 'am'}">직접 입력</button></div></div>`}
  <div class="sec-title">⚡ 빠른 기록</div>
  <div class="row wrap">
    <button class="btn" data-act="goLog">📝 오늘 기록</button>
    <button class="btn" data-act="reactAdd" data-d="${t}">⚠ 이상반응 기록</button>
    <button class="btn" data-act="goPlan">📅 식단 캘린더</button>
    <button class="btn" data-act="nav" data-v="med">🩺 의료정보</button></div>
  ${p.hospital ? `<div class="card" style="margin-top:14px"><b>🏥 병원 지침 메모</b><div class="small" style="white-space:pre-wrap;margin-top:6px">${esc(p.hospital)}</div></div>` : ''}
  <div class="disc">이 도구는 의학적 조언이 아닙니다. 담당 소아과 지침을 우선하세요. 발진·부기·반복 구토·호흡 곤란 등이 보이면 즉시 의료진에게 연락하세요.</div>`;
}

/* ============ 식단 ============ */
function planTitle() {
  const c = parse(ui.cursor);
  if (ui.planMode === 'month') return `${c.getFullYear()}년 ${c.getMonth() + 1}월`;
  if (ui.planMode === 'week') { const w = weekStart(ui.cursor); return `${fmtShort(w)} ~ ${fmtShort(addDays(w, 6))}`; }
  return fmtKo(ui.cursor);
}
function cell(d, out) {
  const t = todayISO(), slots = filledSlots(d), isStart = d === S.profile.start;
  const news = newIngsOn(d), hasReact = S.react.some(r => r.date === d), warn = warningsFor(d).length;
  const di = diffDays(S.profile.start, d);
  return `<button class="cell ${slots.length ? '' : 'empty'} ${out ? 'out' : ''} ${d === t ? 'today' : ''} ${isStart ? 'startday' : ''}" data-act="openDay" data-d="${d}">
    <div class="dn"><span>${parse(d).getDate()}</span>${isStart ? '<span class="tag">시작</span>' : di > 0 && !out ? `<span class="muted" style="font-size:10px;font-weight:600">${di + 1}일</span>` : ''}</div>
    ${slots.map(s => `<div class="ml" style="--c:var(--${s})">${esc(S.plan[d][s].title || mealNames(S.plan[d][s]).join('·'))}</div>`).join('')}
    ${slots.length ? `<div class="dots">${slots.map(s => `<i style="--c:var(--${s})"></i>`).join('')}</div>` : ''}
    <div class="flags">${news.length ? '🆕' : ''}${warn ? '⚠' : ''}${hasReact ? '❗' : ''}</div>${cellThumb(d)}</button>`;
}
function monthGrid() {
  const c = parse(ui.cursor), first = toISO(new Date(c.getFullYear(), c.getMonth(), 1)), last = toISO(new Date(c.getFullYear(), c.getMonth() + 1, 0));
  const ym = ui.cursor.slice(0, 7);
  let h = '<div class="cal"><div></div>' + ['월', '화', '수', '목', '금', '토', '일'].map((d, i) => `<div class="dow ${i === 5 ? 'sat' : i === 6 ? 'sun' : ''}">${d}</div>`).join('');
  for (let ws = weekStart(first); ws <= last; ws = addDays(ws, 7)) {
    h += `<button class="wkbtn" data-act="weekMenu" data-d="${ws}" title="주간 메뉴" aria-label="${fmtShort(ws)} 주 메뉴">⋯</button>`;
    for (let i = 0; i < 7; i++) { const d = addDays(ws, i); h += cell(d, d.slice(0, 7) !== ym); }
  }
  return h + '</div><div class="muted small" style="margin-top:8px">⋯ 주간 메뉴 · 🆕 신규 재료 · ⚠ 경고 · ❗ 이상반응 · 점선 칸은 비어 있는 날</div>';
}
function weekView() {
  const ws = weekStart(ui.cursor), t = todayISO();
  const cols = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i), vs = visibleSlots(d);
    return `<div class="daycol ${d === t ? 'today' : ''}"><h4><span>${fmtKo(d)}</span><button class="btn sm" data-act="openDay" data-d="${d}">상세</button></h4>
      ${vs.map(s => { const m = S.plan[d]?.[s]; return `<button class="srow ${m ? '' : 'empty'}" style="--c:var(--${s})" data-act="editSlot" data-d="${d}" data-s="${s}"><span>${SLOT_EMOJI[s]}</span><span class="t">${m ? esc(m.title || mealNames(m).join('·')) : '+ 입력'}</span></button>`; }).join('')}
      ${warningsFor(d).length ? '<div class="warnline">⚠ 확인 필요</div>' : ''}</div>`;
  }).join('');
  return `<div class="row wrap" style="margin-bottom:10px"><button class="btn sm pri" data-act="gen" data-scope="week" data-d="${ws}">+ 주간 식단 생성</button><button class="btn sm dan" data-act="delWeek" data-d="${ws}">주간 삭제</button></div><div class="weekgrid">${cols}</div>`;
}
function dayView() {
  const d = ui.cursor, a = ageOn(d), st = stageOn(d), di = diffDays(S.profile.start, d), slots = visibleSlots(d);
  return `<div class="card"><div class="row wrap"><div><b style="font-size:17px">${fmtKo(d)}</b>
      <div class="muted small">${di < 0 ? `이유식 시작 ${-di}일 전` : `이유식 ${di + 1}일차`} · 생후 ${a.months}개월 ${a.days}일 · ${st.name} · 하루 ${slotCount(d)}회</div></div>
      <div class="right row wrap">
        <button class="btn sm pri" data-act="gen" data-scope="day" data-d="${d}">${dayEmpty(d) ? '+ 식단 생성' : '식단 다시 생성'}</button>
        ${dayEmpty(d) ? '' : `<button class="btn sm dan" data-act="delDay" data-d="${d}">하루 삭제</button>`}</div></div></div>
    <div style="margin-top:10px">${warnBlock(d)}</div>
    <div style="margin-top:12px">${slots.map(s => slotCard(d, s)).join('')}</div>`;
}
function viewPlan() {
  const m = ui.planMode;
  return `${topbar()}
  <div class="toolbar">
    <button class="btn sm" data-act="planPrev" aria-label="이전">◀</button>
    <h2>${planTitle()}</h2>
    <button class="btn sm" data-act="planNext" aria-label="다음">▶</button>
    <button class="btn sm" data-act="planToday">오늘</button>
    <div class="seg right">${[['month', '월'], ['week', '주'], ['day', '일']].map(([k, l]) => `<button class="${m === k ? 'on' : ''}" data-act="planMode" data-m="${k}">${l}</button>`).join('')}</div>
    ${m === 'month' ? `<button class="btn sm pri" data-act="gen" data-scope="week" data-d="${ui.cursor}">+ 식단 생성</button>` : ''}
  </div>
  ${m === 'month' ? monthGrid() : m === 'week' ? weekView() : dayView()}`;
}

/* ============ 재료 도감 ============ */
const REFD = typeof REF !== 'undefined' ? REF : {};
const PER_PAGE = 16;

// 식단 반영 빈도: 재료별 일수/끼니 수/섭취 기록
let _use = { ver: -1, map: {} };
const ZERO_USE = { days: 0, meals: 0, pastDays: 0, pastMeals: 0, eaten: 0, good: 0, first: null, last: null, byDate: {} };
function usageMap() {
  if (_use.ver === ver) return _use.map;
  const t = todayISO(), raw = {};
  Object.keys(S.plan).sort().forEach(d => SLOTS.forEach(s => {
    const m = S.plan[d][s]; if (!m) return;
    const lg = S.logs[d]?.[s];
    new Set(m.ing || []).forEach(id => {
      const u = raw[id] = raw[id] || { days: new Set(), pastDays: new Set(), meals: 0, pastMeals: 0, eaten: 0, good: 0, first: null, last: null, byDate: {} };
      u.days.add(d); u.meals++; u.byDate[d] = (u.byDate[d] || 0) + 1;
      if (d <= t) { u.pastDays.add(d); u.pastMeals++; }
      if (lg) { u.eaten++; if (lg.r === 'good') u.good++; }
      u.first = u.first || d; u.last = d;
    });
  }));
  const map = {};
  Object.keys(raw).forEach(id => { const u = raw[id]; map[id] = { ...u, days: u.days.size, pastDays: u.pastDays.size }; });
  _use = { ver, map };
  return map;
}
const useOf = id => usageMap()[id] || ZERO_USE;
const totalMeals = () => Object.values(S.plan).reduce((a, d) => a + Object.keys(d).length, 0);
const isCollected = id => useOf(id).meals > 0 || ingState(id).st !== 'none';

function imgTag(id, cls) {
  const g = ING[id], r = REFD[id];
  if (!r || !r.img) return `<span class="fb">${g.emoji}</span>`;
  return `<img class="${cls || ''}" src="${esc(r.img)}" alt="${esc(g.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'fb',textContent:'${g.emoji}'}))">`;
}
function codexList() {
  const q = ui.ingQ.trim(), c = ui.ingC, f = ui.ingF;
  let list = INGREDIENTS.filter(g => (c === 'all' || g.cat === c) && (f === 'all' || ingState(g.id).st === f) && (!q || g.name.includes(q)));
  if (ui.ingSort === 'use') list = [...list].sort((a, b) => useOf(b.id).meals - useOf(a.id).meals);
  return list;
}
function codexGrid() {
  const list = codexList(), pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  ui.ingPage = Math.min(Math.max(0, ui.ingPage), pages - 1);
  const items = list.slice(ui.ingPage * PER_PAGE, (ui.ingPage + 1) * PER_PAGE);
  return `<div class="cgrid">${items.map(g => {
    const u = useOf(g.id), on = isCollected(g.id);
    return `<button class="ccard ${on ? '' : 'locked'} ${ui.ingSel === g.id ? 'sel' : ''}" data-act="ingPick" data-id="${g.id}" aria-label="${g.name}">
      ${u.meals ? `<span class="cnt" title="식단 ${u.meals}끼 / ${u.days}일">${u.meals}</span>` : ''}${buyStats(g.id).memos.length ? '<span class="cmemo" title="구매 특이사항 있음">⚠</span>' : ''}
      <div class="cimg">${imgTag(g.id)}</div><div class="cname">${g.name}</div></button>`;
  }).join('') || '<div class="muted" style="grid-column:1/-1;padding:30px 0;text-align:center">조건에 맞는 재료가 없어요</div>'}</div>
  <div class="pager"><button class="btn sm" data-act="ingPage" data-n="-1" ${ui.ingPage <= 0 ? 'disabled' : ''}>◀</button><span class="muted small">${ui.ingPage + 1} / ${pages}</span>
    <button class="btn sm" data-act="ingPage" data-n="1" ${ui.ingPage >= pages - 1 ? 'disabled' : ''}>▶</button></div>`;
}
const fmtNum = (v, d) => v == null ? '-' : Number(v).toFixed(d);
function maxRef(key) { return Math.max(...Object.values(REFD).map(r => r.n?.[key] || 0), 1); }

function detailInfo(g, s) {
  const r = REFD[g.id], u = useOf(g.id);
  return `<div class="dsec"><div class="dtitle">기본 정보</div>
    ${r?.n ? STAT_BARS.map(([k, l, unit]) => `<div class="statrow"><span class="sl">${l}</span><div class="bar"><i style="width:${Math.max(3, (r.n[k] || 0) / maxRef(k) * 100)}%"></i></div><span class="sv">${fmtNum(r.n[k], k === 'kcal' ? 0 : 1)}${unit}</span></div>`).join('')
      + '<div class="muted small">100g(생것) 기준 · 막대는 도감 내 최대값 대비 상대 비교</div>'
      : '<div class="muted small">영양 데이터를 불러오지 못했어요.</div>'}
    <div class="statrow"><span class="sl">알레르기</span><div class="dots3">${[0, 1, 2].map(i => `<i class="${i <= g.risk ? 'on' : ''}"></i>`).join('')}</div><span class="sv">${['낮음', '보통', '주의'][g.risk]}</span></div>
    <div class="statrow"><span class="sl">도입 권장</span><span class="sv" style="margin-left:auto">${g.min}개월~ (일반 참고)</span></div>
    <div class="statrow"><span class="sl">이유식 상태</span><span class="badge ${STATUS[s.st].cls}" style="margin-left:auto">${STATUS[s.st].label}</span></div></div>
    <div class="dsec"><div class="dtitle">재료 소개</div><div class="descbox">${esc(DESC[g.id] || '')}<div class="tipline">🍳 손질 팁 · ${esc(g.tip)}</div>
      ${isAllergy(g) ? '<div class="warnline">⚠ 프로필의 알레르기 주의 재료입니다.</div>' : ''}${isFamily(g) ? '<div class="warnline">가족력에 포함된 재료예요. 도입 전 소아과와 상의하세요.</div>' : ''}</div></div>
    <div class="row wrap" style="margin-top:12px"><button class="btn sm pri" data-act="ingOpen" data-id="${g.id}">상태·메모 편집</button>
      <span class="small muted">식단 ${u.meals}끼 · ${u.days}일 반영</span></div>
    ${(() => { const b = buyStats(g.id); return `<div class="descbox" style="margin-top:10px"><b>🛒 구매</b> · ${b.buys.length}회${b.buys.length ? ` · 총 ${fmtUnits(b.units)}` : ''}${b.last ? ` · 마지막 ${fmtShort(b.last)}` : ''}
      ${b.memos.length ? `<div class="warnline">⚠ 구매 특이사항 ${b.memos.length}건 — ${esc(buyStoreLabel(b.memos[0]))}: ${esc(b.memos[0].memo)}</div>` : ''}
      <div style="margin-top:6px"><button class="chiplink" data-act="ingTab" data-k="buy">구매 기록 자세히 보기 ›</button></div></div>`; })()}`;
}
function detailNutri(g) {
  const r = REFD[g.id];
  if (!r?.n) return '<div class="dsec"><div class="muted">영양 데이터를 불러오지 못했어요.</div></div>';
  return `<div class="dsec"><div class="dtitle">영양성분표</div>
    <div class="muted small" style="margin-bottom:8px">100g당 · 생것 · USDA 식품: ${esc(r.fdcDesc)}${r.proxy ? `<br><b>※ ${esc(r.proxy)}</b>` : ''}</div>
    <div class="scroll"><table class="nutri"><tr><th>성분</th><th class="num">100g</th><th class="num">20g 사용 시</th></tr>
    ${NUT_ROWS.map(([k, l, unit, d]) => `<tr><td>${l}</td><td class="num">${fmtNum(r.n[k], d)} ${unit}</td><td class="num muted">${r.n[k] == null ? '-' : fmtNum(r.n[k] * 0.2, d + (d === 0 ? 1 : 1)) + ' ' + unit}</td></tr>`).join('')}</table></div>
    <div class="muted small" style="margin-top:8px">‘20g 사용 시’는 100g 수치를 20%로 환산한 참고값입니다. 조리 방식(데침·가열)에 따라 실제 함량은 달라질 수 있어요.</div>
    <a class="srclink" href="${esc(r.fdcUrl)}" target="_blank" rel="noopener">📎 USDA FoodData Central 원본 보기 (FDC ID ${r.fdcId})</a></div>`;
}
function detailUse(g) {
  const u = useOf(g.id), tm = totalMeals(), t = todayISO(), w0 = addDays(weekStart(t), -21);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const ws = addDays(w0, i * 7); let n = 0;
    for (let k = 0; k < 7; k++) n += u.byDate[addDays(ws, k)] || 0;
    return { ws, n, cur: ws === weekStart(t) };
  });
  const mx = Math.max(1, ...weeks.map(w => w.n)), dates = Object.keys(u.byDate).sort();
  return `<div class="dsec"><div class="dtitle">식단 활용 빈도</div>
    <div class="tiles"><div class="tile"><b>${u.days}</b><span>반영 일수</span></div><div class="tile"><b>${u.meals}</b><span>반영 끼니</span></div>
      <div class="tile"><b>${u.pastMeals}</b><span>오늘까지 끼니</span></div><div class="tile"><b>${u.eaten}</b><span>섭취 기록 (잘 먹음 ${u.good})</span></div></div>
    <div class="small" style="margin:8px 0">${tm ? `전체 계획 ${tm}끼 중 <b>${(u.meals / tm * 100).toFixed(1)}%</b>` : '식단이 아직 없어요'}${u.first ? ` · 첫 반영 ${fmtShort(u.first)} · 마지막 ${fmtShort(u.last)}` : ''}</div>
    <div class="dtitle" style="margin-top:12px">주간 사용 끼니 (최근 3주 ~ 향후 4주)</div>
    <div class="wbars">${weeks.map(w => `<div class="wb ${w.cur ? 'cur' : ''}"><span class="n">${w.n || ''}</span><div class="col"><i style="height:${w.n / mx * 100}%"></i></div><span class="l">${fmtShort(w.ws)}</span></div>`).join('')}</div>
    ${dates.length ? `<div class="dtitle" style="margin-top:12px">사용한 날짜</div><div class="chips">${dates.slice(0, 40).map(d => `<button class="btn sm" data-act="openDay" data-d="${d}">${fmtShort(d)}${u.byDate[d] > 1 ? ' ×' + u.byDate[d] : ''}</button>`).join('')}${dates.length > 40 ? `<span class="muted small">외 ${dates.length - 40}일</span>` : ''}</div>` : '<div class="muted small" style="margin-top:8px">이 재료가 들어간 식단이 아직 없어요.</div>'}</div>`;
}
function detailSrc(g) {
  const r = REFD[g.id];
  return `<div class="dsec"><div class="dtitle">수치·정보 출처</div><ul class="srclist">
    ${r?.fdcUrl ? `<li><b>영양성분</b><br><a href="${esc(r.fdcUrl)}" target="_blank" rel="noopener">USDA FoodData Central (SR Legacy) — ${esc(r.fdcDesc)}</a>${r.proxy ? `<br><span class="muted small">${esc(r.proxy)}</span>` : ''}</li>` : ''}
    ${r?.wikiPage ? `<li><b>대표 이미지</b><br><a href="${esc(r.wikiPage)}" target="_blank" rel="noopener">Wikipedia — ${esc(r.wikiTitle)}</a> <span class="muted small">(이미지는 Wikimedia Commons 등 공개 라이선스, 자세한 저작자는 링크 참고)</span></li>` : ''}
    ${GUIDE_LINKS.map(l => `<li><b>이유식 가이드</b><br><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a><br><span class="muted small">${esc(l.note)}</span></li>`).join('')}
    <li><b>소개·손질 팁·도입 권장 월령·알레르기 등급</b><br><span class="muted small">위 자료를 바탕으로 정리한 일반 참고 정보이며 공식 수치가 아닙니다. 알레르기 유발 식품의 도입 시기에 대한 최신 권고는 소아과와 상의하세요.</span></li></ul></div>`;
}
const DTABS = [['info', '기본정보'], ['nutri', '영양성분'], ['use', '식단 활용'], ['buy', '구매'], ['src', '출처']];
function codexDetail() {
  const g = ING[ui.ingSel] || INGREDIENTS[0], s = ingState(g.id), idx = INGREDIENTS.indexOf(g) + 1;
  const body = { info: detailInfo, nutri: detailNutri, use: detailUse, buy: detailBuy, src: detailSrc }[ui.ingTab](g, s);
  return `<div class="dtabs">${DTABS.map(([k, l]) => `<button class="${ui.ingTab === k ? 'on' : ''}" data-act="ingTab" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="dhead"><div class="photo"><span class="vol">VOL.${String(idx).padStart(2, '0')}</span>${imgTag(g.id)}</div>
      <div><h2>${g.name}</h2><div class="muted">${CATS[g.cat]} · 권장 ${g.min}개월~</div><span class="badge ${STATUS[s.st].cls}" style="margin-top:6px">${STATUS[s.st].label}</span></div></div>
    ${body}`;
}
function viewIng() {
  const tried = INGREDIENTS.filter(g => ingState(g.id).st !== 'none' || useOf(g.id).meals > 0);
  const got = INGREDIENTS.filter(g => isCollected(g.id)).length;
  const cats = [['all', '전체', '#9a8ec8'], ['grain', '곡류', '#e6b34a'], ['veg', '채소', '#6fcf97'], ['fruit', '과일', '#ff8fa3'], ['protein', '단백질', '#e0766a'], ['other', '기타', '#7aa7e6']];
  return `${topbar()}
  <div class="sec-title" style="margin-top:0">📖 재료 도감 <span class="badge">수집 ${got}/${INGREDIENTS.length}</span></div>
  <div class="book">
    <div class="bmarks">${cats.map(([k, l, c]) => `<button class="${ui.ingC === k ? 'on' : ''}" style="--c:${c}" data-act="catFilter" data-k="${k}" title="${l}"><span>${l}</span></button>`).join('')}</div>
    <section class="page left">
      <div class="row" style="margin-bottom:10px"><input type="text" id="ingq" placeholder="재료 검색" value="${esc(ui.ingQ)}" data-inp="ingq" style="flex:1">
        <select id="ings" data-chg="ingsort" style="width:auto"><option value="def" ${ui.ingSort === 'def' ? 'selected' : ''}>기본순</option><option value="use" ${ui.ingSort === 'use' ? 'selected' : ''}>사용 빈도순</option></select>
        <select id="ingf" data-chg="ingstat" style="width:auto"><option value="all">모든 상태</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${ui.ingF === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div id="cgridwrap">${codexGrid()}</div>
      <div class="muted small" style="margin-top:8px">카드의 숫자 = 식단에 반영된 끼니 수 · 회색 카드 = 아직 식단/기록에 없는 재료</div>
    </section>
    <section class="page right" id="detailwrap">${codexDetail()}</section>
  </div>
  <div class="sec-title">📋 신규 재료 진행표</div>
  <div class="card scroll">${tried.length ? `<table><tr><th>재료</th><th>첫 시도일</th><th>관찰 종료</th><th>상태</th><th>식단 끼니</th><th>이상반응</th></tr>
    ${tried.sort((a, b) => (ingState(a.id).first || '9').localeCompare(ingState(b.id).first || '9')).map(g => { const s = ingState(g.id); const rc = S.react.filter(r => r.ing === g.id).length;
      return `<tr><td>${g.emoji} ${g.name}</td><td>${s.first ? fmtShort(s.first) : '-'}</td><td>${s.until ? fmtShort(s.until) : '-'}</td><td><span class="badge ${STATUS[s.st].cls}">${s.st === 'none' ? '예정' : STATUS[s.st].label}</span></td><td>${useOf(g.id).meals}</td><td>${rc ? `❗ ${rc}회` : '-'}</td></tr>`; }).join('')}</table>`
    : '<div class="muted">식단을 만들면 첫 시도일부터 자동으로 기록돼요.</div>'}</div>
  <div class="disc">도입 월령과 알레르기 등급은 일반 참고용입니다. 영양 수치 출처: USDA FoodData Central. 알레르기 위험 재료는 소아과와 상의하세요.</div>`;
}

/* ============ 기록 ============ */
function viewLog() {
  const d = ui.logDate, b = S.body[d] || {}, slots = visibleSlots(d);
  const rs = S.react.filter(r => r.date === d);
  const days = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6));
  const sum = days.map(x => {
    const lg = Object.values(S.logs[x] || {}), bd = S.body[x] || {};
    const c = k => lg.filter(l => l.r === k).length;
    return `<tr><td>${fmtShort(x)}(${DOW[parse(x).getDay()]})</td><td>${c('good') ? '😋' + c('good') : ''} ${c('some') ? '😐' + c('some') : ''} ${c('refuse') ? '🙅' + c('refuse') : ''}</td><td>${bd.milkMl ? bd.milkMl + 'ml' : '-'}</td><td>${bd.stoolCnt ?? '-'}</td><td>${S.react.filter(r => r.date === x).length ? '❗' : '-'}</td></tr>`;
  }).join('');
  return `${topbar()}
  <div class="toolbar"><button class="btn sm" data-act="logPrev">◀</button><h2>${fmtKo(d)}</h2><button class="btn sm" data-act="logNext">▶</button><button class="btn sm" data-act="logToday">오늘</button>
    <input type="date" class="right" style="width:auto" value="${d}" data-chg="logDate"></div>
  <div class="sec-title" style="margin-top:0">🍼 끼니 기록</div>
  ${dayEmpty(d) ? `<div class="empty-box">이 날의 식단이 비어 있어요<div style="margin-top:10px"><button class="btn pri sm" data-act="gen" data-scope="day" data-d="${d}">+ 식단 생성</button></div></div>` : slots.map(s => slotCard(d, s)).join('')}
  <div class="sec-title">💩 배변 · 🍼 수유</div>
  <div class="card"><div class="fgrid">
    <div><label class="f">배변 횟수</label><input type="number" min="0" id="b_cnt" value="${b.stoolCnt ?? ''}"></div>
    <div><label class="f">배변 상태</label><select id="b_stool"><option value="">선택</option>${STOOL.map(s => `<option ${b.stool === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div><label class="f">${S.profile.feed === 'breast' ? '모유' : '분유'} 총량(ml)</label><input type="number" min="0" id="b_ml" value="${b.milkMl ?? ''}"></div>
    <div><label class="f">수유 횟수</label><input type="number" min="0" id="b_mc" value="${b.milkCnt ?? ''}"></div></div>
    <label class="f" style="margin-top:10px">메모</label><input type="text" id="b_note" value="${esc(b.note || '')}">
    <div class="actions" style="display:flex;margin-top:12px"><button class="btn pri" data-act="saveBody">저장</button></div></div>
  <div class="sec-title">⚠ 알레르기 · 이상반응</div>
  <div class="banner warn">호흡 곤란, 입술·얼굴 부기, 반복 구토, 축 처짐이 있으면 기록보다 먼저 즉시 119 또는 응급실에 연락하세요.</div>
  <div style="margin-top:10px">${rs.map(r => `<div class="card" style="margin-bottom:8px"><div class="row wrap"><b>${r.ing && ING[r.ing] ? ING[r.ing].emoji + ' ' + ING[r.ing].name : '재료 미상'}</b><span class="badge s-caution">${esc(r.sev)}</span>
      <button class="btn sm dan right" data-act="reactDel" data-id="${r.id}">삭제</button></div><div class="small">${r.sym.map(esc).join(', ') || '증상 선택 없음'}</div>${r.memo ? `<div class="muted small">${esc(r.memo)}</div>` : ''}${r.photos?.length ? `<div class="rths">${reactThumbs(r)}</div>` : ''}</div>`).join('') || '<div class="muted small">이 날 기록된 이상반응이 없어요</div>'}</div>
  <button class="btn" style="margin-top:8px" data-act="reactAdd" data-d="${d}">+ 이상반응 기록</button>
  <div class="sec-title">📊 최근 7일</div>
  <div class="card scroll"><table><tr><th>날짜</th><th>섭취 반응</th><th>수유량</th><th>배변</th><th>이상</th></tr>${sum}</table></div>`;
}

/* ============ 설정 ============ */
function viewSet() {
  const p = S.profile, opt = (obj, v) => Object.entries(obj).map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${typeof l === 'string' ? l : l.label}</option>`).join('');
  return `${topbar()}
  <div class="card stack"><h3>👶 아기 프로필</h3>
    <div class="fgrid">
      <div><label class="f">이름</label><input type="text" id="p_name" value="${esc(p.name)}"></div>
      <div><label class="f">생일</label><input type="date" id="p_birth" value="${p.birth}"></div>
      <div><label class="f">이유식 시작일</label><input type="date" id="p_start" value="${p.start}"></div>
      <div><label class="f">이유식 방식</label><select id="p_method">${opt(METHOD, p.method)}</select></div>
      <div><label class="f">수유 타입</label><select id="p_feed">${opt({ formula: '분유', breast: '모유', mix: '혼합' }, p.feed)}</select></div>
      <div><label class="f">하루 끼니 수</label><select id="p_meals">${opt({ auto: '월령 가이드 자동', 1: '1회', 2: '2회', 3: '3회' }, String(p.mealsPerDay))}</select></div>
      <div><label class="f">신규 재료 관찰 일수</label><select id="p_obs">${[3, 4, 5, 6, 7].map(n => `<option ${obsDays() === n ? 'selected' : ''} value="${n}">${n}일</option>`).join('')}</select></div>
      <div><label class="f">냉동 큐브 보관 기한 (기본 7일 · 질병관리청 안내)</label><select id="p_frz">${[3, 5, 7, 10, 14, 30].map(n => `<option ${(p.freezeDays || 7) === n ? 'selected' : ''} value="${n}">${n}일</option>`).join('')}</select></div>
      <div><label class="f">철분 보충</label><select id="p_iron">${opt({ no: '안 함', yes: '복용 중' }, p.iron ? 'yes' : 'no')}</select></div></div>
    <div><label class="f">알레르기 주의 재료 (쉼표로 구분 · 식단에서 제외/경고)</label><input type="text" id="p_all" placeholder="예: 달걀, 우유" value="${esc(p.allergies)}"></div>
    <div><label class="f">알레르기 가족력 (쉼표로 구분 · 경고 표시)</label><input type="text" id="p_fam" placeholder="예: 땅콩" value="${esc(p.family)}"></div>
    <div><label class="f">소아과/병원 지침 메모 (홈에 표시)</label><textarea id="p_hos">${esc(p.hospital)}</textarea></div>
    <div><label class="f">웹 이미지 가져오기 — 대체 프록시 주소 (선택, 주소 안에 {url} 포함)</label><input type="text" id="p_proxy" placeholder="예: https://내프록시.example/raw?url={url}" value="${esc(p.proxy || '')}">
      <div class="muted small" style="margin-top:4px">기본 방식(Microlink·Jina Reader)이 막힐 때만 사용돼요.</div></div>
    <div class="actions" style="display:flex"><button class="btn pri" data-act="saveProfile">저장</button></div></div>
  ${syncSettingsCard()}
  ${aiSettingsCard()}
  <div class="card stack" style="margin-top:14px"><h3>💾 백업</h3>
    <div class="muted small">데이터는 이 기기의 브라우저에만 저장돼요. 다른 기기로 옮기거나 안전하게 보관하려면 내보내기 파일을 사용하세요.</div>
    <div class="small" id="photostat">사진 정보를 불러오는 중…</div>
    <div class="row wrap"><button class="btn" data-act="export">내보내기(사진 제외)</button><button class="btn" data-act="exportPhotos">사진 포함 내보내기</button><button class="btn" data-act="import">가져오기</button><button class="btn dan" data-act="reset">전체 초기화</button></div>
    <input type="file" id="impfile" accept=".json,application/json" hidden data-chg="impfile"></div>
  <div class="disc">이 도구는 의학적 조언이 아닙니다. 담당 소아과 지침을 우선하세요. · 이유식 마스터 · 빌드 20261009b</div>`;
}

/* ============ 렌더 ============ */
const NAV = [['home', '🏠', '오늘'], ['plan', '📅', '식단'], ['rec', '📖', '레시피'], ['ing', '🥕', '재료'], ['shop', '🛒', '장보기'], ['log', '📝', '기록'], ['stats', '📊', '통계'], ['med', '🩺', '의료정보'], ['set', '⚙️', '설정']];
const VIEWS = { home: viewHome, plan: viewPlan, ing: viewIng, log: viewLog, set: viewSet };  // rec, shop 은 recipes.js 에서 등록
function render() {
  $('#nav').innerHTML = `<div class="brand">🍼 이유식 마스터</div>` + NAV.map(([k, i, l]) => `<button class="${ui.view === k ? 'on' : ''}" data-act="nav" data-v="${k}"><span class="ic">${i}</span>${l}</button>`).join('');
  $('#main').innerHTML = VIEWS[ui.view]();
  afterRenderPhotos();
}

/* ============ 모달 컨텐츠 ============ */
function openGen(scope, date) {
  const src = scope === 'week' ? addDays(weekStart(date), -7) : scope === 'range' ? addDays(date, -7) : addDays(date, -1);
  modal(`<h3>+ 식단 생성</h3><div class="stack">
    <div><label class="f">범위</label><div class="radio-line"><label><input type="radio" name="gscope" value="day" ${scope === 'day' ? 'checked' : ''} data-chg="gen"> 일간</label>
      <label><input type="radio" name="gscope" value="week" ${scope === 'week' ? 'checked' : ''} data-chg="gen"> 주간 (월~일)</label>
      <label><input type="radio" name="gscope" value="range" ${scope === 'range' ? 'checked' : ''} data-chg="gen"> 기간 지정</label></div></div>
    <div id="datebox"><label class="f" id="gdatelab">날짜</label><input type="date" id="gdate" value="${date}" data-chg="gen"></div>
    <div id="rangebox" hidden><div class="fgrid"><div><label class="f">시작일</label><input type="date" id="gfrom" value="${date}" data-chg="gen"></div>
      <div><label class="f">종료일</label><input type="date" id="gto" value="${addDays(date, 6)}" data-chg="gen"></div></div>
      <div class="row wrap" style="margin-top:8px"><span class="small muted" id="grangeinfo"></span>
        <button type="button" class="btn sm right" data-act="rangePreset" data-n="14">2주</button>
        <button type="button" class="btn sm" data-act="rangePreset" data-n="28">4주</button>
        <button type="button" class="btn sm" data-act="rangePreset" data-n="30">30일</button></div></div>
    <div><label class="f">생성 방식</label><div class="radio-line">
      <label><input type="radio" name="gmethod" value="guide" checked data-chg="gen"> 🤖 가이드 자동</label>
      <label><input type="radio" name="gmethod" value="manual" data-chg="gen"> ✍️ 수기 입력</label>
      <label><input type="radio" name="gmethod" value="copy" data-chg="gen"> 📋 이전 식단 복사</label>
      ${[['aiphoto', '📷 AI 사진'], ['aitext', '📝 AI 텍스트'], ['aiurl', '🔗 AI URL']].map(([v, l]) => `<label class="${aiReady() ? '' : 'dis'}"><input type="radio" name="gmethod" value="${v}" ${aiReady() ? '' : 'disabled'} data-chg="gen"> ${l}</label>`).join('')}</div>
      ${aiReady() ? '' : '<div class="muted small" style="margin-top:6px">AI 방식은 <button type="button" class="chiplink" data-act="goAiSettings">설정 › AI 분석</button>에서 API 키를 입력하면 사용할 수 있어요.</div>'}</div>
    <div id="aibox" hidden></div>
    <div id="copybox" hidden><label class="f" id="gsrclab">복사할 원본 날짜</label><input type="date" id="gsrc" value="${src}"></div>
    <div class="fgrid"><div><label class="f">구성 기준</label><select id="gbasis">${Object.entries(BASIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label class="f">조리 방식</label><select id="gprep">${Object.entries(PREP).map(([k, v]) => `<option value="${k}" ${k === 'cube' ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('')}</select></div></div>
    <div><label class="f">이미 식단이 있는 칸은</label><div class="radio-line"><label><input type="radio" name="gmode" value="fill" checked> 빈 칸만 채우기</label><label><input type="radio" name="gmode" value="overwrite"> 덮어쓰기</label></div></div>
    <div class="muted small" id="gnote"></div></div>
    <div class="actions"><button class="btn" data-act="closeModal">취소</button><button class="btn pri" data-act="doGen">생성</button></div>`);
  syncGen();
}
const GEN_MAX_DAYS = 120;
// 생성 대상 날짜 목록: 일간 1일 / 주간 7일 / 기간 지정(시작~종료)
function genDates() {
  const scope = radio('gscope');
  if (scope === 'range') {
    const from = $('#gfrom').value, to = $('#gto').value;
    if (!from || !to) return { err: '시작일과 종료일을 선택해 주세요' };
    const len = diffDays(from, to) + 1;
    if (len < 1) return { err: '종료일은 시작일 이후여야 해요' };
    if (len > GEN_MAX_DAYS) return { err: `한 번에 최대 ${GEN_MAX_DAYS}일까지 생성할 수 있어요` };
    return { dates: Array.from({ length: len }, (_, i) => addDays(from, i)), first: from };
  }
  const d = $('#gdate').value;
  if (!d) return { err: '날짜를 선택해 주세요' };
  return { dates: scope === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(d), i)) : [d], first: d };
}
function syncGen() {
  const method = radio('gmethod'), scope = radio('gscope');
  if (!$('#gdate')) return;
  $('#datebox').hidden = scope === 'range';
  $('#rangebox').hidden = scope !== 'range';
  $('#gdatelab').textContent = scope === 'week' ? '날짜 (해당 날짜가 속한 주)' : '날짜';
  if (scope === 'range') {
    const g = genDates();
    $('#grangeinfo').textContent = g.err ? g.err : `${g.dates.length}일 (${fmtShort(g.dates[0])} ~ ${fmtShort(g.dates[g.dates.length - 1])})`;
  }
  $('#copybox').hidden = method !== 'copy';
  const aibox = $('#aibox'), kind = method.startsWith('ai') ? method.slice(2) : '';
  aibox.hidden = !kind;
  if (kind && aibox.dataset.kind !== kind) { aibox.dataset.kind = kind; aibox.innerHTML = aiSourceHtml(kind, '식단표'); }
  $('#gsrclab').textContent = scope === 'week' ? '복사할 원본 주 (해당 날짜가 속한 주)' : scope === 'range' ? '복사할 원본 시작일 (같은 길이의 기간을 순서대로 복사)' : '복사할 원본 날짜';
  $('#gnote').textContent = method === 'guide' ? `월령·신규 재료 간격(${obsDays()}일)·알레르기 설정을 반영해 초안을 만들어요. 이유식 시작일(${fmtShort(S.profile.start)}) 이전 날짜는 건너뛰어요.`
    : method === 'manual' ? '해당 화면으로 이동해 끼니를 직접 입력해요.'
    : method.startsWith('ai') ? 'AI가 자료에서 식단을 읽어 미리보기를 보여줘요. 바로 저장되지 않고, 확인·수정 후 [적용]을 눌러야 입력돼요. (자료 내용이 Anthropic API로 전송돼요)'
    : '원본의 끼니를 그대로 복사한 뒤 수정할 수 있어요.';
}
function doGen() {
  const scope = radio('gscope'), method = radio('gmethod'), mode = radio('gmode'), basis = $('#gbasis').value, prep = $('#gprep').value;
  const g = genDates(); if (g.err) return toast(g.err);
  const { dates, first: date } = g;
  if (method === 'manual') {
    closeModal(); ui.view = 'plan'; ui.planMode = scope === 'day' ? 'day' : scope === 'week' ? 'week' : 'month'; ui.cursor = date; render();
    return toast(scope === 'range' ? '달력에서 날짜를 눌러 직접 입력해 주세요' : '끼니 칸을 눌러 직접 입력해 주세요');
  }
  if (method.startsWith('ai')) return aiPlanGo(method.slice(2), { dates, basis, prep, mode });
  const snap = JSON.stringify(S.plan); let n = 0;
  if (method === 'guide') dates.forEach(d => { n += genGuide(d, basis, prep, mode); });
  else {
    const srcv = $('#gsrc').value; if (!srcv) return toast('원본 날짜를 선택해 주세요');
    const srcStart = scope === 'week' ? weekStart(srcv) : srcv;
    if (scope === 'range' && srcStart <= dates[dates.length - 1] && addDays(srcStart, dates.length - 1) >= dates[0]) return toast('원본 기간이 생성 기간과 겹쳐요. 다른 시작일을 선택해 주세요');
    dates.forEach((d, i) => { n += copyDay(scope === 'day' ? srcv : addDays(srcStart, i), d, mode); });
  }
  closeModal();
  if (!n) { S.plan = JSON.parse(snap); return toast('생성된 끼니가 없어요 (시작일 이전이거나 원본이 비어 있거나 이미 채워져 있어요)'); }
  ui.cursor = date; commit();
  toast(`${n}개 끼니를 생성했어요`, () => { S.plan = JSON.parse(snap); commit(); });
}

function editSlot(date, slot) {
  const m = S.plan[date]?.[slot] || { ing: [], prep: 'daily', basis: 'self', method: S.profile.method, src: { type: 'self', detail: '' } };
  const chipGroup = (cat) => INGREDIENTS.filter(g => g.cat === cat).map(g => `<label class="chip"><input type="checkbox" name="eing" value="${g.id}" ${m.ing.includes(g.id) ? 'checked' : ''}><span>${g.emoji} ${g.name}</span></label>`).join('');
  modal(`<h3>${SLOT_EMOJI[slot]} ${fmtKo(date)} ${slotLabel(date, slot)}</h3><div class="stack">
    ${S.recipes.length ? `<div><label class="f">📖 내 레시피에서 불러오기</label><select id="e_rec" data-chg="recpick"><option value="">선택 안 함</option>${S.recipes.map(r => `<option value="${r.id}" ${m.recipeId === r.id ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}</select></div>` : ''}
    <div><label class="f">메뉴 이름</label><input type="text" id="e_title" placeholder="비워두면 재료로 자동 작성" value="${esc(m.title || '')}"></div>
    <div><label class="f">재료 선택</label>${Object.keys(CATS).filter(c => INGREDIENTS.some(g => g.cat === c)).map(c => `<div class="small muted" style="margin:6px 0 4px">${CATS[c]}</div><div class="chips">${chipGroup(c)}</div>`).join('')}</div>
    <div><label class="f">그 외 재료 (쉼표로 구분)</label><input type="text" id="e_extra" value="${esc(m.extra || '')}"></div>
    <div class="fgrid">
      <div><label class="f">조리 방식</label><select id="e_prep">${Object.entries(PREP).map(([k, v]) => `<option value="${k}" ${m.prep === k ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('')}</select></div>
      <div><label class="f">구성 기준</label><select id="e_basis">${Object.entries(BASIS).map(([k, v]) => `<option value="${k}" ${m.basis === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label class="f">이유식 방식</label><select id="e_method">${Object.entries(METHOD).map(([k, v]) => `<option value="${k}" ${m.method === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label class="f">출처</label><select id="e_src">${Object.entries(SRC).map(([k, v]) => `<option value="${k}" ${(m.src?.type || 'self') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div></div>
    <div><label class="f">출처 상세 (책 제목/쪽, 계정, URL 등)</label><input type="text" id="e_srcd" value="${esc(m.src?.detail || '')}"></div>
    <div><label class="f">메모</label><textarea id="e_note">${esc(m.note || '')}</textarea></div></div>
    <div class="actions"><button class="btn" data-act="closeModal">취소</button>
      ${S.plan[date]?.[slot] ? `<button class="btn dan" data-act="delSlot" data-d="${date}" data-s="${slot}">삭제</button>` : ''}
      <button class="btn pri" data-act="saveSlot" data-d="${date}" data-s="${slot}">저장</button></div>`);
}
function saveSlot(date, slot) {
  const ing = [...document.querySelectorAll('input[name=eing]:checked')].map(i => i.value), extra = $('#e_extra').value.trim();
  let title = $('#e_title').value.trim();
  if (!title && !ing.length && !extra) return toast('메뉴 이름이나 재료를 입력해 주세요');
  if (!title) title = mealNames({ ing, extra }).join('·');
  (S.plan[date] = S.plan[date] || {})[slot] = { title, ing, extra, prep: $('#e_prep').value, basis: $('#e_basis').value, method: $('#e_method').value, src: { type: $('#e_src').value, detail: $('#e_srcd').value.trim() }, note: $('#e_note').value.trim(), recipeId: $('#e_rec')?.value || undefined };
  closeModal(); commit(); toast('저장했어요');
}
function recordModal(date, slot) {
  const l = S.logs[date]?.[slot] || {};
  modal(`<h3>${SLOT_EMOJI[slot]} ${fmtKo(date)} ${slotLabel(date, slot)} 기록</h3><div class="stack">
    <div><label class="f">반응</label><div class="radio-line">${Object.entries(REACT).map(([k, v]) => `<label><input type="radio" name="rr" value="${k}" ${l.r === k ? 'checked' : ''}> ${v.emoji} ${v.label}</label>`).join('')}</div></div>
    <div><label class="f">먹은 양</label><input type="text" id="r_amt" placeholder="예: 3숟가락, 40ml, 절반" value="${esc(l.amt || '')}"></div>
    <div><label class="f">메모</label><input type="text" id="r_note" value="${esc(l.note || '')}"></div></div>
    <div class="actions"><button class="btn" data-act="closeModal">취소</button>${l.r ? `<button class="btn dan" data-act="delRecord" data-d="${date}" data-s="${slot}">기록 삭제</button>` : ''}
    <button class="btn pri" data-act="saveRecord" data-d="${date}" data-s="${slot}">저장</button></div>`);
}
function ingModal(id) {
  const g = ING[id], o = S.ing[id] || {}, s = ingState(id), rs = S.react.filter(r => r.ing === id);
  modal(`<h3>${g.emoji} ${g.name} <span class="badge ${STATUS[s.st].cls}">${STATUS[s.st].label}</span></h3><div class="stack">
    <div class="muted">${CATS[g.cat]} · ${g.min}개월~ 권장 · 알레르기 위험 ${['낮음', '보통', '주의'][g.risk]}</div>
    <div>${esc(g.tip)}</div>
    ${isAllergy(g) ? '<div class="banner warn">프로필의 알레르기 주의 재료에 포함돼 있어요.</div>' : ''}${isFamily(g) ? '<div class="banner">알레르기 가족력에 포함돼 있어요. 도입 전 소아과와 상의해 보세요.</div>' : ''}
    <div class="fgrid"><div><label class="f">상태 (자동 = 식단 기반)</label><select id="i_st"><option value="">자동</option>${['pass', 'caution', 'excluded'].map(k => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${STATUS[k].label}</option>`).join('')}</select></div>
      <div><label class="f">첫 시도일 (비우면 식단 기준)</label><input type="date" id="i_first" value="${o.first || ''}"></div></div>
    <div><label class="f">메모</label><input type="text" id="i_note" value="${esc(o.note || '')}"></div>
    ${rs.length ? `<div><b>이상반응 기록</b>${rs.map(r => `<div class="small">${fmtShort(r.date)} · ${r.sym.join(', ')} (${r.sev})</div>`).join('')}</div>` : ''}</div>
    <div class="actions"><button class="btn" data-act="closeModal">닫기</button><button class="btn pri" data-act="saveIng" data-id="${id}">저장</button></div>`);
}
function reactModal(date) {
  modal(`<h3>⚠ 이상반응 기록</h3><div class="banner warn" style="margin-bottom:12px">호흡 곤란, 입술·얼굴 부기, 반복 구토, 축 처짐이 있으면 즉시 119/응급실에 연락하세요.</div><div class="stack">
    <div class="fgrid"><div><label class="f">날짜</label><input type="date" id="x_date" value="${date}"></div>
      <div><label class="f">의심 재료</label><select id="x_ing"><option value="">미상/기타</option>${INGREDIENTS.map(g => `<option value="${g.id}">${g.emoji} ${g.name}</option>`).join('')}</select></div></div>
    <div><label class="f">증상</label><div class="chips">${SYMPTOMS.map(s => `<label class="chip"><input type="checkbox" name="xsym" value="${s}"><span>${s}</span></label>`).join('')}</div></div>
    <div><label class="f">정도</label><div class="radio-line">${['경미', '중간', '심함'].map((s, i) => `<label><input type="radio" name="xsev" value="${s}" ${i === 0 ? 'checked' : ''}> ${s}</label>`).join('')}</div></div>
    <div><label class="f">메모</label><textarea id="x_memo"></textarea></div>${reactPhotoField()}</div>
    <div class="actions"><button class="btn" data-act="closeModal">취소</button><button class="btn pri" data-act="saveReact">저장</button></div>`);
}

/* ============ 액션 ============ */
const ACT = {
  nav: el => { ui.view = el.dataset.v; if (ui.view === 'rec') ui.recSel = null; render(); window.scrollTo(0, 0); },
  goLog: () => { ui.view = 'log'; ui.logDate = todayISO(); render(); window.scrollTo(0, 0); },
  goPlan: () => { ui.view = 'plan'; ui.cursor = todayISO(); render(); window.scrollTo(0, 0); },
  closeModal,
  askRun: el => { const b = _ask[+el.dataset.i]; closeModal(); b.fn && b.fn(); },
  planMode: el => { ui.planMode = el.dataset.m; render(); },
  planPrev: () => planStep(-1), planNext: () => planStep(1),
  planToday: () => { ui.cursor = todayISO(); render(); },
  openDay: el => { ui.view = 'plan'; ui.cursor = el.dataset.d; ui.planMode = 'day'; render(); window.scrollTo(0, 0); },
  weekMenu: el => {
    const w = el.dataset.d;
    ask(`${fmtShort(w)} ~ ${fmtShort(addDays(w, 6))} 주간`, '이 주에 대해 무엇을 할까요?', [
      { label: '+ 주간 식단 생성', cls: 'pri', fn: () => openGen('week', w) },
      { label: '주간 보기', fn: () => { ui.cursor = w; ui.planMode = 'week'; render(); } },
      { label: '주간 삭제', cls: 'dan', fn: () => ACT.delWeek({ dataset: { d: w } }) },
      { label: '닫기' }]);
  },
  gen: el => openGen(el.dataset.scope, el.dataset.d),
  rangePreset: el => {
    const f = $('#gfrom').value || todayISO(); $('#gfrom').value = f; $('#gto').value = addDays(f, +el.dataset.n - 1);
    const g = genDates(); if (g.dates) $('#gsrc').value = addDays(g.first, -g.dates.length);
    syncGen();
  },
  doGen,
  editSlot: el => editSlot(el.dataset.d, el.dataset.s),
  saveSlot: el => saveSlot(el.dataset.d, el.dataset.s),
  delSlot: el => {
    const { d, s } = el.dataset;
    ask('끼니 삭제', `<b>${fmtKo(d)} ${slotLabel(d, s)}</b> 식단을 삭제할까요?<br><span class="muted small">먹은 기록과 사진은 유지돼요.</span>`, [
      { label: '취소' }, { label: '삭제', cls: 'dan', fn: () => withUndo('끼니를 삭제했어요', () => { if (S.plan[d]) delete S.plan[d][s]; cleanDay(d); }) }]);
  },
  delDay: el => {
    const d = el.dataset.d, n = filledSlots(d).length;
    ask('하루 식단 삭제', `<b>${fmtKo(d)}</b>의 식단 ${n}끼를 모두 삭제할까요?<br><span class="muted small">먹은 기록, 이상반응 기록, 사진은 유지돼요.</span>`, [
      { label: '취소' }, { label: '삭제', cls: 'dan', fn: () => withUndo(`${n}끼를 삭제했어요`, () => { delete S.plan[d]; }) }]);
  },
  delWeek: el => {
    const w = weekStart(el.dataset.d), days = Array.from({ length: 7 }, (_, i) => addDays(w, i)), n = days.reduce((a, d) => a + filledSlots(d).length, 0);
    if (!n) return toast('이 주는 이미 비어 있어요');
    ask('주간 식단 삭제', `<b>${fmtShort(w)} ~ ${fmtShort(addDays(w, 6))}</b> 7일간의 식단 ${n}끼를 모두 삭제할까요?<br><span class="muted small">먹은 기록, 이상반응 기록, 사진은 유지돼요.</span>`, [
      { label: '취소' }, { label: '삭제', cls: 'dan', fn: () => withUndo(`${n}끼를 삭제했어요`, () => days.forEach(d => delete S.plan[d])) }]);
  },
  record: el => recordModal(el.dataset.d, el.dataset.s),
  saveRecord: el => {
    const r = radio('rr'); if (!r) return toast('반응을 선택해 주세요');
    const { d, s } = el.dataset, isNew = !S.logs[d]?.[s];
    (S.logs[d] = S.logs[d] || {})[s] = { r, amt: $('#r_amt').value.trim(), note: $('#r_note').value.trim() };
    closeModal(); commit(); toast('기록했어요');
    if (isNew) afterRecord(d, s);
  },
  delRecord: el => { const { d, s } = el.dataset; delete S.logs[d][s]; if (!Object.keys(S.logs[d]).length) delete S.logs[d]; closeModal(); commit(); },
  catFilter: el => { ui.ingC = el.dataset.k; ui.ingPage = 0; render(); },
  ingPick: el => { ui.ingSel = el.dataset.id; render(); if (window.innerWidth < 900) $('#detailwrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  ingTab: el => { ui.ingTab = el.dataset.k; render(); },
  ingPage: el => { ui.ingPage += +el.dataset.n; render(); },
  ingOpen: (el, e) => { e && e.preventDefault(); ingModal(el.dataset.id); },
  saveIng: el => {
    const id = el.dataset.id, st = $('#i_st').value, first = $('#i_first').value, note = $('#i_note').value.trim();
    if (!st && !first && !note) delete S.ing[id]; else S.ing[id] = { status: st || undefined, first: first || undefined, note };
    closeModal(); commit();
  },
  reactAdd: el => reactModal(el.dataset.d),
  saveReact: () => {
    const sym = [...document.querySelectorAll('input[name=xsym]:checked')].map(i => i.value);
    const entry = { id: Date.now(), date: $('#x_date').value, ing: $('#x_ing').value, sym, sev: radio('xsev'), memo: $('#x_memo').value.trim() };
    S.react.push(entry); attachReactPhotos(entry);   // 사진은 비동기로 저장 후 화면 갱신
    closeModal(); commit(); toast('기록했어요. 증상이 계속되면 소아과와 상의하세요.');
  },
  reactDel: el => ask('이상반응 기록 삭제', '이 기록을 삭제할까요?', [{ label: '취소' }, { label: '삭제', cls: 'dan', fn: () => { S.react = S.react.filter(r => String(r.id) !== el.dataset.id); commit(); } }]),
  logPrev: () => { ui.logDate = addDays(ui.logDate, -1); render(); },
  logNext: () => { ui.logDate = addDays(ui.logDate, 1); render(); },
  logToday: () => { ui.logDate = todayISO(); render(); },
  saveBody: () => {
    const v = id => $(id).value, num = id => v(id) === '' ? undefined : +v(id);
    S.body[ui.logDate] = { stoolCnt: num('#b_cnt'), stool: v('#b_stool'), milkMl: num('#b_ml'), milkCnt: num('#b_mc'), note: v('#b_note').trim() };
    commit(); toast('저장했어요');
  },
  saveProfile: () => {
    const p = S.profile, v = id => $(id).value;
    if (!v('#p_birth') || !v('#p_start')) return toast('생일과 시작일을 입력해 주세요');
    const next = { ...p, name: v('#p_name').trim() || '아기', birth: v('#p_birth'), start: v('#p_start'), method: v('#p_method'), feed: v('#p_feed'), mealsPerDay: v('#p_meals'),
      observeDays: +v('#p_obs'), freezeDays: +v('#p_frz'), proxy: v('#p_proxy').trim(), iron: v('#p_iron') === 'yes', allergies: v('#p_all').trim(), family: v('#p_fam').trim(), hospital: v('#p_hos').trim() };
    const apply = shift => {
      if (shift) {
        const delta = diffDays(p.start, next.start), moved = {};
        Object.keys(S.plan).forEach(d => { moved[d >= p.start ? addDays(d, delta) : d] = S.plan[d]; });
        S.plan = moved;
      }
      S.profile = { ...next, setup: false }; commit(); toast('저장했어요');
    };
    if (next.start !== p.start && Object.keys(S.plan).length)
      ask('시작일이 바뀌었어요', `시작일을 ${fmtKo(p.start)} → <b>${fmtKo(next.start)}</b>로 변경해요.<br>이미 만든 식단은 어떻게 할까요?`, [
        { label: '식단도 같이 이동', cls: 'pri', fn: () => apply(true) }, { label: '식단은 그대로', fn: () => apply(false) }, { label: '취소' }]);
    else apply(false);
  },
  export: () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `iyusik-backup-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import: () => $('#impfile').click(),
  reset: () => ask('전체 초기화', '모든 식단·기록·설정이 삭제돼요. 먼저 내보내기로 백업하셨나요?', [
    { label: '취소' }, { label: '모두 삭제', cls: 'dan', fn: () => { try { localStorage.removeItem(KEY); } catch (e) { } S = defaultState(); ui.view = 'home'; commit(); toast('초기화했어요'); } }])
};
function planStep(dir) {
  if (ui.planMode === 'month') { const d = parse(ui.cursor); d.setDate(1); d.setMonth(d.getMonth() + dir); ui.cursor = toISO(d); }
  else ui.cursor = addDays(ui.cursor, dir * (ui.planMode === 'week' ? 7 : 1));
  render();
}
const CHG = {
  logDate: el => { if (el.value) { ui.logDate = el.value; render(); } },
  ingsort: el => { ui.ingSort = el.value; ui.ingPage = 0; render(); },
  ingstat: el => { ui.ingF = el.value; ui.ingPage = 0; render(); },
  gen: el => {
    if (el.name === 'gscope' || ['gdate', 'gfrom', 'gto'].includes(el.id)) {
      const sc = radio('gscope');
      if (sc === 'range') {
        if (el.name === 'gscope') { const base = $('#gdate').value; if (base && !$('#gfrom').value) $('#gfrom').value = base; }
        const f = $('#gfrom').value, t = $('#gto').value;
        if (el.id === 'gfrom' && f && (!t || t < f)) $('#gto').value = addDays(f, 6);
        const g = genDates(); if (g.dates) $('#gsrc').value = addDays(g.first, -g.dates.length);
      } else { const d = $('#gdate').value; if (d) $('#gsrc').value = sc === 'week' ? addDays(weekStart(d), -7) : addDays(d, -1); }
    }
    syncGen();
  },
  impfile: el => {
    const f = el.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const o = JSON.parse(rd.result); if (!o.profile || !o.plan) throw new Error('형식 오류');
        ask('가져오기', '현재 데이터를 이 파일의 내용으로 <b>덮어써요</b>. 계속할까요?', [{ label: '취소' }, { label: '덮어쓰기', cls: 'pri', fn: async () => { const d = defaultState(), pd = o.photoData; delete o.photoData; S = { ...d, ...o, profile: { ...d.profile, ...o.profile } }; const n = pd ? await restorePhotos(pd) : 0; commit(); toast(n ? `가져왔어요 (사진 ${n}장 포함)` : '가져왔어요'); } }]);
      } catch (e) { toast('올바른 백업 파일이 아니에요'); }
      el.value = '';
    };
    rd.readAsText(f);
  }
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && ACT[el.dataset.act]) ACT[el.dataset.act](el, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el); });
document.addEventListener('input', e => {
  if (e.target.dataset.inp !== 'ingq') return;
  ui.ingQ = e.target.value; ui.ingPage = 0; $('#cgridwrap').innerHTML = codexGrid();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
// render() 는 js/boot.js 에서 모든 스크립트 로드 후 호출
