'use strict';
/* 4차: 통계 대시보드 — 섭취 반응, 수유량·배변, 재료 선호도, 이상반응 타임라인 */
Object.assign(ui, { statRange: 14, statTable: false });

// 차트 색: 고정 순서 범주 팔레트(블루→오렌지→아쿠아). 색만으로 구분하지 않도록 범례·툴팁·표를 함께 제공
const REACT_ORDER = [['good', '잘 먹음', 'var(--series-1)'], ['some', '조금 먹음', 'var(--series-2)'], ['refuse', '거부', 'var(--series-3)']];

function statDays() {
  const t = todayISO(), n = ui.statRange;
  if (n === 0) {   // 전체: 시작일(또는 첫 기록일)부터 오늘까지, 최대 90일
    const first = [S.profile.start, ...Object.keys(S.logs), ...Object.keys(S.body)].sort()[0];
    const span = Math.min(90, Math.max(7, diffDays(first, t) + 1));
    return Array.from({ length: span }, (_, i) => addDays(t, i - span + 1));
  }
  return Array.from({ length: n }, (_, i) => addDays(t, i - n + 1));
}
function reactTally(days) {
  const sum = { good: 0, some: 0, refuse: 0 };
  const per = days.map(d => { const c = { good: 0, some: 0, refuse: 0 }; Object.values(S.logs[d] || {}).forEach(l => { if (c[l.r] != null) { c[l.r]++; sum[l.r]++; } }); return c; });
  return { per, sum, total: sum.good + sum.some + sum.refuse };
}
function ingPref() {
  const m = {};
  Object.keys(S.logs).forEach(d => Object.entries(S.logs[d]).forEach(([s, l]) => {
    (S.plan[d]?.[s]?.ing || []).forEach(id => { if (id === 'rice' || !ING[id]) return; const o = m[id] = m[id] || { id, good: 0, some: 0, refuse: 0 }; if (o[l.r] != null) o[l.r]++; });
  }));
  return Object.values(m).map(o => ({ ...o, n: o.good + o.some + o.refuse, ratio: o.good / Math.max(1, o.good + o.some + o.refuse) })).filter(o => o.n >= 2).sort((a, b) => b.ratio - a.ratio || b.n - a.n);
}
const dayLbl = d => `${parse(d).getMonth() + 1}/${parse(d).getDate()}`;
const niceMax = v => { if (v <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / p) * p; };

