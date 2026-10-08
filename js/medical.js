'use strict';
/* 의료정보 도감 — 재료 도감과 같은 책 레이아웃. 데이터는 js/meddata.js */
Object.assign(ui, { medSel: 'redflags', medTab: 'ov', medC: 'all', medQ: '', medSev: 'all', medPage: 0 });

const MED_BY = Object.fromEntries(MED_ITEMS.map(m => [m.id, m]));
/* 증상별 사진 (js/medimg.js — Wikimedia Commons, 공개 라이선스). 상처·화상처럼 자극적일 수 있는 사진은 눌러서 보게 한다 */
const MI = typeof MED_IMG !== 'undefined' ? MED_IMG : {};
const imgsOf = id => MI[id] || [];
const MED_SENSITIVE = new Set(['burn', 'infection', 'cut']);
Object.assign(ui, { medReveal: {} });
const creditHtml = im => `${esc(im.author || '작자 미상')} · ${im.licUrl ? `<a href="${esc(im.licUrl)}" target="_blank" rel="noopener">${esc(im.lic)}</a>` : esc(im.lic)} · <a href="${esc(im.page)}" target="_blank" rel="noopener">Wikimedia Commons 원본</a>`;
const photoTag = (im, cls = '') => `<img class="${cls}" src="${esc(im.img)}" alt="${esc(im.t)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('missing')">`;
const medCover = m => { const a = imgsOf(m.id); return a.length && !MED_SENSITIVE.has(m.id) ? photoTag(a[0], 'mcover') : `<span class="fb">${m.emoji}</span>`; };
const MED_PER_PAGE = 16;
const MED_CAT_COLORS = { all: '#9a8ec8', emerg: '#e0566a', skin: '#ff8fa3', allergy: '#e6b34a', fever: '#6fcf97', gi: '#7aa7e6', injury: '#b79cf5', etc: '#a8a29e' };