function chartFrame(title, sub, legend, body, table) {
  return `<div class="card chart"><div class="ch-head"><div><b>${title}</b><div class="muted small">${sub}</div></div></div>
    ${legend ? `<div class="legend">${legend}</div>` : ''}
    ${ui.statTable ? `<div class="scroll">${table}</div>` : body}</div>`;
}
function stackedChart(days, tally) {
  const mx = niceMax(Math.max(1, ...tally.per.map(c => c.good + c.some + c.refuse))), H = 140;
  const cols = days.map((d, i) => {
    const c = tally.per[i], tip = `${dayLbl(d)} · 잘 먹음 ${c.good} · 조금 먹음 ${c.some} · 거부 ${c.refuse}`;
    return `<div class="bcol" data-tip="${tip}" tabindex="0" aria-label="${tip}"><div class="bstack" style="height:${H}px">${REACT_ORDER.slice().reverse().map(([k, , col]) => c[k] ? `<i style="height:${c[k] / mx * 100}%;background:${col}"></i>` : '').join('')}</div>
      <span class="blab">${days.length <= 16 || i % Math.ceil(days.length / 12) === 0 ? dayLbl(d) : ''}</span></div>`;
  }).join('');
  const ticks = [mx, mx / 2, 0].map(v => `<span style="bottom:${v / mx * H}px">${v}</span>`).join('');
  return `<div class="plot"><div class="yaxis" style="height:${H}px">${ticks}</div><div class="bars" style="--h:${H}px">${[mx, mx / 2].map(v => `<div class="grid" style="bottom:${v / mx * H + 22}px"></div>`).join('')}${cols}</div></div>`;
}
function columnChart(days, vals, unit, col) {
  const mx = niceMax(Math.max(1, ...vals.map(v => v || 0))), H = 120;
  const cols = days.map((d, i) => { const v = vals[i], tip = `${dayLbl(d)} · ${v == null ? '기록 없음' : v + unit}`;
    return `<div class="bcol" data-tip="${tip}" tabindex="0" aria-label="${tip}"><div class="bstack" style="height:${H}px">${v ? `<i style="height:${v / mx * 100}%;background:${col}"></i>` : ''}</div>
      <span class="blab">${days.length <= 16 || i % Math.ceil(days.length / 12) === 0 ? dayLbl(d) : ''}</span></div>`; }).join('');
  const ticks = [mx, mx / 2, 0].map(v => `<span style="bottom:${v / mx * H}px">${Math.round(v).toLocaleString('ko-KR')}</span>`).join('');
  return `<div class="plot"><div class="yaxis" style="height:${H}px">${ticks}</div><div class="bars">${[mx, mx / 2].map(v => `<div class="grid" style="bottom:${v / mx * H + 22}px"></div>`).join('')}${cols}</div></div>`;
}
function prefChart(list) {
  if (!list.length) return '<div class="muted small">재료별 반응이 2번 이상 기록되면 선호도가 나타나요.</div>';
  return `<div class="hbars">${list.map(o => { const tip = `${ING[o.id].name} · 잘 먹음 ${o.good} · 조금 ${o.some} · 거부 ${o.refuse} (총 ${o.n}끼)`;
    return `<div class="hrow" data-tip="${tip}" tabindex="0" aria-label="${tip}"><span class="hn">${ING[o.id].emoji} ${ING[o.id].name}</span><div class="htrack"><i style="width:${Math.max(2, o.ratio * 100)}%"></i></div><span class="hv">${Math.round(o.ratio * 100)}% <span class="muted small">(${o.n}끼)</span></span></div>`; }).join('')}</div>`;
}

VIEWS.stats = () => {
  const days = statDays(), t = todayISO(), p = S.profile, T = reactTally(days);
  const milk = days.map(d => S.body[d]?.milkMl ?? null), stool = days.map(d => S.body[d]?.stoolCnt ?? null);
  const milkDays = milk.filter(v => v != null && v > 0), avgMilk = milkDays.length ? Math.round(milkDays.reduce((a, b) => a + b, 0) / milkDays.length) : null;
  const reacts = S.react.filter(r => days.includes(r.date)).sort((a, b) => b.date.localeCompare(a.date));
  const introduced = INGREDIENTS.filter(g => g.id !== 'rice' && ingState(g.id).st !== 'none').length, di = diffDays(p.start, t);
  const pref = ingPref(), pct = T.total ? Math.round(T.sum.good / T.total * 100) : null;
  const legend = REACT_ORDER.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('');
  const tblReact = `<table><tr><th>날짜</th><th class="num">잘 먹음</th><th class="num">조금 먹음</th><th class="num">거부</th></tr>${days.map((d, i) => `<tr><td>${dayLbl(d)}</td><td class="num">${T.per[i].good}</td><td class="num">${T.per[i].some}</td><td class="num">${T.per[i].refuse}</td></tr>`).join('')}</table>`;
  const tblBody = `<table><tr><th>날짜</th><th class="num">${p.feed === 'breast' ? '모유' : '분유'}(ml)</th><th class="num">배변(회)</th></tr>${days.map((d, i) => `<tr><td>${dayLbl(d)}</td><td class="num">${milk[i] ?? '-'}</td><td class="num">${stool[i] ?? '-'}</td></tr>`).join('')}</table>`;
  const tblPref = `<table><tr><th>재료</th><th class="num">잘 먹음</th><th class="num">조금</th><th class="num">거부</th></tr>${pref.map(o => `<tr><td>${ING[o.id].name}</td><td class="num">${o.good}</td><td class="num">${o.some}</td><td class="num">${o.refuse}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">데이터 없음</td></tr>'}</table>`;
  const noData = !T.total && !milkDays.length && !stool.some(v => v != null) && !reacts.length;
  return `${topbar()}
  <div class="toolbar"><div class="seg">${[[7, '7일'], [14, '14일'], [30, '30일'], [0, '전체']].map(([k, l]) => `<button class="${ui.statRange === k ? 'on' : ''}" data-act="statRange" data-k="${k}">${l}</button>`).join('')}</div>
    <button class="btn sm right" data-act="statTable">${ui.statTable ? '📊 차트로 보기' : '📋 표로 보기'}</button></div>
  <div class="tiles tiles6">
    <div class="tile"><b>${di < 0 ? `D${di}` : di + 1}</b><span>${di < 0 ? '시작까지' : '이유식 일차'}</span></div>
    <div class="tile"><b>${T.total}</b><span>기록한 끼니</span></div>
    <div class="tile"><b>${pct == null ? '-' : pct + '%'}</b><span>잘 먹은 비율</span></div>
    <div class="tile"><b>${introduced}<small>/${INGREDIENTS.length - 1}</small></b><span>도입 재료</span></div>
    <div class="tile"><b>${reacts.length}</b><span>이상반응</span></div>
    <div class="tile"><b>${avgMilk == null ? '-' : avgMilk}</b><span>일평균 ${p.feed === 'breast' ? '모유' : '분유'}(ml)</span></div></div>
  ${noData ? '<div class="empty-box" style="margin-top:14px">아직 이 기간에 기록이 없어요. [기록] 화면에서 먹은 반응, 수유량, 배변을 남기면 차트가 채워져요.</div>' : ''}
  <div class="chartgrid">
  ${chartFrame('섭취 반응', `하루 끼니별 반응 · 최근 ${days.length}일`, legend, stackedChart(days, T), tblReact)}
  ${chartFrame(`${p.feed === 'breast' ? '모유' : '분유'} 수유량`, '하루 총량(ml)', '', columnChart(days, milk, 'ml', 'var(--series-1)'), tblBody)}
  ${chartFrame('배변 횟수', '하루 횟수', '', columnChart(days, stool, '회', 'var(--series-3)'), tblBody)}
  ${chartFrame('재료 선호도', '잘 먹은 비율(%) · 2끼 이상 기록된 재료 (쌀 제외)', '', prefChart(pref), tblPref)}</div>
  <div class="sec-title">⚠ 이상반응 타임라인 <span class="badge">${reacts.length}건</span></div>
  <div class="card">${reacts.length ? `<div class="tline">${reacts.map(r => `<div class="tl"><span class="tld">${dayLbl(r.date)}</span><div><b>${r.ing && ING[r.ing] ? ING[r.ing].emoji + ' ' + ING[r.ing].name : '재료 미상'}</b> <span class="badge s-caution">${esc(r.sev)}</span>
      <div class="small">${r.sym.map(esc).join(', ') || '증상 선택 없음'}</div>${r.memo ? `<div class="muted small">${esc(r.memo)}</div>` : ''}</div></div>`).join('')}</div>` : '<div class="muted">이 기간에 기록된 이상반응이 없어요.</div>'}</div>
  <div class="disc">기록한 데이터만으로 만든 통계예요. 의학적 판단이 아니며, 걱정되는 변화는 소아과와 상의하세요.</div>`;
};

// 호버/포커스/터치 툴팁 (마크마다 data-tip)
(function tooltip() {
  let tip = null;
  const show = (el, x, y) => {
    if (!tip) { tip = document.createElement('div'); tip.className = 'ctip'; document.body.appendChild(tip); }
    tip.textContent = el.dataset.tip; tip.style.display = 'block';
    const w = tip.offsetWidth, left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
    tip.style.left = left + 'px'; tip.style.top = Math.max(8, y - tip.offsetHeight - 12) + 'px';
  };
  const hide = () => { if (tip) tip.style.display = 'none'; };
  document.addEventListener('pointermove', e => { const el = e.target.closest?.('[data-tip]'); el ? show(el, e.clientX, e.clientY) : hide(); });
  document.addEventListener('pointerdown', e => { const el = e.target.closest?.('[data-tip]'); if (el) show(el, e.clientX, e.clientY); });
  document.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } });
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, true);
})();
Object.assign(ACT, {
  statRange: el => { ui.statRange = +el.dataset.k; render(); },
  statTable: () => { ui.statTable = !ui.statTable; render(); }
});