function medFiltered() {
  const q = ui.medQ.trim().toLowerCase();
  return MED_ITEMS.filter(m =>
    (ui.medC === 'all' || (ui.medC === 'emerg' ? m.sev === 2 : m.cat === ui.medC)) &&
    (ui.medSev === 'all' || String(m.sev) === ui.medSev) &&
    (!q || m.name.toLowerCase().includes(q) || m.kw.some(k => k.toLowerCase().includes(q)) || m.summary.toLowerCase().includes(q)));
}
function medGrid() {
  const list = medFiltered(), pages = Math.max(1, Math.ceil(list.length / MED_PER_PAGE));
  ui.medPage = Math.min(Math.max(0, ui.medPage), pages - 1);
  const items = list.slice(ui.medPage * MED_PER_PAGE, (ui.medPage + 1) * MED_PER_PAGE);
  return `<div class="cgrid">${items.map(m => `<button class="ccard mcard ${ui.medSel === m.id ? 'sel' : ''}" data-act="medPick" data-id="${m.id}" aria-label="${esc(m.name)}">
      <span class="msev ${MED_SEV[m.sev].cls}" title="${MED_SEV[m.sev].label}">${MED_SEV[m.sev].icon}</span>
      <div class="cimg">${medCover(m)}</div><div class="cname mname">${esc(m.name)}</div></button>`).join('')
    || '<div class="muted" style="grid-column:1/-1;padding:30px 0;text-align:center">조건에 맞는 항목이 없어요. 다른 증상 이름으로 찾아 보세요.</div>'}</div>
  <div class="pager"><button class="btn sm" data-act="medPage" data-n="-1" ${ui.medPage <= 0 ? 'disabled' : ''}>◀</button><span class="muted small">${ui.medPage + 1} / ${pages} · ${list.length}개</span>
    <button class="btn sm" data-act="medPage" data-n="1" ${ui.medPage >= pages - 1 ? 'disabled' : ''}>▶</button></div>`;
}
const medList = (arr, cls = '') => arr && arr.length ? `<ul class="mlist ${cls}">${arr.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '';

function medOverview(m) {
  return `<div class="dsec"><div class="dtitle">개요</div><div class="descbox">${esc(m.summary)}</div></div>
    ${m.signs.length ? `<div class="dsec"><div class="dtitle">이런 모습이에요</div>${medList(m.signs)}</div>` : ''}
    ${m.note ? `<div class="dsec"><div class="mbox note"><b>참고</b><br>${esc(m.note)}</div></div>` : ''}
    <div class="row wrap" style="margin-top:12px">
      ${m.sev >= 1 && m.er.length ? `<button class="btn sm dan" data-act="medTab" data-k="hos">🚨 바로 병원·119 가야 할 때 보기</button>` : ''}
      ${m.aid.length ? `<button class="btn sm pri" data-act="medTab" data-k="aid">⛑️ 응급처치 방법 보기</button>` : ''}
      ${m.app === 'react' ? `<button class="btn sm" data-act="reactAdd" data-d="${todayISO()}">📝 이상반응 기록하기</button>` : ''}
      ${m.id === 'foodAllergy' || m.id === 'hives' ? '<button class="btn sm" data-act="nav" data-v="ing">🥕 재료 도감</button>' : ''}</div>`;
}
function medCare(m) {
  const none = '<div class="muted small">이 항목은 집에서 지켜보기보다 아래 [병원·응급] 안내를 먼저 확인하세요.</div>';
  return `<div class="dsec"><div class="dtitle">집에서 해 볼 수 있는 것</div>${m.home.length ? medList(m.home, 'ok') : none}</div>
    ${m.dont.length ? `<div class="dsec"><div class="dtitle">하면 안 되는 것</div>${medList(m.dont, 'no')}</div>` : ''}
    ${m.prevent.length ? `<div class="dsec"><div class="dtitle">예방</div>${medList(m.prevent)}</div>` : ''}
    <div class="muted small" style="margin-top:10px">해열·진통제 등 약은 월령·체중에 맞는 종류와 용량이 달라서 이 앱에는 용량을 싣지 않았어요. 반드시 소아과·약사에게 확인하세요.</div>`;
}
function medHospital(m) {
  return `${m.er.length ? `<div class="mbox er"><b>🚨 즉시 119 · 응급실</b>${medList(m.er)}</div>` : ''}
    ${m.see.length ? `<div class="mbox see"><b>🏥 소아과 진료가 필요해요</b>${medList(m.see)}</div>` : ''}
    ${!m.er.length && !m.see.length ? '<div class="muted small">별도로 정리된 병원 방문 기준이 없어요. 걱정되면 소아과에 문의하세요.</div>' : ''}
    <div class="mbox info"><b>🇰🇷 우리나라에서는</b>${MED_GENERAL.korea.map(k => `<div style="margin-top:6px"><b>${esc(k.t)}</b> — ${esc(k.d)}</div>`).join('')}
      <div class="row wrap" style="margin-top:8px"><a class="btn sm" href="tel:119">📞 119 전화</a><a class="btn sm" href="${esc(SRC_M.moonlight.url)}" target="_blank" rel="noopener">🌙 달빛어린이병원 찾기</a></div></div>`;
}
function medAid(m) {
  return `<div class="mbox er"><b>🚨 먼저 119에 신고하세요</b> — 혼자라면 스피커폰으로 신고하고 상담원의 안내를 따르며 처치하세요.</div>
    <ol class="msteps">${m.aid.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="muted small">응급처치는 글만 읽지 말고 소방서·대한적십자사 등의 영유아 응급처치 교육으로 직접 익혀 두세요.</div>`;
}
function medPics(m) {
  const a = imgsOf(m.id), hide = MED_SENSITIVE.has(m.id) && !ui.medReveal[m.id];
  if (!a.length) return `<div class="dsec"><div class="dtitle">대표적인 모습</div><div class="descbox">이 항목은 공개 라이선스로 쓸 수 있는 사진을 찾지 못했어요. 대신 설명과 대처 방법을 확인하세요.</div></div>`;
  return `<div class="dsec"><div class="dtitle">대표적인 모습 · ${a.length}장</div>
    <div class="muted small" style="margin-bottom:8px">같은 증상도 <b>정도·경과 시간·피부색·나이</b>에 따라 다르게 보여요. 사진만으로 판단하지 말고, 걱정되면 소아과에 보여 주세요. 사진을 누르면 크게 볼 수 있어요.</div>
    ${MED_SENSITIVE.has(m.id) ? `<div class="mbox note" style="margin:0 0 10px">⚠ 상처·화상 모습이 담겨 있어요. ${hide ? '<button class="btn sm" data-act="medReveal" data-id="' + m.id + '">사진 보기</button>' : '<button class="btn sm" data-act="medReveal" data-id="' + m.id + '">사진 숨기기</button>'}</div>` : ''}
    ${hide ? '' : `<div class="mgal">${a.map((im, i) => `<figure class="mfig"><button class="mimg" data-act="medImgView" data-id="${m.id}" data-i="${i}" aria-label="${esc(im.t)} 크게 보기">${photoTag(im)}</button>
      <figcaption>${esc(im.t)}<div class="mcredit">${creditHtml(im)}</div></figcaption></figure>`).join('')}</div>`}
    ${a.length < 4 ? `<div class="muted small" style="margin-top:8px">공개 라이선스로 쓸 수 있는 사진이 ${a.length}장뿐이에요.</div>` : ''}</div>`;
}
function medSources(m) {
  const a = imgsOf(m.id);
  return `<div class="dsec"><div class="dtitle">정보 출처</div><ul class="srclist">${m.src.map(k => { const s = SRC_M[k]; return `<li><b>${esc(s.org)}</b><br><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`; }).join('')}</ul>
    ${a.length ? `<div class="dtitle" style="margin-top:14px">사진 출처 (${a.length}장)</div><ol class="srclist small">${a.map(im => `<li>${esc(im.t)}<br><span class="muted">${creditHtml(im)}</span></li>`).join('')}</ol><div class="muted small">사진은 Wikimedia Commons의 공개 라이선스(CC BY-SA 등) 이미지이며, 저작자와 라이선스 조건에 따라 표시했어요.</div>` : ''}
    <div class="muted small">정보 확인일 ${MED_CHECKED} · 위 자료를 한국어로 요약·정리했고, 한국 상황에 맞게 응급 연락처(119)와 병원 이용 방법을 덧붙였어요. 영국(NHS)·미국(AAP) 자료는 약 이름·응급번호·기준이 한국과 다를 수 있어요.</div>
    <div class="banner warn" style="margin-top:10px">${esc(MED_GENERAL.disclaimer)}</div></div>`;
}
function medTabs(m) { return [['ov', '개요'], ['pic', '사진'], ['care', '대처'], ['hos', '병원·응급'], ...(m.aid.length ? [['aid', '응급처치']] : []), ['src', '출처']]; }
function medDetail() {
  const m = MED_BY[ui.medSel] || MED_ITEMS[0], tabs = medTabs(m);
  if (!tabs.some(([k]) => k === ui.medTab)) ui.medTab = 'ov';
  const body = { ov: medOverview, pic: medPics, care: medCare, hos: medHospital, aid: medAid, src: medSources }[ui.medTab](m), idx = MED_ITEMS.indexOf(m) + 1;
  return `<div class="dtabs">${tabs.map(([k, l]) => `<button class="${ui.medTab === k ? 'on' : ''} ${k === 'hos' || k === 'aid' ? 'red' : ''}" data-act="medTab" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="dhead"><div class="photo mphoto2"><span class="vol">NO.${String(idx).padStart(2, '0')}</span>${medCover(m)}</div>
      <div><h2>${esc(m.name)}</h2><div class="muted">${m.sev === 2 ? '응급 항목' : MED_CATS[m.cat]}${m.sev === 2 ? '' : ''}</div>
      <span class="badge ${MED_SEV[m.sev].cls}" style="margin-top:6px">${MED_SEV[m.sev].icon} ${MED_SEV[m.sev].label}</span> <span class="badge">${MED_CATS[m.cat]}</span></div></div>
    ${body}`;
}

VIEWS.med = () => {
  const cats = Object.entries({ all: '전체', ...MED_CATS });
  return `${topbar()}
  <div class="sec-title" style="margin-top:0">🩺 의료정보 <span class="badge">${MED_ITEMS.length}개 항목</span></div>
  <div class="banner warn medtop"><b>🚨 숨쉬기 힘들어하거나 파랗게 질리거나 깨어나지 않거나 경련·질식·배터리 삼킴이면 지금 바로 119.</b>
    <div class="row wrap" style="margin-top:8px"><a class="btn sm dan" href="tel:119">📞 119 전화</a><button class="btn sm" data-act="medPick" data-id="redflags">응급 신호 체크리스트</button><button class="btn sm" data-act="medPick" data-id="choking">질식 응급처치</button></div>
    <div class="small" style="margin-top:6px">${esc(MED_GENERAL.disclaimer)}</div></div>
  <div class="book" style="margin-top:12px">
    <div class="bmarks">${cats.map(([k, l]) => `<button class="${ui.medC === k ? 'on' : ''}" style="--c:${MED_CAT_COLORS[k]}" data-act="medCat" data-k="${k}" title="${l}"><span>${l}</span></button>`).join('')}</div>
    <section class="page left">
      <div class="row" style="margin-bottom:10px"><input type="text" id="medq" placeholder="증상 검색 (예: 발진, 고름, 열꽃)" value="${esc(ui.medQ)}" data-inp="medq" style="flex:1">
        <select data-chg="medsev" style="width:auto"><option value="all">모든 단계</option>${Object.entries(MED_SEV).map(([k, v]) => `<option value="${k}" ${ui.medSev === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select></div>
      <div id="medgridwrap">${medGrid()}</div>
      <div class="muted small" style="margin-top:8px">ℹ️ 집에서 관리 · ⚠️ 진료 권장 · 🚨 응급 — 카드를 누르면 오른쪽에 상세 정보가 나와요.</div>
    </section>
    <section class="page right" id="meddetail">${medDetail()}</section>
  </div>
  <div class="disc">출처: NHS(영국), 미국소아과학회(AAP), 질병관리청 국가건강정보포털, 서울아산병원·서울대병원 등 · 항목마다 출처 링크가 있어요. 약 용량은 싣지 않았어요.</div>`;
};

Object.assign(ACT, {
  medPick: el => { ui.view = 'med'; ui.medSel = el.dataset.id; ui.medTab = 'ov'; render(); if (window.innerWidth < 900) $('#meddetail').scrollIntoView({ behavior: 'smooth', block: 'start' }); else window.scrollTo(0, 0); },
  medTab: el => { ui.medTab = el.dataset.k; render(); },
  medCat: el => { ui.medC = el.dataset.k; ui.medPage = 0; render(); },
  medPage: el => { ui.medPage += +el.dataset.n; render(); },
  medReveal: el => { ui.medReveal[el.dataset.id] = !ui.medReveal[el.dataset.id]; render(); },
  medImgView: el => {
    const im = imgsOf(el.dataset.id)[+el.dataset.i]; if (!im) return;
    modal(`<h3>${esc(im.t)}</h3><img class="bigimg" src="${esc(im.img)}" alt="${esc(im.t)}" referrerpolicy="no-referrer">
      <div class="mcredit" style="margin-top:8px">${creditHtml(im)}</div><div class="muted small">파일명: ${esc(im.name)}</div>
      <div class="actions"><button class="btn" data-act="closeModal">닫기</button></div>`);
  }
});
Object.assign(CHG, { medsev: el => { ui.medSev = el.value; ui.medPage = 0; render(); } });
document.addEventListener('input', e => { if (e.target.dataset.inp === 'medq') { ui.medQ = e.target.value; ui.medPage = 0; $('#medgridwrap').innerHTML = medGrid(); } });
